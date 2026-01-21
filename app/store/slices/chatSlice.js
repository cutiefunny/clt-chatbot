// app/store/slices/chatSlice.js
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  getDocs,
  serverTimestamp,
  doc,
  updateDoc,
  limit,
  startAfter,
  writeBatch,
} from "firebase/firestore";
import { locales } from "../../lib/locales";
import { getErrorKey } from "../../lib/errorHandler";
import { handleResponse } from "../actions/chatResponseHandler";

const MESSAGE_LIMIT = 15;
// --- 👇 [수정] 상수 제거 또는 동적 사용을 위해 주석 처리 ---
// const FASTAPI_BASE_URL = "http://210.114.17.65:8001"; 

const getInitialMessages = (lang = "ko") => {
  const initialText =
    locales[lang]?.initialBotMessage ||
    locales["en"]?.initialBotMessage ||
    "Hello! How can I help you?";
  return [{ id: "initial", sender: "bot", text: initialText }];
};

export const createChatSlice = (set, get) => {

  return {
    // State
    messages: getInitialMessages("ko"),
    isLoading: false,
    pendingResponses: new Set(),
    completedResponses: new Set(),
    slots: {},
    setSlots: (newSlots) => set({ slots: newSlots }),
    extractedSlots: {},
    llmRawResponse: null,
    selectedOptions: {},
    unsubscribeMessages: null,
    lastVisibleMessage: null,
    hasMoreMessages: true,
    // --- 👇 [추가] SSE 연결 객체 저장 ---
    sseEventSource: null,
    // --- 👆 [추가] ---

    // Actions
    // ... (resetMessages 등 기존 액션 유지) ...
    resetMessages: (language) => {
      set({
        messages: getInitialMessages(language),
        lastVisibleMessage: null,
        hasMoreMessages: true,
        selectedOptions: {},
        isLoading: false,
      });
      get().unsubscribeMessages?.();
      set({ unsubscribeMessages: null });
      get().setMainInputValue("");
    },

    // --- 👇 [추가] SSE 연결 및 해제 액션 ---
    connectToSSE: () => {
        const { useFastApi, useLocalFastApiUrl, sseEventSource, addMessage } = get();
        
        // FastAPI 모드가 아니거나 이미 연결되어 있으면 중단
        if (!useFastApi || sseEventSource) return;

        // URL 결정 (기존 포트 8001 사용, 필요시 변경 가능)
        const baseUrl = useLocalFastApiUrl ? "http://localhost:8001" : "http://210.114.17.65:8001";
        const sseUrl = `${baseUrl}/events`;

        console.log(`[SSE] Connecting to ${sseUrl}...`);

        const newEventSource = new EventSource(sseUrl);

        newEventSource.onmessage = (event) => {
            try {
                // 참고 코드의 로직 적용: 싱글 쿼트를 더블 쿼트로 변환하여 파싱
                const rawData = event.data.replace(/'/g, '"');
                const data = JSON.parse(rawData);
                console.log("[SSE] Message received:", data);

                // 메시지 내용 추출 (참고 코드의 data.message 사용)
                const messageText = data.message || JSON.stringify(data);
                
                // 채팅창에 봇 메시지로 추가
                addMessage('bot', { 
                    text: messageText,
                    type: 'text' 
                });
            } catch (error) {
                console.error("[SSE] Error parsing message:", error, event.data);
            }
        };

        newEventSource.onerror = (err) => {
            console.error("[SSE] Connection error:", err);
            newEventSource.close();
            set({ sseEventSource: null });
            // 필요하다면 여기서 재연결 로직(setTimeout 등) 추가 가능
        };

        set({ sseEventSource: newEventSource });
    },

    disconnectSSE: () => {
        const { sseEventSource } = get();
        if (sseEventSource) {
            console.log("[SSE] Disconnecting...");
            sseEventSource.close();
            set({ sseEventSource: null });
        }
    },

    loadInitialMessages: async (conversationId) => {
      const { user, language, showEphemeralToast, useFastApi, useLocalFastApiUrl } = get(); // useLocalFastApiUrl 추가
      if (!user || !conversationId) return;

      const initialMessage = getInitialMessages(language)[0];
      set({
        isLoading: true,
        messages: [initialMessage],
        lastVisibleMessage: null,
        hasMoreMessages: true,
        selectedOptions: {},
        mainInputValue: "",
      });

      if (useFastApi) {
        try {

          const baseUrl = useLocalFastApiUrl ? "http://localhost:8001" : "http://210.114.17.65:8001";
          const response = await fetch(`${baseUrl}/conversations/${conversationId}`);
          
          if (!response.ok) throw new Error("Failed to load messages");
          
          const data = await response.json();
          const apiMessagesRaw = data.messages || [];
          
          const mappedMessages = apiMessagesRaw.map((msg) => ({
            id: msg.id,
            sender: msg.role === 'user' ? 'user' : 'bot',
            text: msg.content,
            createdAt: msg.created_at,
          }));
          
          set({
            messages: [initialMessage, ...mappedMessages],
            isLoading: false,
            hasMoreMessages: false,
          });
        } catch (error) {
          console.error("FastAPI loadInitialMessages error:", error);
          showEphemeralToast("Failed to load messages (API).", "error");
          set({ isLoading: false });
        }
        return;
      }

      try {
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

        get().unsubscribeMessages?.();

        const unsubscribe = onSnapshot(
          q,
          (messagesSnapshot) => {
            const newMessages = messagesSnapshot.docs
              .map((doc) => ({ id: doc.id, ...doc.data() }))
              .reverse();
            const lastVisible =
              messagesSnapshot.docs[messagesSnapshot.docs.length - 1];
            const newSelectedOptions = {};
            newMessages.forEach((msg) => {
              if (msg.selectedOption)
                newSelectedOptions[msg.id] = msg.selectedOption;
            });

            let finalMessages = [initialMessage, ...newMessages];

            if (get().pendingResponses.has(conversationId)) {
              const thinkingText =
                locales[language]?.["statusGenerating"] || "Generating...";
              const tempBotMessage = {
                id: `temp_pending_${conversationId}`,
                sender: "bot",
                text: thinkingText,
                isStreaming: true,
                feedback: null,
              };
              finalMessages.push(tempBotMessage);
            }

            set({
              messages: finalMessages,
              lastVisibleMessage: lastVisible,
              hasMoreMessages: messagesSnapshot.docs.length === MESSAGE_LIMIT,
              isLoading: false,
              selectedOptions: newSelectedOptions,
            });
          },
          (error) => {
            // ... (에러 핸들링 유지) ...
            console.error(
              `Error listening to initial messages for ${conversationId}:`,
              error
            );
            const errorKey = getErrorKey(error);
            const message =
              locales[language]?.[errorKey] ||
              locales["en"]?.errorUnexpected ||
              "Failed to load messages.";
            showEphemeralToast(message, "error");
            set({ isLoading: false, hasMoreMessages: false });
            unsubscribe();
            set({ unsubscribeMessages: null });
          }
        );
        set({ unsubscribeMessages: unsubscribe });
      } catch (error) {
        // ... (에러 핸들링 유지) ...
        console.error(
          `Error setting up initial message listener for ${conversationId}:`,
          error
        );
        const errorKey = getErrorKey(error);
        const message =
          locales[language]?.[errorKey] ||
          locales["en"]?.errorUnexpected ||
          "Failed to load messages.";
        showEphemeralToast(message, "error");
        set({
          isLoading: false,
          hasMoreMessages: false,
          messages: [initialMessage],
        });
      }
    },

    // ... (updateLastMessage, setSelectedOption, setMessageFeedback 등 나머지 액션 유지) ...
    
    updateLastMessage: (payload) => {
      set((state) => {
        const lastMessage = state.messages[state.messages.length - 1];
        if (
          !lastMessage ||
          lastMessage.sender !== "bot" ||
          !lastMessage.isStreaming
        ) {
          return state; 
        }

        let updatedMessage = { ...lastMessage };

        switch (payload.type) {
          case "text":
            updatedMessage.text = payload.replace
              ? payload.data
              : (lastMessage.text || "") + payload.data;
            break;
          case "button":
            updatedMessage.text = (lastMessage.text || "") + payload.data;
            break;
          case "chart":
            updatedMessage.chartData = payload.data;
            updatedMessage.hasRichContent = true;
            break;
          default:
            console.warn(
              "updateLastMessage received unknown payload type:",
              payload.type
            );
            return state; 
        }

        return {
          messages: [...state.messages.slice(0, -1), updatedMessage],
        };
      });
    },

    setSelectedOption: async (messageId, optionValue) => {
      const isTemporaryId = String(messageId).startsWith("temp_");
      if (isTemporaryId) {
        console.warn(
          "setSelectedOption called with temporary ID, skipping Firestore update for now:",
          messageId
        );
        set((state) => ({
          selectedOptions: { ...state.selectedOptions, [messageId]: optionValue },
        }));
        return;
      }

      const previousSelectedOptions = get().selectedOptions;
      set((state) => ({
        selectedOptions: { ...state.selectedOptions, [messageId]: optionValue },
      }));

      const { user, language, showEphemeralToast, currentConversationId } =
        get();
      if (!user || !currentConversationId || !messageId) return;

      try {
        const messageRef = doc(
          get().db,
          "chats",
          user.uid,
          "conversations",
          currentConversationId,
          "messages",
          String(messageId)
        );
        await updateDoc(messageRef, { selectedOption: optionValue });
      } catch (error) {
        console.error("Error updating selected option in Firestore:", error);
        const errorKey = getErrorKey(error);
        const message =
          locales[language]?.[errorKey] ||
          locales["en"]?.errorUnexpected ||
          "Failed to save selection.";
        showEphemeralToast(message, "error");
        set({ selectedOptions: previousSelectedOptions });
      }
    },

    setMessageFeedback: async (messageId, feedbackType) => {
      const { user, language, showEphemeralToast, currentConversationId, messages } =
        get();
      if (!user || !currentConversationId || !messageId) {
        console.warn(
          "[setMessageFeedback] Missing user, conversationId, or messageId."
        );
        return;
      }

      const messageIndex = messages.findIndex((m) => m.id === messageId);
      if (messageIndex === -1) {
        console.warn(`[setMessageFeedback] Message not found: ${messageId}`);
        return;
      }

      const message = messages[messageIndex];
      const originalFeedback = message.feedback || null;
      const newFeedback = originalFeedback === feedbackType ? null : feedbackType;

      const updatedMessages = [...messages];
      updatedMessages[messageIndex] = { ...message, feedback: newFeedback };
      set({ messages: updatedMessages });

      try {
        const messageRef = doc(
          get().db,
          "chats",
          user.uid,
          "conversations",
          currentConversationId,
          "messages",
          messageId
        );
        await updateDoc(messageRef, { feedback: newFeedback });
        console.log(`Feedback set to '${newFeedback}' for message ${messageId}`);
      } catch (error) {
        console.error("Error updating message feedback in Firestore:", error);
        const errorKey = getErrorKey(error);
        const errorMessage =
          locales[language]?.[errorKey] ||
          locales["en"]?.errorUnexpected ||
          "Failed to save feedback.";
        showEphemeralToast(errorMessage, "error");

        const rollbackMessages = [...get().messages];
        const rollbackMessageIndex = rollbackMessages.findIndex(
          (m) => m.id === messageId
        );
        if (rollbackMessageIndex !== -1) {
          rollbackMessages[rollbackMessageIndex] = {
            ...rollbackMessages[rollbackMessageIndex],
            feedback: originalFeedback,
          };
          set({ messages: rollbackMessages });
        }
      }
    },

    setExtractedSlots: (newSlots) => {
      console.log("[ChatStore] Setting extracted slots:", newSlots);
      set((state) => ({
        extractedSlots: { ...state.extractedSlots, ...newSlots },
      }));
    },

    clearExtractedSlots: () => {
      set({ extractedSlots: {} });
    },

    unsubscribeAllMessagesAndScenarios: () => {
      get().unsubscribeMessages?.();
      set({ unsubscribeMessages: null });
      get().unsubscribeAllScenarioListeners?.();
    },

    handleShortcutClick: async (item, messageId) => {
      if (!item || !item.action) return;
      const {
        extractedSlots,
        clearExtractedSlots,
        setSelectedOption,
        openScenarioPanel,
        handleResponse,
        availableScenarios, 
        language,
        showEphemeralToast,
        setMainInputValue, 
        focusChatInput, 
        sendTextShortcutImmediately 
      } = get();

      if (messageId) {
        set((state) => ({
          selectedOptions: { ...state.selectedOptions, [messageId]: item.title },
        }));
        get().setSelectedOption(messageId, item.title);
      }

      if (item.action.type === "custom") {
        await handleResponse({
          text: item.action.value,
          displayText: item.title,
        });
      } else if (item.action.type === "text") {
        if (sendTextShortcutImmediately) {
           await handleResponse({
            text: item.action.value,
            displayText: item.action.value, 
          });
        } else {
           setMainInputValue(item.action.value); 
           focusChatInput();
        }
      } else if (item.action.type === "scenario") {
        const scenarioId = item.action.value;

        if (!availableScenarios.includes(scenarioId)) {
          console.warn(
            `[handleShortcutClick] Scenario not found: ${scenarioId}. Shortcut title: "${item.title}"`
          );
          const errorMessage =
            locales[language]?.["errorScenarioNotFound"] ||
            "The linked scenario could not be found. Please contact an administrator.";
          
          showEphemeralToast(errorMessage, "error");
        } else {
          get().openScenarioPanel?.(scenarioId, extractedSlots);
        }
      } else {
        console.warn(`Unsupported shortcut action type: ${item.action.type}`);
      }
      clearExtractedSlots();
    },

    saveMessage: async (message, conversationId = null) => {
      const {
        user,
        language,
        showEphemeralToast,
        currentConversationId: globalConversationId,
        createNewConversation,
        useFastApi, 
      } = get();

      if (useFastApi) {
        // console.log("FastAPI mode enabled. Skipping Firestore save in saveMessage.");
        return null;
      }

      if (!user || !message || typeof message !== "object") {
        if (!message || typeof message !== "object")
          console.error("saveMessage invalid message:", message);
        return null;
      }

      let activeConversationId = conversationId || globalConversationId;

      try {
        if (!activeConversationId) {
          console.log("No active conversation, creating new one and waiting...");
          activeConversationId = await createNewConversation(true);
          if (!activeConversationId) {
            throw new Error(
              "Failed to get conversation ID after creation attempt (returned null)."
            );
          }
          console.log(
            `Using newly created and loaded conversation ID: ${activeConversationId}`
          );
        }

        const messageToSave = { ...message };
        const tempId = String(messageToSave.id).startsWith("temp_")
          ? messageToSave.id
          : null;
        Object.keys(messageToSave).forEach((key) => {
          if (messageToSave[key] === undefined) delete messageToSave[key];
        });
        if (messageToSave.node?.data) {
          const { content, replies } = messageToSave.node.data;
          messageToSave.node.data = {
            ...(content && { content }),
            ...(replies && { replies }),
          };
        }
        if (tempId) delete messageToSave.id;

        console.log(`Saving message to conversation: ${activeConversationId}`);
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
          doc(
            get().db,
            "chats",
            user.uid,
            "conversations",
            activeConversationId
          ),
          { updatedAt: serverTimestamp() }
        );
        console.log(`Message saved with ID: ${messageRef.id}`);

        if (tempId) {
          let selectedOptionValue = null;
          const isStillOnSameConversation =
            activeConversationId === get().currentConversationId;

          if (isStillOnSameConversation) {
            set((state) => {
              const newSelectedOptions = { ...state.selectedOptions };
              if (newSelectedOptions[tempId]) {
                selectedOptionValue = newSelectedOptions[tempId];
                newSelectedOptions[messageRef.id] = selectedOptionValue;
                delete newSelectedOptions[tempId];
              }

              let newMessages = state.messages;
              const alreadyExists = state.messages.some(
                (m) => m.id === messageRef.id
              );

              if (alreadyExists) {
                newMessages = state.messages.filter(
                  (msg) => msg.id !== tempId
                );
              } else {
                newMessages = state.messages.map((msg) =>
                  msg.id === tempId
                    ? { ...message, id: messageRef.id, isStreaming: false }
                    : msg
                );
              }

              return {
                messages: newMessages,
                selectedOptions: newSelectedOptions,
              };
            });
          } else {
            console.log(
              `[saveMessage] User switched conversation. Skipping local state update for tempId: ${tempId}.`
            );
            selectedOptionValue = get().selectedOptions[tempId];
          }

          if (selectedOptionValue) {
            await get().setSelectedOption(messageRef.id, selectedOptionValue);
          }
        }

        return messageRef.id;
      } catch (error) {
        console.error(
          `Error in saveMessage (target convo ID: ${activeConversationId}):`,
          error
        );
        const errorKey = getErrorKey(error);
        const errorMessage =
          locales[language]?.[errorKey] ||
          locales["en"]?.errorUnexpected ||
          "Failed to save message.";
        showEphemeralToast(errorMessage, "error");

        if (
          String(message?.id).startsWith("temp_") &&
          activeConversationId === get().currentConversationId
        ) {
          set((state) => ({
            messages: state.messages.filter((msg) => msg.id !== message.id),
          }));
        }
        return null;
      }
    },

    addMessage: async (sender, messageData) => {
      let newMessage;
      const temporaryId = `temp_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 7)}`;

      if (sender === "user") {
        newMessage = { id: temporaryId, sender, ...messageData };
      } else {
        newMessage = {
          id: messageData.id || temporaryId,
          sender: "bot",
          text: messageData.text,
          scenarios: messageData.scenarios,
          isStreaming: messageData.isStreaming || false,
          type: messageData.type,
          scenarioId: messageData.scenarioId,
          scenarioSessionId: messageData.scenarioSessionId,
          feedback: null,
          chartData: messageData.chartData || null,
        };
      }

      set((state) => ({ messages: [...state.messages, newMessage] }));

      if (!newMessage.isStreaming) {
        await get().saveMessage(newMessage, null);
      }
    },

    loadMoreMessages: async () => {
      const {
        user,
        language,
        showEphemeralToast,
        currentConversationId,
        lastVisibleMessage,
        hasMoreMessages,
        messages,
      } = get();
      if (
        !user ||
        !currentConversationId ||
        !hasMoreMessages ||
        !lastVisibleMessage ||
        get().isLoading
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

        if (snapshot.empty) {
          set({ hasMoreMessages: false });
          return;
        }

        const newMessages = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .reverse();
        const newLastVisible =
          snapshot.docs[snapshot.docs.length - 1];
        const initialMessage = messages[0];
        const existingMessages = messages.slice(1);

        const newSelectedOptions = { ...get().selectedOptions };
        newMessages.forEach((msg) => {
          if (msg.selectedOption)
            newSelectedOptions[msg.id] = msg.selectedOption;
        });

        set({
          messages: [initialMessage, ...newMessages, ...existingMessages],
          lastVisibleMessage: newLastVisible,
          hasMoreMessages: snapshot.docs.length === MESSAGE_LIMIT,
          selectedOptions: newSelectedOptions,
        });
      } catch (error) {
        console.error("Error loading more messages:", error);
        const errorKey = getErrorKey(error);
        const message =
          locales[language]?.[errorKey] ||
          locales["en"]?.errorUnexpected ||
          "Failed to load more messages.";
        showEphemeralToast(message, "error");
        set({ hasMoreMessages: false });
      } finally {
        set({ isLoading: false });
      }
    },

    handleResponse: (messagePayload) => handleResponse(get, set, messagePayload),
  };
};