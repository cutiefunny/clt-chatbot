// app/store/slices/chatSlice.js
import { locales } from "../../lib/locales";
import { MESSAGE_LIMIT } from "../../lib/constants";
import { 
  getConversation, 
  fetchMessages, 
  createMessage, 
  updateMessage 
} from "@/app/lib/api";
import { getErrorKey, handleError } from "../../lib/errorHandler";
import { handleResponse } from "../actions/chatResponseHandler";

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
    unsubscribeMessages: null, // REST API 환경이므로 항상 null 유지
    lastVisibleMessage: null, // 페이지네이션용 (skip/offset으로 대체 가능)
    hasMoreMessages: true,

    // 메시지 초기화
    resetMessages: (language) => {
      set({
        messages: [],
        completedResponses: new Set(),
      });
    },

    /**
     * 초기 메시지 로드 (FastAPI 기반)
     */
    loadInitialMessages: async (conversationId) => {
      if (!conversationId) return;
      
      // 이미 같은 대화방의 메시지를 로딩 중이면 중복 호출 방지
      const currentState = get();
      if (currentState.isLoading && currentState.currentConversationId === conversationId) {
        console.log(`[loadInitialMessages] Already loading messages for ${conversationId}. Skipping.`);
        return;
      }

      set({ isLoading: true });
      try {
        // 1. 대화 상세 정보 로드
        const conversationData = await getConversation(conversationId);

        // 2. 메시지 목록 로드 (api.js에서 이미 가공됨)
        const messages = await fetchMessages({
          queryKey: [null, conversationId],
          pageParam: 0,
        });

        // 3. 선택된 옵션 데이터 추출
        const newSelectedOptions = {};
        messages.forEach(msg => {
          if (msg.selectedOption) newSelectedOptions[msg.id] = msg.selectedOption;
        });

        // 4. 중복 제거: 동일한 ID가 있는 경우 첫 번째 것만 유지
        const uniqueMessages = [];
        const seenIds = new Set();
        for (const msg of messages) {
          if (!seenIds.has(msg.id)) {
            seenIds.add(msg.id);
            uniqueMessages.push(msg);
          }
        }

        set({
          messages: uniqueMessages,
          selectedOptions: newSelectedOptions,
          currentConversationTitle: conversationData.title || "New Chat",
          isLoading: false,
          hasMoreMessages: messages.length >= 15, // 초기 리미트 기준
        });
        
        console.log(`[chatSlice] Successfully loaded ${uniqueMessages.length} unique messages from FastAPI.`);
      } catch (error) {
        handleError("Error loading initial messages", error, { 
          getStore: get,
          showToast: true 
        });
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
            return state;
        }

        return {
          messages: [...state.messages.slice(0, -1), updatedMessage],
        };
      });
    },

    /**
     * 선택 옵션 저장 (FastAPI PATCH 연동)
     */
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

      const { currentConversationId, showEphemeralToast, language } = get();
      if (!currentConversationId) return;

      try {
        await updateMessage(currentConversationId, messageId, { selectedOption: optionValue });
      } catch (error) {
        handleError("Error updating selected option", error, {
          getStore: get,
          showToast: true
        });
        set({ selectedOptions: previousSelectedOptions });
      }
    },

    /**
     * 피드백 저장 (FastAPI PATCH 연동)
     */
    setMessageFeedback: async (messageId, feedbackType) => {
      const { currentConversationId, messages, showEphemeralToast, language } = get();
      if (!currentConversationId || !messageId) return;

      const messageIndex = messages.findIndex((m) => m.id === messageId);
      if (messageIndex === -1) return;

      const message = messages[messageIndex];
      const originalFeedback = message.feedback || null;
      const newFeedback = originalFeedback === feedbackType ? null : feedbackType;

      // 낙관적 업데이트
      const updatedMessages = [...messages];
      updatedMessages[messageIndex] = { ...message, feedback: newFeedback };
      set({ messages: updatedMessages });

      try {
        await updateMessage(currentConversationId, messageId, { feedback: newFeedback });
      } catch (error) {
        handleError("Error updating feedback", error, {
          getStore: get,
          showToast: true
        });
        
        // 롤백
        const rollbackMessages = [...get().messages];
        if (messageIndex !== -1) {
          rollbackMessages[messageIndex] = { ...message, feedback: originalFeedback };
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
      // REST API에서는 해제할 리스너가 없음
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
        const scenarioExists = availableScenarios.some(s => s.id === scenarioId);
        if (!scenarioExists) {
          showEphemeralToast(locales[language]?.["errorScenarioNotFound"] || "시나리오를 찾을 수 없습니다.", "error");
        } else {
          openScenarioPanel?.(scenarioId, extractedSlots);
        }
      }
      clearExtractedSlots();
    },

    /**
     * 메시지 ID 업데이트 (백엔드 응답에서 받은 실제 ID로 교체)
     * 참고: /chat API가 메시지를 저장하므로 별도 저장 불필요
     */
    updateMessageId: (tempId, realId) => {
      if (!tempId || !realId || tempId === realId) return;

      set((state) => {
        // 이미 해당 ID가 존재하는지 확인 (중복 방지)
        const alreadyExists = state.messages.some(msg => msg.id === realId);
        
        if (alreadyExists) {
          // 이미 존재하면 임시 메시지만 제거
          return {
            messages: state.messages.filter(msg => msg.id !== tempId)
          };
        }
        
        // 존재하지 않으면 ID 교체
        return {
          messages: state.messages.map((msg) =>
            msg.id === tempId ? { ...msg, id: realId, isStreaming: false } : msg
          ),
          // 선택 옵션 맵의 키도 변경
          selectedOptions: (() => {
            const newOpts = { ...state.selectedOptions };
            if (newOpts[tempId]) {
              newOpts[realId] = newOpts[tempId];
              delete newOpts[tempId];
            }
            return newOpts;
          })()
        };
      });
    },

    addMessage: async (sender, messageData) => {
      const temporaryId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      let newMessage = {
        id: messageData.id || temporaryId,
        sender: sender === "user" ? "user" : "bot",
        text: messageData.text,
        scenarios: messageData.scenarios,
        isStreaming: messageData.isStreaming || false,
        type: messageData.type,
        scenarioId: messageData.scenarioId,
        scenarioSessionId: messageData.scenarioSessionId,
        feedback: null,
        chartData: messageData.chartData || null,
      };

      // 중복 메시지 추가 방지
      const exists = get().messages.some(msg => msg.id === newMessage.id);
      if (exists) {
        console.warn(`[addMessage] Message with id ${newMessage.id} already exists. Skipping.`);
        return;
      }

      set((state) => ({ messages: [...state.messages, newMessage] }));

      // saveMessage 제거: 백엔드 /chat API에서 이미 메시지를 저장함
      // if (!newMessage.isStreaming) {
      //   await get().saveMessage(newMessage);
      // }
    },

    /**
     * 추가 메시지 로드 (FastAPI 페이지네이션)
     */
    loadMoreMessages: async () => {
      const { currentConversationId, messages, hasMoreMessages, isLoading, showEphemeralToast, language } = get();

      if (!currentConversationId || !hasMoreMessages || isLoading) return;

      set({ isLoading: true });

      try {
        const skip = messages.length;
        const newMessages = await fetchMessages({
          queryKey: [null, currentConversationId],
          pageParam: skip,
        });

        if (newMessages.length === 0) {
          set({ hasMoreMessages: false });
        } else {
          // 중복 제거: 이미 있는 메시지는 제외
          const existingIds = new Set(messages.map(m => m.id));
          const uniqueNewMessages = newMessages.filter(m => !existingIds.has(m.id));
          
          set({
            messages: [...uniqueNewMessages, ...messages],
            hasMoreMessages: newMessages.length === MESSAGE_LIMIT,
          });
        }
      } catch (error) {
        handleError("Error loading more messages", error, {
          getStore: get,
          showToast: true
        });
        set({ hasMoreMessages: false });
      } finally {
        set({ isLoading: false });
      }
    },

    handleResponse: (messagePayload) => handleResponse(get, set, messagePayload),
  };
};