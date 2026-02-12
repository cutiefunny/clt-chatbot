// app/store/slices/chatSlice.js
import { locales } from "../../lib/locales";
import { getErrorKey } from "../../lib/errorHandler";
import { handleResponse } from "../actions/chatResponseHandler";
import { MESSAGE_LIMIT, FASTAPI_BASE_URL } from "../../lib/constants";

// 초기 메시지 함수 (chatSlice가 관리)
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

    loadInitialMessages: async (conversationId) => {
      const { user, language, showEphemeralToast, useFastApi } = get();
      if (!user || !conversationId) return;

      const initialMessage = getInitialMessages(language)[0];
      set({
        isLoading: true,
        messages: [initialMessage],
        lastVisibleMessage: null,
        hasMoreMessages: true,
        selectedOptions: {},
        mainInputValue: "", // 대화 로드 시 입력창 초기화
      });

      try {
        const params = new URLSearchParams({
          usr_id: user.uid,
          ten_id: "1000",
          stg_id: "DEV",
          sec_ofc_id: "000025"
        });
        const response = await fetch(`${FASTAPI_BASE_URL}/conversations/${conversationId}?${params}`);
        if (!response.ok) throw new Error("Failed to load messages");
        
        const data = await response.json();
        // API 응답 구조: { id: "...", messages: [{ role: "...", content: "...", ... }] }
        const apiMessagesRaw = data.messages || [];
        
        // 백엔드 데이터(role, content)를 프론트엔드 데이터(sender, text)로 매핑
        const mappedMessages = apiMessagesRaw.map((msg) => ({
          id: msg.id,
          sender: msg.role === 'user' ? 'user' : 'bot', // role -> sender 변환
          text: msg.content, // content -> text 변환
          createdAt: msg.created_at,
          // 필요한 경우 추가 필드 매핑
        }));
        
        // 초기 메시지와 합치기
        set({
          messages: [initialMessage, ...mappedMessages],
          isLoading: false,
          hasMoreMessages: false, // API 페이징 미구현 시 false 처리
        });
      } catch (error) {
        console.error("FastAPI loadInitialMessages error:", error);
        showEphemeralToast("Failed to load messages (API).", "error");
        set({ isLoading: false, messages: [initialMessage] });
      }
    },

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
        // --- [수정] FastAPI로 메시지 업데이트 ---
        const response = await fetch(
          `${FASTAPI_BASE_URL}/conversations/${currentConversationId}/messages/${messageId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              usr_id: user.uid,
              selected_option: optionValue,
            }),
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to update message: ${response.status}`);
        }
        // --- [수정] ---
      } catch (error) {
        console.error("Error updating selected option via FastAPI:", error);
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
        // FastAPI를 통해 메시지 피드백 업데이트
        const response = await fetch(`${FASTAPI_BASE_URL}/conversations/${currentConversationId}/messages/${messageId}/feedback`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            feedback: newFeedback,
            usr_id: user.uid,
            ten_id: "1000",
            stg_id: "DEV",
            sec_ofc_id: "000025"
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to update feedback: ${response.statusText}`);
        }

        console.log(`Feedback set to '${newFeedback}' for message ${messageId}`);
      } catch (error) {
        console.error("Error updating message feedback via API:", error);
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

    saveMessage: async (message, conversationId = null) => {
      const {
        user,
        language,
        showEphemeralToast,
        currentConversationId: globalConversationId,
        createNewConversation,
        useFastApi, // --- 👇 [추가] ---
      } = get();

      // --- 👇 [수정] FastAPI 모드일 경우 Firestore 저장 로직 건너뛰기 ---
      if (useFastApi) {
        // console.log("FastAPI mode enabled. Skipping Firestore save in saveMessage.");
        return null;
      }
      // --- 👆 [수정] ---

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
        
        // --- [수정] FastAPI로 메시지 저장 ---
        const saveMessageResponse = await fetch(
          `${FASTAPI_BASE_URL}/conversations/${activeConversationId}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              usr_id: user.uid,
              role: messageToSave.sender || "user",
              content: messageToSave.text || "",
              type: messageToSave.type || "text",
              ...(messageToSave.scenarioSessionId && {
                scenario_session_id: messageToSave.scenarioSessionId,
              }),
            }),
          }
        );

        if (!saveMessageResponse.ok) {
          throw new Error(`Failed to save message: ${saveMessageResponse.status}`);
        }

        const savedMessage = await saveMessageResponse.json();
        const messageRef = { id: savedMessage.id || savedMessage.message_id };

        console.log(`Message saved with ID: ${messageRef.id}`);
        // --- [수정] ---

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
        // --- [수정] FastAPI로 메시지 페이지네이션 조회 ---
        // 간단한 구현: offset 기반 페이지네이션
        // 실제 구현에서는 타임스탬프 기반 커서 페이지네이션 권장
        const params = new URLSearchParams({
          usr_id: user.uid,
          offset: (messages.length - 1).toString(), // 초기 메시지 제외
          limit: MESSAGE_LIMIT.toString(),
        });

        const response = await fetch(
          `${FASTAPI_BASE_URL}/conversations/${currentConversationId}/messages?${params}`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to load messages: ${response.status}`);
        }

        const data = await response.json();
        const newMessages = Array.isArray(data.messages)
          ? data.messages
          : data.messages?.reverse?.() || [];

        if (newMessages.length === 0) {
          set({ hasMoreMessages: false });
          return;
        }

        const initialMessage = messages[0];
        const existingMessages = messages.slice(1);

        const newSelectedOptions = { ...get().selectedOptions };
        newMessages.forEach((msg) => {
          if (msg.selected_option)
            newSelectedOptions[msg.id] = msg.selected_option;
        });

        set({
          messages: [initialMessage, ...newMessages, ...existingMessages],
          lastVisibleMessage: newMessages[newMessages.length - 1],
          hasMoreMessages: newMessages.length === MESSAGE_LIMIT,
          selectedOptions: newSelectedOptions,
        });
        // --- [수정] ---
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