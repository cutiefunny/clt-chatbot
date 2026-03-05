// app/store/slices/chatSlice.js
import { locales } from "../../lib/locales";
import { getErrorKey } from "../../lib/errorHandler";
import { handleResponse } from "../actions/chatResponseHandler";
import { MESSAGE_LIMIT, FASTAPI_BASE_URL } from "../../lib/constants";

import {
  getInitialMessages,
  loadInitialMessages,
  saveMessage,
  loadMoreMessages,
  setSelectedOptionAction
} from "../actions/chatStorageActions";

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
      get().setMainInputValue(""); // 입력창 초기화
    },

    loadInitialMessages: async (conversationId) => loadInitialMessages(get, set, conversationId),

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

    setSelectedOption: async (messageId, optionValue) => setSelectedOptionAction(get, set, messageId, optionValue),

    // setMessageFeedback: async (messageId, feedbackType) => { /* 피드백 기능 비활성화 */ },
    setMessageFeedback: () => { },  // 비활성화됨

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
        // 설정에 따른 분기 로직
        if (sendTextShortcutImmediately) {
          // 즉시 전송 (설정 ON)
          await handleResponse({
            text: item.action.value,
            displayText: item.action.value,
          });
        } else {
          // 입력창 채우기 (설정 OFF - 기본값)
          setMainInputValue(item.action.value);
          focusChatInput();
        }
      } else if (item.action.type === "scenario") {
        const scenarioId = item.action.value;

        if (!Object.keys(availableScenarios).includes(scenarioId)) {
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

    saveMessage: async (message, conversationId = null) => saveMessage(get, set, message, conversationId),

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

      // /chat을 거치지 않는 메시지만 저장 (skipSave 플래그가 없을 때)
      if (!newMessage.isStreaming && !messageData.skipSave) {
        await get().saveMessage(newMessage, null);
      }
    },

    loadMoreMessages: async () => loadMoreMessages(get, set),

    handleResponse: (messagePayload) => handleResponse(get, set, messagePayload),
  };
};