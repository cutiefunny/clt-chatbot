// app/store/slices/chatSlice.js
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  getDocs,
  serverTimestamp,
  deleteDoc,
  doc,
  updateDoc,
  limit,
  startAfter,
  where,
  writeBatch,
} from "firebase/firestore";
import { locales } from "../../lib/locales";
import { getErrorKey } from "../../lib/errorHandler"; // --- 👈 [추가] ---

const MESSAGE_LIMIT = 15;

const getInitialMessages = (lang = "ko") => {
  // locales[lang]가 없을 경우 'en' 또는 기본값 사용
  const initialText = locales[lang]?.initialBotMessage || locales['en']?.initialBotMessage || "Hello! How can I help you?";
  return [
    { id: "initial", sender: "bot", text: initialText },
  ];
};

const responseHandlers = {
  scenario_list: (data, get) => {
    get().addMessage("bot", { text: data.message, scenarios: data.scenarios });
  },
  canvas_trigger: (data, get) => {
    get().addMessage("bot", {
      // --- 👇 [수정] locales 사용 ---
      text: locales[get().language]?.scenarioStarted(data.scenarioId) || `Starting scenario '${data.scenarioId}'.`
      // --- 👆 [수정] ---
    });
    get().openScenarioPanel(data.scenarioId);
  },
  toast: (data, get) => {
    // --- 👇 [수정] showEphemeralToast 사용 ---
    get().showEphemeralToast(data.message, data.toastType || 'info');
    // --- 👆 [수정] ---
  },
  llm_response_with_slots: (data, get) => {
    get().addMessage("bot", { text: data.message });
    if (data.slots && Object.keys(data.slots).length > 0) {
      get().setExtractedSlots(data.slots);
    }
  },
};

// --- 👇 [추가] Gemini 스트림 처리 제너레이터 함수 ---
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
                    buffer = ''; // 구분자 이후 부분은 다음 처리로 넘김 (혹시 모르니 초기화)

                    try {
                        const parsed = JSON.parse(jsonPart);
                        if (parsed.slots) {
                            yield { type: 'slots', data: parsed.slots }; // 슬롯 정보 전달
                            yield { type: 'rawResponse', data: parsed }; // 원본 응답 전달
                        }
                    } catch (e) {
                        console.error("Failed to parse slots JSON from Gemini stream:", e, "JSON part:", jsonPart);
                        yield { type: 'rawResponse', data: { error: "Failed to parse slots", data: jsonPart } };
                    }
                    slotsFound = true;
                    if (textPart) {
                         yield { type: 'text', data: textPart, replace: !thinkingMessageReplaced }; // 텍스트 청크 전달
                         thinkingMessageReplaced = true;
                    }
                }
            } else {
                yield { type: 'text', data: chunk, replace: !thinkingMessageReplaced }; // 텍스트 청크 전달
                thinkingMessageReplaced = true; // 슬롯 이후 첫 텍스트 청크도 replace 가능하게
            }
        }
    } catch (streamError) {
         console.error("Error reading Gemini stream:", streamError);
         yield { type: 'error', data: streamError }; // 스트림 읽기 오류 전달
    }
}
// --- 👆 [추가] ---

// --- 👇 [추가] Flowise 스트림 처리 제너레이터 함수 ---
async function* processFlowiseStream(reader, decoder, get) {
    let buffer = '';
    let thinkingMessageReplaced = false;
    let collectedText = ''; // 최종 텍스트 조립용
    let buttonText = ''; // 버튼(시나리오 ID) 텍스트
    let extractedSlots = {}; // 추출된 슬롯

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                // 스트림 종료 시 남은 버퍼 처리
                if (buffer) {
                    const lines = buffer.split('\n');
                    for (const line of lines) {
                       // ... (기존 final buffer 처리 로직과 유사하게 파싱 및 yield) ...
                       if (line.toLowerCase().startsWith('data:')) {
                           const jsonString = line.substring(line.indexOf(':') + 1).trim();
                           if (jsonString && jsonString !== "[DONE]") {
                               try {
                                   const data = JSON.parse(jsonString);
                                   let textChunk = '';
                                   if (data.event === 'agentFlowExecutedData' && Array.isArray(data.data)) {
                                        const lastNodeExecution = data.data[data.data.length - 1];
                                        if (lastNodeExecution?.data?.output?.content) {
                                            textChunk = lastNodeExecution.data.output.content;
                                            yield { type: 'text', data: textChunk, replace: true }; // 최종 텍스트 덮어쓰기
                                            thinkingMessageReplaced = true;
                                            collectedText = textChunk; // 최종 텍스트 기록
                                        }
                                    } else if (data.event === 'usedTools' && Array.isArray(data.data) && data.data.length > 0 && data.data[0]?.toolOutput && !buttonText) {
                                        const match = data.data[0].toolOutput.match(/"scenarioId"\s*:\s*"([^"]+)"/);
                                        if (match && match[1]) buttonText = `\n\n[BUTTON:${match[1]}]`;
                                    }
                                    // 기타 textChunk 추출 로직...
                               } catch (e) { console.warn("Error parsing final Flowise buffer:", e); }
                           }
                       }
                    }
                }
                break; // 루프 종료
            }

            if (!value) continue;
            let chunk;
            try { chunk = decoder.decode(value, { stream: true }); } catch(e) { chunk = ''; }
            buffer += chunk;

            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // 마지막 줄은 다음 처리를 위해 남김

            for (const line of lines) {
                if (!line.trim() || line.toLowerCase().startsWith('message:')) continue;
                let jsonString = '';
                if (line.toLowerCase().startsWith('data:')) {
                    jsonString = line.substring(line.indexOf(':') + 1).trim();
                } else { jsonString = line.trim(); }
                if (!jsonString || jsonString === "[DONE]") continue;

                let data;
                try { data = JSON.parse(jsonString); } catch (e) { buffer = line + (buffer ? '\n' + buffer : ''); continue; }

                let textChunk = '';
                 if (data.event === 'agentFlowExecutedData' && Array.isArray(data.data)) {
                    const lastNodeExecution = data.data[data.data.length - 1];
                    if (lastNodeExecution?.data?.output?.content) {
                        textChunk = lastNodeExecution.data.output.content;
                        yield { type: 'text', data: textChunk, replace: true }; // 최종 텍스트 덮어쓰기
                        thinkingMessageReplaced = true;
                        collectedText = textChunk; // 최종 텍스트 기록
                    }
                } else if (data.event === 'usedTools' && Array.isArray(data.data) && data.data.length > 0 && data.data[0]?.toolOutput && !buttonText) {
                     const match = data.data[0].toolOutput.match(/"scenarioId"\s*:\s*"([^"]+)"/);
                     if (match && match[1]) buttonText = `\n\n[BUTTON:${match[1]}]`;
                } else if (data.event === 'token' && typeof data.data === 'string') {
                    textChunk = data.data;
                    yield { type: 'text', data: textChunk, replace: !thinkingMessageReplaced };
                    thinkingMessageReplaced = true;
                    collectedText += textChunk; // 텍스트 누적
                } else if (data.event === 'chunk' && data.data?.response) {
                    textChunk = data.data.response;
                    yield { type: 'text', data: textChunk, replace: !thinkingMessageReplaced };
                    thinkingMessageReplaced = true;
                    collectedText += textChunk;
                }
                // 기타 이벤트 처리...
            } // end for lines
        } // end while

        // 스트림 종료 후 버튼 텍스트 전달
        if (buttonText) {
            yield { type: 'button', data: buttonText };
            collectedText += buttonText; // 최종 텍스트에도 추가
        }

        // 슬롯 추출 및 전달 (collectedText 기반)
        const bookingNoRegex = /\b([A-Z]{2}\d{10})\b/i;
        const match = collectedText.match(bookingNoRegex);
        if (match && match[1]) {
            extractedSlots.bkgNr = match[1];
            yield { type: 'slots', data: extractedSlots };
        }
        // 최종 텍스트 전달 (혹시 누락된 경우 대비)
        yield { type: 'finalText', data: collectedText };

    } catch (streamError) {
        console.error("Error reading Flowise stream:", streamError);
        yield { type: 'error', data: streamError }; // 스트림 읽기 오류 전달
    }
}
// --- 👆 [추가] ---

