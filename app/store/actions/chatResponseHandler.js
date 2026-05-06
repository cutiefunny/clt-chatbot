// app/store/actions/chatResponseHandler.js
import {
  processFlowiseStream,
  processGeminiStream,
} from "../../lib/streamProcessors";
import { locales } from "../../lib/locales";
import { FASTAPI_BASE_URL, TARGET_AUTO_OPEN_URL } from "../../lib/constants";

// URL 포함 여부 확인 및 새 창 열기 헬퍼 함수
const checkAndOpenUrl = (text) => {
  if (typeof text === 'string' && text.includes(TARGET_AUTO_OPEN_URL)) {
    if (typeof window !== 'undefined') {
      console.log(`[AutoOpen] Target URL detected. Opening: ${TARGET_AUTO_OPEN_URL}`);
      window.open(TARGET_AUTO_OPEN_URL, '_blank', 'noopener,noreferrer');
    }
  }
};

// responseHandlers는 이 스코프 내에서만 사용되므로 여기에 정의
const responseHandlers = {
  scenario_list: (data, getFn) => {
    getFn().addMessage("bot", {
      id: data.id || data.message_id,
      text: data.message,
      scenarios: data.scenarios,
      skipSave: true,
    });
  },
  canvas_trigger: (data, getFn) => {
    getFn().addMessage("bot", {
      id: data.id || data.message_id,
      text:
        locales[getFn().language]?.scenarioStarted(data.scenarioId) ||
        `Starting '${data.scenarioId}'.`,
      skipSave: true,
    });
    getFn().openScenarioPanel(data.scenarioId);
  },
  toast: (data, getFn) => {
    getFn().showEphemeralToast(data.message, data.toastType || "info");
  },
  text: (data, getFn) => {
    const responseText =
      data.message || data.text || data.content || "(No Content)";
    getFn().addMessage("bot", {
      id: data.id || data.message_id,
      text: responseText,
      skipSave: true,
    });
    checkAndOpenUrl(responseText);
    if (data.slots && Object.keys(data.slots).length > 0) {
      getFn().setExtractedSlots(data.slots);
    }
  },
  error: (data, getFn) => {
    getFn().addMessage("bot", {
      text:
        data.message ||
        locales[getFn().language]?.errorUnexpected ||
        "An error occurred.",
      skipSave: true,
    });
  },
};

/**
 * 사용자 메시지 처리 및 봇 응답 요청/처리
 * (chatSlice.js에서 분리됨)
 * @param {function} get - Zustand 스토어의 get 함수
 * @param {function} set - Zustand 스토어의 set 함수
 * @param {object} messagePayload - 사용자 입력 페이로드 (e.g., { text: "..." })
 */
