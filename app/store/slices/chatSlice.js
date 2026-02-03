// app/store/slices/chatSlice.js
import {
  collection,
  addDoc,
  query,
  orderBy,
  getDocs, // onSnapshot 대신 getDocs 사용
  serverTimestamp,
  doc,
  updateDoc,
  limit,
  startAfter,
} from "firebase/firestore";
import { locales } from "../../lib/locales";
import { getErrorKey } from "../../lib/errorHandler";
import { handleResponse } from "../actions/chatResponseHandler";

const MESSAGE_LIMIT = 15;
// 이미지 명세에 맞춰 포트 및 주소 기본값 설정
const DEFAULT_FASTAPI_URL = "http://202.20.84.65:8083";

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
    // 리스너가 없으므로 unsubscribeMessages는 null로 초기화하고 관리하지 않음
    unsubscribeMessages: null,
    lastVisibleMessage: null,
    hasMoreMessages: true,

    // 메시지 초기화
    resetMessages: (language) => {
      set({
        messages: [],
        completedResponses: new Set(),
      });
    },

    loadInitialMessages: async (conversationId) => {
    if (!conversationId) return;
    
    set({ isLoading: true });
    try {
      // 1. 대화 기본 정보 로드 (이미지 규격 반영)
      const conversationData = await getConversation(conversationId);
      
      // 2. 해당 대화의 메시지 목록 로드
      // 이미지 규격: GET /conversations/{conversation_id}/messages
      const messages = await fetchMessages({ 
        queryKey: [null, conversationId], 
        pageParam: 0 
      });

      set({ 
        messages: Array.isArray(messages) ? messages : [],
        currentConversationTitle: conversationData.title || "New Chat",
        isLoading: false 
      });
    } catch (error) {
      console.error("Error loading initial messages:", error);
      const { showEphemeralToast } = get();
      showEphemeralToast("대화 내용을 불러오는데 실패했습니다.", "error");
      set({ isLoading: false, messages: [] });
    }
  },

    updateLastMessage: (payload) => {
      set((state) => {
        const lastMessage = state.messages[state.messages.length - 1];
        if (!lastMessage || lastMessage.sender !== "bot" || !lastMessage.isStreaming) {
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
            console.warn("updateLastMessage received unknown payload type:", payload.type);
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
        set((state) => ({
          selectedOptions: { ...state.selectedOptions, [messageId]: optionValue },
        }));
        return;
      }

      const previousSelectedOptions = get().selectedOptions;
      set((state) => ({
        selectedOptions: { ...state.selectedOptions, [messageId]: optionValue },
      }));

      const { user, language, showEphemeralToast, currentConversationId } = get();
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
        console.error("Error updating selected option:", error);
        const errorKey = getErrorKey(error);
        const message = locales[language]?.[errorKey] || "Failed to save selection.";
        showEphemeralToast(message, "error");
        set({ selectedOptions: previousSelectedOptions });
      }
    },

    setMessageFeedback: async (messageId, feedbackType) => {
      const { user, language, showEphemeralToast, currentConversationId, messages } = get();
      if (!user || !currentConversationId || !messageId) return;

      const messageIndex = messages.findIndex((m) => m.id === messageId);
      if (messageIndex === -1) return;

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
      } catch (error) {
        console.error("Error updating feedback:", error);
        const errorKey = getErrorKey(error);
        const errorMessage = locales[language]?.[errorKey] || "Failed to save feedback.";
        showEphemeralToast(errorMessage, "error");

        // Rollback
        const rollbackMessages = [...get().messages];
        const rollbackIndex = rollbackMessages.findIndex((m) => m.id === messageId);
        if (rollbackIndex !== -1) {
          rollbackMessages[rollbackIndex] = { ...rollbackMessages[rollbackIndex], feedback: originalFeedback };
          set({ messages: rollbackMessages });
        }
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
      // 메시지 리스너 해제 (이 코드를 적용하면 unsubscribeMessages는 null이지만 안전상 호출)
      get().unsubscribeMessages?.();
      set({ unsubscribeMessages: null });
      
      // [주의] 시나리오 리스너 해제
      // 시나리오 관련 슬라이스에서 onSnapshot을 쓰고 있다면 여기서 Listen이 발생할 수 있습니다.
      get().unsubscribeAllScenarioListeners?.();
    },

    handleShortcutClick: async (item, messageId) => {
      if (!item || !item.action) return;
      const {
        extractedSlots, clearExtractedSlots, setSelectedOption, openScenarioPanel,
        handleResponse, availableScenarios, language, showEphemeralToast,
        setMainInputValue, focusChatInput, sendTextShortcutImmediately
      } = get();

      if (messageId) {
        set((state) => ({
          selectedOptions: { ...state.selectedOptions, [messageId]: item.title },
        }));
        setSelectedOption(messageId, item.title);
      }

      if (item.action.type === "custom") {
        await handleResponse({ text: item.action.value, displayText: item.title });
      } else if (item.action.type === "text") {
        if (sendTextShortcutImmediately) {
           await handleResponse({ text: item.action.value, displayText: item.action.value });
        } else {
           setMainInputValue(item.action.value);
           focusChatInput();
        }
      } else if (item.action.type === "scenario") {
        const scenarioId = item.action.value;
        if (!availableScenarios.includes(scenarioId)) {
          const errorMessage = locales[language]?.["errorScenarioNotFound"] || "Scenario not found.";
          showEphemeralToast(errorMessage, "error");
        } else {
          openScenarioPanel?.(scenarioId, extractedSlots);
        }
      }
      clearExtractedSlots();
    },

    saveMessage: async (message, conversationId = null) => {
      const { user, language, showEphemeralToast, currentConversationId, createNewConversation, useFastApi } = get();

      if (useFastApi) return null; // FastAPI 모드에서는 Firestore 저장 스킵

      if (!user || !message || typeof message !== "object") return null;

      let activeConversationId = conversationId || currentConversationId;

      try {
        if (!activeConversationId) {
          activeConversationId = await createNewConversation(true);
          if (!activeConversationId) throw new Error("Failed to create conversation.");
        }

        const messageToSave = { ...message };
        const tempId = String(messageToSave.id).startsWith("temp_") ? messageToSave.id : null;
        Object.keys(messageToSave).forEach((key) => {
          if (messageToSave[key] === undefined) delete messageToSave[key];
        });
        if (messageToSave.node?.data) {
          const { content, replies } = messageToSave.node.data;
          messageToSave.node.data = { ...(content && { content }), ...(replies && { replies }) };
        }
        if (tempId) delete messageToSave.id;

        const messagesCollection = collection(get().db, "chats", user.uid, "conversations", activeConversationId, "messages");
        const messageRef = await addDoc(messagesCollection, { ...messageToSave, createdAt: serverTimestamp() });

        await updateDoc(doc(get().db, "chats", user.uid, "conversations", activeConversationId), { updatedAt: serverTimestamp() });

        // 로컬 상태 업데이트 (Temp ID 교체 등)
        if (tempId) {
          let selectedOptionValue = null;
          if (activeConversationId === get().currentConversationId) {
            set((state) => {
              const newSelectedOptions = { ...state.selectedOptions };
              if (newSelectedOptions[tempId]) {
                selectedOptionValue = newSelectedOptions[tempId];
                newSelectedOptions[messageRef.id] = selectedOptionValue;
                delete newSelectedOptions[tempId];
              }
              const newMessages = state.messages.map((msg) =>
                msg.id === tempId ? { ...message, id: messageRef.id, isStreaming: false } : msg
              );
              return { messages: newMessages, selectedOptions: newSelectedOptions };
            });
          } else {
            selectedOptionValue = get().selectedOptions[tempId];
          }
          if (selectedOptionValue) {
            await get().setSelectedOption(messageRef.id, selectedOptionValue);
          }
        }
        return messageRef.id;
      } catch (error) {
        console.error("saveMessage error:", error);
        const errorKey = getErrorKey(error);
        const errorMessage = locales[language]?.[errorKey] || "Failed to save message.";
        showEphemeralToast(errorMessage, "error");
        
        // 에러 시 임시 메시지 롤백
        if (String(message?.id).startsWith("temp_") && activeConversationId === get().currentConversationId) {
          set((state) => ({ messages: state.messages.filter((msg) => msg.id !== message.id) }));
        }
        return null;
      }
    },

    addMessage: async (sender, messageData) => {
      let newMessage;
      const temporaryId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

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
      const { user, language, showEphemeralToast, currentConversationId, lastVisibleMessage, hasMoreMessages, messages } = get();

      if (!user || !currentConversationId || !hasMoreMessages || !lastVisibleMessage || get().isLoading) return;

      set({ isLoading: true });

      try {
        const messagesRef = collection(get().db, "chats", user.uid, "conversations", currentConversationId, "messages");
        const q = query(
          messagesRef,
          orderBy("createdAt", "desc"),
          startAfter(lastVisibleMessage),
          limit(MESSAGE_LIMIT)
        );
        
        // 여기도 마찬가지로 onSnapshot 대신 getDocs 사용
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
          set({ hasMoreMessages: false });
          return;
        }

        const newMessages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).reverse();
        const newLastVisible = snapshot.docs[snapshot.docs.length - 1];
        
        const newSelectedOptions = { ...get().selectedOptions };
        newMessages.forEach((msg) => {
          if (msg.selectedOption) newSelectedOptions[msg.id] = msg.selectedOption;
        });

        set({
          messages: [messages[0], ...newMessages, ...messages.slice(1)],
          lastVisibleMessage: newLastVisible,
          hasMoreMessages: snapshot.docs.length === MESSAGE_LIMIT,
          selectedOptions: newSelectedOptions,
        });
      } catch (error) {
        console.error("Error loading more messages:", error);
        const errorKey = getErrorKey(error);
        const message = locales[language]?.[errorKey] || "Failed to load more messages.";
        showEphemeralToast(message, "error");
        set({ hasMoreMessages: false });
      } finally {
        set({ isLoading: false });
      }
    },

    handleResponse: (messagePayload) => handleResponse(get, set, messagePayload),
  };
};