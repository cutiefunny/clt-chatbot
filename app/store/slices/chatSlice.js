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

  updateLastMessage: (chunk) => {
    set((state) => {
      const lastMessage = state.messages[state.messages.length - 1];
      if (lastMessage && lastMessage.sender === 'bot') {
        const updatedMessage = {
          ...lastMessage,
          text: (lastMessage.text || '') + chunk,
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
    // 1. 로컬 상태 우선 업데이트 (즉각적인 UI 반응)
    set((state) => ({
      selectedOptions: {
        ...state.selectedOptions,
        [messageId]: optionValue,
      },
    }));

    // 2. Firestore에 비동기로 선택 상태 저장
    const { user, currentConversationId } = get();
    if (!user || !currentConversationId || !messageId) return;

    try {
      const messageRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "messages", messageId);
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
    set((state) => ({
      extractedSlots: { ...state.extractedSlots, ...newSlots },
    }));
  },

  clearExtractedSlots: () => {
    set({ extractedSlots: {} });
  },

  unsubscribeAllMessagesAndScenarios: () => {
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
      get().openScenarioPanel(item.action.value, extractedSlots);
    }
    clearExtractedSlots();
  },

  toggleConversationExpansion: (conversationId) => {
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
    set((state) => ({ messages: [...state.messages, newMessage] }));
    if (!newMessage.isStreaming) {
      const savedMessageId = await get().saveMessage(newMessage);
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg.id === newMessage.id ? { ...msg, id: savedMessageId } : msg
        ),
      }));
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
        await get().addMessage("bot", { text: "", isStreaming: true });
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';
        let buffer = '';
        let slotsFound = false;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          fullResponse += chunk;
          
          if (get().llmProvider === 'gemini' && !slotsFound) {
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
              get().updateLastMessage(textPart);
            }
          } else {
            get().updateLastMessage(chunk);
          }
        }
        
        // --- 👇 [수정된 부분] ---
        let finalMessageText = fullResponse;
        if (get().llmProvider === 'flowise') {
            set({ llmRawResponse: fullResponse });
            if (finalMessageText.toLowerCase().includes("change the vessel")) {
              finalMessageText += '\n\nor you can execute via below button.';
              finalMessageText += '\n\n[BUTTON:Vessel Schedule]';

              const bookingNoRegex = /\b([A-Z]{2}\d{10})\b/i;
              const match = finalMessageText.match(bookingNoRegex);
              if (match && match[1]) {
                  get().setExtractedSlots({ booking_no: match[1] });
              }
            }
        }
        
        set(state => {
            const lastMessage = state.messages[state.messages.length - 1];
            if (lastMessage && lastMessage.sender === 'bot') {
                const updatedMessage = {
                    ...lastMessage,
                    text: finalMessageText,
                    isStreaming: false,
                };
                return {
                    messages: [...state.messages.slice(0, -1), updatedMessage],
                };
            }
            return state;
        });
        
        await get().saveMessage(get().messages[get().messages.length - 1]);
        // --- 👆 [여기까지] ---

      } else {
        const data = await response.json();
        set({ llmRawResponse: data });
        const handler = responseHandlers[data.type];

        if (handler) {
          handler(data, get);
        } else {
          if (data.type !== "scenario_start" && data.type !== "scenario") {
            console.warn(`[ChatStore] Unhandled response type: ${data.type}`);
          }
        }
      }
    } catch (error) {
      const errorKey = getErrorKey(error);
      const { language } = get();
      const errorMessage =
        locales[language][errorKey] || locales[language]["errorUnexpected"];
      get().addMessage("bot", { text: errorMessage });
    } finally {
      set({ isLoading: false });
    }
  },

  searchConversations: async (searchQuery) => {
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