export async function handleResponse(get, set, messagePayload) {
  set({ isLoading: true, llmRawResponse: null });
  const {
    language,
    showEphemeralToast,
    addMessage,
    updateLastMessage,
    saveMessage,
    setExtractedSlots,
    llmProvider,
    messages,
    currentConversationId,
    createNewConversation,
    conversations,
    updateConversationTitle,
    setForceScrollToBottom,
  } = get();

  let conversationId = currentConversationId;
  if (!conversationId) {
    conversationId = await createNewConversation(true);
    if (!conversationId) {
      console.error("[handleResponse] Failed to create new conversation");
      showEphemeralToast("Failed to create conversation.", "error");
      set({ isLoading: false });
      return;
    }
  }

  const textForUser = messagePayload.displayText || messagePayload.text;

  // 사용자가 메시지를 보내면 무조건 맨 아래로 스크롤 강제 이동
  setForceScrollToBottom(true);

  const defaultTitle = locales[language]?.["newChat"] || "New Conversation";
  const isFirstUserMessage =
    messages.filter((m) => m.id !== "initial").length === 0;
  const currentConvo = currentConversationId
    ? conversations.find((c) => c.id === currentConversationId)
    : null;
  const needsTitleUpdate =
    isFirstUserMessage &&
    textForUser &&
    (!currentConvo || currentConvo.title === defaultTitle);

  if (textForUser) {
    await addMessage("user", { text: textForUser, skipSave: true });
  }

  const conversationIdForBotResponse = conversationId;

  if (!conversationIdForBotResponse) {
    console.error("[handleResponse] Failed to determine conversationId for bot response.");
    set({ isLoading: false });
    return;
  }

  if (needsTitleUpdate) {
    const newTitle = textForUser.substring(0, 100);
    await updateConversationTitle(conversationIdForBotResponse, newTitle);
  }

  // GET_SCENARIO_LIST 커스텀 액션 처리
  if (messagePayload.text === "GET_SCENARIO_LIST") {
    const availableScenarios = get().availableScenarios || {};
    const scenarioList = Object.entries(availableScenarios).map(([id, title]) => ({
      id,
      name: title,
    }));

    await addMessage("bot", {
      text: locales[language]?.["selectScenario"] || "Select a scenario:",
      scenarios: scenarioList, // 객체 배열로 전달 (ID 포함)
    });
    set({ isLoading: false });
    return;
  }

  // 말풍선 표시 여부 결정
  const shouldShowBubble = true;

  const thinkingText = locales[language]?.["statusRequesting"] || "Requesting...";
  const tempBotMessageId = `temp_pending_${conversationIdForBotResponse}_${Date.now()}`;
  const tempBotMessage = {
    id: tempBotMessageId,
    sender: "bot",
    text: thinkingText,
    isStreaming: true,
    feedback: null,
  };

  // 조건부로 임시 메시지 및 pending 상태 추가
  if (shouldShowBubble) {
    set((state) => ({
      messages: [...state.messages, tempBotMessage],
      pendingResponses: new Set(state.pendingResponses).add(conversationIdForBotResponse),
    }));
  }

  let lastBotMessageId = tempBotMessageId;
  let finalMessageId = null;
  let finalStreamText = "";
  let isStream = false;

  // 5초 타임아웃 설정
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 5000);

  try {
    let response;

    response = await fetch(`${FASTAPI_BASE_URL}/chat/prediction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usr_id: get().user.uid,
        ten_id: "1000",
        stg_id: "DEV",
        sec_ofc_id: "000025",
        conversation_id: conversationIdForBotResponse,
        question: messagePayload.text,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId); // 응답 시작 시 타임아웃 해제

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: `Server error: ${response.status}` }));
      throw new Error(errorData.message || `Server error: ${response.status}`);
    }

    if (response.headers.get("Content-Type")?.includes("text/event-stream")) {
      isStream = true;
      console.log("[handleResponse] Processing text/event-stream response from /chat/prediction.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // processFlowiseStream 사용
      const streamProcessor = processFlowiseStream(reader, decoder, language);

      for await (const result of streamProcessor) {
        if (conversationIdForBotResponse === get().currentConversationId) {
          if (
            result.type === "text" ||
            result.type === "button" ||
            result.type === "chart"
          ) {
            updateLastMessage(result);
          }
        }
        if (result.type === "slots") setExtractedSlots(result.data);
        else if (result.type === "rawResponse")
          set({ llmRawResponse: result.data });
        else if (result.type === "finalText") finalStreamText = result.data;
        else if (result.type === "error") throw result.data;
      }
    } else {
      isStream = false;
      const data = await response.json();
      set({ llmRawResponse: data });

      // 말풍선을 띄웠던 경우에만 제거 시도
      if (shouldShowBubble) {
        set((state) => ({
          messages: state.messages.filter((m) => m.id !== tempBotMessageId),
        }));
      }

      if (data.type === "error") {
        throw new Error(data.message || "API returned an unknown error.");
      }

      const handler = responseHandlers[data.type];
      if (handler) {
        if (conversationIdForBotResponse === get().currentConversationId) {
          handler(data, get);
        } else {
          set((state) => ({
            completedResponses: new Set(state.completedResponses).add(
              conversationIdForBotResponse
            ),
          }));
        }
      } else {
        const responseText = data.response || data.text || data.message;
        if (responseText) {
          // 일반 텍스트 응답에서 URL 체크
          checkAndOpenUrl(responseText);

          if (conversationIdForBotResponse === get().currentConversationId) {
            await addMessage("bot", {
              id: data.id || data.message_id,
              text: responseText,
              skipSave: true,
            });
          } else {
            // /prediction API가 서버에서 이미 저장하므로 클라이언트는 중복 저장하지 않음.
            // 다른 대화인 경우 완료 상태만 업데이트.
            set((state) => ({
              completedResponses: new Set(state.completedResponses).add(
                conversationIdForBotResponse
              ),
            }));
          }
        } else {
          console.warn(
            `[ChatStore] Unhandled non-stream response type or empty response:`,
            data
          );
          await addMessage("bot", {
            text: locales[language]?.["errorUnexpected"] || "(No content)",
            skipSave: true,
          });
        }
      }
      set({ isLoading: false });
    }
  } catch (error) {
    console.error("[handleResponse] Error:", error);

    let errorMessage;
    if (error.name === 'AbortError') {
      errorMessage = "응답을 찾지 못 했습니다";
    } else {
      errorMessage = error.message ||
        locales[language]?.["errorLLMFail"] ||
        locales["en"]?.["errorLLMFail"] ||
        "There was a problem with the response. Please try again later.";
    }

    let messageSaved = false;
    const isStillOnSameConversation =
      conversationIdForBotResponse === get().currentConversationId;

    if (isStillOnSameConversation) {
      set((state) => {
        const lastMessageIndex = state.messages.length - 1;
        const lastMessage = state.messages[lastMessageIndex];

        // 말풍선이 존재하고 스트리밍 중이었다면 교체
        if (
          lastMessage &&
          lastMessage.id === lastBotMessageId &&
          lastMessage.isStreaming
        ) {
          const updatedMessage = {
            ...lastMessage,
            text: errorMessage,
            isStreaming: false,
          };

          saveMessage(updatedMessage, conversationIdForBotResponse).then(
            (savedId) => {
              finalMessageId = savedId;
              set((s) => {
                const newSet = new Set(s.pendingResponses);
                newSet.delete(conversationIdForBotResponse);

                let newMessages = s.messages;
                const alreadyExists = savedId
                  ? s.messages.some((m) => m.id === savedId)
                  : false;

                if (alreadyExists) {
                  newMessages = s.messages.filter(
                    (m) => m.id !== lastBotMessageId
                  );
                } else if (savedId) {
                  newMessages = s.messages.map((m) =>
                    m.id === lastBotMessageId
                      ? { ...updatedMessage, id: savedId }
                      : m
                  );
                } else {
                  newMessages = s.messages.map((m) =>
                    m.id === lastBotMessageId ? updatedMessage : m
                  );
                }

                return {
                  messages: newMessages,
                  isLoading: false,
                  pendingResponses: newSet,
                };
              });
              messageSaved = true;
            }
          );
          return {
            messages: [
              ...state.messages.slice(0, lastMessageIndex),
              updatedMessage,
            ],
          };
        }

        // 말풍선이 없었다면(shouldShowBubble=false 였거나 제거된 경우) 새로 추가 (에러 메시지 표시)
        addMessage("bot", { text: errorMessage, skipSave: true });
        const newSet = new Set(state.pendingResponses);
        newSet.delete(conversationIdForBotResponse);
        return { isLoading: false, pendingResponses: newSet };
      });
    } else {
      const errorBotMessage = {
        id: `temp_${Date.now()}`,
        sender: "bot",
        text: errorMessage,
        isStreaming: false,
        feedback: null,
      };
      saveMessage(errorBotMessage, conversationIdForBotResponse).then(() => {
        messageSaved = true;
      });
      set((state) => {
        const newSet = new Set(state.pendingResponses);
        newSet.delete(conversationIdForBotResponse);
        const newCompletedSet = new Set(state.completedResponses);
        newCompletedSet.add(conversationIdForBotResponse);
        return {
          isLoading: false,
          pendingResponses: newSet,
          completedResponses: newCompletedSet,
        };
      });
    }

    if (!messageSaved && !isStream) {
      set((state) => {
        const newSet = new Set(state.pendingResponses);
        newSet.delete(conversationIdForBotResponse);
        const newCompletedSet = new Set(state.completedResponses);
        newCompletedSet.add(conversationIdForBotResponse);
        return {
          isLoading: false,
          pendingResponses: newSet,
          completedResponses: newCompletedSet,
        };
      });
    }
  } finally {
    if (isStream) {
      const isStillOnSameConversation =
        conversationIdForBotResponse === get().currentConversationId;

      if (isStillOnSameConversation) {
        set((state) => {
          const lastMessageIndex = state.messages.length - 1;
          const lastMessage = state.messages[lastMessageIndex];

          if (
            lastMessage &&
            (lastMessage.id === lastBotMessageId ||
              lastMessage.id === finalMessageId) &&
            lastMessage.isStreaming
          ) {
            const finalText =
              (llmProvider === "flowise" ? finalStreamText : lastMessage.text) ||
              "";
            const finalMessageText =
              finalText.trim() === "" ||
                finalText.trim() === thinkingText.trim()
                ? locales[language]?.["errorLLMFail"] ||
                "(Response failed. Please try again later.)"
                : finalText;

            checkAndOpenUrl(finalMessageText);

            const finalMessage = {
              ...lastMessage,
              text: finalMessageText,
              isStreaming: false,
              feedback: null,
            };

            // /prediction API가 서버에서 메시지를 이미 저장하므로 클라이언트는 중복 저장하지 않음.
            set((s) => {
              const newSet = new Set(s.pendingResponses);
              newSet.delete(conversationIdForBotResponse);
              return {
                messages: s.messages.map((m) =>
                  m.id === lastMessage.id ? finalMessage : m
                ),
                isLoading: false,
                pendingResponses: newSet,
              };
            });
            return {
              messages: [
                ...state.messages.slice(0, lastMessageIndex),
                finalMessage,
              ],
            };
          }
          const newSet = new Set(state.pendingResponses);
          newSet.delete(conversationIdForBotResponse);
          if (state.isLoading) return { isLoading: false, pendingResponses: newSet };
          return {};
        });
      } else {
        set((state) => {
          if (finalStreamText) {
            checkAndOpenUrl(finalStreamText);
          }
          const newSet = new Set(state.pendingResponses);
          newSet.delete(conversationIdForBotResponse);
          return {
            isLoading: false,
            pendingResponses: newSet,
          };
        });
      }
    }
  }
}