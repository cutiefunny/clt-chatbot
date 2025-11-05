// app/store/actions/chatResponseHandler.js
import {
  processFlowiseStream,
  processGeminiStream,
} from "../../lib/streamProcessors";
import { locales } from "../../lib/locales";

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

  let lastBotMessageId = null;
  let finalMessageId = null;
  let finalStreamText = "";
  let isStream = false;
  const thinkingText = locales[language]?.["statusGenerating"] || "Generating...";

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
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: `Server error: ${response.status}` }));
      throw new Error(errorData.message || `Server error: ${response.status}`);
    }

    if (response.headers.get("Content-Type")?.includes("text/event-stream")) {
      isStream = true;
      console.log("[handleResponse] Processing text/event-stream response.");

      set((state) => ({
        pendingResponses: new Set(state.pendingResponses).add(
          conversationIdForBotResponse
        ),
      }));
      const tempBotMessage = {
        id: `temp_pending_${conversationIdForBotResponse}`,
        sender: "bot",
        text: thinkingText,
        isStreaming: true,
        feedback: null,
      };
      set((state) => ({ messages: [...state.messages, tempBotMessage] }));
      lastBotMessageId = tempBotMessage.id;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamProcessor;

      // --- 👇 [수정] streamProcessors 임포트 사용 및 인자 변경 ---
      if (llmProvider === "gemini")
        streamProcessor = processGeminiStream(reader, decoder);
      else if (llmProvider === "flowise")
        streamProcessor = processFlowiseStream(reader, decoder, language);
      // --- 👆 [수정] ---
      else
        throw new Error(
          `Unsupported LLM provider for streaming: ${llmProvider}`
        );

      for await (const result of streamProcessor) {
        if (conversationIdForBotResponse === get().currentConversationId) {
          if (result.type === "text")
            updateLastMessage(result.data, result.replace);
          else if (result.type === "button") updateLastMessage(result.data);
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

      if (data.type === "error") {
        throw new Error(data.message || "API returned an unknown error.");
      }

      const handler = responseHandlers[data.type];
      if (handler) {
        if (conversationIdForBotResponse === get().currentConversationId) {
          handler(data, get);
        } else {
          console.log(
            "[handleResponse] User switched convo. Skipping local state update for JSON response."
          );
          set((state) => ({
            completedResponses: new Set(state.completedResponses).add(
              conversationIdForBotResponse
            ),
          }));
        }
      } else {
        const responseText = data.response || data.text || data.message;
        if (responseText) {
          if (conversationIdForBotResponse === get().currentConversationId) {
            await addMessage("bot", { text: responseText });
          } else {
            console.log(
              "[handleResponse] User switched. Saving JSON response to original conversation in background."
            );
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
    const errorMessage =
      error.message ||
      locales[language]?.["errorLLMFail"] ||
      locales["en"]?.["errorLLMFail"] ||
      "There was a problem with the response. Please try again later.";

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
      console.log(
        "[handleResponse/catch] User switched. Saving error message to original conversation in background."
      );
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

                  let newMessages = s.messages;
                  const alreadyExists = savedId
                    ? s.messages.some((m) => m.id === savedId)
                    : false;

                  if (alreadyExists) {
                    newMessages = s.messages.filter(
                      (m) => m.id !== lastMessage.id
                    );
                  } else if (savedId) {
                    newMessages = s.messages.map((m) =>
                      m.id === lastMessage.id
                        ? { ...finalMessage, id: savedId }
                        : m
                    );
                  } else {
                    newMessages = s.messages.filter(
                      (m) => m.id !== lastMessage.id
                    );
                  }

                  return {
                    messages: newMessages,
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
        console.log(
          "[handleResponse/finally] User switched. Saving final message to original conversation in background."
        );
        set((state) => {
          const messagesWithoutThinking = state.messages.filter(
            (m) => m.id !== lastBotMessageId
          );

          if (finalStreamText) {
            const finalMessageText =
              finalStreamText.trim() === "" ||
              finalStreamText.trim() === thinkingText.trim()
                ? locales[language]?.["errorLLMFail"] ||
                  "(Response failed. Please try again later.)"
                : finalStreamText;
            const finalMessage = {
              id: `temp_${Date.now()}`,
              sender: "bot",
              text: finalMessageText,
              isStreaming: false,
              feedback: null,
            };

            saveMessage(finalMessage, conversationIdForBotResponse);
          }

          const newSet = new Set(state.pendingResponses);
          newSet.delete(conversationIdForBotResponse);
          const newCompletedSet = new Set(state.completedResponses);
          newCompletedSet.add(conversationIdForBotResponse);

          return {
            messages: messagesWithoutThinking,
            isLoading: false,
            pendingResponses: newSet,
            completedResponses: newCompletedSet,
          };
        });
      }
    }
  }
}