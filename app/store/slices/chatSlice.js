// app/store/slices/chatSlice.js
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  getDocs,
  serverTimestamp,
  // deleteDoc, // conversationSlice에서 사용
  doc,
  updateDoc,
  limit,
  startAfter,
  // where, // 검색 슬라이스에서 사용
  writeBatch, // 메시지 저장 관련 로직에서 필요할 수 있음
} from "firebase/firestore";
import { locales } from "../../lib/locales";
import { getErrorKey } from "../../lib/errorHandler";

const MESSAGE_LIMIT = 15;

// 초기 메시지 함수 (chatSlice가 관리)
const getInitialMessages = (lang = "ko") => {
  const initialText = locales[lang]?.initialBotMessage || locales['en']?.initialBotMessage || "Hello! How can I help you?";
  return [{ id: "initial", sender: "bot", text: initialText }];
};


// --- 👇 [수정된 부분 시작]: processFlowiseStream 수정 ---
async function* processFlowiseStream(reader, decoder, get) {
    let buffer = '';
    let thinkingMessageReplaced = false;
    let collectedText = ''; // 스트림 전체 텍스트 수집
    let buttonText = ''; // 추출된 버튼 텍스트
    let extractedSlots = {}; // 추출된 슬롯
    const { language } = get(); // 오류 메시지를 위해 언어 설정 가져오기

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break; // 스트림 종료
            if (!value) continue;

            let chunk;
            try {
                // stream: true 옵션으로 부분적인 UTF-8 시퀀스 처리
                chunk = decoder.decode(value, { stream: true });
            } catch (e) {
                console.warn("Flowise stream decoding error:", e);
                chunk = ''; // 디코딩 오류 시 빈 문자열로 처리
            }

            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // 마지막 라인은 불완전할 수 있으므로 버퍼에 남김

            for (const line of lines) {
                if (!line.trim() || line.toLowerCase().startsWith('message:')) continue; // 빈 줄이나 주석 무시

                let jsonString = '';
                if (line.toLowerCase().startsWith('data:')) {
                    jsonString = line.substring(line.indexOf(':') + 1).trim();
                } else {
                    jsonString = line.trim(); // 'data:' 접두사 없는 경우 대비
                }

                if (!jsonString || jsonString === "[DONE]") continue; // 빈 데이터나 종료 마커 무시

                let data;
                try {
                    data = JSON.parse(jsonString); // JSON 파싱 시도
                } catch (e) {
                    // console.warn("Flowise stream JSON parse error:", e, "Line:", line);
                    // 파싱 실패 시 해당 라인을 다음 청크와 합치기 위해 버퍼에 다시 추가
                    buffer = line + (buffer ? '\n' + buffer : '');
                    continue; // 다음 라인 처리
                }

                // 모든 파싱된 데이터 객체 로깅
                console.log("[Flowise Stream Event]", data);

                let textChunk = '';

                // Flowise 이벤트 타입별 처리
                if (data.event === 'agentFlowExecutedData' && Array.isArray(data.data) && data.data.length > 0) {
                    
                    // --- 👇 [수정] ---
                    // 이 이벤트는 "C"나 JSON 배열 같은 중간 데이터를 포함하는 것으로 보입니다.
                    // 실제 텍스트 스트림은 'token' 이벤트로 처리되므로,
                    // 'agentFlowExecutedData'는 UI 업데이트(yield)를 하지 않도록 수정합니다.
                    
                    const lastData = data.data[data.data.length - 1];
                    if (lastData?.data?.output?.content) {
                        textChunk = lastData.data.output.content;

                        if (typeof textChunk === 'string') {
                            let isJsonString = false;
                            try {
                                const parsed = JSON.parse(textChunk);
                                if (parsed && typeof parsed === 'object') {
                                    isJsonString = true;
                                }
                            } catch (e) {
                                isJsonString = false;
                            }

                            if (isJsonString) {
                                console.log("[Flowise Stream] Ignoring JSON 'output.content':", textChunk);
                            } else {
                                // "C"와 같은 순수 텍스트 중간 데이터도 무시합니다.
                                console.log("[Flowise Stream] Ignoring non-JSON string 'output.content' (intermediate data):", textChunk);
                                // [REMOVED] yield { type: 'text', data: textChunk, replace: true };
                                // [REMOVED] thinkingMessageReplaced = true;
                                // [REMOVED] collectedText = textChunk; 
                            }
                        } else {
                            console.log("[Flowise Stream] Ignoring non-string 'output.content':", textChunk);
                        }
                    }
                    // --- 👆 [수정] ---

                } else if (data.event === 'usedTools' && Array.isArray(data.data) && data.data.length > 0) {
                     // toolOutput 구조 및 scenarioId 존재 여부 확인 (구조 검증 강화)
                    const toolOutput = data.data[0]?.toolOutput;
                    
                    if (toolOutput && typeof toolOutput === 'string') {
                        // 버튼 추출 (한 번만)
                        if (!buttonText) {
                             const matchScenarioId = toolOutput.match(/"scenarioId"\s*:\s*"([^"]+)"/);
                             if (matchScenarioId && matchScenarioId[1]) {
                                 buttonText = `\n\n[BUTTON:${matchScenarioId[1]}]`;
                             }
                        }

                        // question 추출 (toolOutput이 업데이트될 때마다 시도)
                        const matchQuestion = toolOutput.match(/"question"\s*:\s*"([^"]+)"/);
                        if (matchQuestion && matchQuestion[1]) {
                            const extractedQuestion = matchQuestion[1];
                            if (extractedSlots.question !== extractedQuestion) {
                                extractedSlots.question = extractedQuestion; 
                                console.log(`[Flowise Stream] Extracted question: ${extractedQuestion}`);
                            }
                        }
                    }
                } else if (data.event === 'token' && typeof data.data === 'string') {
                    // 일반 텍스트 토큰 스트리밍 (실제 응답)
                    textChunk = data.data;
                    
                    // --- 👇 [수정] 비어있지 않은 첫 토큰이 "생성중..."을 대체하도록 함 ---
                    if (textChunk.trim().length > 0 && !thinkingMessageReplaced) {
                       yield { type: 'text', data: textChunk, replace: true };
                       thinkingMessageReplaced = true;
                    } else if (thinkingMessageReplaced) {
                       // 이후 토큰들은 추가
                       yield { type: 'text', data: textChunk, replace: false };
                    }
                    // --- 👆 [수정] ---
                    
                    collectedText += textChunk; // 전체 텍스트 누적
                } else if (data.event === 'chunk' && data.data?.response) {
                    // 일부 Flowise 버전의 텍스트 청크 스트리밍 (실제 응답)
                    textChunk = data.data.response;

                    // --- 👇 [수정] 비어있지 않은 첫 청크가 "생성중..."을 대체하도록 함 ---
                     if (textChunk.trim().length > 0 && !thinkingMessageReplaced) {
                       yield { type: 'text', data: textChunk, replace: true };
                       thinkingMessageReplaced = true;
                    } else if (thinkingMessageReplaced) {
                       yield { type: 'text', data: textChunk, replace: false };
                    }
                    // --- 👆 [수정] ---
                    
                    collectedText += textChunk; // 전체 텍스트 누적
                }
                // 다른 이벤트 타입은 필요에 따라 추가
            }
        } // end while

        // 스트림 종료 후 버퍼에 남은 데이터 처리 (예: 마지막 JSON 조각)
        if (buffer.trim()) {
            try {
                const data = JSON.parse(buffer.trim());
                console.log("[Flowise Stream Event] (Final Buffer)", data);
                 let textChunk = '';
                if (data.event === 'agentFlowExecutedData' /*...*/) {
                    // ...
                } else if (data.event === 'token' /*...*/) {
                   // ...
                }
            } catch (e) {
                console.warn("Error parsing final Flowise stream buffer:", e, "Buffer:", buffer);
            }
        }

        // 수집된 버튼 텍스트가 있으면 UI 업데이트 및 전체 텍스트에 추가
        if (buttonText) {
            yield { type: 'button', data: buttonText };
            collectedText += buttonText;
        }

        // 슬롯 추출 시도
        const bookingNoRegex = /\b([A-Z]{2}\d{10})\b/i;
        const match = collectedText.match(bookingNoRegex);
        if (match && match[1]) {
            extractedSlots.bkgNr = match[1];
        }

        if (Object.keys(extractedSlots).length > 0) {
            yield { type: 'slots', data: extractedSlots }; // 추출된 슬롯 전달
        }

        // 최종 수집된 텍스트 전달 (finally 블록에서 사용됨)
        yield { type: 'finalText', data: collectedText };

    } catch (streamError) {
        console.error("Flowise stream processing error:", streamError);
        // 스트림 처리 중 오류 발생 시 에러 객체 전달
        yield { type: 'error', data: new Error(locales[language]?.errorUnexpected || 'Error processing stream.') };
    }
}
// --- 👆 [수정된 부분 끝] ---


