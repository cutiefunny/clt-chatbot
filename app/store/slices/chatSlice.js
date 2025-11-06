// app/store/slices/chatSlice.js
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  getDocs,
  serverTimestamp,
  // deleteDoc, // conversationSlice에서 사용
  doc,
  updateDoc,
  limit,
  startAfter,
  // where, // 검색 슬라이스에서 사용
  writeBatch, // 메시지 저장 관련 로직에서 필요할 수 있음
} from "firebase/firestore";
import { locales } from "../../lib/locales";
import { getErrorKey } from "../../lib/errorHandler";
// --- 👇 [추가] handleResponse 임포트 ---
import { handleResponse } from "../actions/chatResponseHandler";
// --- 👆 [추가] ---

const MESSAGE_LIMIT = 15;

// 초기 메시지 함수 (chatSlice가 관리)
const getInitialMessages = (lang = "ko") => {
  const initialText =
    locales[lang]?.initialBotMessage ||
    locales["en"]?.initialBotMessage ||
    "Hello! How can I help you?";
  return [{ id: "initial", sender: "bot", text: initialText }];
};

// --- 👇 [제거] processFlowiseStream 헬퍼 (lib/streamProcessors.js로 이동) ---
// async function* processFlowiseStream(reader, decoder, get) { ... }
// --- 👆 [제거] ---

// --- 👇 [제거] processGeminiStream 헬퍼 (lib/streamProcessors.js로 이동) ---
// async function* processGeminiStream(reader, decoder, get) { ... }
// --- 👆 [제거] ---

export const createChatSlice = (set, get) => {
  // --- 👇 [제거] responseHandlers (actions/chatResponseHandler.js로 이동) ---
  // const responseHandlers = { ... };
  // --- 👆 [제거] ---

  return {
    // State
    messages: getInitialMessages("ko"),
    isLoading: false,
    pendingResponses: new Set(),
    completedResponses: new Set(),
    slots: {},
    extractedSlots: {},
    llmRawResponse: null,
    selectedOptions: {},
    unsubscribeMessages: null,
    lastVisibleMessage: null,
    hasMoreMessages: true,

    // Actions
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
    },

    loadInitialMessages: async (conversationId) => {
      const { user, language, showEphemeralToast } = get();
      if (!user || !conversationId) return;

      const initialMessage = getInitialMessages(language)[0];
      set({
        isLoading: true,
        messages: [initialMessage],
        lastVisibleMessage: null,
        hasMoreMessages: true,
        selectedOptions: {},
      });

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

    updateLastMessage: (chunk, replace = false) => {
      set((state) => {
        const lastMessage = state.messages[state.messages.length - 1];
        if (
          lastMessage &&
          lastMessage.sender === "bot" &&
          lastMessage.isStreaming
        ) {
          const updatedText = replace
            ? chunk
            : (lastMessage.text || "") + chunk;
          const updatedMessage = { ...lastMessage, text: updatedText };
          return {
            messages: [...state.messages.slice(0, -1), updatedMessage],
          };
        }
        return state;
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
      } = get();

      if (messageId) {
        set((state) => ({
          selectedOptions: { ...state.selectedOptions, [messageId]: item.title },
        }));
        get().setSelectedOption(messageId, item.title);
      }

      // --- ▼ 수정 ▼ ---
      if (item.action.type === "custom") {
        await handleResponse({
          text: item.action.value,
          displayText: item.title,
        });
      } else if (item.action.type === "text") {
        await handleResponse({
          text: item.action.value,
          displayText: item.action.value, // 'text' 타입은 value를 displayText로 사용
        });
      // --- ▲ 수정 ▲ ---
      } else if (item.action.type === "scenario") {
        get().openScenarioPanel?.(item.action.value, extractedSlots);
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
      } = get();
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

    // --- 👇 [수정] handleResponse를 외부 파일에서 가져와 연결 ---
    handleResponse: (messagePayload) => handleResponse(get, set, messagePayload),
    // --- 👆 [수정] ---
    //
    // --- 👇 [제거] handleResponse의 거대한 함수 블록 (actions/chatResponseHandler.js로 이동) ---
    // handleResponse: async (messagePayload) => { ... }
    // --- 👆 [제거] ---
  }; // end return store object
}; // end createChatSlice