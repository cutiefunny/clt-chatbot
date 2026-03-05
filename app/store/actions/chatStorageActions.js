import { locales } from "../../lib/locales";
import { getErrorKey } from "../../lib/errorHandler";
import { MESSAGE_LIMIT, FASTAPI_BASE_URL } from "../../lib/constants";

export const getInitialMessages = (lang = "ko") => {
    const initialText =
        locales[lang]?.initialBotMessage ||
        locales["en"]?.initialBotMessage ||
        "Hello! How can I help you?";
    return [{ id: "initial", sender: "bot", text: initialText }];
};

export const loadInitialMessages = async (get, set, conversationId) => {
    const { user, language, showEphemeralToast } = get();
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
        const apiMessagesRaw = data.messages || [];

        const mappedMessages = apiMessagesRaw.map((msg) => ({
            id: msg.id,
            sender: msg.role === 'user' ? 'user' : 'bot',
            text: msg.content,
            createdAt: msg.created_at,
            type: msg.type,
            scenarioSessionId: msg.scenario_session_id,
            scenarioId: msg.scenario_id,
            ...(msg.scenarios && { scenarios: msg.scenarios }),
            ...(msg.chart_data && { chartData: msg.chart_data }),
            ...(msg.shortcuts && { shortcuts: msg.shortcuts }),
            ...(msg.node && { node: msg.node }),
        }));

        const restoredSelectedOptions = {};
        apiMessagesRaw.forEach((msg) => {
            if (msg.selected_option) restoredSelectedOptions[msg.id] = msg.selected_option;
        });

        set({
            messages: [initialMessage, ...mappedMessages],
            isLoading: false,
            hasMoreMessages: false,
            selectedOptions: restoredSelectedOptions,
        });

        const scenarioSessionIds = mappedMessages
            .filter(msg => msg.scenarioSessionId)
            .map(msg => msg.scenarioSessionId);

        if (scenarioSessionIds.length > 0) {
            console.log(`[loadInitialMessages] Found ${scenarioSessionIds.length} scenario sessions`);
            const scenariosList = [];

            for (const sessionId of scenarioSessionIds) {
                const existingScenario = get().scenarioStates?.[sessionId];
                if (!existingScenario) {
                    try {
                        const scenarioResponse = await fetch(
                            `${FASTAPI_BASE_URL}/conversations/${conversationId}/scenario-sessions/${sessionId}`,
                            {
                                method: "GET",
                                headers: { "Content-Type": "application/json" }
                            }
                        );

                        if (scenarioResponse.ok) {
                            const scenarioData = await scenarioResponse.json();
                            const data = scenarioData.data || scenarioData;

                            scenariosList.push({
                                sessionId: sessionId,
                                scenarioId: data.scenario_id || sessionId,
                                status: data.status,
                                title: data.title,
                                messages: data.messages || [],
                                updatedAt: data.updated_at || new Date(),
                            });

                            set(state => ({
                                scenarioStates: {
                                    ...state.scenarioStates,
                                    [sessionId]: {
                                        ...data,
                                        activeScenarioSessionId: state.activeScenarioSessionId,
                                    }
                                }
                            }));
                        }
                    } catch (scenarioError) {
                        console.warn(`Failed to load scenario session ${sessionId}:`, scenarioError);
                    }
                } else {
                    const existingData = get().scenarioStates[sessionId];
                    scenariosList.push({
                        sessionId: sessionId,
                        scenarioId: existingData.scenario_id || sessionId,
                        status: existingData.status,
                        title: existingData.title,
                        messages: existingData.messages || [],
                        updatedAt: existingData.updated_at || new Date(),
                    });
                }
            }

            if (scenariosList.length > 0) {
                set(state => ({
                    scenariosForConversation: {
                        ...state.scenariosForConversation,
                        [conversationId]: scenariosList,
                    }
                }));
            }
        }
    } catch (error) {
        console.error("FastAPI loadInitialMessages error:", error);
        showEphemeralToast("Failed to load messages (API).", "error");
        set({ isLoading: false, messages: [initialMessage] });
    }
};