// Gemini 스트림 처리 헬퍼 함수 (기존 유지)
async function* processGeminiStream(reader, decoder, get) {
    let buffer = '';
    let slotsFound = false;
    let thinkingMessageReplaced = false;
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            if (!slotsFound) {
                buffer += chunk;
                const separatorIndex = buffer.indexOf('|||');
                if (separatorIndex !== -1) {
                    const jsonPart = buffer.substring(0, separatorIndex);
                    const textPart = buffer.substring(separatorIndex + 3);
                    buffer = '';
                    try {
                        const parsed = JSON.parse(jsonPart);
                        if (parsed.slots) { yield { type: 'slots', data: parsed.slots }; yield { type: 'rawResponse', data: parsed }; }
                    } catch (e) { console.error("Gemini stream slot parse error:", e, jsonPart); yield { type: 'rawResponse', data: { error: "Slot parse fail", data: jsonPart } }; }
                    slotsFound = true;
                    if (textPart) { yield { type: 'text', data: textPart, replace: !thinkingMessageReplaced }; thinkingMessageReplaced = true; }
                }
            } else { yield { type: 'text', data: chunk, replace: !thinkingMessageReplaced }; thinkingMessageReplaced = true; }
        }
    } catch (streamError) { console.error("Gemini stream read error:", streamError); yield { type: 'error', data: streamError }; }
}

