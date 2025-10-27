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


// 스트림 처리 헬퍼 함수들 (파일 상단 또는 별도 유틸)
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
async function* processFlowiseStream(reader, decoder, get) {
    let buffer = '';
    let thinkingMessageReplaced = false;
    let collectedText = '';
    let buttonText = '';
    let extractedSlots = {};
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) { /* final buffer processing */
                 if (buffer) {
                    const lines = buffer.split('\n');
                    for (const line of lines) {
                        if (line.toLowerCase().startsWith('data:')) {
                            const jsonString = line.substring(line.indexOf(':') + 1).trim();
                            if (jsonString && jsonString !== "[DONE]") {
                                try {
                                    const data = JSON.parse(jsonString); let textChunk = '';
                                    if (data.event === 'agentFlowExecutedData' && Array.isArray(data.data) && data.data.length > 0 && data.data[data.data.length-1]?.data?.output?.content) {
                                        textChunk = data.data[data.data.length-1].data.output.content;
                                        yield { type: 'text', data: textChunk, replace: true }; thinkingMessageReplaced = true; collectedText = textChunk;
                                    } else if (data.event === 'usedTools' && Array.isArray(data.data) && data.data.length > 0 && data.data[0]?.toolOutput && !buttonText) {
                                        const match = data.data[0].toolOutput.match(/"scenarioId"\s*:\s*"([^"]+)"/);
                                        if (match && match[1]) buttonText = `\n\n[BUTTON:${match[1]}]`;
                                    }
                                } catch (e) { console.warn("Final Flowise buffer parse error:", e); }
                            }
                        }
                    }
                 }
                 break;
            }
            if (!value) continue; let chunk; try { chunk = decoder.decode(value, { stream: true }); } catch(e) { chunk = ''; } buffer += chunk; const lines = buffer.split('\n'); buffer = lines.pop() || '';
            for (const line of lines) {
                if (!line.trim() || line.toLowerCase().startsWith('message:')) continue; let jsonString = ''; if (line.toLowerCase().startsWith('data:')) jsonString = line.substring(line.indexOf(':') + 1).trim(); else jsonString = line.trim(); if (!jsonString || jsonString === "[DONE]") continue; let data; try { data = JSON.parse(jsonString); } catch (e) { buffer = line + (buffer ? '\n' + buffer : ''); continue; } let textChunk = '';
                if (data.event === 'agentFlowExecutedData' && Array.isArray(data.data) && data.data.length > 0 && data.data[data.data.length-1]?.data?.output?.content) {
                    textChunk = data.data[data.data.length-1].data.output.content;
                    yield { type: 'text', data: textChunk, replace: true }; thinkingMessageReplaced = true; collectedText = textChunk;
                } else if (data.event === 'usedTools' && Array.isArray(data.data) && data.data.length > 0 && data.data[0]?.toolOutput && !buttonText) {
                     const match = data.data[0].toolOutput.match(/"scenarioId"\s*:\s*"([^"]+)"/);
                     if (match && match[1]) buttonText = `\n\n[BUTTON:${match[1]}]`;
                } else if (data.event === 'token' && typeof data.data === 'string') {
                    textChunk = data.data; yield { type: 'text', data: textChunk, replace: !thinkingMessageReplaced }; thinkingMessageReplaced = true; collectedText += textChunk;
                } else if (data.event === 'chunk' && data.data?.response) {
                    textChunk = data.data.response; yield { type: 'text', data: textChunk, replace: !thinkingMessageReplaced }; thinkingMessageReplaced = true; collectedText += textChunk;
                }
            }
        }
        if (buttonText) { yield { type: 'button', data: buttonText }; collectedText += buttonText; }
        const bookingNoRegex = /\b([A-Z]{2}\d{10})\b/i; const match = collectedText.match(bookingNoRegex); if (match && match[1]) { extractedSlots.bkgNr = match[1]; yield { type: 'slots', data: extractedSlots }; }
        yield { type: 'finalText', data: collectedText };
    } catch (streamError) { console.error("Flowise stream read error:", streamError); yield { type: 'error', data: streamError }; }
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

  // 사용자 메시지 처리 및 봇 응답 요청/처리
  handleResponse: async (messagePayload) => {
    set({ isLoading: true, llmRawResponse: null }); // 로딩 시작
    const { language, showEphemeralToast, addMessage, updateLastMessage, saveMessage, setExtractedSlots, llmProvider } = get();

    // 사용자 메시지 추가 (UI 업데이트 및 저장 시도)
    const textForUser = messagePayload.displayText || messagePayload.text;
    if (textForUser) {
        await addMessage("user", { text: textForUser }); // 내부에서 오류 처리 및 ID 교체
    }

    const thinkingText = locales[language]?.['statusGenerating'] || "Generating...";
    let lastBotMessageId = null; // 봇 응답 메시지의 임시 ID 저장용
    let finalMessageId = null; // 저장 후 실제 ID 저장용 (finally에서 사용)
    let finalStreamText = ''; // 스트림 완료 후 최종 텍스트 (Flowise용)

    try {
      // 백엔드 API 호출
      const response = await fetch("/api/chat", {
         method: "POST", headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
             message: { text: messagePayload.text }, // 실제 처리될 텍스트
             scenarioState: null, // 일반 메시지 요청
             slots: get().slots, // 현재 슬롯 전달
             language: language,
             llmProvider: llmProvider,
             flowiseApiUrl: get().flowiseApiUrl,
         }),
      });

      // API 응답 오류 처리
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Server error: ${response.statusText}` }));
        throw new Error(errorData.message || `Server error: ${response.statusText}`);
      }

      // 응답 타입(스트림/JSON)에 따른 처리
      if (response.headers.get("Content-Type")?.includes("text/event-stream")) {
        // 스트림 응답 처리
        console.log("[handleResponse] Processing text/event-stream response.");

        // '생각중...' 메시지 추가 및 임시 ID 저장
        const tempBotMessage = { id: `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, sender: 'bot', text: thinkingText, isStreaming: true };
        set(state => ({ messages: [...state.messages, tempBotMessage] }));
        lastBotMessageId = tempBotMessage.id;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let streamProcessor;

        // Provider에 따라 스트림 처리기 선택
        if (llmProvider === 'gemini') streamProcessor = processGeminiStream(reader, decoder, get);
        else if (llmProvider === 'flowise') streamProcessor = processFlowiseStream(reader, decoder, get);
        else throw new Error(`Unsupported LLM provider for streaming: ${llmProvider}`);

        // 스트림 결과 처리 루프
        for await (const result of streamProcessor) {
            if (result.type === 'text') updateLastMessage(result.data, result.replace);
            else if (result.type === 'slots') setExtractedSlots(result.data);
            else if (result.type === 'rawResponse') set({ llmRawResponse: result.data });
            else if (result.type === 'button') updateLastMessage(result.data); // Flowise: 버튼 추가
            else if (result.type === 'finalText') finalStreamText = result.data; // Flowise: 최종 텍스트
            else if (result.type === 'error') throw result.data; // 스트림 처리 중 오류
        }
        // 스트림 정상 종료 -> finally 블록에서 최종 메시지 처리 및 저장

      } else { // JSON 응답 처리
        const data = await response.json();
        set({ llmRawResponse: data }); // 원시 응답 저장 (디버깅용)

        const handler = responseHandlers[data.type]; // 응답 타입에 맞는 핸들러 찾기
        if (handler) {
          handler(data, get); // 핸들러 실행 (내부에서 addMessage 등 호출)
        } else {
          // 기본 LLM 응답 처리
          if (data.response || data.text) {
            await addMessage("bot", { text: data.response || data.text }); // 메시지 추가 (내부 오류 처리)
            if (data.slots) setExtractedSlots(data.slots); // 슬롯 저장
          } else { // 알 수 없는 타입 또는 빈 응답
            console.warn(`[ChatStore] Unhandled non-stream response type or empty response:`, data);
            await addMessage("bot", { text: locales[language]?.['errorUnexpected'] || "(No content)" });
          }
        }
        set({ isLoading: false }); // JSON 응답은 여기서 로딩 해제
      }
    } catch (error) { // 메인 try 블록의 catch (API 호출, 스트림, JSON 파싱 오류 등)
      console.error("[handleResponse] Error:", error);
      const errorKey = getErrorKey(error);
      const errorMessage = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'An error occurred.';

      // 오류 발생 시 마지막 메시지 상태 업데이트 (스트리밍 중이었는지 확인)
      set(state => {
          const lastMessageIndex = state.messages.length - 1;
          const lastMessage = state.messages[lastMessageIndex];
          // 마지막 메시지가 스트리밍 중이던 '생각중...' 메시지인지 ID로 확인
          if (lastMessage && lastMessage.id === lastBotMessageId && lastMessage.isStreaming) {
              const updatedMessage = { ...lastMessage, text: errorMessage, isStreaming: false };
              // 오류 메시지 저장 시도 (ID는 여전히 임시 ID일 수 있음)
              saveMessage(updatedMessage).then(savedId => {
                  finalMessageId = savedId; // 저장 후 실제 ID 업데이트 (finally에서 사용)
                  if (savedId && savedId !== lastBotMessageId) {
                      // ID 변경 시 상태 업데이트
                      set(s => ({ messages: s.messages.map(m => m.id === lastBotMessageId ? { ...updatedMessage, id: savedId } : m) }));
                  }
              });
              return { messages: [...state.messages.slice(0, lastMessageIndex), updatedMessage] };
          }
          // 스트리밍 중 아니었으면 새 오류 메시지 추가
          addMessage("bot", { text: errorMessage }); // addMessage 내부에서 저장 시도
          return { isLoading: false }; // 로딩 해제
      });

    } finally { // 메인 try 블록의 finally (스트림 성공/실패 무관 실행)
      set(state => {
          const lastMessageIndex = state.messages.length - 1;
          const lastMessage = state.messages[lastMessageIndex];

          // 마지막 메시지가 스트리밍 완료 대기 상태인지 확인 (ID 비교 및 isStreaming 플래그)
          // 오류 발생 시 이미 isStreaming=false로 변경되었으므로 이 조건은 정상 종료 시에만 해당
          if (lastMessage && (lastMessage.id === lastBotMessageId || lastMessage.id === finalMessageId) && lastMessage.isStreaming) {
               // 최종 텍스트 결정
               const finalText = (llmProvider === 'flowise' ? finalStreamText : lastMessage.text) || '';
               // 비어있거나 '생각중...'이면 오류 메시지로 대체
               const finalMessageText = finalText.trim() === '' || finalText.trim() === thinkingText.trim()
                    ? locales[language]?.['errorUnexpected'] || "(No response received)"
                    : finalText;

               const finalMessage = { ...lastMessage, text: finalMessageText, isStreaming: false };

               // 최종 메시지 저장 (saveMessage 내부 오류 처리, ID 반환)
               saveMessage(finalMessage).then(savedId => {
                    finalMessageId = savedId; // 최종 ID 업데이트
                    if (savedId && savedId !== lastMessage.id) {
                        // 저장 후 ID 변경 시 상태 업데이트
                         set(s => ({
                            messages: s.messages.map(m => m.id === lastMessage.id ? { ...finalMessage, id: savedId } : m)
                        }));
                    }
               });

               return {
                   messages: [...state.messages.slice(0, lastMessageIndex), finalMessage], // 상태에 최종 메시지 반영
                   isLoading: false // 로딩 최종 해제
                };
          }
          // 스트리밍 아니었거나 이미 오류 처리된 경우 로딩만 해제
          // isLoading 상태가 위 catch 블록에서 false로 설정되지 않았을 수 있으므로 여기서 확실히 해제
          return { isLoading: false };
      });
    } // end finally
  }, // end handleResponse

 } // end return store object
}; // end createChatSlice