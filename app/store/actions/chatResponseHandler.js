// app/store/actions/chatResponseHandler.js
import {
  processFlowiseStream,
  processGeminiStream,
} from "../../lib/streamProcessors";
import { locales } from "../../lib/locales";

// --- 👇 [추가] 자동 팝업을 트리거할 타겟 URL 정의 ---
const TARGET_AUTO_OPEN_URL = "http://172.20.130.91:9110/oceans/BPM_P1002.do?tenId=2000&stgId=TST&pgmNr=BKD_M3201";

// --- 👇 [추가] URL 포함 여부 확인 및 새 창 열기 헬퍼 함수 ---
const checkAndOpenUrl = (text) => {
  if (typeof text === 'string' && text.includes(TARGET_AUTO_OPEN_URL)) {
    if (typeof window !== 'undefined') {
      console.log(`[AutoOpen] Target URL detected. Opening: ${TARGET_AUTO_OPEN_URL}`);
      window.open(TARGET_AUTO_OPEN_URL, '_blank', 'noopener,noreferrer');
    }
  }
};
// --- 👆 [추가] ---

// responseHandlers는 이 스코프 내에서만 사용되므로 여기에 정의
const responseHandlers = {
  scenario_list: (data, getFn) => {
    getFn().addMessage("bot", { text: data.message, scenarios: data.scenarios });
  },
  canvas_trigger: (data, getFn) => {
    getFn().addMessage("bot", {
      text:
        locales[getFn().language]?.scenarioStarted(data.scenarioId) ||
        `Starting '${data.scenarioId}'.`,
    });
    getFn().openScenarioPanel(data.scenarioId);
  },
  toast: (data, getFn) => {
    getFn().showEphemeralToast(data.message, data.toastType || "info");
  },
  llm_response_with_slots: (data, getFn) => {
    getFn().addMessage("bot", { text: data.message });
    // --- 👇 [추가] LLM 응답(slots 포함)에서도 URL 체크 ---
    checkAndOpenUrl(data.message);
    // --- 👆 [추가] ---
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
    conversations,
    updateConversationTitle,
  } = get();

  const textForUser = messagePayload.displayText || messagePayload.text;

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
    await addMessage("user", { text: textForUser });
  }

  const conversationIdForBotResponse = get().currentConversationId;

  if (!conversationIdForBotResponse) {
    console.error("[handleResponse] Failed to determine conversationId for bot response.");
    set({ isLoading: false });
    return;
  }

  if (needsTitleUpdate) {
    const newTitle = textForUser.substring(0, 100);
    await updateConversationTitle(conversationIdForBotResponse, newTitle);
  }

  // --- 👇 [수정] 말풍선 표시 여부 결정 (커스텀 액션 등은 숨김) ---
  const isCustomAction = messagePayload.text === "GET_SCENARIO_LIST"; 
  const shouldShowBubble = !isCustomAction;
  // --- 👆 [수정] ---

  const thinkingText = locales[language]?.["statusRequesting"] || "Requesting...";
  const tempBotMessageId = `temp_pending_${conversationIdForBotResponse}`;
  const tempBotMessage = {
    id: tempBotMessageId,
    sender: "bot",
    text: thinkingText,
    isStreaming: true,
    feedback: null,
  };

  // --- 👇 [수정] 조건부로 임시 메시지 및 pending 상태 추가 ---
  if (shouldShowBubble) {
    set((state) => ({
      messages: [...state.messages, tempBotMessage],
      pendingResponses: new Set(state.pendingResponses).add(conversationIdForBotResponse),
    }));
  }
  // --- 👆 [수정] ---

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
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: { text: messagePayload.text },
        scenarioState: null,
        slots: get().slots,
        language: language,
        llmProvider: llmProvider,
        flowiseApiUrl: get().flowiseApiUrl,
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
      console.log("[handleResponse] Processing text/event-stream response.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamProcessor;

      if (llmProvider === "gemini")
        streamProcessor = processGeminiStream(reader, decoder);
      else if (llmProvider === "flowise")
        streamProcessor = processFlowiseStream(reader, decoder, language);
      else
        throw new Error(
          `Unsupported LLM provider for streaming: ${llmProvider}`
        );

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

      // --- 👇 [수정] 말풍선을 띄웠던 경우에만 제거 시도 ---
      if (shouldShowBubble) {
        set((state) => ({
          messages: state.messages.filter((m) => m.id !== tempBotMessageId),
        }));
      }
      // --- 👆 [수정] ---

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
          // --- 👇 [추가] 일반 텍스트 응답에서 URL 체크 ---
          checkAndOpenUrl(responseText);
          // --- 👆 [추가] ---

          if (conversationIdForBotResponse === get().currentConversationId) {
            await addMessage("bot", { text: responseText });
          } else {
            const botMessage = {
              id: `temp_${Date.now()}`,
              sender: "bot",
              text: responseText,
              isStreaming: false,
              feedback: null,
            };
            await saveMessage(botMessage, conversationIdForBotResponse);
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
        addMessage("bot", { text: errorMessage });
        const newSet = new Set(state.pendingResponses);
        newSet.delete(conversationIdForBotResponse);
        return { isLoading: false, pendingResponses: newSet };
      });
    } else {
      // ... (다른 대화방 로직 기존 동일)
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
        // ... (스트림 종료 로직 기존 동일)
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
            // ... (스트림 최종 저장 로직)
             const finalText =
              (llmProvider === "flowise" ? finalStreamText : lastMessage.text) ||
              "";
            const finalMessageText =
              finalText.trim() === "" ||
              finalText.trim() === thinkingText.trim()
                ? locales[language]?.["errorLLMFail"] ||
                  "(Response failed. Please try again later.)"
                : finalText;
            
            // --- 👇 [추가] 스트리밍 완료 후 최종 텍스트에서 URL 체크 ---
            checkAndOpenUrl(finalMessageText);
            // --- 👆 [추가] ---

            const finalMessage = {
              ...lastMessage,
              text: finalMessageText,
              isStreaming: false,
              feedback: null,
            };

             saveMessage(finalMessage, conversationIdForBotResponse).then(
              (savedId) => {
                // ...
                 finalMessageId = savedId;
                set((s) => {
                  const newSet = new Set(s.pendingResponses);
                  newSet.delete(conversationIdForBotResponse);
                  // ...
                  return {
                    messages: s.messages.map((m) => m.id === lastMessage.id ? {...finalMessage, id: savedId} : m), // Simplified
                    isLoading: false,
                    pendingResponses: newSet,
                  };
                });
              }
            );
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
          // ... (스위칭 로직)
         set((state) => {
             // ...
             if (finalStreamText) {
                 // ... saveMessage ...
                 // --- 👇 [추가] 다른 대화방에 있어도 스트리밍 완료 시 URL 체크 ---
                 checkAndOpenUrl(finalStreamText);
                 // --- 👆 [추가] ---
             }
             const newSet = new Set(state.pendingResponses);
            newSet.delete(conversationIdForBotResponse);
             // ...
            return {
                isLoading: false,
                pendingResponses: newSet,
                // ...
            };
         });
      }
    }
  }
}