export const setSelectedOptionAction = async (get, set, messageId, optionValue) => {
    const isTemporaryId = String(messageId).startsWith("temp_");
    if (isTemporaryId) {
        console.warn("setSelectedOption called with temporary ID, skipping server update for now:", messageId);
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
};

export const saveMessage = async (get, set, message, conversationId = null) => {
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
            activeConversationId = await createNewConversation(true);
            if (!activeConversationId) {
                throw new Error("Failed to get conversation ID after creation attempt.");
            }
        }

        const messageToSave = { ...message };
        const tempId = String(messageToSave.id).startsWith("temp_") ? messageToSave.id : null;
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
                    ...(messageToSave.scenarioSessionId && { scenario_session_id: messageToSave.scenarioSessionId }),
                    ...(messageToSave.scenarioId && { scenario_id: messageToSave.scenarioId }),
                    ...(messageToSave.scenarios && { scenarios: messageToSave.scenarios }),
                    ...(messageToSave.chartData && { chart_data: messageToSave.chartData }),
                    ...(messageToSave.shortcuts && { shortcuts: messageToSave.shortcuts }),
                    ...(messageToSave.node && { node: messageToSave.node }),
                }),
            }
        );

        if (!saveMessageResponse.ok) {
            throw new Error(`Failed to save message: ${saveMessageResponse.status}`);
        }

        const savedMessage = await saveMessageResponse.json();
        const messageRef = { id: savedMessage.id || savedMessage.message_id };

        if (tempId) {
            let selectedOptionValue = null;
            const isStillOnSameConversation = activeConversationId === get().currentConversationId;

            if (isStillOnSameConversation) {
                set((state) => {
                    const newSelectedOptions = { ...state.selectedOptions };
                    if (newSelectedOptions[tempId]) {
                        selectedOptionValue = newSelectedOptions[tempId];
                        newSelectedOptions[messageRef.id] = selectedOptionValue;
                        delete newSelectedOptions[tempId];
                    }

                    let newMessages = state.messages;
                    const alreadyExists = state.messages.some((m) => m.id === messageRef.id);

                    if (alreadyExists) {
                        newMessages = state.messages.filter((msg) => msg.id !== tempId);
                    } else {
                        newMessages = state.messages.map((msg) =>
                            msg.id === tempId ? { ...message, id: messageRef.id, isStreaming: false } : msg
                        );
                    }

                    return {
                        messages: newMessages,
                        selectedOptions: newSelectedOptions,
                    };
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
        console.error(`Error in saveMessage:`, error);
        const errorKey = getErrorKey(error);
        const errorMessage =
            locales[language]?.[errorKey] ||
            locales["en"]?.errorUnexpected ||
            "Failed to save message.";
        showEphemeralToast(errorMessage, "error");

        if (String(message?.id).startsWith("temp_") && activeConversationId === get().currentConversationId) {
            set((state) => ({
                messages: state.messages.filter((msg) => msg.id !== message.id),
            }));
        }
        return null;
    }
};

export const loadMoreMessages = async (get, set) => {
    const {
        user,
        language,
        showEphemeralToast,
        currentConversationId,
        lastVisibleMessage,
        hasMoreMessages,
        messages,
    } = get();

    if (!user || !currentConversationId || !hasMoreMessages || !lastVisibleMessage || get().isLoading) return;

    set({ isLoading: true });

    try {
        const params = new URLSearchParams({
            usr_id: user.uid,
            offset: (messages.length - 1).toString(),
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
        const newMessages = Array.isArray(data.messages) ? data.messages : data.messages?.reverse?.() || [];

        if (newMessages.length === 0) {
            set({ hasMoreMessages: false });
            return;
        }

        const initialMessage = messages[0];
        const existingMessages = messages.slice(1);
        const newSelectedOptions = { ...get().selectedOptions };
        newMessages.forEach((msg) => {
            if (msg.selected_option) newSelectedOptions[msg.id] = msg.selected_option;
        });

        set({
            messages: [initialMessage, ...newMessages, ...existingMessages],
            lastVisibleMessage: newMessages[newMessages.length - 1],
            hasMoreMessages: newMessages.length === MESSAGE_LIMIT,
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
};