export const createChatSlice = (set, get) => {

  // responseHandlers는 이 스코프 내에서만 사용되므로 여기에 정의
  const responseHandlers = {
    scenario_list: (data, getFn) => {
      getFn().addMessage("bot", { text: data.message, scenarios: data.scenarios });
    },
    canvas_trigger: (data, getFn) => {
      getFn().addMessage("bot", {
        text: locales[getFn().language]?.scenarioStarted(data.scenarioId) || `Starting '${data.scenarioId}'.`
      });
      // scenarioSlice의 액션 호출 (getFn()으로 전체 스토어 접근)
      getFn().openScenarioPanel(data.scenarioId);
    },
    toast: (data, getFn) => {
      // uiSlice의 액션 호출 (getFn()으로 전체 스토어 접근)
      getFn().showEphemeralToast(data.message, data.toastType || 'info');
    },
    llm_response_with_slots: (data, getFn) => {
      getFn().addMessage("bot", { text: data.message });
      if (data.slots && Object.keys(data.slots).length > 0) {
        getFn().setExtractedSlots(data.slots);
      }
    },
     // --- 👇 [추가] API 연동 실패 시 오류 메시지 처리 ---
    error: (data, getFn) => {
        // 이미 getLlmResponse 에서 오류 메시지를 생성하므로 그대로 사용
        getFn().addMessage("bot", { text: data.message || locales[getFn().language]?.errorUnexpected || "An error occurred." });
    },
     // --- 👆 [추가] ---
  };

  return {
  // State
  messages: getInitialMessages("ko"), // 현재 대화의 메시지 목록
  isLoading: false, // 메시지 로딩 또는 응답 대기 상태
  // --- 👇 [수정] pendingResponses, completedResponses 상태 추가 ---
  pendingResponses: new Set(), // 현재 응답(fetch) 대기 중인 conversationId 집합
  completedResponses: new Set(), // 완료되었으나 확인하지 않은 conversationId 집합
  // --- 👆 [수정] ---
  slots: {}, // 시나리오 실행 시 사용될 슬롯 (scenarioSlice로 이동 고려)
  extractedSlots: {}, // LLM이 추출한 슬롯
  llmRawResponse: null, // LLM 원시 응답 (디버깅용)
  selectedOptions: {}, // 메시지 내 버튼 선택 상태
  unsubscribeMessages: null, // 현재 대화 메시지 리스너 해제 함수
  lastVisibleMessage: null, // 메시지 페이징 커서
  hasMoreMessages: true, // 추가 메시지 로드 가능 여부

  // Actions
  // 메시지 상태 초기화 (언어 변경, 새 대화 시작 시 호출됨)
  resetMessages: (language) => {
      set({
          messages: getInitialMessages(language), // 해당 언어의 초기 메시지로 설정
          lastVisibleMessage: null,
          hasMoreMessages: true,
          selectedOptions: {},
          isLoading: false, // 로딩 상태 초기화
      });
      // 기존 메시지 리스너 해제
      get().unsubscribeMessages?.();
      set({ unsubscribeMessages: null });
      // [주의] pending/completedResponses는 여기서 초기화하지 않음
  },

  // --- 👇 [수정] loadInitialMessages 수정 (pendingResponses 확인 로직 추가) ---
  // 초기 메시지 로드 및 실시간 구독 설정
  loadInitialMessages: async (conversationId) => {
      const { user, language, showEphemeralToast } = get();
      if (!user || !conversationId) return;

      const initialMessage = getInitialMessages(language)[0]; // 언어에 맞는 초기 메시지
      // 로딩 시작 시 초기 메시지만 표시하도록 수정
      set({ isLoading: true, messages: [initialMessage], lastVisibleMessage: null, hasMoreMessages: true, selectedOptions: {} });

      try {
          const messagesRef = collection( get().db, "chats", user.uid, "conversations", conversationId, "messages" );
          const q = query( messagesRef, orderBy("createdAt", "desc"), limit(MESSAGE_LIMIT) );

          get().unsubscribeMessages?.(); // 이전 리스너 해제

          const unsubscribe = onSnapshot(q, (messagesSnapshot) => {
              const newMessages = messagesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).reverse();
              const lastVisible = messagesSnapshot.docs[messagesSnapshot.docs.length - 1];
              const newSelectedOptions = {};
              newMessages.forEach(msg => { if (msg.selectedOption) newSelectedOptions[msg.id] = msg.selectedOption; });

              let finalMessages = [initialMessage, ...newMessages];

              // --- [새 로직] ---
              // 이 대화(conversationId)가 응답 대기 중인지 확인
              if (get().pendingResponses.has(conversationId)) {
                  const thinkingText = locales[language]?.['statusGenerating'] || "Generating...";
                  // 예측 가능한 임시 ID 사용 (handleResponse와 동일하게)
                  const tempBotMessage = { 
                      id: `temp_pending_${conversationId}`, 
                      sender: 'bot', 
                      text: thinkingText, 
                      isStreaming: true, 
                      feedback: null 
                  };
                  finalMessages.push(tempBotMessage);
              }
              // --- [새 로직 끝] ---

              // 초기 메시지와 결합하여 상태 업데이트
              set({
                  messages: finalMessages, // 수정된 메시지 배열 사용
                  lastVisibleMessage: lastVisible,
                  hasMoreMessages: messagesSnapshot.docs.length === MESSAGE_LIMIT,
                  isLoading: false, // 로딩 완료
                  selectedOptions: newSelectedOptions,
              });
          }, (error) => { // 리스너 오류 처리
              console.error(`Error listening to initial messages for ${conversationId}:`, error);
              const errorKey = getErrorKey(error);
              const message = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to load messages.';
              showEphemeralToast(message, 'error');
              set({ isLoading: false, hasMoreMessages: false });
              unsubscribe();
              set({ unsubscribeMessages: null });
          });
          set({ unsubscribeMessages: unsubscribe }); // 새 리스너 저장
      } catch (error) { // onSnapshot 설정 자체의 오류 처리
          console.error(`Error setting up initial message listener for ${conversationId}:`, error);
          const errorKey = getErrorKey(error);
          const message = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to load messages.';
          showEphemeralToast(message, 'error');
          // 오류 발생 시 초기 메시지만 남기고 로딩 해제
          set({ isLoading: false, hasMoreMessages: false, messages: [initialMessage] });
      }
  },
  // --- 👆 [수정] ---

  // 스트리밍 중 마지막 봇 메시지 업데이트
  updateLastMessage: (chunk, replace = false) => {
    set((state) => {
      const lastMessage = state.messages[state.messages.length - 1];
      if (lastMessage && lastMessage.sender === 'bot' && lastMessage.isStreaming) {
        const updatedText = replace ? chunk : (lastMessage.text || '') + chunk;
        const updatedMessage = { ...lastMessage, text: updatedText };
        return { messages: [...state.messages.slice(0, -1), updatedMessage] };
      }
      return state;
    });
  },

  // 메시지 내 버튼 선택 상태 업데이트
  setSelectedOption: async (messageId, optionValue) => {
    // 임시 ID 체크: Firestore 업데이트 건너뛰기
    const isTemporaryId = String(messageId).startsWith('temp_');
    if (isTemporaryId) {
      console.warn("setSelectedOption called with temporary ID, skipping Firestore update for now:", messageId);
      // 로컬 상태만 우선 업데이트 (UI 피드백용)
      set((state) => ({ selectedOptions: { ...state.selectedOptions, [messageId]: optionValue } }));
      return;
    }

    const previousSelectedOptions = get().selectedOptions;
    set((state) => ({ selectedOptions: { ...state.selectedOptions, [messageId]: optionValue } })); // 낙관적 업데이트

    const { user, language, showEphemeralToast, currentConversationId } = get(); // conversationSlice 상태 참조
    if (!user || !currentConversationId || !messageId) return; // 필수 값 확인

    try {
      const messageRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "messages", String(messageId));
      await updateDoc(messageRef, { selectedOption: optionValue }); // Firestore 업데이트
    } catch (error) {
      console.error("Error updating selected option in Firestore:", error);
      const errorKey = getErrorKey(error);
      const message = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to save selection.';
      showEphemeralToast(message, 'error');
      set({ selectedOptions: previousSelectedOptions }); // 오류 시 롤백
    }
  },

  // --- 👇 [새 액션] 메시지 피드백 설정 (좋아요/싫어요) ---
  setMessageFeedback: async (messageId, feedbackType) => {
    const { user, language, showEphemeralToast, currentConversationId, messages } = get();
    if (!user || !currentConversationId || !messageId) {
      console.warn("[setMessageFeedback] Missing user, conversationId, or messageId.");
      return;
    }

    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) {
      console.warn(`[setMessageFeedback] Message not found: ${messageId}`);
      return;
    }

    const message = messages[messageIndex];
    const originalFeedback = message.feedback || null;
    
    // 1. 새 피드백 상태 결정 (토글 로직)
    const newFeedback = (originalFeedback === feedbackType) ? null : feedbackType;

    // 2. Optimistic UI Update (Zustand 스토어)
    const updatedMessages = [...messages];
    updatedMessages[messageIndex] = { ...message, feedback: newFeedback };
    set({ messages: updatedMessages });

    // 3. Firestore 업데이트
    try {
      const messageRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "messages", messageId);
      await updateDoc(messageRef, { feedback: newFeedback });
      
      console.log(`Feedback set to '${newFeedback}' for message ${messageId}`);

    } catch (error) {
      console.error("Error updating message feedback in Firestore:", error);
      const errorKey = getErrorKey(error);
      const errorMessage = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to save feedback.';
      showEphemeralToast(errorMessage, 'error');

      // 4. 오류 발생 시 롤백
      const rollbackMessages = [...get().messages]; // 롤백 시점의 최신 상태 가져오기
      const rollbackMessageIndex = rollbackMessages.findIndex(m => m.id === messageId);
      if (rollbackMessageIndex !== -1) {
        rollbackMessages[rollbackMessageIndex] = { ...rollbackMessages[rollbackMessageIndex], feedback: originalFeedback };
        set({ messages: rollbackMessages });
      }
    }
  },
  // --- 👆 [새 액션] ---

  // LLM 추출 슬롯 설정
  setExtractedSlots: (newSlots) => {
      console.log("[ChatStore] Setting extracted slots:", newSlots);
      set((state) => ({ extractedSlots: { ...state.extractedSlots, ...newSlots } }));
  },

  // LLM 추출 슬롯 초기화
  clearExtractedSlots: () => {
     set({ extractedSlots: {} });
  },

  // 메시지 및 시나리오 관련 모든 구독 해제 (다른 슬라이스 호출 포함)
  unsubscribeAllMessagesAndScenarios: () => {
      get().unsubscribeMessages?.();
      set({ unsubscribeMessages: null });
      // scenarioSlice의 구독 해제 함수 호출 (가정)
      get().unsubscribeAllScenarioListeners?.();
  },

  // 바로가기(숏컷) 클릭 처리
  handleShortcutClick: async (item, messageId) => {
    if (!item || !item.action) return; // 유효성 검사
    const { extractedSlots, clearExtractedSlots, setSelectedOption, openScenarioPanel, handleResponse } = get();

    // 옵션 선택 상태 로컬 업데이트 (버튼 비활성화)
    // Firestore 업데이트는 setSelectedOption에서 처리 (임시 ID 제외)
    if (messageId) {
        set(state => ({ selectedOptions: { ...state.selectedOptions, [messageId]: item.title } }));
        // 실제 Firestore 저장은 비동기로 진행
        get().setSelectedOption(messageId, item.title);
    }

    // 액션 타입에 따라 분기
    if (item.action.type === "custom") { // 커스텀 액션 (메시지 전송)
      await handleResponse({ text: item.action.value, displayText: item.title });
    } else if (item.action.type === "scenario") { // 시나리오 시작
      // openScenarioPanel은 scenarioSlice에 있어야 함
      get().openScenarioPanel?.(item.action.value, extractedSlots); // scenarioSlice 호출 가정
    } else {
      console.warn(`Unsupported shortcut action type: ${item.action.type}`);
    }
    clearExtractedSlots(); // 슬롯 초기화
  },

  // --- 👇 [수정된 부분 시작]: saveMessage (중복 ID 확인 로직 추가) ---
  // 메시지를 Firestore에 저장 (대화 생성 로직 포함)
  saveMessage: async (message, conversationId = null) => {
    const { user, language, showEphemeralToast, currentConversationId: globalConversationId, createNewConversation } = get(); // conversationSlice 액션 참조
    if (!user || !message || typeof message !== 'object') {
        if(!message || typeof message !== 'object') console.error("saveMessage invalid message:", message);
        return null;
    }

    // 1. 전달받은 conversationId를 우선 사용, 없으면 전역(global) ID 사용
    let activeConversationId = conversationId || globalConversationId;

    try {
        // 2. (user 메시지 저장 시) ID가 없으면 새 대화 생성
        if (!activeConversationId) {
            console.log("No active conversation, creating new one and waiting...");
            activeConversationId = await createNewConversation(true); // conversationSlice 호출 (내부 await 포함)
            if (!activeConversationId) {
                throw new Error("Failed to get conversation ID after creation attempt (returned null).");
            }
            console.log(`Using newly created and loaded conversation ID: ${activeConversationId}`);
        } else {
             // 봇 응답 저장 시 또는 기존 대화에 메시지 저장 시
             // console.log(`Using provided conversation ID: ${activeConversationId}`);
        }

        // 3. 저장할 메시지 데이터 정리
        const messageToSave = { ...message };
        const tempId = String(messageToSave.id).startsWith('temp_') ? messageToSave.id : null; // 임시 ID 저장
        Object.keys(messageToSave).forEach( (key) => { if (messageToSave[key] === undefined) delete messageToSave[key]; });
        if (messageToSave.node?.data) { const { content, replies } = messageToSave.node.data; messageToSave.node.data = { ...(content && { content }), ...(replies && { replies }) }; }
        if (tempId) delete messageToSave.id; // Firestore 저장 시 임시 ID 제거

        // 4. Firestore에 메시지 추가 및 대화 업데이트 시간 갱신 (반드시 activeConversationId 사용)
        console.log(`Saving message to conversation: ${activeConversationId}`);
        const messagesCollection = collection( get().db, "chats", user.uid, "conversations", activeConversationId, "messages" );
        const messageRef = await addDoc(messagesCollection, { ...messageToSave, createdAt: serverTimestamp() });
        
        await updateDoc( doc(get().db, "chats", user.uid, "conversations", activeConversationId), { updatedAt: serverTimestamp() });
        console.log(`Message saved with ID: ${messageRef.id}`);

        // 5. [중요] 저장 성공 후, 로컬 상태(UI) 업데이트 (대화창을 이동하지 않았을 경우에만)
        if (tempId) {
            let selectedOptionValue = null;
            // 저장한 대화 ID(activeConversationId)와 현재 전역 ID(globalConversationId) 비교
            const isStillOnSameConversation = activeConversationId === get().currentConversationId;

            if (isStillOnSameConversation) {
                set(state => {
                    const newSelectedOptions = { ...state.selectedOptions };
                    if (newSelectedOptions[tempId]) {
                        selectedOptionValue = newSelectedOptions[tempId];
                        newSelectedOptions[messageRef.id] = selectedOptionValue;
                        delete newSelectedOptions[tempId];
                    }

                    // --- [FIX] ---
                    let newMessages = state.messages;
                    // onSnapshot이 이미 추가했는지 확인
                    const alreadyExists = state.messages.some(m => m.id === messageRef.id);

                    if (alreadyExists) {
                        // 스냅샷이 이김: 임시 메시지만 제거
                        newMessages = state.messages.filter(msg => msg.id !== tempId);
                    } else {
                        // saveMessage가 이김: 임시 메시지를 실제 메시지로 교체
                        newMessages = state.messages.map(msg => 
                            msg.id === tempId ? { ...message, id: messageRef.id, isStreaming: false } : msg
                        );
                    }
                    // --- [FIX END] ---
                    
                    return {
                        messages: newMessages,
                        selectedOptions: newSelectedOptions
                    };
                });
            } else {
                // 사용자가 다른 대화로 이동했으므로 로컬 state(UI)를 건드리지 않음
                console.log(`[saveMessage] User switched conversation. Skipping local state update for tempId: ${tempId}.`);
                selectedOptionValue = get().selectedOptions[tempId];
            }
            
            if (selectedOptionValue) {
                await get().setSelectedOption(messageRef.id, selectedOptionValue);
            }
        }

        return messageRef.id; // 성공 시 Firestore 문서 ID 반환
    } catch (error) {
        console.error(`Error in saveMessage (target convo ID: ${activeConversationId}):`, error);
        const errorKey = getErrorKey(error);
        const errorMessage = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to save message.';
        showEphemeralToast(errorMessage, 'error');

        // 저장 실패 시 임시 메시지 제거 (현재 활성화된 대화창에 한해서)
        if (String(message?.id).startsWith('temp_') && activeConversationId === get().currentConversationId) {
            set(state => ({ messages: state.messages.filter(msg => msg.id !== message.id) }));
        }
        return null; // 실패 시 null 반환
    }
  },
  // --- 👆 [수정된 부분 끝] ---

  // 메시지를 상태에 추가하고 Firestore에 저장 요청
  addMessage: async (sender, messageData) => {
     let newMessage;
     const temporaryId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`; // 임시 ID 생성

     // 메시지 객체 생성
     if (sender === "user") {
       newMessage = { id: temporaryId, sender, ...messageData };
     } else { // sender === 'bot'
       newMessage = {
         id: messageData.id || temporaryId, // 서버 ID 없으면 임시 ID
         sender: "bot",
         text: messageData.text,
         scenarios: messageData.scenarios,
         isStreaming: messageData.isStreaming || false,
         type: messageData.type,
         scenarioId: messageData.scenarioId,
         scenarioSessionId: messageData.scenarioSessionId,
         feedback: null, // --- 👈 [추가] 피드백 필드 초기화 ---
       };
     }

     // 낙관적 UI 업데이트: 상태에 임시 메시지 추가
     set((state) => ({ messages: [...state.messages, newMessage] }));

     // 스트리밍 중이 아닐 때만 Firestore 저장 시도 (saveMessage에서 ID 교체 및 selectedOption 처리)
     if (!newMessage.isStreaming) {
       // --- 👇 [수정] saveMessage에 null을 전달 (전역 ID를 사용하도록) ---
       await get().saveMessage(newMessage, null); // await 추가하여 저장/롤백 완료 기다림
       // --- 👆 [수정] ---
     }
     // 스트리밍 메시지는 handleResponse의 finally 블록에서 최종 저장 시도
  },

  // 이전 메시지 더 로드하기
  loadMoreMessages: async () => {
    const { user, language, showEphemeralToast, currentConversationId, lastVisibleMessage, hasMoreMessages, messages } = get(); // conversationSlice 상태 참조
    if (!user || !currentConversationId || !hasMoreMessages || !lastVisibleMessage || get().isLoading) return;

    set({ isLoading: true }); // 로딩 시작

    try {
      const messagesRef = collection( get().db, "chats", user.uid, "conversations", currentConversationId, "messages" );
      const q = query( messagesRef, orderBy("createdAt", "desc"), startAfter(lastVisibleMessage), limit(MESSAGE_LIMIT) );
      const snapshot = await getDocs(q); // Firestore 읽기

      if (snapshot.empty) { // 더 이상 메시지가 없으면
          set({ hasMoreMessages: false });
          return; // 로딩은 finally에서 해제
      }

      const newMessages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).reverse(); // 시간 순서대로
      const newLastVisible = snapshot.docs[snapshot.docs.length - 1]; // 새 커서
      const initialMessage = messages[0]; // 초기 메시지 유지
      const existingMessages = messages.slice(1); // 기존 메시지

      // 선택 옵션 병합
      const newSelectedOptions = { ...get().selectedOptions };
      newMessages.forEach(msg => { if (msg.selectedOption) newSelectedOptions[msg.id] = msg.selectedOption; });

      // 상태 업데이트: 새 메시지를 기존 메시지 *앞에* 추가
      set({
        messages: [initialMessage, ...newMessages, ...existingMessages],
        lastVisibleMessage: newLastVisible, // 커서 업데이트
        hasMoreMessages: snapshot.docs.length === MESSAGE_LIMIT, // 더 있는지 여부 업데이트
        selectedOptions: newSelectedOptions,
      });
    } catch (error) {
      console.error("Error loading more messages:", error);
      const errorKey = getErrorKey(error);
      const message = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to load more messages.';
      showEphemeralToast(message, 'error');
      set({ hasMoreMessages: false }); // 오류 시 더 로드 시도 중지
    } finally {
      set({ isLoading: false }); // 로딩 종료
    }
  },

  // --- 👇 [수정된 부분 시작]: handleResponse (completedResponses 로직 추가) ---
  // 사용자 메시지 처리 및 봇 응답 요청/처리
  handleResponse: async (messagePayload) => {
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
          updateConversationTitle
      } = get();

      const textForUser = messagePayload.displayText || messagePayload.text;

      const defaultTitle = locales[language]?.["newChat"] || "New Conversation";
      // addMessage 호출 전 상태 확인
      const isFirstUserMessage = messages.filter(m => m.id !== 'initial').length === 0;
      const currentConvo = currentConversationId ? conversations.find(c => c.id === currentConversationId) : null;
      // 새 대화 버튼을 눌러 C.ID가 있어도, 제목이 기본값이면 업데이트 대상
      const needsTitleUpdate = isFirstUserMessage && textForUser && (!currentConvo || currentConvo.title === defaultTitle);
      
      if (textForUser) {
          // 1. 메시지 추가 (이 안에서 saveMessage(..., null) 호출 -> C.ID 없으면 생성)
          await addMessage("user", { text: textForUser });
      }

      // 2. [중요] 봇 응답을 저장할 대화 ID 캡처
      // (addMessage/saveMessage를 거치며 ID가 확정됨)
      const conversationIdForBotResponse = get().currentConversationId;
      
      if (!conversationIdForBotResponse) {
           console.error("[handleResponse] Failed to determine conversationId for bot response.");
           set({ isLoading: false });
           return; // 봇 응답 요청 중단
      }

      // 3. 제목 업데이트 필요 시 (캡처된 ID 사용)
      if (needsTitleUpdate) {
          const newTitle = textForUser.substring(0, 100); // 100자 제한
          await updateConversationTitle(conversationIdForBotResponse, newTitle); // conversationSlice의 액션 호출
      }

      // --- [NEW] ---
      // 4. Pending 상태 추가 및 '생각중' 메시지 UI에 추가
      set(state => ({ 
          pendingResponses: new Set(state.pendingResponses).add(conversationIdForBotResponse) 
      }));
      const thinkingText = locales[language]?.['statusGenerating'] || "Generating...";
      // 예측 가능한 임시 ID 사용
      const tempBotMessage = { 
          id: `temp_pending_${conversationIdForBotResponse}`, 
          sender: 'bot', 
          text: thinkingText, 
          isStreaming: true, 
          feedback: null 
      };
      set(state => ({ messages: [...state.messages, tempBotMessage] }));
      let lastBotMessageId = tempBotMessage.id;
      // --- [NEW END] ---

      let finalMessageId = null;
      let finalStreamText = '';

      try {
        const response = await fetch("/api/chat", {
           method: "POST", headers: { "Content-Type": "application/json" },
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
          const errorData = await response.json().catch(() => ({ message: `Server error: ${response.status}` }));
          throw new Error(errorData.message || `Server error: ${response.status}`);
        }

        if (response.headers.get("Content-Type")?.includes("text/event-stream")) {
          // --- 스트림 응답 처리 ---
          console.log("[handleResponse] Processing text/event-stream response.");
          
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let streamProcessor;

          if (llmProvider === 'gemini') streamProcessor = processGeminiStream(reader, decoder, get);
          else if (llmProvider === 'flowise') streamProcessor = processFlowiseStream(reader, decoder, get);
          else throw new Error(`Unsupported LLM provider for streaming: ${llmProvider}`);

          for await (const result of streamProcessor) {
              // [중요] 스트림 업데이트는 현재 활성화된 대화창에만 반영
              if (conversationIdForBotResponse === get().currentConversationId) {
                 if (result.type === 'text') updateLastMessage(result.data, result.replace);
                 else if (result.type === 'button') updateLastMessage(result.data);
              }
              // 슬롯/rawResponse는 UI 영향 없으므로 항상 업데이트
              if (result.type === 'slots') setExtractedSlots(result.data);
              else if (result.type === 'rawResponse') set({ llmRawResponse: result.data });
              else if (result.type === 'finalText') finalStreamText = result.data;
              else if (result.type === 'error') throw result.data;
          }
           // 스트림 정상 종료 -> finally 블록에서 최종 메시지 처리 및 저장

        } else { // --- JSON 응답 처리 ---
          const data = await response.json();
          set({ llmRawResponse: data });

          if (data.type === 'error') {
              throw new Error(data.message || 'API returned an unknown error.');
          }

          const handler = responseHandlers[data.type];
          if (handler) {
            // [중요] JSON 응답도 현재 활성화된 대화창에만 addMessage
            if (conversationIdForBotResponse === get().currentConversationId) {
                handler(data, get);
            } else {
                 console.log("[handleResponse] User switched convo. Skipping local state update for JSON response.");
                 // [NEW] JSON 응답도 완료 뱃지 표시
                 set(state => ({
                    completedResponses: new Set(state.completedResponses).add(conversationIdForBotResponse)
                 }));
            }
          } else {
            const responseText = data.response || data.text || data.message;
            if (responseText) {
              // addMessage는 현재 대화창(null)에만 저장함. 
              // [수정] saveMessage를 직접 호출해야 함
              if(conversationIdForBotResponse === get().currentConversationId) {
                  await addMessage("bot", { text: responseText }); 
              } else {
                  console.log("[handleResponse] User switched. Saving JSON response to original conversation in background.");
                  const botMessage = { id: `temp_${Date.now()}`, sender: 'bot', text: responseText, isStreaming: false, feedback: null };
                  await saveMessage(botMessage, conversationIdForBotResponse);
                  // [NEW] JSON 응답도 완료 뱃지 표시
                  set(state => ({
                     completedResponses: new Set(state.completedResponses).add(conversationIdForBotResponse)
                  }));
              }
            } else {
              console.warn(`[ChatStore] Unhandled non-stream response type or empty response:`, data);
              await addMessage("bot", { text: locales[language]?.['errorUnexpected'] || "(No content)" });
            }
          }
        }
      } catch (error) { // 메인 try 블록의 catch
        console.error("[handleResponse] Error:", error);
        const errorMessage = error.message || locales[language]?.['errorLLMFail'] || locales['en']?.['errorLLMFail'] || 'There was a problem with the response. Please try again later.';

        let messageSaved = false;
        const isStillOnSameConversation = conversationIdForBotResponse === get().currentConversationId;

        if (isStillOnSameConversation) {
            // 1. 아직 같은 대화창: UI 업데이트 + Firestore 저장
            set(state => {
                const lastMessageIndex = state.messages.length - 1;
                const lastMessage = state.messages[lastMessageIndex];

                if (lastMessage && lastMessage.id === lastBotMessageId && lastMessage.isStreaming) {
                    const updatedMessage = { ...lastMessage, text: errorMessage, isStreaming: false };
                    
                    saveMessage(updatedMessage, conversationIdForBotResponse).then(savedId => {
                        finalMessageId = savedId;
                        set(s => {
                            const newSet = new Set(s.pendingResponses);
                            newSet.delete(conversationIdForBotResponse);
                            
                            let newMessages = s.messages;
                            const alreadyExists = savedId ? s.messages.some(m => m.id === savedId) : false;

                            if (alreadyExists) {
                                newMessages = s.messages.filter(m => m.id !== lastBotMessageId);
                            } else if (savedId) {
                                newMessages = s.messages.map(m => m.id === lastBotMessageId ? { ...updatedMessage, id: savedId } : m);
                            } else {
                                newMessages = s.messages.map(m => m.id === lastBotMessageId ? updatedMessage : m);
                            }

                            return {
                                messages: newMessages,
                                isLoading: false,
                                pendingResponses: newSet 
                            };
                        });
                        messageSaved = true;
                    });
                    return { messages: [...state.messages.slice(0, lastMessageIndex), updatedMessage] };
                }
                
                addMessage("bot", { text: errorMessage });
                const newSet = new Set(state.pendingResponses);
                newSet.delete(conversationIdForBotResponse);
                return { isLoading: false, pendingResponses: newSet };
            });
        } else {
            // 2. 다른 대화창: Firestore에만 저장
            console.log("[handleResponse/catch] User switched. Saving error message to original conversation in background.");
            const errorBotMessage = { id: `temp_${Date.now()}`, sender: 'bot', text: errorMessage, isStreaming: false, feedback: null };
            saveMessage(errorBotMessage, conversationIdForBotResponse).then(() => {
                 messageSaved = true;
            });
            set(state => {
                 const newSet = new Set(state.pendingResponses);
                 newSet.delete(conversationIdForBotResponse);
                 // --- 👇 [수정] 에러 시에도 완료 뱃지 추가 ---
                 const newCompletedSet = new Set(state.completedResponses);
                 newCompletedSet.add(conversationIdForBotResponse);
                 // --- 👆 [수정] ---
                 return { 
                     isLoading: false, 
                     pendingResponses: newSet,
                     completedResponses: newCompletedSet // [NEW]
                 };
            });
        }
        
        if (!messageSaved) {
            set(state => {
                 const newSet = new Set(state.pendingResponses);
                 newSet.delete(conversationIdForBotResponse);
                 // --- 👇 [수정] 에러 시에도 완료 뱃지 추가 ---
                 const newCompletedSet = new Set(state.completedResponses);
                 newCompletedSet.add(conversationIdForBotResponse);
                 // --- 👆 [수정] ---
                 return { 
                     isLoading: false, 
                     pendingResponses: newSet,
                     completedResponses: newCompletedSet // [NEW]
                 };
            });
        }

      } finally { // 메인 try 블록의 finally (스트림 성공 종료 또는 JSON 성공 시)
        
        const isStillOnSameConversation = conversationIdForBotResponse === get().currentConversationId;

        if (isStillOnSameConversation) {
            // 1. 아직 같은 대화창: UI 업데이트 + Firestore 저장
            set(state => {
                const lastMessageIndex = state.messages.length - 1;
                const lastMessage = state.messages[lastMessageIndex];

                // 스트리밍 메시지였는지 확인
                if (lastMessage && (lastMessage.id === lastBotMessageId || lastMessage.id === finalMessageId) && lastMessage.isStreaming) {
                    const finalText = (llmProvider === 'flowise' ? finalStreamText : lastMessage.text) || '';
                    const finalMessageText = finalText.trim() === '' || finalText.trim() === thinkingText.trim()
                          ? locales[language]?.['errorLLMFail'] || "(Response failed. Please try again later.)"
                          : finalText;
                    const finalMessage = { ...lastMessage, text: finalMessageText, isStreaming: false, feedback: null };

                    saveMessage(finalMessage, conversationIdForBotResponse).then(savedId => {
                          finalMessageId = savedId;
                           set(s => {
                                const newSet = new Set(s.pendingResponses);
                                newSet.delete(conversationIdForBotResponse);
                                
                                let newMessages = s.messages;
                                const alreadyExists = savedId ? s.messages.some(m => m.id === savedId) : false;

                                if (alreadyExists) {
                                    newMessages = s.messages.filter(m => m.id !== lastMessage.id);
                                } else if (savedId) {
                                    newMessages = s.messages.map(m => m.id === lastMessage.id ? { ...finalMessage, id: savedId } : m);
                                } else {
                                    // [FIX] save 실패 시 임시 메시지 제거
                                    newMessages = s.messages.filter(m => m.id !== lastMessage.id);
                                }

                                return {
                                    messages: newMessages,
                                    isLoading: false,
                                    pendingResponses: newSet 
                                };
                           });
                    });

                    return {
                        messages: [...state.messages.slice(0, lastMessageIndex), finalMessage]
                    };
                }
                
                // 스트리밍이 아니었던 경우 (예: JSON 응답)
                const newSet = new Set(state.pendingResponses);
                newSet.delete(conversationIdForBotResponse);
                if (state.isLoading) return { isLoading: false, pendingResponses: newSet }; 
                return {};
            });
        } else {
             // 2. 다른 대화창: Firestore에만 저장
             console.log("[handleResponse/finally] User switched. Saving final message to original conversation in background.");
             set(state => {
                 // 로컬 '생각중' 메시지 찾아서 제거
                 const messagesWithoutThinking = state.messages.filter(m => m.id !== lastBotMessageId);
                 
                 // --- 👇 [수정] 스트리밍/JSON 모두 백그라운드 저장 및 뱃지 추가 ---
                 let messageToSave = null;
                 if (finalStreamText) { // 스트리밍 응답
                     const finalMessageText = finalStreamText.trim() === '' || finalStreamText.trim() === thinkingText.trim()
                          ? locales[language]?.['errorLLMFail'] || "(Response failed. Please try again later.)"
                          : finalStreamText;
                     messageToSave = { id: `temp_${Date.now()}`, sender: 'bot', text: finalMessageText, isStreaming: false, feedback: null };
                 } else if (lastBotMessageId) { 
                     // JSON 응답 (스트리밍이 아니었음) - 이 경우는 addMessage에서 이미 처리되었을 수 있으나,
                     // 1290줄 근처의 JSON 응답 로직에서 다른 대화창일 때 저장을 안 했으므로 여기서 저장
                     const localJsonMessage = get().messages.find(m => m.id === lastBotMessageId);
                     if (localJsonMessage) { // addMessage가 만든 임시 메시지가 있다면
                         messageToSave = { ...localJsonMessage, isStreaming: false };
                     }
                 }

                 if (messageToSave) {
                     saveMessage(messageToSave, conversationIdForBotResponse);
                 }
                 
                 const newSet = new Set(state.pendingResponses);
                 newSet.delete(conversationIdForBotResponse);
                 // [NEW] Add to completed set
                 const newCompletedSet = new Set(state.completedResponses);
                 newCompletedSet.add(conversationIdForBotResponse);
                 // --- 👆 [수정] ---

                 return {
                     messages: messagesWithoutThinking, // 현재 UI에서 '생각중' 제거
                     isLoading: false, // 현재 UI 로딩 중지
                     pendingResponses: newSet,
                     completedResponses: newCompletedSet // [NEW]
                 };
             });
        }
      } // end finally
    }, // end handleResponse
    // --- 👆 [수정된 부분 끝] ---

   } // end return store object
}; // end createChatSlice