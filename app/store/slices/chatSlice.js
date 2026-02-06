// app/store/slices/chatSlice.js
import { locales } from "../../lib/locales";
import { MESSAGE_LIMIT } from "../../lib/constants";
import { 
  getConversation, 
  fetchMessages, 
  createMessage, 
  updateMessage,
  fetchScenarioSessions
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
      console.log('[resetMessages] Resetting all messages and state');
      set({
        messages: [],
        completedResponses: new Set(),
        selectedOptions: {},
        hasMoreMessages: true,
      });
    },

    /**
     * 초기 메시지 로드 (FastAPI 기반)
     */
    loadInitialMessages: async (conversationId) => {
      if (!conversationId) return;

      set({ isLoading: true });
      try {
        // 1. 대화 상세 정보 로드
        const conversationData = await getConversation(conversationId);

        // 2. 메시지 목록 로드 (api.js에서 이미 가공됨)
        const messages = await fetchMessages({
          queryKey: [null, conversationId],
          pageParam: 0,
        });

        // 3. 시나리오 세션 로드 (메시지가 있을 때만, 실패해도 계속 진행)
        let scenarioSessions = [];
        if (messages.length > 0) {
          try {
            scenarioSessions = await fetchScenarioSessions(conversationId);
          } catch (error) {
            console.warn('[loadInitialMessages] Failed to load scenario sessions:', error);
          }
        }
        const scenarioStates = {};
        const scenarioSessionIds = new Set();
        scenarioSessions.forEach(session => {
          scenarioSessionIds.add(session.id);
          scenarioStates[session.id] = {
            ...session,
            scenarioId: session.scenario_id,
            slots: session.slots || {},
            messages: session.messages || [],
            state: session.state || { scenarioId: session.scenario_id, currentNodeId: 'start', awaitingInput: false },
            isLoading: false
          };
        });

        // 4. 선택된 옵션 데이터 추출 및 시나리오 메시지 변환
        const newSelectedOptions = {};
        const processedMessages = messages.map(msg => {
          if (msg.selectedOption) newSelectedOptions[msg.id] = msg.selectedOption;
          
          // 시나리오 세션 ID가 있는 메시지를 scenario_bubble로 변환
          if (msg.scenarioSessionId && scenarioSessionIds.has(msg.scenarioSessionId)) {
            return { ...msg, type: 'scenario_bubble' };
          }
          
          // scenario_session_id가 없지만 시나리오 ID 형식인 경우 체크
          // (백엔드가 scenario_session_id를 반환하지 않는 경우 대비)
          if (msg.sender === 'user' && msg.text && /^[A-Za-z0-9_-]+$/.test(msg.text.trim())) {
            // 이 메시지 직후에 시나리오 세션이 생성되었는지 확인
            const matchingSession = scenarioSessions.find(session => 
              session.scenario_id === msg.text.trim()
            );
            if (matchingSession) {
              return { ...msg, type: 'scenario_bubble', scenarioSessionId: matchingSession.id };
            }
          }
          
          return msg;
        });

        set({
          messages: processedMessages,
          selectedOptions: newSelectedOptions,
          currentConversationTitle: conversationData.title || "New Chat",
          isLoading: false,
          hasMoreMessages: messages.length >= 15, // 초기 리미트 기준
          scenarioStates: { ...get().scenarioStates, ...scenarioStates }
        });
        
        console.log(`[chatSlice] Successfully loaded ${messages.length} messages and ${scenarioSessions.length} scenario sessions from FastAPI.`);
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
     * 메시지 저장 (FastAPI POST 연동)
     */
    saveMessage: async (message, conversationId = null) => {
      const { currentConversationId, createNewConversation, showEphemeralToast, language } = get();
      
      let activeConversationId = conversationId || currentConversationId;

      try {
        if (!activeConversationId) {
          activeConversationId = await createNewConversation(true);
        }

        // FastAPI createMessage 호출
        const savedMessage = await createMessage(activeConversationId, message);
        
        // 임시 ID(temp_)를 실제 DB ID로 교체
        if (String(message.id).startsWith("temp_")) {
          set((state) => ({
            messages: state.messages.map((msg) =>
              msg.id === message.id ? { ...msg, id: savedMessage.id, isStreaming: false } : msg
            ),
            // 선택 옵션 맵의 키도 변경
            selectedOptions: (() => {
              const newOpts = { ...state.selectedOptions };
              if (newOpts[message.id]) {
                newOpts[savedMessage.id] = newOpts[message.id];
                delete newOpts[message.id];
              }
              return newOpts;
            })()
          }));
        }

        return savedMessage.id;
      } catch (error) {
        handleError("Error saving message", error, {
          getStore: get,
          showToast: true
        });
        return null;
      }
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

      set((state) => ({ messages: [...state.messages, newMessage] }));

      if (!newMessage.isStreaming) {
        await get().saveMessage(newMessage);
      }
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
          set({
            messages: [...newMessages, ...messages],
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