export const createChatSlice = (set, get) => ({
  messages: getInitialMessages("ko"),
  conversations: [],
  currentConversationId: null,
  isLoading: false,
  isSearching: false,
  searchResults: [],
  slots: {},
  extractedSlots: {},
  llmRawResponse: null,
  selectedOptions: {},
  unsubscribeMessages: null,
  unsubscribeConversations: null,
  lastVisibleMessage: null,
  hasMoreMessages: true,
  scenariosForConversation: {},

  favorites: [],
  unsubscribeFavorites: null,

  updateLastMessage: (chunk, replace = false) => {
    set((state) => {
      const lastMessage = state.messages[state.messages.length - 1];
      if (lastMessage && lastMessage.sender === 'bot' && lastMessage.isStreaming) { // 스트리밍 중일 때만 업데이트
        const updatedText = replace ? chunk : (lastMessage.text || '') + chunk;
        const updatedMessage = {
          ...lastMessage,
          text: updatedText,
          // isStreaming: true, // isStreaming 상태는 유지
        };
        return {
          messages: [...state.messages.slice(0, -1), updatedMessage],
        };
      }
      return state; // 스트리밍 중이 아니면 상태 변경 없음
    });
  },

  setSelectedOption: async (messageId, optionValue) => {
    // 1. 로컬 상태 우선 업데이트 (즉각적인 UI 반응)
    const previousSelectedOptions = get().selectedOptions; // --- 👈 [추가] 롤백을 위해 이전 상태 저장
    set((state) => ({
      selectedOptions: {
        ...state.selectedOptions,
        [messageId]: optionValue,
      },
    }));

    // 2. 임시 ID인지 확인
    const isTemporaryId = String(messageId).startsWith('temp_'); // 임시 ID 형식 확인
    if (isTemporaryId) {
      console.warn("Optimistic update for temporary message ID:", messageId);
      return;
    }

    // 3. Firestore에 비동기로 선택 상태 저장
    const { user, currentConversationId, language, showEphemeralToast } = get(); // --- 👈 [추가] language, showEphemeralToast
    if (!user || !currentConversationId || !messageId) return;

    try {
      const messageRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "messages", String(messageId));
      await updateDoc(messageRef, {
        selectedOption: optionValue,
      });
    } catch (error) {
      console.error("Error updating selected option in Firestore:", error);
      // --- 👇 [수정] Firestore 업데이트 실패 시 롤백 ---
      const errorKey = getErrorKey(error);
      const message = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to save selection.';
      showEphemeralToast(message, 'error');
      set({ selectedOptions: previousSelectedOptions }); // 이전 상태로 롤백
      // --- 👆 [수정] ---
    }
  },

  setExtractedSlots: (newSlots) => {
      set((state) => ({
      // 기존 슬롯과 새 슬롯 병합 (새 슬롯 우선)
      extractedSlots: { ...state.extractedSlots, ...newSlots },
    }));
  },

  clearExtractedSlots: () => {
     set({ extractedSlots: {} });
  },

  unsubscribeAllMessagesAndScenarios: () => {
      get().unsubscribeMessages?.();
    const scenariosMap = get().unsubscribeScenariosMap;
    // 안전하게 순회하며 구독 해제
    Object.keys(scenariosMap).forEach(sessionId => {
        try {
            scenariosMap[sessionId]();
        } catch (e) {
            console.warn(`Error unsubscribing scenario session ${sessionId}:`, e);
        }
    });
    set({
      unsubscribeMessages: null,
      unsubscribeScenariosMap: {}, // 비우기
      scenarioStates: {}, // 시나리오 상태 초기화
      activeScenarioSessions: [], // 활성 세션 목록 초기화
      activeScenarioSessionId: null, // 활성 세션 ID 초기화
      lastFocusedScenarioSessionId: null, // 마지막 포커스 ID 초기화
      activePanel: "main", // 패널 초기화
    });
  },

  loadFavorites: (userId) => {
      // --- 👇 [수정] Firestore 리스너 오류 처리 ---
      if (get().unsubscribeFavorites) {
           console.log("Favorites listener already active.");
           return; // 이미 구독 중이면 중복 실행 방지
      }

      const q = query(
        collection(get().db, "users", userId, "favorites"),
        orderBy("order", "asc")
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const favorites = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        set({ favorites });
      }, (error) => { // 오류 콜백 추가
          console.error("Error listening to favorites changes:", error);
          const { language, showEphemeralToast } = get();
          const errorKey = getErrorKey(error);
          const message = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to load favorites.';
          showEphemeralToast(message, 'error');
          // 심각한 오류 시 리스너 구독 해제 (선택 사항)
          // unsubscribe();
          // set({ unsubscribeFavorites: null });
      });
      set({ unsubscribeFavorites: unsubscribe });
      // --- 👆 [수정] ---
  },

  addFavorite: async (favoriteData) => {
    const { user, favorites, maxFavorites, language, showEphemeralToast } = get();
    if (!user) return;

    if (favorites.length >= maxFavorites) {
      showEphemeralToast(locales[language]?.['최대 즐겨찾기 개수에 도달했습니다.'] || "Favorite limit reached.", "error");
      return;
    }

    // --- 👇 [수정] Firestore 작업 오류 처리 ---
    try {
        const favoritesCollection = collection(
          get().db,
          "users",
          user.uid,
          "favorites"
        );
        // order 필드를 현재 favorites 배열 길이로 설정
        const currentOrder = get().favorites.length;
        const dataToSave = {
            ...favoriteData,
            createdAt: serverTimestamp(),
            order: currentOrder, // 현재 길이를 순서로 사용
        };
        await addDoc(favoritesCollection, dataToSave); // Firestore 추가 시도
        // 성공 메시지는 toggleFavorite에서 표시

        // Firestore 리스너가 상태를 업데이트하므로 여기서 set() 호출 불필요
    } catch (error) {
        console.error("Error adding favorite to Firestore:", error);
        const errorKey = getErrorKey(error);
        const message = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to add favorite.';
        showEphemeralToast(message, 'error');
    }
    // --- 👆 [수정] ---
  },

  updateFavoritesOrder: async (newOrder) => {
    const { user, favorites: originalOrder, language, showEphemeralToast } = get();
    if (!user) return;

    // 낙관적 UI 업데이트
    set({ favorites: newOrder });

    // --- 👇 [수정] Firestore 작업 오류 처리 및 롤백 ---
    const batch = writeBatch(get().db);
    newOrder.forEach((fav, index) => {
      // fav.id가 유효한지 확인
      if (typeof fav.id !== 'string' || !fav.id) {
         console.error("Invalid favorite item found during order update:", fav);
         // 유효하지 않은 항목은 건너뛰거나 오류 처리
         return; // 이 항목은 업데이트에서 제외
      }
      const favRef = doc(get().db, "users", user.uid, "favorites", fav.id);
      batch.update(favRef, { order: index });
    });

    try {
      await batch.commit(); // 일괄 업데이트 시도
    } catch (error) {
      console.error("Error updating favorites order:", error);
      const errorKey = getErrorKey(error);
      const message = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to save new order.';
      showEphemeralToast(message, 'error');
      // 롤백: 이전 순서로 상태 복구
      set({ favorites: originalOrder });
    }
    // --- 👆 [수정] ---
  },

  deleteFavorite: async (favoriteId) => {
    const { user, favorites: originalFavorites, language, showEphemeralToast } = get();
    if (!user) return;

    const favoriteToDelete = originalFavorites.find(
      (fav) => fav.id === favoriteId
    );
    if (!favoriteToDelete) {
        console.warn(`Favorite with ID ${favoriteId} not found for deletion.`);
        return; // 삭제할 항목 없으면 종료
    }

    // 낙관적 UI 업데이트: 삭제 및 순서 재정렬
    const newFavorites = originalFavorites
      .filter((fav) => fav.id !== favoriteId)
      .map((fav, index) => ({ ...fav, order: index }));
    set({ favorites: newFavorites });

    // --- 👇 [수정] Firestore 작업 오류 처리 및 롤백 ---
    try {
      const favoriteRef = doc(
        get().db,
        "users",
        user.uid,
        "favorites",
        favoriteId
      );
      await deleteDoc(favoriteRef); // Firestore 문서 삭제

      // 삭제 후 순서 재정렬 Batch (데이터 정합성 유지)
      const batch = writeBatch(get().db);
      newFavorites.forEach((fav) => {
         // fav.id 유효성 검사
         if (typeof fav.id !== 'string' || !fav.id) {
             console.error("Invalid favorite item found during reorder after delete:", fav);
             return; // 이 항목은 건너뜀
         }
        const favRef = doc(get().db, "users", user.uid, "favorites", fav.id);
        batch.update(favRef, { order: fav.order });
      });
      await batch.commit(); // 순서 업데이트 적용

      // 성공 메시지는 toggleFavorite에서 표시

    } catch (error) {
      console.error("Error deleting favorite:", error);
      const errorKey = getErrorKey(error);
      const message = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to delete favorite.';
      showEphemeralToast(message, 'error');
      // 롤백: 이전 상태로 복구
      set({ favorites: originalFavorites });
    }
    // --- 👆 [수정] ---
  },

  toggleFavorite: async (item) => {
      const {
      user,
      favorites,
      addFavorite, // addFavorite 내부에서 오류 처리됨
      deleteFavorite, // deleteFavorite 내부에서 오류 처리됨
      showEphemeralToast,
      maxFavorites,
      language, // --- 👈 [추가] ---
    } = get();
    // item 또는 item.action 유효성 검사 강화
    if (!user || !item?.action?.type || typeof item.action.value !== 'string' || !item.action.value.trim()) {
        console.warn("Invalid item provided to toggleFavorite:", item);
        return;
    }

    const valueToCompare = item.action.value.trim(); // 공백 제거 후 비교

    // 이미 즐겨찾기에 있는지 확인
    const favoriteToDelete = favorites.find(
      (fav) =>
        fav.action?.type === item.action.type &&
        fav.action?.value?.trim() === valueToCompare // 공백 제거 후 비교
    );

    if (favoriteToDelete) {
      // 삭제 시도
      await deleteFavorite(favoriteToDelete.id);
      // 삭제 성공 여부는 deleteFavorite 내부의 롤백 로직으로 확인 가능
      // 약간의 딜레이 후 상태 확인 (리스너 반영 대기)
      setTimeout(() => {
          if (!get().favorites.find(f => f.id === favoriteToDelete.id)) { // 실제로 삭제되었는지 확인
              showEphemeralToast(locales[language]?.['즐겨찾기에서 삭제되었습니다.'] || "Removed from favorites.", "info");
          }
      }, 300);
    } else { // 추가 로직
      if (favorites.length >= maxFavorites) {
        showEphemeralToast(locales[language]?.['최대 즐겨찾기 개수에 도달했습니다.'] || "Favorite limit reached.", "error");
        return;
      }
      // title 유효성 검사 추가
      if (!item.title || typeof item.title !== 'string' || !item.title.trim()) {
          console.warn("Cannot add favorite with empty title:", item);
          showEphemeralToast("Cannot add favorite with empty title.", "error");
          return;
      }
      const newFavorite = {
        icon: "🌟", // 기본 아이콘
        title: item.title.trim(),
        description: item.description || "", // description 없으면 빈 문자열
        action: { type: item.action.type, value: valueToCompare },
      };
      // 추가 시도
      await addFavorite(newFavorite);
      // 추가 성공 여부 확인 (딜레이 후)
      setTimeout(() => {
          if (get().favorites.some(fav => fav.action.value === newFavorite.action.value && fav.action.type === newFavorite.action.type)) {
             showEphemeralToast(locales[language]?.['즐겨찾기에 추가되었습니다.'] || "Added to favorites.", "success");
          }
      }, 300);
    }
  },

  handleShortcutClick: async (item, messageId) => {
        if (!item || !item.action) {
            console.warn("handleShortcutClick called with invalid item:", item);
            return;
        }
    const { extractedSlots, clearExtractedSlots, setSelectedOption, openScenarioPanel, handleResponse } = get();

    // 메시지 ID가 있으면 옵션 선택 처리 (내부 오류 처리)
    if (messageId) {
      await setSelectedOption(messageId, item.title);
    }

    // 액션 타입에 따라 처리 (각 함수 내부에서 오류 처리)
    if (item.action.type === "custom") {
      await handleResponse({
        text: item.action.value,
        displayText: item.title,
      });
    } else if (item.action.type === "scenario") {
      await openScenarioPanel(item.action.value, extractedSlots);
    } else {
        console.warn(`Unsupported shortcut action type: ${item.action.type}`);
    }

    // 액션 실행 후 슬롯 초기화
    clearExtractedSlots();
  },

  toggleConversationExpansion: (conversationId) => {
         const { expandedConversationId, unsubscribeScenariosMap, user, language, showEphemeralToast } = get();

    // 닫기
    if (expandedConversationId === conversationId) {
      unsubscribeScenariosMap[conversationId]?.(); // 리스너 해제
      const newMap = { ...unsubscribeScenariosMap };
      delete newMap[conversationId];
      set({ expandedConversationId: null, unsubscribeScenariosMap: newMap });
      // 시나리오 목록 데이터는 유지해도 무방 (다시 열 때 로드됨)
      return;
    }

    // 다른 거 열려있으면 닫기
    if (
      expandedConversationId &&
      unsubscribeScenariosMap[expandedConversationId]
    ) {
      unsubscribeScenariosMap[expandedConversationId]();
      const newMap = { ...unsubscribeScenariosMap };
      delete newMap[expandedConversationId];
      set({ unsubscribeScenariosMap: newMap });
    }

    // 새로 열기 - UI 상태 먼저 업데이트
    set({ expandedConversationId: conversationId });

    if (!user) return; // 사용자 없으면 리스너 설정 불가

    // Firestore 리스너 설정 (오류 처리 포함)
    const scenariosRef = collection(
      get().db,
      "chats",
      user.uid,
      "conversations",
      conversationId,
      "scenario_sessions"
    );
    const q = query(scenariosRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const scenarios = snapshot.docs.map((doc) => ({
        sessionId: doc.id,
        ...doc.data(),
      }));
      set((state) => ({
        scenariosForConversation: {
          ...state.scenariosForConversation,
          [conversationId]: scenarios,
        },
      }));
    }, (error) => { // 오류 콜백
        console.error(`Error listening to scenarios for conversation ${conversationId}:`, error);
        const errorKey = getErrorKey(error);
        const message = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to load scenario list.';
        showEphemeralToast(message, 'error');
        // 오류 발생 시 확장된 상태 해제 및 리스너 정리
        unsubscribe(); // 리스너 해제 시도
        const newMap = { ...get().unsubscribeScenariosMap };
        delete newMap[conversationId]; // 맵에서 제거
        set((state) => {
            // 현재 확장된 ID가 오류 발생 ID와 같은 경우에만 확장 해제
            const shouldCloseExpansion = state.expandedConversationId === conversationId;
            return {
                ...(shouldCloseExpansion ? { expandedConversationId: null } : {}),
                unsubscribeScenariosMap: newMap,
                scenariosForConversation: {
                    ...state.scenariosForConversation,
                    [conversationId]: [], // 빈 목록으로 설정
                },
            };
        });
    });

    // 구독 해제 함수 저장
    set((state) => ({
      unsubscribeScenariosMap: {
        ...state.unsubscribeScenariosMap,
        [conversationId]: unsubscribe,
      },
    }));
  },

  loadConversations: (userId) => {
    // Firestore 리스너 오류 처리
    if (get().unsubscribeConversations) {
        console.log("Conversations listener already active.");
        return; // 이미 구독 중이면 중복 실행 방지
    }

    const q = query(
      collection(get().db, "chats", userId, "conversations"),
      orderBy("pinned", "desc"),
      orderBy("updatedAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const conversations = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      set({ conversations });
    }, (error) => { // 오류 콜백
        console.error("Error listening to conversations changes:", error);
        const { language, showEphemeralToast } = get();
        const errorKey = getErrorKey(error);
        const message = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to load conversations.';
        showEphemeralToast(message, 'error');
        // 심각한 오류 시 리스너 구독 해제 (선택 사항)
        // unsubscribe();
        // set({ unsubscribeConversations: null });
    });

    set({ unsubscribeConversations: unsubscribe });
  },

  loadConversation: async (conversationId) => {
    const user = get().user;
    // conversationId 유효성 검사 추가
    if (!user || get().currentConversationId === conversationId || typeof conversationId !== 'string' || !conversationId) {
        console.warn(`loadConversation called with invalid params: user=${!!user}, currentId=${get().currentConversationId}, targetId=${conversationId}`);
        return;
    }

    const { language, showEphemeralToast } = get();

    // 기존 구독 해제
    get().unsubscribeAllMessagesAndScenarios();

    // 초기 상태 설정
    const initialMessage = getInitialMessages(language)[0];
    set({
      currentConversationId: conversationId,
      isLoading: true, // 로딩 시작
      messages: [initialMessage],
      lastVisibleMessage: null,
      hasMoreMessages: true,
      expandedConversationId: null, // 대화 변경 시 확장 닫기
      selectedOptions: {}, // 선택 옵션 초기화
      // lastFocusedScenarioSessionId: null, // 대화 변경 시 초기화 (선택적)
    });

    // Firestore 작업 오류 처리
    try {
        // 메시지 컬렉션 참조
        const messagesRef = collection(
          get().db,
          "chats",
          user.uid,
          "conversations",
          conversationId,
          "messages"
        );
        // 첫 메시지 로드 쿼리
        const q = query(
          messagesRef,
          orderBy("createdAt", "desc"),
          limit(MESSAGE_LIMIT)
        );

        // 메시지 리스너 설정 (onSnapshot은 내부에서 구독 오류 처리)
        const unsubscribeMessages = onSnapshot(q, (messagesSnapshot) => {
          const newMessages = messagesSnapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .reverse(); // 시간 순서대로 정렬
          const lastVisible = messagesSnapshot.docs[messagesSnapshot.docs.length - 1]; // 다음 페이지 커서

          // 선택된 옵션 복원
          const newSelectedOptions = {};
          newMessages.forEach(msg => {
            if (msg.selectedOption) {
              newSelectedOptions[msg.id] = msg.selectedOption;
            }
          });

          // 상태 업데이트
          set((state) => ({
            // 이미 로드된 메시지가 있는 경우 비교하여 업데이트 (중복 방지 - 필요 시)
            messages: [initialMessage, ...newMessages], // 초기 메시지 + 로드된 메시지
            lastVisibleMessage: lastVisible,
            hasMoreMessages: messagesSnapshot.docs.length === MESSAGE_LIMIT,
            isLoading: false, // 메시지 로드 완료 시 로딩 해제
            selectedOptions: newSelectedOptions,
          }));
        }, (error) => { // 메시지 리스너 오류 콜백
            console.error(`Error listening to messages for conversation ${conversationId}:`, error);
            const errorKey = getErrorKey(error);
            const message = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to load messages.';
            showEphemeralToast(message, 'error');
            set({ isLoading: false }); // 오류 발생 시 로딩 해제
            // 리스너 자동 재시도 또는 수동 해제 결정
            // unsubscribeMessages();
            // set({ unsubscribeMessages: null });
        });

        // 리스너 해제 함수 저장
        set({ unsubscribeMessages });

        // 시나리오 세션 구독 (getDocs 오류 처리)
        const scenariosRef = collection(
          get().db,
          "chats",
          user.uid,
          "conversations",
          conversationId,
          "scenario_sessions"
        );
        const scenariosQuery = query(scenariosRef); // 필요 시 orderBy 추가
        const scenariosSnapshot = await getDocs(scenariosQuery); // getDocs 실패 시 아래 catch로 이동

        // 각 시나리오 세션 구독 시작 (subscribeToScenarioSession 내부에서 오류 처리)
        scenariosSnapshot.forEach((doc) => {
          get().subscribeToScenarioSession(doc.id);
        });

    } catch (error) { // getDocs 또는 기타 설정 오류 처리
        console.error(`Error loading conversation ${conversationId}:`, error);
        const errorKey = getErrorKey(error);
        const message = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to load conversation.';
        showEphemeralToast(message, 'error');
        // 오류 발생 시 상태 초기화
        set({
            isLoading: false,
            currentConversationId: null, // 현재 대화 ID 초기화
            messages: [initialMessage], // 초기 메시지만 남김
            lastVisibleMessage: null,
            hasMoreMessages: true,
            selectedOptions: {},
        });
        get().unsubscribeAllMessagesAndScenarios(); // 모든 관련 리스너 정리
    }
  },

  loadMoreMessages: async () => {
        const user = get().user;
    const {
      currentConversationId,
      lastVisibleMessage,
      hasMoreMessages,
      messages,
      language,
      showEphemeralToast
    } = get();

    // 중복 로딩 방지 및 조건 검사 강화
    if (
      !user ||
      !currentConversationId ||
      !hasMoreMessages ||
      !lastVisibleMessage || // lastVisibleMessage가 있어야 추가 로드 가능
      get().isLoading // 이미 로딩 중이면 실행하지 않음
    )
      return;

    set({ isLoading: true }); // 로딩 시작

    try {
      const messagesRef = collection(
        get().db,
        "chats",
        user.uid,
        "conversations",
        currentConversationId,
        "messages"
      );
      const q = query(
        messagesRef,
        orderBy("createdAt", "desc"),
        startAfter(lastVisibleMessage), // 이전 마지막 문서를 기준으로 다음 문서 로드
        limit(MESSAGE_LIMIT)
      );

      const snapshot = await getDocs(q); // Firestore 읽기 (오류 발생 가능)
      const newMessages = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .reverse(); // 시간 순서대로

      // 추가 메시지가 없는 경우
      if (snapshot.empty) {
          set({ hasMoreMessages: false, isLoading: false });
          return;
      }

      const newLastVisible = snapshot.docs[snapshot.docs.length - 1]; // 새 커서

      const initialMessage = messages[0]; // 초기 메시지 유지
      const existingMessages = messages.slice(1); // 기존 메시지 목록

      // 선택 옵션 병합
      const newSelectedOptions = { ...get().selectedOptions };
      newMessages.forEach(msg => {
        if (msg.selectedOption) {
          newSelectedOptions[msg.id] = msg.selectedOption;
        }
      });

      // 상태 업데이트
      set({
        messages: [initialMessage, ...newMessages, ...existingMessages], // 새 메시지를 기존 메시지 앞에 추가
        lastVisibleMessage: newLastVisible, // 커서 업데이트
        hasMoreMessages: snapshot.docs.length === MESSAGE_LIMIT, // 더 로드할 메시지 있는지 여부
        selectedOptions: newSelectedOptions,
      });
    } catch (error) {
      console.error("Error loading more messages:", error);
      const errorKey = getErrorKey(error);
      const message = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to load more messages.';
      showEphemeralToast(message, 'error');
    } finally {
      set({ isLoading: false }); // 로딩 종료
    }
  },

  createNewConversation: async (returnId = false) => {
    // 이미 새 대화 상태거나, ID 반환 목적이 아닌데 현재 대화 ID가 없으면 중복 실행 방지
    if (get().currentConversationId === null && !returnId) return null;

    get().unsubscribeAllMessagesAndScenarios(); // 기존 구독 해제

    const { language, user, showEphemeralToast } = get();

    // 새 대화 생성 (ID 반환 목적 또는 실제 사용자 로그인 상태)
    if ((returnId || get().currentConversationId !== null) && user) {
        try {
            const conversationRef = await addDoc(
              collection(get().db, "chats", user.uid, "conversations"),
              {
                title: locales[language]?.['newChat'] || "New Conversation",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                pinned: false,
              }
            );
            // 새 대화 로드 (loadConversation 내부에서 오류 처리됨)
            await get().loadConversation(conversationRef.id);
            // ID 반환이 필요하면 반환
            return returnId ? conversationRef.id : null;
        } catch (error) {
            console.error("Error creating new conversation:", error);
            const errorKey = getErrorKey(error);
            const message = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to create new conversation.';
            showEphemeralToast(message, 'error');
            // 새 대화 상태로 되돌리기 (UI 초기화)
            set({
                messages: getInitialMessages(language),
                currentConversationId: null,
                lastVisibleMessage: null,
                hasMoreMessages: true,
                expandedConversationId: null,
                isLoading: false,
            });
            return null; // ID 반환 불가
        }
    } else { // 로그아웃 상태 등에서 UI만 초기화
      set({
        messages: getInitialMessages(language),
        currentConversationId: null,
        lastVisibleMessage: null,
        hasMoreMessages: true,
        expandedConversationId: null,
        isLoading: false,
      });
      return null;
    }
  },

  deleteConversation: async (conversationId) => {
    const { user, language, showEphemeralToast } = get();
    if (!user) return;

    // 대화 ID 유효성 검사
     if (typeof conversationId !== 'string' || !conversationId) {
        console.error("deleteConversation called with invalid ID:", conversationId);
        showEphemeralToast(locales[language]?.errorUnexpected || 'Invalid operation.', 'error');
        return;
     }

    const conversationRef = doc(
      get().db,
      "chats",
      user.uid,
      "conversations",
      conversationId
    );
    const batch = writeBatch(get().db);

    try {
        // 하위 컬렉션 문서 삭제 (더 안전하게)
        const scenariosRef = collection(conversationRef, "scenario_sessions");
        const scenariosSnapshot = await getDocs(scenariosRef);
        scenariosSnapshot.forEach((doc) => { batch.delete(doc.ref); });

        const messagesRef = collection(conversationRef, "messages");
        const messagesSnapshot = await getDocs(messagesRef);
        messagesSnapshot.forEach((doc) => { batch.delete(doc.ref); });

        // 대화 문서 삭제
        batch.delete(conversationRef);

        // 일괄 작업 실행
        await batch.commit();

        // 성공 시 UI 업데이트
        // Firestore 리스너가 목록에서 제거할 것이므로 로컬 conversations 배열 직접 수정 불필요
        console.log(`Conversation ${conversationId} deleted successfully.`);

        // 현재 보고 있던 대화가 삭제되었다면 새 대화 상태로 전환
        if (get().currentConversationId === conversationId) {
          get().createNewConversation(); // 새 대화 로드 (내부 오류 처리)
        }
    } catch (error) {
        console.error(`Error deleting conversation ${conversationId}:`, error);
        const errorKey = getErrorKey(error);
        const message = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to delete conversation.';
        showEphemeralToast(message, 'error');
        // 롤백은 Firestore 리스너에 의존 (삭제 실패 시 리스너가 원래 상태 유지)
    }
  },

  updateConversationTitle: async (conversationId, newTitle) => {
    const { user, language, showEphemeralToast } = get();
    // 파라미터 유효성 검사 강화
    if (!user || typeof conversationId !== 'string' || !conversationId || typeof newTitle !== 'string' || !newTitle.trim()) {
        console.warn("updateConversationTitle called with invalid parameters.");
        if (typeof newTitle !== 'string' || !newTitle.trim()) {
            showEphemeralToast("Title cannot be empty.", "error"); // 빈 제목 오류
        }
        return;
    }

    const trimmedTitle = newTitle.trim();

    // Firestore 업데이트 오류 처리
    try {
        const conversationRef = doc(
          get().db,
          "chats",
          user.uid,
          "conversations",
          conversationId
        );
        // 제목 길이 제한 (선택 사항)
        const MAX_TITLE_LENGTH = 100;
        await updateDoc(conversationRef, { title: trimmedTitle.substring(0, MAX_TITLE_LENGTH) });
        // Firestore 리스너가 UI 업데이트를 처리함
    } catch (error) {
        console.error(`Error updating title for conversation ${conversationId}:`, error);
        const errorKey = getErrorKey(error);
        const message = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to update conversation title.';
        showEphemeralToast(message, 'error');
    }
  },

  pinConversation: async (conversationId, pinned) => {
    const { user, language, showEphemeralToast } = get();
     // 파라미터 유효성 검사
     if (!user || typeof conversationId !== 'string' || !conversationId || typeof pinned !== 'boolean') {
        console.warn("pinConversation called with invalid parameters.");
        return;
     }

    // Firestore 업데이트 오류 처리
    try {
        const conversationRef = doc(
          get().db,
          "chats",
          user.uid,
          "conversations",
          conversationId
        );
        await updateDoc(conversationRef, { pinned });
        // Firestore 리스너가 UI 업데이트를 처리함
    } catch (error) {
        console.error(`Error updating pin status for conversation ${conversationId}:`, error);
        const errorKey = getErrorKey(error);
        const message = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to update pin status.';
        showEphemeralToast(message, 'error');
    }
  },

  saveMessage: async (message) => {
    const { user, language, showEphemeralToast } = get();
    if (!user) return null; // 사용자 없으면 저장 불가
    // message 객체 유효성 검사 (선택 사항)
    if (!message || typeof message !== 'object') {
        console.error("saveMessage called with invalid message object:", message);
        return null;
    }

    let conversationId = get().currentConversationId;

    try {
        // 1. 대화 ID가 없으면 새로 생성
        if (!conversationId) {
          const firstMessageContent = message.text || "New Conversation";
          const conversationRef = await addDoc(
            collection(get().db, "chats", user.uid, "conversations"),
            {
              title: firstMessageContent.substring(0, 30), // 제목 길이 제한
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              pinned: false,
            }
          );
          conversationId = conversationRef.id;

          // 새 대화 로드 (오류 처리는 loadConversation 내부에서)
          // loadConversation이 완료될 때까지 기다림 (상태 변경 감지 방식 개선)
          await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error("Timeout waiting for conversation load after creation")), 5000);
              const unsubscribe = set(state => {
                  if (state.currentConversationId === conversationId && !state.isLoading) {
                      clearTimeout(timeout);
                      // unsubscribe(); // Zustand의 set 내에서 unsubscribe 호출은 복잡할 수 있음, 외부 변수로 관리 필요
                      resolve();
                      return {}; // 상태 변경 없음
                  }
                  return {}; // 상태 변경 없음
              });
              // 상태 변경을 감지하는 더 안정적인 방법 필요 (Zustand 구독 활용 등)
              // 임시로 loadConversation 호출 후 상태 확인
              get().loadConversation(conversationId);
          });
          // 대화 로드 완료 후 activeConversationId를 다시 확인
          conversationId = get().currentConversationId; // loadConversation이 성공적으로 ID를 설정했는지 확인
          if (conversationId !== conversationRef.id) {
              throw new Error("Failed to set active conversation ID after creation.");
          }
        }

        // 2. 저장할 메시지 데이터 정리
        const messageToSave = { ...message };
        // Firestore에 저장할 수 없는 값 제거 (undefined)
        Object.keys(messageToSave).forEach(
          (key) => {
              if (messageToSave[key] === undefined) {
                  delete messageToSave[key];
              }
          }
        );
        // node.data 필터링 (필요한 속성만 저장)
        if (messageToSave.node?.data) {
          const { content, replies } = messageToSave.node.data;
          messageToSave.node.data = { ...(content && { content }), ...(replies && { replies }) };
        }
        // 임시 ID 제거 (실제 저장 시에는 ID 불필요)
        if (String(messageToSave.id).startsWith('temp_')) {
            delete messageToSave.id;
        }

        // 3. 메시지 저장 및 대화 업데이트 시간 갱신
        const activeConversationId = conversationId; // 위에서 확보한 유효한 ID 사용

        const messagesCollection = collection(
          get().db,
          "chats",
          user.uid,
          "conversations",
          activeConversationId,
          "messages"
        );
        // addDoc은 생성된 문서 참조를 반환
        const messageRef = await addDoc(messagesCollection, {
          ...messageToSave,
          createdAt: serverTimestamp(), // 서버 시간으로 생성 시간 기록
        });
        // 대화 업데이트 시간 갱신
        await updateDoc(
          doc(get().db, "chats", user.uid, "conversations", activeConversationId),
          { updatedAt: serverTimestamp() }
        );

        return messageRef.id; // 저장된 Firestore 문서 ID 반환

    } catch (error) {
        console.error("Error saving message:", error);
        const errorKey = getErrorKey(error);
        const errorMessage = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to save message.';
        showEphemeralToast(errorMessage, 'error');
        return null; // 실패 시 null 반환
    }
  },

  addMessage: async (sender, messageData) => {
     let newMessage;
     // 임시 ID 생성
     const temporaryId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

     if (sender === "user") {
       newMessage = { id: temporaryId, sender, ...messageData };
     } else {
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

     // 낙관적 UI 업데이트
     set((state) => ({ messages: [...state.messages, newMessage] }));

     // 스트리밍 중이 아닐 때만 Firestore에 저장 시도
     if (!newMessage.isStreaming) {
       const savedMessageId = await get().saveMessage(newMessage); // saveMessage 내부에서 오류 처리

       if (savedMessageId) { // 저장 성공 시
           let selectedOptionValue = null;
           set((state) => {
             const newSelectedOptions = { ...state.selectedOptions };
             // 임시 ID -> 실제 ID로 selectedOptions 키 변경
             if (newSelectedOptions[temporaryId]) {
               selectedOptionValue = newSelectedOptions[temporaryId];
               newSelectedOptions[savedMessageId] = selectedOptionValue;
               delete newSelectedOptions[temporaryId];
             }
             // messages 배열에서 임시 ID -> 실제 ID로 교체
             return {
               messages: state.messages.map((msg) =>
                 msg.id === temporaryId ? { ...msg, id: savedMessageId } : msg
               ),
               selectedOptions: newSelectedOptions,
             };
           });
           // selectedOption이 있었다면 Firestore에도 업데이트 (내부 오류 처리)
           if (selectedOptionValue) {
             await get().setSelectedOption(savedMessageId, selectedOptionValue);
           }
       } else { // 저장 실패 시 (saveMessage가 null 반환)
           // 낙관적 업데이트 롤백: UI에서 임시 메시지 제거
           console.error(`Failed to save message, removing temporary message (ID: ${temporaryId})`);
           set(state => ({
               messages: state.messages.filter(msg => msg.id !== temporaryId)
           }));
           // 오류 메시지는 saveMessage 내부에서 표시됨
       }
     }
     // 스트리밍 메시지의 경우, 스트림 완료 후 handleResponse의 finally 블록에서 저장 시도
  },

  handleResponse: async (messagePayload) => {
    set({ isLoading: true, llmRawResponse: null });
    const { language, showEphemeralToast, addMessage, updateLastMessage, saveMessage, setExtractedSlots, llmProvider } = get();

    const textForUser = messagePayload.displayText || messagePayload.text;
    if (textForUser) {
      await addMessage("user", { text: textForUser }); // addMessage 내부 오류 처리
    }

    const thinkingText = locales[language]?.['statusGenerating'] || "Generating...";
    let lastBotMessageId = null; // 마지막 봇 메시지 ID 저장 (임시 ID일 수 있음)
    let lastBotMessageRef = null; // 저장 후 실제 ID 참조

    try {
      const response = await fetch("/api/chat", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
           message: { text: messagePayload.text },
           scenarioState: null, // 일반 응답 요청 시 null
           slots: get().slots, // 현재 슬롯 전달 (필요 시)
           language: language,
           llmProvider: llmProvider,
           flowiseApiUrl: get().flowiseApiUrl,
         }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Server error: ${response.statusText}` }));
        throw new Error(errorData.message || `Server error: ${response.statusText}`);
      }

      // 스트림 처리
      if (response.headers.get("Content-Type")?.includes("text/event-stream")) {
        console.log("[handleResponse] Detected text/event-stream response.");

        // 초기 '생각중...' 메시지 추가 및 임시 ID 저장
        const tempBotMessage = { id: `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, sender: 'bot', text: thinkingText, isStreaming: true };
        set(state => ({ messages: [...state.messages, tempBotMessage] }));
        lastBotMessageId = tempBotMessage.id;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let streamProcessor;
        let finalStreamText = ''; // 스트림 완료 후 최종 텍스트

        // Provider에 따라 제너레이터 선택
        if (llmProvider === 'gemini') {
          streamProcessor = processGeminiStream(reader, decoder, get);
        } else if (llmProvider === 'flowise') {
          streamProcessor = processFlowiseStream(reader, decoder, get);
        } else {
          throw new Error(`Unsupported LLM provider for streaming: ${llmProvider}`);
        }

        // 스트림 결과 처리 루프
        for await (const result of streamProcessor) {
            if (result.type === 'text') {
                updateLastMessage(result.data, result.replace);
                // 최종 텍스트는 제너레이터 내부 또는 finally에서 관리
            } else if (result.type === 'slots') {
                setExtractedSlots(result.data);
            } else if (result.type === 'rawResponse') {
                set({ llmRawResponse: result.data });
            } else if (result.type === 'button') { // Flowise
                updateLastMessage(result.data);
            } else if (result.type === 'finalText') { // Flowise
                 finalStreamText = result.data;
            } else if (result.type === 'error') {
                throw result.data; // 스트림 처리 중 오류 발생
            }
        }
        // 스트림 루프 정상 종료 (오류 없이)

      } else { // 비-스트림 응답 처리
        const data = await response.json();
        set({ llmRawResponse: data });
        const handler = responseHandlers[data.type];

        if (handler) {
          handler(data, get); // 핸들러 내부에서 addMessage 호출 (오류 처리 포함)
        } else {
          if (data.response || data.text) {
            // addMessage 내부에서 오류 처리됨
            await addMessage("bot", { text: data.response || data.text });
            if (data.slots && Object.keys(data.slots).length > 0) {
              setExtractedSlots(data.slots);
            }
          } else { // 알 수 없는 응답 타입
            console.warn(`[ChatStore] Unhandled non-stream response type or empty response:`, data);
            await addMessage("bot", { text: locales[language]?.['errorUnexpected'] || "(No content)" });
          }
        }
      } // end else (비-스트림)

    } catch (error) { // 메인 try 블록의 catch (API 호출 실패, 스트림 오류 등)
      console.error("[handleResponse] Error during fetch or processing:", error);
      const errorKey = getErrorKey(error);
      const errorMessage = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'An unexpected error occurred.';

      set(state => {
          const lastMessageIndex = state.messages.length - 1;
          const lastMessage = state.messages[lastMessageIndex];
          // 마지막 메시지가 스트리밍 중이던 '생각중...' 메시지인지 확인 (ID 비교)
          if (lastMessage && lastMessage.id === lastBotMessageId && lastMessage.isStreaming) {
              const updatedMessage = { ...lastMessage, text: errorMessage, isStreaming: false };
              // 오류 메시지 저장 시도 (saveMessage 내부 오류 처리)
              saveMessage(updatedMessage).then(savedId => {
                  lastBotMessageRef = savedId; // 실제 저장된 ID 참조 업데이트
                  if (savedId && savedId !== lastBotMessageId) {
                      // ID 변경 시 상태 업데이트
                      set(s => ({
                          messages: s.messages.map(m => m.id === lastBotMessageId ? { ...updatedMessage, id: savedId } : m)
                      }));
                  }
              });
              return { messages: [...state.messages.slice(0, lastMessageIndex), updatedMessage] };
          }
          // 스트리밍 중이 아니었다면 새 오류 메시지 추가 (addMessage 내부 오류 처리)
          addMessage("bot", { text: errorMessage });
          return state; // isLoading은 finally에서 해제됨
      });

    } finally { // 메인 try 블록의 finally
      set(state => {
          const lastMessageIndex = state.messages.length - 1;
          const lastMessage = state.messages[lastMessageIndex];

          // 마지막 메시지가 스트리밍 완료 대기 상태인지 확인 (오류 없이 스트림 종료)
          // ID 비교: 임시 ID 또는 오류 처리에서 업데이트된 실제 ID(lastBotMessageRef) 사용
          if (lastMessage && (lastMessage.id === lastBotMessageId || lastMessage.id === lastBotMessageRef) && lastMessage.isStreaming) {
               // 최종 텍스트 결정 (Flowise는 제너레이터에서, Gemini는 마지막 상태에서)
               const finalText = (llmProvider === 'flowise' ? finalStreamText : lastMessage.text) || '';
               const finalMessageText = finalText.trim() === '' || finalText.trim() === thinkingText.trim()
                    ? locales[language]?.['errorUnexpected'] || "(No response received)"
                    : finalText;

               const finalMessage = { ...lastMessage, text: finalMessageText, isStreaming: false };

               // 최종 메시지 저장 (saveMessage 내부 오류 처리)
               saveMessage(finalMessage).then(savedId => {
                    if (savedId && savedId !== lastMessage.id) {
                        // 저장 후 ID 변경 시 상태 업데이트
                         set(s => ({
                            messages: s.messages.map(m => m.id === lastMessage.id ? { ...finalMessage, id: savedId } : m)
                        }));
                    }
               });

               return {
                   messages: [...state.messages.slice(0, lastMessageIndex), finalMessage],
                   isLoading: false // 로딩 최종 해제
                };
          }
          // 스트리밍 아니었거나 이미 처리된 경우 로딩만 해제
          return { isLoading: false };
      });
    } // end finally
  }, // end handleResponse

  searchConversations: async (searchQuery) => {
    // 검색 로직은 Firestore 읽기 위주이므로, 오류 발생 가능성은 낮지만 필요한 경우 try...catch 추가 가능
    if (!searchQuery.trim()) {
      set({ searchResults: [], isSearching: false });
      return;
    }
    set({ isSearching: true, searchResults: [] }); // 검색 시작 시 결과 초기화
    const { user, conversations, language, showEphemeralToast } = get(); // 오류 처리 위해 추가
    if (!user || !conversations) {
      set({ isSearching: false });
      return;
    }

    try { // --- 👇 [추가] Firestore 검색 오류 처리 ---
        const results = [];
        const lowerCaseQuery = searchQuery.toLowerCase();

        // 모든 대화에 대해 병렬로 메시지 검색 (성능 개선 가능성)
        const searchPromises = conversations.map(async (convo) => {
          try { // 개별 대화 검색 오류 처리
              const messagesCollection = collection(
                get().db,
                "chats",
                user.uid,
                "conversations",
                convo.id,
                "messages"
              );
              // TODO: Firestore 텍스트 검색 기능 활용 고려 (현재는 클라이언트 필터링)
              const messagesSnapshot = await getDocs(messagesCollection); // 오류 발생 가능
              let foundInConvo = false;
              const matchingMessages = [];
              messagesSnapshot.forEach((doc) => {
                const message = doc.data();
                const content = message.text || ""; // text 필드가 없을 수 있음
                if (typeof content === 'string' && content.toLowerCase().includes(lowerCaseQuery)) {
                  foundInConvo = true;
                  // 스니펫 생성 로직 (기존 유지)
                  const snippetIndex = content.toLowerCase().indexOf(lowerCaseQuery);
                  const start = Math.max(0, snippetIndex - 20);
                  const end = Math.min(content.length, snippetIndex + lowerCaseQuery.length + 20); // 검색어 길이만큼 포함
                  const snippet = `...${content.substring(start, end)}...`;
                  // 최대 3개까지만 추가
                  if (matchingMessages.length < 3) {
                     matchingMessages.push(snippet);
                  }
                }
              });
              if (foundInConvo) {
                return { // 검색 결과를 Promise 결과로 반환
                  id: convo.id,
                  title: convo.title || "Untitled Conversation",
                  snippets: matchingMessages,
                };
              }
          } catch (convoSearchError) {
              console.error(`Error searching messages in conversation ${convo.id}:`, convoSearchError);
              // 개별 대화 검색 실패 시 해당 대화는 결과에서 제외됨
          }
          return null; // 검색 결과 없거나 오류 시 null 반환
        });

        // 모든 검색 Promise 완료 기다림
        const searchResultsRaw = await Promise.all(searchPromises);
        // null 아닌 결과만 필터링하여 최종 결과 생성
        results.push(...searchResultsRaw.filter(result => result !== null));

        set({ searchResults: results });

    } catch (error) { // --- 👆 [추가] ---
      console.error("Error during conversation search:", error);
      const errorKey = getErrorKey(error);
      const message = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to search conversations.';
      showEphemeralToast(message, 'error');
      set({ searchResults: [] }); // 오류 시 결과 비움
    } finally {
      set({ isSearching: false }); // 검색 종료 (성공/실패 무관)
    }
  }, // end searchConversations
});