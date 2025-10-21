// cutiefunny/clt-chatbot/clt-chatbot-e8ffc9efed67d27bb63c1f28645327efec51d8f4/app/store/slices/scenarioSlice.js
import { collection, addDoc, doc, updateDoc, onSnapshot, serverTimestamp, getDoc, setDoc, getDocs, query, orderBy, where } from 'firebase/firestore';
import { locales } from '../../lib/locales';
import { getErrorKey } from '../../lib/errorHandler';

export const createScenarioSlice = (set, get) => ({
  // ... (기존 State 및 다른 함수들은 그대로 유지)
  scenarioStates: {},
  activeScenarioSessionId: null,
  activeScenarioSessions: [],
  scenarioCategories: [],
  availableScenarios: [],
  unsubscribeScenariosMap: {},

  loadAvailableScenarios: async () => {
    try {
      const scenariosCollection = collection(get().db, 'scenarios');
      const querySnapshot = await getDocs(scenariosCollection);
      const scenarioIds = querySnapshot.docs.map(doc => doc.id);
      set({ availableScenarios: scenarioIds });
    } catch (error) {
      console.error("Error loading available scenarios:", error);
      set({ availableScenarios: [] });
    }
  },

  loadScenarioCategories: async () => {
    try {
      const shortcutRef = doc(get().db, "shortcut", "main");
      const docSnap = await getDoc(shortcutRef);

      if (docSnap.exists() && docSnap.data().categories) {
        set({ scenarioCategories: docSnap.data().categories });
      } else {
        console.log("No shortcut document found, initializing with default data.");
        const initialData = [];
        set({ scenarioCategories: initialData });
        await setDoc(shortcutRef, { categories: initialData });
      }
    } catch (error) {
      console.error("Error loading scenario categories from Firestore.", error);
      set({ scenarioCategories: [] });
    }
  },

  saveScenarioCategories: async (newCategories) => {
    const shortcutRef = doc(get().db, "shortcut", "main");
    try {
      await setDoc(shortcutRef, { categories: newCategories });
      set({ scenarioCategories: newCategories });
      return true;
    } catch (error) {
      console.error("Error saving scenario categories to Firestore:", error);
      return false;
    }
  },

  openScenarioPanel: async (scenarioId, initialSlots = {}) => {
    const { user, currentConversationId, handleEvents, language, setActivePanel, addMessage, setForceScrollToBottom } = get();
    if (!user) return;

    let conversationId = currentConversationId;
    if (!conversationId) {
        const newConversationId = await get().createNewConversation(true);
        if (!newConversationId) return;

        await new Promise(resolve => {
            const check = () => {
                if (get().currentConversationId === newConversationId) {
                    resolve();
                } else {
                    setTimeout(check, 50);
                }
            };
            check();
        });
        conversationId = newConversationId;
    }

    const scenarioSessionsRef = collection(get().db, "chats", user.uid, "conversations", conversationId, "scenario_sessions");
    const newSessionDoc = await addDoc(scenarioSessionsRef, {
      scenarioId: scenarioId,
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      messages: [],
      state: null, // 초기에는 null로 설정
      slots: initialSlots,
    });

    const newScenarioSessionId = newSessionDoc.id;

    setActivePanel('main');
    setForceScrollToBottom(true);
    addMessage('user', {
        type: 'scenario_bubble',
        scenarioSessionId: newScenarioSessionId,
    });

    get().subscribeToScenarioSession(newScenarioSessionId);

    setTimeout(() => {
        setActivePanel('scenario', newScenarioSessionId);
    }, 50);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: { text: scenarioId },
          scenarioSessionId: newScenarioSessionId,
          slots: initialSlots,
          language: language, // 언어 정보 추가
        }),
      });
      if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
      const data = await response.json();

      handleEvents(data.events, newScenarioSessionId, conversationId);

      const sessionRef = doc(get().db, "chats", user.uid, "conversations", conversationId, "scenario_sessions", newScenarioSessionId);

      if (data.type === 'scenario_start' || data.type === 'scenario') {
        const updatedSlots = { ...initialSlots, ...(data.slots || {}) };
        const initialMessages = [];
        let scenarioStateUpdate = {};

        if (data.nextNode) {
            // 'setSlot' 노드는 메시지에 추가하지 않음
            if (data.nextNode.type !== 'setSlot') {
                initialMessages.push({ id: data.nextNode.id, sender: 'bot', node: data.nextNode });
            }

            // --- 👇 [수정된 부분 시작] ---
            // 시작 노드가 slotfilling이면 awaitingInput을 true로 설정
            const isFirstNodeSlotFilling = data.nextNode.type === 'slotfilling';
            scenarioStateUpdate = {
                scenarioId: scenarioId,
                currentNodeId: data.nextNode.id,
                awaitingInput: isFirstNodeSlotFilling
            };
            // --- 👆 [수정된 부분 끝] ---

        } else if (data.message) {
             // 시나리오 시작 직후 종료되는 경우 (예: 조건 분기 실패)
             initialMessages.push({ id: 'end-message', sender: 'bot', text: data.message });
             scenarioStateUpdate = null; // 시나리오 상태 없음
             data.status = 'completed'; // 상태를 완료로 설정
        }


        await updateDoc(sessionRef, {
            messages: initialMessages,
            state: scenarioStateUpdate, // 업데이트된 상태 적용
            slots: updatedSlots,
            status: data.status || 'active', // data에 status가 있으면 사용, 없으면 active
            updatedAt: serverTimestamp(),
        });

        // 시작 노드가 slotfilling이 아닌 경우에만 continueScenarioIfNeeded 호출
        if (data.nextNode && data.nextNode.type !== 'slotfilling') {
            await get().continueScenarioIfNeeded(data.nextNode, newScenarioSessionId);
        }

      } else {
        // 시나리오 시작 실패 처리
        const errorText = data.message || "Failed to start scenario properly";
        await updateDoc(sessionRef, {
            messages: [{ id: 'error-start', sender: 'bot', text: errorText }],
            status: 'failed',
            state: null,
            updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      // 네트워크 오류 또는 API 처리 중 예외 발생 시 처리
      const errorKey = getErrorKey(error);
      const errorMessage = locales[language][errorKey] || locales[language]['errorUnexpected'];
      const sessionRef = doc(get().db, "chats", user.uid, "conversations", conversationId, "scenario_sessions", newScenarioSessionId);
      await updateDoc(sessionRef, {
        messages: [{ id: 'error-fetch', sender: 'bot', text: errorMessage }],
        status: 'failed',
        state: null,
        updatedAt: serverTimestamp(),
      });
    }
  },

  setScenarioSelectedOption: async (scenarioSessionId, messageNodeId, selectedValue) => {
    const { user, currentConversationId, scenarioStates } = get();
    if (!user || !currentConversationId || !scenarioSessionId) return;

    const scenarioState = scenarioStates[scenarioSessionId];
    if (!scenarioState) return;

    const originalMessages = scenarioState.messages;
    const updatedMessages = originalMessages.map(msg => {
        if (msg.node && msg.node.id === messageNodeId) {
            return { ...msg, selectedOption: selectedValue };
        }
        return msg;
    });

    // 1. Optimistic UI update
    set(state => ({
        scenarioStates: {
            ...state.scenarioStates,
            [scenarioSessionId]: {
                ...state.scenarioStates[scenarioSessionId],
                messages: updatedMessages,
            },
        },
    }));

    // 2. Update Firestore
    try {
        const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", scenarioSessionId);
        await updateDoc(sessionRef, {
            messages: updatedMessages
        });
    } catch (error) {
        console.error("Error updating scenario selected option in Firestore:", error);
        // Rollback UI on error
        set(state => ({
            scenarioStates: {
                ...state.scenarioStates,
                [scenarioSessionId]: {
                  ...state.scenarioStates[scenarioSessionId],
                  messages: originalMessages,
                }
            },
        }));
    }
  },

  subscribeToScenarioSession: (sessionId) => {
    const { user, currentConversationId, unsubscribeScenariosMap } = get();
    if (!user || !currentConversationId || unsubscribeScenariosMap[sessionId]) return;

    const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", sessionId);
    const unsubscribe = onSnapshot(sessionRef, (doc) => {
      if (doc.exists()) {
        const scenarioData = doc.data();
        set(state => {
            const newScenarioStates = {
                ...state.scenarioStates,
                [sessionId]: { ...scenarioData, isLoading: false }
            };
            const newActiveSessions = Object.keys(newScenarioStates);

            return {
                scenarioStates: newScenarioStates,
                activeScenarioSessions: newActiveSessions,
            };
        });
      } else {
        // 문서가 삭제된 경우 구독 해지 및 상태 정리
        console.log(`Scenario session ${sessionId} not found or deleted.`);
        get().unsubscribeFromScenarioSession(sessionId);
        set(state => {
            const updatedStates = { ...state.scenarioStates };
            delete updatedStates[sessionId];
            const updatedActiveSessions = Object.keys(updatedStates);
            return {
                scenarioStates: updatedStates,
                activeScenarioSessions: updatedActiveSessions,
                ...(state.activeScenarioSessionId === sessionId ? { activeScenarioSessionId: null, activePanel: 'main' } : {})
            };
        });
      }
    }, (error) => {
        console.error(`Error listening to scenario session ${sessionId}:`, error);
        get().unsubscribeFromScenarioSession(sessionId); // 오류 발생 시 구독 해지
    });

    set(state => ({
        unsubscribeScenariosMap: {
            ...state.unsubscribeScenariosMap,
            [sessionId]: unsubscribe
        }
    }));
  },

  unsubscribeFromScenarioSession: (sessionId) => {
      set(state => {
          const newUnsubscribeMap = { ...state.unsubscribeScenariosMap };
          if (newUnsubscribeMap[sessionId]) {
              newUnsubscribeMap[sessionId](); // Firestore 구독 해지 함수 호출
              delete newUnsubscribeMap[sessionId]; // 맵에서 제거
          }

          const updatedStates = { ...state.scenarioStates };
          delete updatedStates[sessionId]; // 상태에서도 제거
          const updatedActiveSessions = Object.keys(updatedStates);

          return {
              unsubscribeScenariosMap: newUnsubscribeMap,
              scenarioStates: updatedStates,
              activeScenarioSessions: updatedActiveSessions,
              // 현재 활성 패널이 해지된 세션이면 메인으로 변경
              ...(state.activeScenarioSessionId === sessionId ? { activeScenarioSessionId: null, activePanel: 'main' } : {})
          };
      });
  },

  endScenario: async (scenarioSessionId, status = 'completed') => {
    const { user, currentConversationId } = get();
    if (!user || !currentConversationId || !scenarioSessionId) return;

    const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", scenarioSessionId);
    try {
        await updateDoc(sessionRef, { status, updatedAt: serverTimestamp() });
        // 로컬 상태도 즉시 업데이트 (선택 사항, Firestore 구독이 처리할 수도 있음)
        set(state => ({
            scenarioStates: {
                ...state.scenarioStates,
                [scenarioSessionId]: {
                    ...state.scenarioStates[scenarioSessionId],
                    status: status,
                }
            },
             // 현재 활성 패널이 종료된 세션이면 메인으로 변경
             ...(state.activeScenarioSessionId === scenarioSessionId ? { activeScenarioSessionId: null, activePanel: 'main' } : {})
        }));
    } catch (error) {
        console.error(`Error ending scenario ${scenarioSessionId}:`, error);
        // 오류 처리 (예: 사용자에게 알림)
    }
  },

  handleScenarioResponse: async (payload) => {
    const { scenarioSessionId } = payload;
    const { handleEvents, showToast, user, currentConversationId, language, endScenario } = get();
    if (!user || !currentConversationId || !scenarioSessionId) return;

    const currentScenario = get().scenarioStates[scenarioSessionId];
    // currentScenario가 존재하지 않으면 함수 종료
    if (!currentScenario) {
        console.warn(`handleScenarioResponse called for non-existent session: ${scenarioSessionId}`);
        return;
    }
    const existingMessages = Array.isArray(currentScenario.messages) ? currentScenario.messages : [];

    set(state => ({
        scenarioStates: { ...state.scenarioStates, [scenarioSessionId]: { ...currentScenario, isLoading: true } }
    }));

    const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", scenarioSessionId);

    // Firestore 업데이트 전에 로컬 상태 업데이트 (로딩 표시)
    await updateDoc(sessionRef, { status: 'generating', updatedAt: serverTimestamp() });

    let newMessages = [...existingMessages];

    // 사용자 입력이 있으면 메시지 배열에 추가하고 Firestore 업데이트
    if (payload.userInput) {
        newMessages.push({ id: `user-${Date.now()}`, sender: 'user', text: payload.userInput });
        // 사용자 입력 메시지만 먼저 Firestore에 업데이트
        try {
            await updateDoc(sessionRef, { messages: newMessages, updatedAt: serverTimestamp() });
        } catch (error) {
            console.error("Error updating user message in Firestore:", error);
            // 오류 발생 시 로딩 상태 해제 및 함수 종료 (선택적)
            set(state => ({
              scenarioStates: { ...state.scenarioStates, [scenarioSessionId]: { ...state.scenarioStates[scenarioSessionId], isLoading: false } }
            }));
            return;
        }
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            sourceHandle: payload.sourceHandle,
            text: payload.userInput
          },
          scenarioState: currentScenario.state, // 현재 상태 전달
          slots: { ...currentScenario.slots, ...(payload.formData || {}) }, // 슬롯 병합
          language: language, // 언어 정보 추가
          scenarioSessionId: scenarioSessionId,
        }),
      });
      if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
      const data = await response.json();

      handleEvents(data.events, scenarioSessionId, currentConversationId);

      // 'setSlot' 노드는 메시지로 표시하지 않음
      if (data.nextNode && data.nextNode.type !== 'setSlot') {
          newMessages.push({ id: data.nextNode.id, sender: 'bot', node: data.nextNode });
      } else if (data.message && data.type !== 'scenario_validation_fail') { // 검증 실패 메시지는 별도 처리
          // 시나리오 종료 메시지 또는 setSlot 이후 메시지
          newMessages.push({ id: `bot-end-${Date.now()}`, sender: 'bot', text: data.message });
      }

      // 시나리오 상태 업데이트 객체 준비
      let updatePayload = {
          messages: newMessages,
          updatedAt: serverTimestamp(),
      };

      if (data.type === 'scenario_validation_fail') {
          showToast(data.message, 'error', scenarioSessionId, currentConversationId);
          updatePayload.status = 'active'; // 상태를 다시 active로
          // 검증 실패 시 nextNode가 없으므로 state와 slots는 업데이트하지 않음
      } else if (data.type === 'scenario_end') {
        const finalStatus = data.slots?.apiFailed ? 'failed' : 'completed';
        updatePayload.status = finalStatus;
        updatePayload.state = null; // 시나리오 종료 시 상태 초기화
        updatePayload.slots = data.slots || currentScenario.slots; // 최종 슬롯 업데이트
        await updateDoc(sessionRef, updatePayload); // Firestore 업데이트 먼저
        endScenario(scenarioSessionId, finalStatus); // 로컬 상태 변경
      } else { // 'scenario' 타입 (진행 중)
        updatePayload.status = 'active';
        updatePayload.state = data.scenarioState;
        updatePayload.slots = data.slots || currentScenario.slots;
        await updateDoc(sessionRef, updatePayload); // Firestore 업데이트
        // 다음 노드가 있고, 그 노드가 슬롯 설정 노드가 아니라면 추가 처리 시도
        if (data.nextNode && data.nextNode.type !== 'setSlot') {
            await get().continueScenarioIfNeeded(data.nextNode, scenarioSessionId);
        } else if (data.nextNode && data.nextNode.type === 'setSlot') {
            // setSlot 노드 직후에는 항상 continueScenarioIfNeeded를 호출하여 다음 자동 노드 실행
            await get().continueScenarioIfNeeded(data.nextNode, scenarioSessionId);
        }
      }
    } catch (error) {
        // 네트워크 오류 또는 API 응답 처리 중 예외 발생 시
        const errorKey = getErrorKey(error);
        const errorMessage = locales[language][errorKey] || locales[language]['errorUnexpected'];

        const errorMessages = [...newMessages, { id: `bot-error-${Date.now()}`, sender: 'bot', text: errorMessage }];
        await updateDoc(sessionRef, { messages: errorMessages, status: 'failed', state: null, updatedAt: serverTimestamp() });
        endScenario(scenarioSessionId, 'failed'); // 로컬 상태도 실패로 변경
    } finally {
      // 로딩 상태 해제 (Firestore 구독이 최종 상태를 반영할 것임)
      set(state => {
         // 세션이 아직 존재하는지 확인 후 isLoading 업데이트
         if(state.scenarioStates[scenarioSessionId]) {
            return {
                scenarioStates: { ...state.scenarioStates, [scenarioSessionId]: { ...state.scenarioStates[scenarioSessionId], isLoading: false } }
            };
         }
         return state; // 세션이 중간에 삭제된 경우 상태 변경 없음
      });
    }
  },

  continueScenarioIfNeeded: async (lastNode, scenarioSessionId) => {
    // lastNode가 null이거나 scenarioSessionId가 없으면 실행 중지
    if (!lastNode || !scenarioSessionId) {
      console.warn("continueScenarioIfNeeded: lastNode or scenarioSessionId is missing.");
      return;
    }

    // 'setSlot' 노드도 비대화형 노드로 간주합니다.
    const isInteractive = lastNode.type === 'slotfilling' ||
                          lastNode.type === 'form' ||
                          lastNode.type === 'branch' && lastNode.data?.evaluationType !== 'CONDITION' || // 조건 분기는 자동 진행 가능
                          (lastNode.data?.replies && lastNode.data.replies.length > 0 && lastNode.type !== 'branch'); // 조건 아닌 branch만 해당

    if (!isInteractive && lastNode.id !== 'end') {
      console.log(`Node ${lastNode.id} (${lastNode.type}) is not interactive, continuing...`);
      // 약간의 지연을 주어 UI 업데이트 시간을 확보하고 다음 단계 진행
      await new Promise(resolve => setTimeout(resolve, 300)); // 지연 시간 조정 가능
      await get().handleScenarioResponse({
        scenarioSessionId: scenarioSessionId,
        currentNodeId: lastNode.id, // 마지막으로 처리된 노드 ID 전달
        sourceHandle: null, // 자동 진행이므로 sourceHandle 없음
        userInput: null, // 자동 진행이므로 userInput 없음
      });
    } else {
        console.log(`Node ${lastNode.id} (${lastNode.type}) is interactive or end node, stopping auto-continue.`);
    }
  },
});