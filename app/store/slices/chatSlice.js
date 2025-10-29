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


// --- 👇 [수정된 부분 시작]: processFlowiseStream 개선 ---
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

                let textChunk = '';

                // Flowise 이벤트 타입별 처리
                if (data.event === 'agentFlowExecutedData' && Array.isArray(data.data) && data.data.length > 0) {
                    // 마지막 데이터 객체의 output.content 확인 (구조 검증 강화)
                    const lastData = data.data[data.data.length - 1];
                    if (lastData?.data?.output?.content) {
                        textChunk = lastData.data.output.content;
                        // 첫 응답 시 thinking 메시지 대체, 이후엔 기존 텍스트 완전히 대체
                        yield { type: 'text', data: textChunk, replace: true };
                        thinkingMessageReplaced = true;
                        collectedText = textChunk; // 전체 텍스트 업데이트
                    }
                } else if (data.event === 'usedTools' && Array.isArray(data.data) && data.data.length > 0) {
                     // toolOutput 구조 및 scenarioId 존재 여부 확인 (구조 검증 강화)
                    const toolOutput = data.data[0]?.toolOutput;
                    if (toolOutput && typeof toolOutput === 'string' && !buttonText) { // 버튼은 한 번만 추출
                         const match = toolOutput.match(/"scenarioId"\s*:\s*"([^"]+)"/);
                         if (match && match[1]) {
                             buttonText = `\n\n[BUTTON:${match[1]}]`;
                             // 버튼 텍스트는 바로 UI 업데이트하지 않고 마지막에 추가
                         }
                    }
                } else if (data.event === 'token' && typeof data.data === 'string') {
                    // 일반 텍스트 토큰 스트리밍
                    textChunk = data.data;
                    yield { type: 'text', data: textChunk, replace: !thinkingMessageReplaced };
                    thinkingMessageReplaced = true;
                    collectedText += textChunk; // 전체 텍스트 누적
                } else if (data.event === 'chunk' && data.data?.response) {
                    // 일부 Flowise 버전의 텍스트 청크 스트리밍
                    textChunk = data.data.response;
                    yield { type: 'text', data: textChunk, replace: !thinkingMessageReplaced };
                    thinkingMessageReplaced = true;
                    collectedText += textChunk; // 전체 텍스트 누적
                }
                // 다른 이벤트 타입은 필요에 따라 추가
            }
        } // end while

        // 스트림 종료 후 버퍼에 남은 데이터 처리 (예: 마지막 JSON 조각)
        if (buffer.trim()) {
            try {
                const data = JSON.parse(buffer.trim());
                // 필요시 마지막 데이터 처리 로직 추가 (위의 이벤트 처리 로직과 유사하게)
                 let textChunk = '';
                if (data.event === 'agentFlowExecutedData' /*...*/) {
                    // ... 처리 ...
                    // yield { type: 'text', data: textChunk, replace: true };
                    // collectedText = textChunk;
                } else if (data.event === 'token' /*...*/) {
                   // ... 처리 ...
                   // yield { type: 'text', data: textChunk, replace: !thinkingMessageReplaced };
                   // collectedText += textChunk;
                }
                // ... 기타 등등 ...
            } catch (e) {
                console.warn("Error parsing final Flowise stream buffer:", e, "Buffer:", buffer);
            }
        }

        // 수집된 버튼 텍스트가 있으면 UI 업데이트 및 전체 텍스트에 추가
        if (buttonText) {
            yield { type: 'button', data: buttonText };
            collectedText += buttonText;
        }

        // 슬롯 추출 시도 (현재는 예약번호만, 개선 필요)
        // TODO: 더 일반적인 슬롯 추출 로직 필요 (Flowise 응답 형식 정의 필요)
        const bookingNoRegex = /\b([A-Z]{2}\d{10})\b/i;
        const match = collectedText.match(bookingNoRegex);
        if (match && match[1]) {
            extractedSlots.bkgNr = match[1];
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
  },

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

              // 초기 메시지와 결합하여 상태 업데이트
              set({
                  messages: [initialMessage, ...newMessages],
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

  // 스트리밍 중 마지막 봇 메시지 업데이트
  updateLastMessage: (chunk, replace = false) => {
    set((state) => {
      const lastMessage = state.messages[state.messages.length - 1];
      if (lastMessage && lastMessage.sender === 'bot' && lastMessage.isStreaming) {
        const updatedText = replace ? chunk : (lastMessage.text || '') + chunk;
        const updatedMessage = { ...lastMessage, text: updatedText };
        return { messages: [...state.messages.slice(0, -1), updatedMessage] };
      }
      // 스트리밍 메시지가 아니면 새 메시지로 추가 (Flowise 버튼 처리 등)
      // else if (chunk && chunk.trim()) {
      //     const newId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      //     const newMessage = { id: newId, sender: 'bot', text: chunk, isStreaming: false };
      //     get().saveMessage(newMessage); // 저장 시도
      //     return { messages: [...state.messages, newMessage] };
      // }
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

  // LLM 추출 슬롯 설정
  setExtractedSlots: (newSlots) => {
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

  // 메시지를 Firestore에 저장 (대화 생성 로직 포함)
  saveMessage: async (message) => {
    const { user, language, showEphemeralToast, currentConversationId, createNewConversation } = get(); // conversationSlice 액션 참조
    if (!user || !message || typeof message !== 'object') {
        if(!message || typeof message !== 'object') console.error("saveMessage invalid message:", message);
        return null;
    }

    let activeConversationId = currentConversationId; // conversationSlice 상태 참조

    try {
        // 현재 대화 ID 없으면 새로 생성하고 로드가 완료될 때까지 기다림
        if (!activeConversationId) {
            console.log("No active conversation, creating new one and waiting...");
            activeConversationId = await createNewConversation(true); // conversationSlice 호출 (내부 await 포함)
            if (!activeConversationId) {
                throw new Error("Failed to get conversation ID after creation attempt (returned null).");
            }
            console.log(`Using newly created and loaded conversation ID: ${activeConversationId}`);
        } else {
             console.log(`Using existing conversation ID: ${activeConversationId}`);
        }

        // 저장할 메시지 데이터 정리
        const messageToSave = { ...message };
        const tempId = String(messageToSave.id).startsWith('temp_') ? messageToSave.id : null; // 임시 ID 저장
        Object.keys(messageToSave).forEach( (key) => { if (messageToSave[key] === undefined) delete messageToSave[key]; });
        if (messageToSave.node?.data) { const { content, replies } = messageToSave.node.data; messageToSave.node.data = { ...(content && { content }), ...(replies && { replies }) }; }
        if (tempId) delete messageToSave.id; // Firestore 저장 시 임시 ID 제거

        // Firestore에 메시지 추가 및 대화 업데이트 시간 갱신
        console.log(`Saving message to conversation: ${activeConversationId}`);
        const messagesCollection = collection( get().db, "chats", user.uid, "conversations", activeConversationId, "messages" );
        const messageRef = await addDoc(messagesCollection, { ...messageToSave, createdAt: serverTimestamp() });
        await updateDoc( doc(get().db, "chats", user.uid, "conversations", activeConversationId), { updatedAt: serverTimestamp() });
        console.log(`Message saved with ID: ${messageRef.id}`);

        // 저장 성공 후, 임시 ID였던 경우 상태 업데이트 처리
        if (tempId) {
            let selectedOptionValue = null;
            set(state => {
                const newSelectedOptions = { ...state.selectedOptions };
                if (newSelectedOptions[tempId]) {
                    selectedOptionValue = newSelectedOptions[tempId];
                    newSelectedOptions[messageRef.id] = selectedOptionValue;
                    delete newSelectedOptions[tempId];
                }
                // 메시지 배열에서 ID 교체 (message 객체 사용)
                return {
                    messages: state.messages.map(msg => msg.id === tempId ? { ...message, id: messageRef.id, isStreaming: false } : msg), // isStreaming 확실히 false
                    selectedOptions: newSelectedOptions
                };
            });
            // Firestore에 selectedOption 업데이트 (setSelectedOption 호출)
            if (selectedOptionValue) {
                await get().setSelectedOption(messageRef.id, selectedOptionValue);
            }
        }

        return messageRef.id; // 성공 시 Firestore 문서 ID 반환
    } catch (error) {
        console.error("Error in saveMessage:", error);
        const errorKey = getErrorKey(error);
        const errorMessage = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to save message.';
        showEphemeralToast(errorMessage, 'error');

        // 저장 실패 시 임시 메시지 제거
        if (String(message?.id).startsWith('temp_')) {
            set(state => ({ messages: state.messages.filter(msg => msg.id !== message.id) }));
        }
        return null; // 실패 시 null 반환
    }
  },

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
       };
     }

     // 낙관적 UI 업데이트: 상태에 임시 메시지 추가
     set((state) => ({ messages: [...state.messages, newMessage] }));

     // 스트리밍 중이 아닐 때만 Firestore 저장 시도 (saveMessage에서 ID 교체 및 selectedOption 처리)
     if (!newMessage.isStreaming) {
       await get().saveMessage(newMessage); // await 추가하여 저장/롤백 완료 기다림
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

  // --- 👇 [수정된 부분 시작]: handleResponse 개선 ---
  // 사용자 메시지 처리 및 봇 응답 요청/처리
  handleResponse: async (messagePayload) => {
      set({ isLoading: true, llmRawResponse: null });
      const { language, showEphemeralToast, addMessage, updateLastMessage, saveMessage, setExtractedSlots, llmProvider } = get();

      const textForUser = messagePayload.displayText || messagePayload.text;
      if (textForUser) {
          await addMessage("user", { text: textForUser });
      }

      const thinkingText = locales[language]?.['statusGenerating'] || "Generating...";
      let lastBotMessageId = null;
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
          // --- 스트림 응답 처리 (이전과 동일) ---
          console.log("[handleResponse] Processing text/event-stream response.");
          const tempBotMessage = { id: `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, sender: 'bot', text: thinkingText, isStreaming: true };
          set(state => ({ messages: [...state.messages, tempBotMessage] }));
          lastBotMessageId = tempBotMessage.id;

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let streamProcessor;

          if (llmProvider === 'gemini') streamProcessor = processGeminiStream(reader, decoder, get);
          else if (llmProvider === 'flowise') streamProcessor = processFlowiseStream(reader, decoder, get);
          else throw new Error(`Unsupported LLM provider for streaming: ${llmProvider}`);

          for await (const result of streamProcessor) {
              if (result.type === 'text') updateLastMessage(result.data, result.replace);
              else if (result.type === 'slots') setExtractedSlots(result.data);
              else if (result.type === 'rawResponse') set({ llmRawResponse: result.data });
              else if (result.type === 'button') updateLastMessage(result.data);
              else if (result.type === 'finalText') finalStreamText = result.data;
              else if (result.type === 'error') throw result.data;
          }
           // 스트림 정상 종료 -> finally 블록에서 최종 메시지 처리 및 저장

        } else { // --- JSON 응답 처리 ---
          const data = await response.json();
          set({ llmRawResponse: data });

          // API 라우트에서 표준 오류 객체 반환 시 처리
          if (data.type === 'error') {
              throw new Error(data.message || 'API returned an unknown error.');
          }

          const handler = responseHandlers[data.type];
          if (handler) {
            handler(data, get);
          } else {
            const responseText = data.response || data.text || data.message;
            if (responseText) {
              await addMessage("bot", { text: responseText });
              if (data.slots) setExtractedSlots(data.slots);
            } else {
              console.warn(`[ChatStore] Unhandled non-stream response type or empty response:`, data);
              await addMessage("bot", { text: locales[language]?.['errorUnexpected'] || "(No content)" });
            }
          }
          set({ isLoading: false });
        }
      } catch (error) { // 메인 try 블록의 catch
        console.error("[handleResponse] Error:", error);
        // --- 👇 [수정] errorLLMFail 메시지 키 사용 및 error.message 우선 사용 ---
        // API 에러 메시지(error.message)가 있으면 사용, 없으면 errorLLMFail 사용
        const errorMessage = error.message || locales[language]?.['errorLLMFail'] || locales['en']?.['errorLLMFail'] || 'There was a problem with the response. Please try again later.';
        // --- 👆 [수정] ---

        let messageSaved = false;
        set(state => {
            const lastMessageIndex = state.messages.length - 1;
            const lastMessage = state.messages[lastMessageIndex];

            if (lastMessage && lastMessage.id === lastBotMessageId && lastMessage.isStreaming) {
                const updatedMessage = { ...lastMessage, text: errorMessage, isStreaming: false };
                saveMessage(updatedMessage).then(savedId => {
                    finalMessageId = savedId;
                    if (savedId && savedId !== lastBotMessageId) {
                        set(s => ({
                             messages: s.messages.map(m => m.id === lastBotMessageId ? { ...updatedMessage, id: savedId } : m),
                             isLoading: false
                          }));
                        messageSaved = true;
                    } else if (savedId) {
                        set(s => ({ isLoading: false }));
                        messageSaved = true;
                    }
                });
                return { messages: [...state.messages.slice(0, lastMessageIndex), updatedMessage] };
            }
            addMessage("bot", { text: errorMessage });
            return { isLoading: false };
        });

        if (!messageSaved) {
            set({ isLoading: false });
        }

      } finally { // 메인 try 블록의 finally (스트림 성공 종료 시)
        set(state => {
            const lastMessageIndex = state.messages.length - 1;
            const lastMessage = state.messages[lastMessageIndex];

            if (lastMessage && (lastMessage.id === lastBotMessageId || lastMessage.id === finalMessageId) && lastMessage.isStreaming) {
                 const finalText = (llmProvider === 'flowise' ? finalStreamText : lastMessage.text) || '';
                 // --- 👇 [수정] 최종 텍스트 비어있거나 thinkingText와 같으면 errorLLMFail 메시지 사용 ---
                 const finalMessageText = finalText.trim() === '' || finalText.trim() === thinkingText.trim()
                      ? locales[language]?.['errorLLMFail'] || "(Response failed. Please try again later.)"
                      : finalText;
                  // --- 👆 [수정] ---

                 const finalMessage = { ...lastMessage, text: finalMessageText, isStreaming: false };

                 saveMessage(finalMessage).then(savedId => {
                      finalMessageId = savedId;
                      if (savedId && savedId !== lastMessage.id) {
                           set(s => ({
                              messages: s.messages.map(m => m.id === lastMessage.id ? { ...finalMessage, id: savedId } : m),
                              isLoading: false
                          }));
                      } else if (savedId) {
                           set(s => ({ isLoading: false }));
                      } else {
                          // saveMessage 실패 시 (이미 토스트 표시됨), 로딩 상태만 해제
                           set(s => ({ isLoading: false }));
                      }
                 });

                 return {
                     messages: [...state.messages.slice(0, lastMessageIndex), finalMessage]
                  };
            }
            // 스트리밍 아니었거나 이미 처리된 경우, isLoading 상태가 false가 아닐 수 있으므로 여기서 확실히 false로 설정
            if (state.isLoading) {
                 return { isLoading: false };
            }
            return {}; // 상태 변경 없음
        });
      } // end finally
    }, // end handleResponse
    // --- 👆 [수정된 부분 끝] ---

    // ... (rest of the chatSlice functions remain the same) ...
   } // end return store object
}; // end createChatSlice