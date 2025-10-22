import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  getDocs,
  serverTimestamp,
  deleteDoc,
  doc,
  updateDoc,
  limit,
  startAfter,
  where,
  writeBatch,
} from "firebase/firestore";
import { locales } from "../../lib/locales";
import { getErrorKey } from "../../lib/errorHandler";

const MESSAGE_LIMIT = 15;

const getInitialMessages = (lang = "ko") => {
  return [
    { id: "initial", sender: "bot", text: locales[lang].initialBotMessage },
  ];
};

const responseHandlers = {
  scenario_list: (data, get) => {
    get().addMessage("bot", { text: data.message, scenarios: data.scenarios });
  },
  canvas_trigger: (data, get) => {
    get().addMessage("bot", {
      text: `'${data.scenarioId}' 시나리오를 시작합니다.`,
    });
    get().openScenarioPanel(data.scenarioId);
  },
  toast: (data, get) => {
    get().showToast(data.message, data.toastType);
  },
  llm_response_with_slots: (data, get) => {
    get().addMessage("bot", { text: data.message });
    if (data.slots && Object.keys(data.slots).length > 0) {
      get().setExtractedSlots(data.slots);
    }
  },
};

export const createChatSlice = (set, get) => ({
  messages: getInitialMessages("ko"),
  conversations: [],
  currentConversationId: null,
  isLoading: false,
  isSearching: false,
  searchResults: [],
  slots: {},
  extractedSlots: {},
  llmRawResponse: null,
  selectedOptions: {},
  unsubscribeMessages: null,
  unsubscribeConversations: null,
  lastVisibleMessage: null,
  hasMoreMessages: true,
  scenariosForConversation: {},

  favorites: [],
  unsubscribeFavorites: null,

  updateLastMessage: (chunk, replace = false) => {
    set((state) => {
      const lastMessage = state.messages[state.messages.length - 1];
      if (lastMessage && lastMessage.sender === 'bot') {
        const updatedText = replace ? chunk : (lastMessage.text || '') + chunk;
        const updatedMessage = {
          ...lastMessage,
          text: updatedText,
          isStreaming: true,
        };
        return {
          messages: [...state.messages.slice(0, -1), updatedMessage],
        };
      }
      return state;
    });
  },

  setSelectedOption: async (messageId, optionValue) => {
    // ... (setSelectedOption 로직 동일) ...
     // 1. 로컬 상태 우선 업데이트 (즉각적인 UI 반응)
    set((state) => ({
      selectedOptions: {
        ...state.selectedOptions,
        [messageId]: optionValue,
      },
    }));

    // 2. 임시 ID인지 확인 (숫자로만 구성된 타임스탬프)
    const isTemporaryId = /^\d{13,}$/.test(String(messageId));
    if (isTemporaryId) {
      console.warn("Optimistic update for temporary message ID:", messageId);
      return; // Firestore 업데이트를 시도하지 않고 종료 (오류 방지)
    }

    // 3. (ID가 임시가 아닐 경우) Firestore에 비동기로 선택 상태 저장
    const { user, currentConversationId } = get();
    if (!user || !currentConversationId || !messageId) return;

    try {
      const messageRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "messages", String(messageId));
      await updateDoc(messageRef, {
        selectedOption: optionValue,
      });
    } catch (error) {
      console.error("Error updating selected option in Firestore:", error);
      // 필요 시 에러 처리 (예: 롤백)
      set((state) => {
        const newSelectedOptions = { ...state.selectedOptions };
        delete newSelectedOptions[messageId];
        return { selectedOptions: newSelectedOptions };
      });
    }
  },

  setExtractedSlots: (newSlots) => {
    // ... (setExtractedSlots 로직 동일) ...
      set((state) => ({
      extractedSlots: { ...state.extractedSlots, ...newSlots },
    }));
  },

  clearExtractedSlots: () => {
    // ... (clearExtractedSlots 로직 동일) ...
     set({ extractedSlots: {} });
  },

  unsubscribeAllMessagesAndScenarios: () => {
    // ... (unsubscribeAllMessagesAndScenarios 로직 동일) ...
      get().unsubscribeMessages?.();
    const scenariosMap = get().unsubscribeScenariosMap;
    Object.values(scenariosMap).forEach((unsub) => unsub());
    set({
      unsubscribeMessages: null,
      unsubscribeScenariosMap: {},
      scenarioStates: {},
      activeScenarioSessions: [],
      activeScenarioSessionId: null,
      activePanel: "main",
    });
  },

  loadFavorites: (userId) => {
    // ... (loadFavorites 로직 동일) ...
      const q = query(
      collection(get().db, "users", userId, "favorites"),
      orderBy("order", "asc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const favorites = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      set({ favorites });
    });
    set({ unsubscribeFavorites: unsubscribe });
  },

  addFavorite: async (favoriteData) => {
    // ... (addFavorite 로직 동일) ...
      const user = get().user;
    if (!user) return;

    if (get().favorites.length >= get().maxFavorites) {
      get().showEphemeralToast("최대 즐겨찾기 개수에 도달했습니다.", "error");
      return;
    }

    const favoritesCollection = collection(
      get().db,
      "users",
      user.uid,
      "favorites"
    );
    await addDoc(favoritesCollection, {
      ...favoriteData,
      createdAt: serverTimestamp(),
      order: get().favorites.length,
    });
  },

  updateFavoritesOrder: async (newOrder) => {
    // ... (updateFavoritesOrder 로직 동일) ...
         const user = get().user;
    if (!user) return;

    const originalOrder = get().favorites;
    set({ favorites: newOrder });

    const batch = writeBatch(get().db);
    newOrder.forEach((fav, index) => {
      const favRef = doc(get().db, "users", user.uid, "favorites", fav.id);
      batch.update(favRef, { order: index });
    });

    try {
      await batch.commit();
    } catch (error) {
      console.error("Error updating favorites order:", error);
      get().showEphemeralToast("Failed to save new order.", "error");
      set({ favorites: originalOrder });
    }
  },

  deleteFavorite: async (favoriteId) => {
    // ... (deleteFavorite 로직 동일) ...
        const user = get().user;
    if (!user) return;

    const originalFavorites = get().favorites;
    const favoriteToDelete = originalFavorites.find(
      (fav) => fav.id === favoriteId
    );
    if (!favoriteToDelete) return;

    const newFavorites = originalFavorites
      .filter((fav) => fav.id !== favoriteId)
      .map((fav, index) => ({ ...fav, order: index }));

    set({ favorites: newFavorites });

    try {
      const favoriteRef = doc(
        get().db,
        "users",
        user.uid,
        "favorites",
        favoriteId
      );
      await deleteDoc(favoriteRef);

      const batch = writeBatch(get().db);
      newFavorites.forEach((fav) => {
        const favRef = doc(get().db, "users", user.uid, "favorites", fav.id);
        batch.update(favRef, { order: fav.order });
      });
      await batch.commit();
    } catch (error) {
      console.error("Error deleting favorite:", error);
      get().showEphemeralToast("Failed to delete favorite.", "error");
      set({ favorites: originalFavorites });
    }
  },

  toggleFavorite: async (item) => {
    // ... (toggleFavorite 로직 동일) ...
      const {
      user,
      favorites,
      addFavorite,
      deleteFavorite,
      showEphemeralToast,
      maxFavorites,
    } = get();
    if (!user || !item?.action?.value) return;

    const favoriteToDelete = favorites.find(
      (fav) =>
        fav.action.type === item.action.type &&
        fav.action.value === item.action.value
    );

    if (favoriteToDelete) {
      await deleteFavorite(favoriteToDelete.id);
      showEphemeralToast("즐겨찾기에서 삭제되었습니다.", "info");
    } else {
      if (favorites.length >= maxFavorites) {
        showEphemeralToast("최대 즐겨찾기 개수에 도달했습니다.", "error");
        return;
      }
      const newFavorite = {
        icon: "🌟",
        title: item.title,
        description: item.description,
        action: item.action,
      };
      await addFavorite(newFavorite);
      showEphemeralToast("즐겨찾기에 추가되었습니다.", "success");
    }
  },

  handleShortcutClick: async (item, messageId) => {
    // ... (handleShortcutClick 로직 동일) ...
        if (!item || !item.action) return;
    const { extractedSlots, clearExtractedSlots, setSelectedOption } = get();

    if (messageId) {
      await setSelectedOption(messageId, item.title);
    }

    if (item.action.type === "custom") {
      await get().handleResponse({
        text: item.action.value,
        displayText: item.title,
      });
    } else {
       // --- 👇 [수정] 버튼 클릭 시 action.value (scenarioId) 사용 ---
      get().openScenarioPanel(item.action.value, extractedSlots);
       // --- 👆 [여기까지] ---
    }
    clearExtractedSlots();
  },

  toggleConversationExpansion: (conversationId) => {
    // ... (toggleConversationExpansion 로직 동일) ...
         const { expandedConversationId, unsubscribeScenariosMap, user } = get();

    if (expandedConversationId === conversationId) {
      unsubscribeScenariosMap[conversationId]?.();
      const newMap = { ...unsubscribeScenariosMap };
      delete newMap[conversationId];
      set({ expandedConversationId: null, unsubscribeScenariosMap: newMap });
      return;
    }
    if (
      expandedConversationId &&
      unsubscribeScenariosMap[expandedConversationId]
    ) {
      unsubscribeScenariosMap[expandedConversationId]();
      const newMap = { ...unsubscribeScenariosMap };
      delete newMap[expandedConversationId];
      set({ unsubscribeScenariosMap: newMap });
    }

    set({ expandedConversationId: conversationId });

    if (!user) return;

    const scenariosRef = collection(
      get().db,
      "chats",
      user.uid,
      "conversations",
      conversationId,
      "scenario_sessions"
    );
    const q = query(scenariosRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const scenarios = snapshot.docs.map((doc) => ({
        sessionId: doc.id,
        ...doc.data(),
      }));
      set((state) => ({
        scenariosForConversation: {
          ...state.scenariosForConversation,
          [conversationId]: scenarios,
        },
      }));
    });

    set((state) => ({
      unsubscribeScenariosMap: {
        ...state.unsubscribeScenariosMap,
        [conversationId]: unsubscribe,
      },
    }));
  },

  loadConversations: (userId) => {
    // ... (loadConversations 로직 동일) ...
       const q = query(
      collection(get().db, "chats", userId, "conversations"),
      orderBy("pinned", "desc"),
      orderBy("updatedAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const conversations = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      set({ conversations });
    });

    set({ unsubscribeConversations: unsubscribe });
  },

  loadConversation: async (conversationId) => {
    // ... (loadConversation 로직 동일) ...
       const user = get().user;
    if (!user || get().currentConversationId === conversationId) return;

    get().unsubscribeAllMessagesAndScenarios();

    const { language } = get();
    const initialMessage = getInitialMessages(language)[0];
    set({
      currentConversationId: conversationId,
      isLoading: true,
      messages: [initialMessage],
      lastVisibleMessage: null,
      hasMoreMessages: true,
      expandedConversationId: null,
      selectedOptions: {},
    });

    const messagesRef = collection(
      get().db,
      "chats",
      user.uid,
      "conversations",
      conversationId,
      "messages"
    );
    const q = query(
      messagesRef,
      orderBy("createdAt", "desc"),
      limit(MESSAGE_LIMIT)
    );

    const unsubscribeMessages = onSnapshot(q, (messagesSnapshot) => {
      const newMessages = messagesSnapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .reverse();
      const lastVisible =
        messagesSnapshot.docs[messagesSnapshot.docs.length - 1];

      const newSelectedOptions = {};
      newMessages.forEach(msg => {
        if (msg.selectedOption) {
          newSelectedOptions[msg.id] = msg.selectedOption;
        }
      });

      set((state) => ({
        messages: [initialMessage, ...newMessages],
        lastVisibleMessage: lastVisible,
        hasMoreMessages: messagesSnapshot.docs.length === MESSAGE_LIMIT,
        isLoading: false,
        selectedOptions: newSelectedOptions,
      }));
    });

    set({ unsubscribeMessages });

    const scenariosRef = collection(
      get().db,
      "chats",
      user.uid,
      "conversations",
      conversationId,
      "scenario_sessions"
    );
    const scenariosQuery = query(scenariosRef);
    const scenariosSnapshot = await getDocs(scenariosQuery);

    scenariosSnapshot.forEach((doc) => {
      get().subscribeToScenarioSession(doc.id);
    });
  },

  loadMoreMessages: async () => {
    // ... (loadMoreMessages 로직 동일) ...
        const user = get().user;
    const {
      currentConversationId,
      lastVisibleMessage,
      hasMoreMessages,
      messages,
    } = get();

    if (
      !user ||
      !currentConversationId ||
      !hasMoreMessages ||
      !lastVisibleMessage
    )
      return;

    set({ isLoading: true });

    try {
      const messagesRef = collection(
        get().db,
        "chats",
        user.uid,
        "conversations",
        currentConversationId,
        "messages"
      );
      const q = query(
        messagesRef,
        orderBy("createdAt", "desc"),
        startAfter(lastVisibleMessage),
        limit(MESSAGE_LIMIT)
      );

      const snapshot = await getDocs(q);
      const newMessages = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .reverse();
      const newLastVisible = snapshot.docs[snapshot.docs.length - 1];

      const initialMessage = messages[0];
      const existingMessages = messages.slice(1);

      const newSelectedOptions = { ...get().selectedOptions };
      newMessages.forEach(msg => {
        if (msg.selectedOption) {
          newSelectedOptions[msg.id] = msg.selectedOption;
        }
      });

      set({
        messages: [initialMessage, ...newMessages, ...existingMessages],
        lastVisibleMessage: newLastVisible,
        hasMoreMessages: snapshot.docs.length === MESSAGE_LIMIT,
        selectedOptions: newSelectedOptions,
      });
    } catch (error) {
      console.error("Error loading more messages:", error);
    } finally {
      set({ isLoading: false });
    }
  },

  createNewConversation: async (returnId = false) => {
    // ... (createNewConversation 로직 동일) ...
         if (get().currentConversationId === null && !returnId) return;

    get().unsubscribeAllMessagesAndScenarios();

    const { language, user } = get();

    if (returnId && user) {
      const conversationRef = await addDoc(
        collection(get().db, "chats", user.uid, "conversations"),
        {
          title: "New Conversation",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          pinned: false,
        }
      );
      get().loadConversation(conversationRef.id);
      return conversationRef.id;
    } else {
      set({
        messages: getInitialMessages(language),
        currentConversationId: null,
        lastVisibleMessage: null,
        hasMoreMessages: true,
        expandedConversationId: null,
      });
      return null;
    }
  },

  deleteConversation: async (conversationId) => {
    // ... (deleteConversation 로직 동일) ...
          const user = get().user;
    if (!user) return;

    const conversationRef = doc(
      get().db,
      "chats",
      user.uid,
      "conversations",
      conversationId
    );
    const batch = writeBatch(get().db);

    const scenariosRef = collection(conversationRef, "scenario_sessions");
    const scenariosSnapshot = await getDocs(scenariosRef);
    scenariosSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    const messagesRef = collection(conversationRef, "messages");
    const messagesSnapshot = await getDocs(messagesRef);
    messagesSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    batch.delete(conversationRef);

    await batch.commit();

    if (get().currentConversationId === conversationId) {
      get().createNewConversation();
    }
  },

  updateConversationTitle: async (conversationId, newTitle) => {
    // ... (updateConversationTitle 로직 동일) ...
          const user = get().user;
    if (!user || !newTitle.trim()) return;
    const conversationRef = doc(
      get().db,
      "chats",
      user.uid,
      "conversations",
      conversationId
    );
    await updateDoc(conversationRef, { title: newTitle.trim() });
  },

  pinConversation: async (conversationId, pinned) => {
    // ... (pinConversation 로직 동일) ...
       const user = get().user;
    if (!user) return;
    const conversationRef = doc(
      get().db,
      "chats",
      user.uid,
      "conversations",
      conversationId
    );
    await updateDoc(conversationRef, { pinned });
  },

  saveMessage: async (message) => {
    // ... (saveMessage 로직 동일) ...
          const user = get().user;
    if (!user) return;
    let conversationId = get().currentConversationId;
    if (!conversationId) {
      const firstMessageContent = message.text || "New Conversation";
      const conversationRef = await addDoc(
        collection(get().db, "chats", user.uid, "conversations"),
        {
          title: firstMessageContent.substring(0, 30),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          pinned: false,
        }
      );
      conversationId = conversationRef.id;
      get().loadConversation(conversationRef.id);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const messageToSave = { ...message };

    Object.keys(messageToSave).forEach(
      (key) => messageToSave[key] === undefined && delete messageToSave[key]
    );
    if (messageToSave.node) {
      const { data, ...rest } = messageToSave.node;
      messageToSave.node = {
        ...rest,
        data: { content: data?.content, replies: data?.replies },
      };
    }

    const activeConversationId = get().currentConversationId || conversationId;

    const messagesCollection = collection(
      get().db,
      "chats",
      user.uid,
      "conversations",
      activeConversationId,
      "messages"
    );
    const messageRef = await addDoc(messagesCollection, {
      ...messageToSave,
      createdAt: serverTimestamp(),
    });
    await updateDoc(
      doc(get().db, "chats", user.uid, "conversations", activeConversationId),
      { updatedAt: serverTimestamp() }
    );
    return messageRef.id;
  },

  addMessage: async (sender, messageData) => {
    // ... (addMessage 로직 동일) ...
     let newMessage;
    if (sender === "user") {
      newMessage = { id: Date.now(), sender, ...messageData };
    } else {
      newMessage = {
        id: messageData.id || Date.now(),
        sender: "bot",
        text: messageData.text,
        scenarios: messageData.scenarios,
        isStreaming: messageData.isStreaming || false,
        type: messageData.type,
        scenarioId: messageData.scenarioId,
        scenarioSessionId: messageData.scenarioSessionId,
      };
    }

    const temporaryId = newMessage.id;
    set((state) => ({ messages: [...state.messages, newMessage] }));

    if (!newMessage.isStreaming) {
      const savedMessageId = await get().saveMessage(newMessage);

      let selectedOptionValue = null; // 선택된 값을 임시 저장할 변수

      set((state) => {
        const newSelectedOptions = { ...state.selectedOptions };
        // 임시 ID로 저장된 선택 값이 있는지 확인
        if (newSelectedOptions[temporaryId]) {
          selectedOptionValue = newSelectedOptions[temporaryId]; // 값 저장
          newSelectedOptions[savedMessageId] = selectedOptionValue; // 실제 ID로 교체
          delete newSelectedOptions[temporaryId]; // 임시 ID 항목 삭제
        }

        return {
          messages: state.messages.map((msg) =>
            msg.id === temporaryId ? { ...msg, id: savedMessageId } : msg
          ),
          selectedOptions: newSelectedOptions, // 업데이트된 맵 적용
        };
      });

      // 만약 임시 ID로 선택된 값이 있었다면,
      // 이제 실제 ID로 Firestore에 업데이트를 실행
      if (selectedOptionValue) {
        const { user, currentConversationId } = get();
        if (user && currentConversationId) {
          try {
            const messageRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "messages", String(savedMessageId));
            await updateDoc(messageRef, {
              selectedOption: selectedOptionValue,
            });
          } catch (error) {
            console.error("Error saving selected option after ID swap:", error);
            // UI는 이미 낙관적으로 업데이트되었으므로, 에러 로깅만 처리
          }
        }
      }
    }
  },

  handleResponse: async (messagePayload) => {
    set({ isLoading: true, llmRawResponse: null });

    const textForUser = messagePayload.displayText || messagePayload.text;
    if (textForUser) {
      await get().addMessage("user", { text: textForUser });
    }

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: { text: messagePayload.text },
          scenarioState: null,
          slots: get().slots,
          language: get().language,
          llmProvider: get().llmProvider,
          flowiseApiUrl: get().flowiseApiUrl,
        }),
      });
      if (!response.ok) throw new Error(`Server error: ${response.statusText}`);

      if (response.headers.get("Content-Type")?.includes("text/event-stream")) {
        console.log("[handleResponse] Detected text/event-stream response.");
        const thinkingText = "생각중...";
        await get().addMessage("bot", { text: thinkingText, isStreaming: true });
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalAnswerText = '';
        let thinkingMessageReplaced = false;
        const llmProvider = get().llmProvider;

        console.log(`[handleResponse] Starting stream processing for provider: ${llmProvider}`);

        if (llmProvider === 'gemini') {
          // ... (기존 Gemini 로직, finalAnswerText 누적 및 thinkingMessageReplaced 플래그 사용) ...
           let slotsFound = false;
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);

            if (!slotsFound) {
              buffer += chunk;
              const separatorIndex = buffer.indexOf('|||');
              if (separatorIndex !== -1) {
                const jsonPart = buffer.substring(0, separatorIndex);
                const textPart = buffer.substring(separatorIndex + 3);

                try {
                  const parsed = JSON.parse(jsonPart);
                  if (parsed.slots) {
                    get().setExtractedSlots(parsed.slots);
                    set({ llmRawResponse: parsed });
                  }
                } catch (e) {
                  console.error("Failed to parse slots JSON from stream:", e);
                  set({ llmRawResponse: { error: "Failed to parse slots", data: jsonPart } });
                }

                slotsFound = true;
                get().updateLastMessage(textPart, !thinkingMessageReplaced);
                thinkingMessageReplaced = true;
                finalAnswerText += textPart;
              }
            } else {
              get().updateLastMessage(chunk);
              finalAnswerText += chunk;
            }
          }

        } else if (llmProvider === 'flowise') {
          let newSlots = {};
          let buttonText = ''; // 이제 scenarioId를 저장할 변수

          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              console.log("[handleResponse/Flowise] Stream finished (reader.read done). Final buffer:", buffer);
              // 마지막 버퍼 처리
              if (buffer) {
                const lines = buffer.split('\n');
                for (const line of lines) {
                    if (line.toLowerCase().startsWith('data:')) {
                        const jsonString = line.substring(line.indexOf(':') + 1).trim();
                        if (jsonString && jsonString !== "[DONE]") {
                            try {
                                const data = JSON.parse(jsonString);
                                console.log("[handleResponse/Flowise] Processing final buffer data:", data);
                                let textChunk = '';
                                if (data.event === 'agentFlowExecutedData' && Array.isArray(data.data)) {
                                    const lastNodeExecution = data.data[data.data.length - 1];
                                    if (lastNodeExecution?.data?.output?.content) {
                                        textChunk = lastNodeExecution.data.output.content;
                                        console.log("[handleResponse/Flowise] Found final text in agentFlowExecutedData (final buffer):", textChunk);
                                        finalAnswerText = textChunk;
                                        get().updateLastMessage(textChunk, true);
                                        thinkingMessageReplaced = true;
                                    }
                                }
                                // --- 👇 [수정] usedTools 이벤트 처리 (final buffer) ---
                                else if (data.event === 'usedTools' && Array.isArray(data.data) && data.data.length > 0 && data.data[0]?.toolOutput) {
                                    if (!buttonText) { // 아직 버튼 텍스트(scenarioId)가 설정되지 않았을 때만
                                        try {
                                            // toolOutput이 JSON 형태의 문자열이라고 가정하고 파싱
                                            const toolOutputData = JSON.parse(data.data[0].toolOutput);
                                            if (toolOutputData.scenarioId) {
                                                buttonText = `\n\n[BUTTON:${toolOutputData.scenarioId}]`;
                                                console.log("[handleResponse/Flowise] Extracted button text (scenarioId) from usedTools (final buffer):", buttonText);
                                            }
                                        } catch (e) {
                                            console.warn("[handleResponse/Flowise] Failed to parse toolOutput or find scenarioId (final buffer):", data.data[0].toolOutput, e);
                                        }
                                    }
                                }
                                // --- 👆 [여기까지] ---
                                // Fallback 텍스트 처리 (이전 로직과 유사하게 추가 가능, 필요 시)
                                // else if (typeof data.text === 'string') { ... }
                                // else if (data.event === 'token' ... ) { ... }
                                // else if (data.event === 'chunk' ... ) { ... }
                                // if (textChunk && !finalAnswerText) { /* Fallback 처리 */ }

                            } catch (e) {
                                console.warn("[handleResponse/Flowise] Failed to parse final buffer data chunk:", jsonString, "Error:", e);
                            }
                        }
                    }
                }
              }
              break; // 루프 종료
            }

            if (!value) {
                console.log("[handleResponse/Flowise] Received empty value from reader.read(), continuing...");
                continue;
            }
            console.log("[handleResponse/Flowise] reader.read() - done:", done);

            let chunk;
            try {
                if (value instanceof Uint8Array) {
                    chunk = decoder.decode(value, { stream: true });
                    console.log("[handleResponse/Flowise] Decoded chunk:", JSON.stringify(chunk));
                } else {
                    console.warn("[handleResponse/Flowise] Received non-Uint8Array value:", value);
                    chunk = '';
                }
            } catch (e) {
                console.error("[handleResponse/Flowise] Error decoding chunk:", e, "Raw value:", value);
                chunk = '';
            }
            buffer += chunk;

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            console.log(`[handleResponse/Flowise] Processed ${lines.length} lines. Remaining buffer:`, JSON.stringify(buffer));

            for (const line of lines) {
              console.log("[handleResponse/Flowise] Processing line:", JSON.stringify(line));

              if (line.trim() === '' || line.toLowerCase().startsWith('message:')) {
                  console.log("[handleResponse/Flowise] Ignoring empty line or 'message:' line.");
                  continue;
              }

              let jsonString = '';
              if (line.toLowerCase().startsWith('data:')) {
                  jsonString = line.substring(line.indexOf(':') + 1).trim();
              } else {
                  jsonString = line.trim();
                  console.warn("[handleResponse/Flowise] Line does not start with 'data:', attempting direct JSON parse:", JSON.stringify(line));
              }

              console.log("[handleResponse/Flowise] Extracted data string:", JSON.stringify(jsonString));

              if (jsonString === "[DONE]") {
                console.log("[handleResponse/Flowise] Received [DONE] marker.");
                continue;
              }

              let data;
              try {
                data = JSON.parse(jsonString);
                console.log("[handleResponse/Flowise] Successfully parsed JSON data:", data);
              } catch (e) {
                console.warn("[handleResponse/Flowise] Failed to parse SSE data chunk:", jsonString, "Error:", e);
                console.log("[handleResponse/Flowise] Adding line back to buffer for retry:", JSON.stringify(line));
                buffer = line + (buffer ? '\n' + buffer : '');
                continue;
              }

              let textChunk = '';
              if (data.event === 'agentFlowExecutedData' && Array.isArray(data.data)) {
                  const lastNodeExecution = data.data[data.data.length - 1];
                  if (lastNodeExecution?.data?.output?.content) {
                      textChunk = lastNodeExecution.data.output.content;
                      console.log("[handleResponse/Flowise] Found potential final text in agentFlowExecutedData:", textChunk);
                      finalAnswerText = textChunk;
                      get().updateLastMessage(textChunk, true);
                      thinkingMessageReplaced = true;
                  } else {
                      console.log("[handleResponse/Flowise] agentFlowExecutedData found, but no output.content in the last element.");
                  }
              }
              // --- 👇 [수정] usedTools 이벤트 처리: scenarioId 추출 ---
              else if (data.event === 'usedTools' && Array.isArray(data.data) && data.data.length > 0 && data.data[0]?.toolOutput) {
                  if (!buttonText) {
                      try {
                          // toolOutput 문자열에서 scenarioId 값을 추출 시도
                          // 예시: "[{\"scenarioId\":\"PoC_Scenario_fin\"...]"
                          const match = data.data[0].toolOutput.match(/"scenarioId"\s*:\s*"([^"]+)"/);
                          if (match && match[1]) {
                              const scenarioIdValue = match[1];
                              buttonText = `\n\n[BUTTON:${scenarioIdValue}]`;
                              console.log("[handleResponse/Flowise] Extracted button text (scenarioId) from usedTools:", buttonText);
                          } else {
                              console.warn("[handleResponse/Flowise] Could not find scenarioId in toolOutput:", data.data[0].toolOutput);
                          }
                      } catch (e) {
                          console.warn("[handleResponse/Flowise] Failed to parse toolOutput or find scenarioId:", data.data[0].toolOutput, e);
                      }
                  }
              }
              // --- 👆 [여기까지] ---
              // 토큰/청크 이벤트 처리 (Fallback)
              else if (data.event === 'token' && typeof data.data === 'string') {
                  textChunk = data.data;
                  console.log("[handleResponse/Flowise] Found text in event 'token':", textChunk);
                  get().updateLastMessage(textChunk, !thinkingMessageReplaced);
                  thinkingMessageReplaced = true;
                  finalAnswerText += textChunk;
              } else if (data.event === 'chunk' && data.data?.response) {
                  textChunk = data.data.response;
                  console.log("[handleResponse/Flowise] Found text in event 'chunk':", textChunk);
                  get().updateLastMessage(textChunk, !thinkingMessageReplaced);
                  thinkingMessageReplaced = true;
                  finalAnswerText += textChunk;
              }
              // Fallback: data.text 처리 (필요 시)
              // else if (typeof data.text === 'string' && !finalAnswerText) { ... }

              // 처리 안 된 다른 이벤트 로그
              else if (data.event !== 'agentFlowExecutedData' && data.event !== 'usedTools') {
                 console.log("[handleResponse/Flowise] Received unhandled data event:", data);
              }

            } // end for loop over lines
          } // end while(true)

          console.log("[handleResponse/Flowise] Finished stream reading loop. Processing final steps.");

          // 스트림 종료 후 버튼 텍스트 최종 추가
          if (buttonText) {
             console.log("[handleResponse/Flowise] Appending button text to final answer.");
             finalAnswerText += buttonText;
             get().updateLastMessage(buttonText);
          }

          // 슬롯 추출
          const bookingNoRegex = /\b([A-Z]{2}\d{10})\b/i;
          if (finalAnswerText) {
              const match = finalAnswerText.match(bookingNoRegex);
              if (match && match[1]) {
                newSlots.bkgNr = match[1];
                console.log("[handleResponse/Flowise] Extracted booking number slot:", newSlots);
              }
          }
          if (Object.keys(newSlots).length > 0) {
            get().setExtractedSlots(newSlots);
          }

        } // end else if (llmProvider === 'flowise')

        console.log("[handleResponse] Stream processing complete. Finalizing message.");

        set(state => {
            const lastMessage = state.messages[state.messages.length - 1];
            if (lastMessage && lastMessage.sender === 'bot') {
                const finalTextToUse = llmProvider === 'flowise' ? finalAnswerText : lastMessage.text;

                const finalMessageText = finalTextToUse.trim() === '' || finalTextToUse.trim() === thinkingText.trim()
                    ? "(응답을 받지 못했습니다)"
                    : finalTextToUse;

                const updatedMessage = {
                    ...lastMessage,
                    text: finalMessageText,
                    isStreaming: false,
                };
                console.log("[handleResponse] Final message state updated:", updatedMessage);
                return {
                    messages: [...state.messages.slice(0, -1), updatedMessage],
                };
            }
            console.warn("[handleResponse] Could not find the last bot message to finalize.");
            return state;
        });

        if (get().messages[get().messages.length - 1]?.text !== "(응답을 받지 못했습니다)") {
            await get().saveMessage(get().messages[get().messages.length - 1]);
            console.log("[handleResponse] Final message saved to Firestore.");
        } else {
             console.log("[handleResponse] Skipping save for empty response.");
        }

      } else { // Not a stream response
        // ... (비-스트림 처리 로직 동일) ...
          const data = await response.json();
        set({ llmRawResponse: data });
        const handler = responseHandlers[data.type];

        if (handler) {
          handler(data, get);
        } else {
           if (data.response || data.text) {
               get().addMessage("bot", { text: data.response || data.text });
               if (data.slots && Object.keys(data.slots).length > 0) {
                 get().setExtractedSlots(data.slots);
               }
           } else if (data.type !== "scenario_start" && data.type !== "scenario") {
             console.warn(`[ChatStore] Unhandled response type or empty response:`, data);
             get().addMessage("bot", { text: "(응답 내용 없음)" });
           }
        }
      }
    } catch (error) {
      // ... (에러 처리 로직 동일) ...
          const errorKey = getErrorKey(error);
      const { language } = get();
      const errorMessage =
        locales[language][errorKey] || locales[language]["errorUnexpected"];
       set(state => {
           const lastMessage = state.messages[state.messages.length - 1];
           if (lastMessage && lastMessage.sender === 'bot' && lastMessage.isStreaming) {
               const updatedMessage = { ...lastMessage, text: errorMessage, isStreaming: false };
               return { messages: [...state.messages.slice(0, -1), updatedMessage] };
           }
           get().addMessage("bot", { text: errorMessage });
           return state;
       });
      console.error("[handleResponse] Error during fetch or processing:", error);
    } finally {
      set({ isLoading: false });
    }
  },

  searchConversations: async (searchQuery) => {
    // ... (searchConversations 로직 동일) ...
      if (!searchQuery.trim()) {
      set({ searchResults: [], isSearching: false });
      return;
    }
    set({ isSearching: true, searchResults: [] });
    const user = get().user;
    const conversations = get().conversations;
    if (!user || !conversations) {
      set({ isSearching: false });
      return;
    }
    const results = [];
    const lowerCaseQuery = searchQuery.toLowerCase();
    for (const convo of conversations) {
      const messagesCollection = collection(
        get().db,
        "chats",
        user.uid,
        "conversations",
        convo.id,
        "messages"
      );
      const messagesSnapshot = await getDocs(messagesCollection);
      let foundInConvo = false;
      const matchingMessages = [];
      messagesSnapshot.forEach((doc) => {
        const message = doc.data();
        const content = message.text || "";
        if (content.toLowerCase().includes(lowerCaseQuery)) {
          foundInConvo = true;
          const snippetIndex = content.toLowerCase().indexOf(lowerCaseQuery);
          const start = Math.max(0, snippetIndex - 20);
          const end = Math.min(content.length, snippetIndex + 20);
          const snippet = `...${content.substring(start, end)}...`;
          matchingMessages.push(snippet);
        }
      });
      if (foundInConvo) {
        results.push({
          id: convo.id,
          title: convo.title || "Untitled Conversation",
          snippets: matchingMessages.slice(0, 3),
        });
      }
    }
    set({ searchResults: results, isSearching: false });
  },
});