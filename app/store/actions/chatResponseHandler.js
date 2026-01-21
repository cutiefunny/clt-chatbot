// app/store/actions/chatResponseHandler.js
import {
  processFlowiseStream,
  processGeminiStream,
} from "../../lib/streamProcessors";
import { locales } from "../../lib/locales";

// 자동 팝업을 트리거할 타겟 URL 정의
const TARGET_AUTO_OPEN_URL = "http://172.20.130.91:9110/oceans/BPM_P1002.do?tenId=2000&stgId=TST&pgmNr=BKD_M3201";

// --- 👇 [수정] URL 상수 분리 및 환경변수 적용 ---
const REMOTE_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://210.114.17.65:8001";
const LOCAL_BASE_URL = "http://localhost:8001";
// --- 👆 [수정] ---

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
    checkAndOpenUrl(data.message);
    if (data.slots && Object.keys(data.slots).length > 0) {
      getFn().setExtractedSlots(data.slots);
    }
  },
  text: (data, getFn) => {
    const responseText = data.message || data.text || "(No Content)";
    getFn().addMessage("bot", { text: responseText });
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
    });
  },
};

/**
 * 사용자 메시지 처리 및 봇 응답 요청/처리
 */
export async function handleResponse(get, set, messagePayload) {
  set({ isLoading: true, llmRawResponse: null });
  const {
    language,
    addMessage,
    updateLastMessage,
    saveMessage,
    setExtractedSlots,
    llmProvider,
    messages,
    currentConversationId,
    setForceScrollToBottom, 
    useFastApi,
    // --- 👇 [추가] 로컬 API 사용 여부 가져오기 ---
    useLocalFastApiUrl, 
    // --- 👆 [추가] ---
  } = get();

  const textForUser = messagePayload.displayText || messagePayload.text;

  // 사용자가 메시지를 보내면 무조건 맨 아래로 스크롤 강제 이동
  setForceScrollToBottom(true);

  if (textForUser) {
    await addMessage("user", { text: textForUser });
  }

  const conversationIdForBotResponse = get().currentConversationId;

  if (!conversationIdForBotResponse) {
    console.error("[handleResponse] Failed to determine conversationId for bot response.");
    set({ isLoading: false });
    return;
  }

  // 말풍선 표시 여부 결정
  const isCustomAction = messagePayload.text === "GET_SCENARIO_LIST"; 
  const shouldShowBubble = !isCustomAction;

  const thinkingText = locales[language]?.["statusRequesting"] || "Requesting...";
  const tempBotMessageId = `temp_pending_${conversationIdForBotResponse}`;
  const tempBotMessage = {
    id: tempBotMessageId,
    sender: "bot",
    text: thinkingText,
    isStreaming: true,
    feedback: null,
  };

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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 5000);

  try {
    let response;

    if (useFastApi) {
      // --- 👇 [수정] 설정에 따라 API URL 결정 ---
      const baseUrl = useLocalFastApiUrl ? LOCAL_BASE_URL : REMOTE_BASE_URL;
      const apiUrl = `${baseUrl}/chat`;
      
      console.log(`[handleResponse] Using FastAPI Backend (${useLocalFastApiUrl ? 'Local' : 'Remote'}): ${apiUrl}`);
      // --- 👆 [수정] ---

      response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationIdForBotResponse,
          content: messagePayload.text,
          language: language,
          slots: get().slots,
        }),
        signal: controller.signal,
      });
    } else {
      // 기존 Firebase API 호출
      response = await fetch("/api/chat", {
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
    }

    clearTimeout(timeoutId);

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
          checkAndOpenUrl(responseText);

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

        addMessage("bot", { text: errorMessage });
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

             saveMessage(finalMessage, conversationIdForBotResponse).then(
              (savedId) => {
                 finalMessageId = savedId;
                set((s) => {
                  const newSet = new Set(s.pendingResponses);
                  newSet.delete(conversationIdForBotResponse);
                  return {
                    messages: s.messages.map((m) => m.id === lastMessage.id ? {...finalMessage, id: savedId} : m), 
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