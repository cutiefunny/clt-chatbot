// app/store/slices/scenarioSlice.js
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  getDoc,
  setDoc,
  getDocs,
  query,
  orderBy,
  where,
  deleteDoc, // deleteDoc 임포트 추가
} from "firebase/firestore";
import { locales } from "../../lib/locales";
import { getErrorKey } from "../../lib/errorHandler";

export const createScenarioSlice = (set, get) => ({
  scenarioStates: {},
  activeScenarioSessionId: null,
  activeScenarioSessions: [],
  scenarioCategories: [],
  availableScenarios: [],
  unsubscribeScenariosMap: {},

  loadAvailableScenarios: async () => {
    // --- 👇 [수정] Firestore 작업 오류 처리 ---
    try {
      const scenariosCollection = collection(get().db, "scenarios");
      const querySnapshot = await getDocs(scenariosCollection); // 오류 발생 가능
      const scenarioIds = querySnapshot.docs.map((doc) => doc.id);
      set({ availableScenarios: scenarioIds });
    } catch (error) {
      console.error("Error loading available scenarios:", error);
      const { language, showEphemeralToast } = get();
      const errorKey = getErrorKey(error);
      const message =
        locales[language]?.[errorKey] || "Failed to load scenario list.";
      showEphemeralToast(message, "error");
      set({ availableScenarios: [] }); // 실패 시 빈 배열 설정
    }
    // --- 👆 [수정] ---
  },

  loadScenarioCategories: async () => {
    // --- 👇 [수정] Firestore 작업 오류 처리 ---
    try {
      const shortcutRef = doc(get().db, "shortcut", "main");
      const docSnap = await getDoc(shortcutRef); // 오류 발생 가능

      if (docSnap.exists() && docSnap.data().categories) {
        set({ scenarioCategories: docSnap.data().categories });
      } else {
        console.log(
          "No shortcut document found, initializing with default data."
        );
        const initialData = [];
        set({ scenarioCategories: initialData });
        // 초기 데이터 저장 시도 (오류 발생 가능)
        await setDoc(shortcutRef, { categories: initialData });
      }
    } catch (error) {
      console.error(
        "Error loading/initializing scenario categories from Firestore.",
        error
      );
      const { language, showEphemeralToast } = get();
      const errorKey = getErrorKey(error);
      const message =
        locales[language]?.[errorKey] || "Failed to load scenario categories.";
      showEphemeralToast(message, "error");
      set({ scenarioCategories: [] }); // 실패 시 빈 배열 설정
    }
    // --- 👆 [수정] ---
  },

  saveScenarioCategories: async (newCategories) => {
    const shortcutRef = doc(get().db, "shortcut", "main");
    // --- 👇 [수정] Firestore 작업 오류 처리 ---
    try {
      await setDoc(shortcutRef, { categories: newCategories }); // 오류 발생 가능
      set({ scenarioCategories: newCategories });
      return true;
    } catch (error) {
      console.error("Error saving scenario categories to Firestore:", error);
      // 오류 발생 시 사용자에게 알림 (showEphemeralToast 사용)
      const { language, showEphemeralToast } = get();
      const errorKey = getErrorKey(error);
      const message =
        locales[language]?.[errorKey] || "Failed to save scenario categories.";
      showEphemeralToast(message, "error");
      return false;
    }
    // --- 👆 [수정] ---
  },

  openScenarioPanel: async (scenarioId, initialSlots = {}) => {
    const {
      user,
      currentConversationId,
      handleEvents,
      language,
      setActivePanel,
      addMessage, // addMessage 가져오기
      setForceScrollToBottom,
      showEphemeralToast,
    } = get();
    if (!user) return;

    let conversationId = currentConversationId;
    let newScenarioSessionId = null; // 세션 ID 저장용 변수

    try {
      // 1. 현재 대화 ID 없으면 새로 생성 (createNewConversation 내부에서 오류 처리됨)
      if (!conversationId) {
        const newConversationId = await get().createNewConversation(true);
        if (!newConversationId) {
          // createNewConversation 실패 시 (오류 메시지는 내부에서 표시됨)
          throw new Error(
            "Failed to ensure conversation ID for starting scenario."
          );
        }
        // 새 대화 로드가 완료될 때까지 기다림 (상태 변경 감지)
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Timeout waiting for conversation load")),
            5000
          ); // 5초 타임아웃
          const check = () => {
            if (get().currentConversationId === newConversationId) {
              clearTimeout(timeout);
              resolve();
            } else {
              setTimeout(check, 100); // 100ms 간격으로 확인
            }
          };
          check();
        });
        conversationId = newConversationId; // 업데이트된 ID 사용
      }

      // 2. 시나리오 세션 문서 생성
      const scenarioSessionsRef = collection(
        get().db,
        "chats",
        user.uid,
        "conversations",
        conversationId,
        "scenario_sessions"
      );
      const newSessionDoc = await addDoc(scenarioSessionsRef, {
        // 오류 발생 가능
        scenarioId: scenarioId,
        status: "starting", // 초기 상태 변경: starting
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        messages: [],
        state: null,
        slots: initialSlots,
      });
      newScenarioSessionId = newSessionDoc.id; // 생성된 ID 저장

      // 3. UI 업데이트 (메인 패널 포커스, 버블 추가)
      setActivePanel("main"); // 메인 패널로 포커스 이동 (선택 사항)
      setForceScrollToBottom(true); // 메인 채팅 스크롤 맨 아래로

      // --- 👇 [추가] Scenario Bubble 메시지를 메인 채팅에 추가 ---
      // 'user' sender를 사용하여 오른쪽 정렬 (사용자가 시작한 것처럼 보이게)
      await addMessage("user", {
        type: "scenario_bubble",
        scenarioSessionId: newScenarioSessionId,
        // 이 타입은 'text'가 필요 없음
      });
      // --- 👆 [추가] ---

      // 4. 새 시나리오 세션 구독 시작 (subscribeToScenarioSession 내부에서 오류 처리됨)
      get().subscribeToScenarioSession(newScenarioSessionId);

      // 5. 시나리오 패널 활성화 (약간의 딜레이 후)
      setTimeout(() => {
        setActivePanel("scenario", newScenarioSessionId);
      }, 100); // 딜레이 살짝 증가

      // 6. 백엔드 API 호출하여 시나리오 시작
      const response = await fetch("/api/chat", {
        // 오류 발생 가능 (네트워크 등)
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: { text: scenarioId }, // 시작 시에는 시나리오 ID를 메시지로 전달
          scenarioSessionId: newScenarioSessionId,
          slots: initialSlots,
          language: language,
        }),
      });
      if (!response.ok) {
        // API 라우트 자체 오류 (500 등)
        const errorData = await response
          .json()
          .catch(() => ({ message: `Server error: ${response.statusText}` }));
        throw new Error(
          errorData.message || `Server error: ${response.statusText}`
        );
      }
      const data = await response.json(); // API 응답 파싱 오류 발생 가능

      // 7. API 응답 처리 (이벤트, Firestore 업데이트 등)
      handleEvents(data.events, newScenarioSessionId, conversationId); // 이벤트 처리

      const sessionRef = doc(
        get().db,
        "chats",
        user.uid,
        "conversations",
        conversationId,
        "scenario_sessions",
        newScenarioSessionId
      );
      let updatePayload = { updatedAt: serverTimestamp() }; // 공통 업데이트 필드

      if (data.type === "scenario_start" || data.type === "scenario") {
        updatePayload.slots = { ...initialSlots, ...(data.slots || {}) };
        updatePayload.messages = [];
        updatePayload.state = null; // 기본값 null

        if (data.nextNode) {
          // 'setSlot' 노드는 메시지에 추가하지 않음
          if (data.nextNode.type !== "setSlot") {
            updatePayload.messages.push({
              id: data.nextNode.id,
              sender: "bot",
              node: data.nextNode,
            });
          }
          const isFirstNodeSlotFillingOrForm =
            data.nextNode.type === "slotfilling" ||
            data.nextNode.type === "form" ||
            (data.nextNode.type === "branch" &&
              data.nextNode.data?.evaluationType !== "CONDITION");
          updatePayload.state = {
            scenarioId: scenarioId,
            currentNodeId: data.nextNode.id,
            awaitingInput: isFirstNodeSlotFillingOrForm,
          };
        } else if (data.message) {
          // 시나리오 시작 직후 종료되는 경우 (예: 조건 분기 실패)
          updatePayload.messages.push({
            id: "end-message",
            sender: "bot",
            text: data.message,
          });
          updatePayload.status = data.status || "completed"; // API에서 status 주면 사용
        }
        updatePayload.status = data.status || "active"; // 최종 상태 설정

        await updateDoc(sessionRef, updatePayload); // Firestore 업데이트 (오류 발생 가능)

        // 시작 노드가 대화형이 아닌 경우 자동 진행 (continueScenarioIfNeeded 내부 오류 처리)
        if (
          data.nextNode &&
          data.nextNode.type !== "slotfilling" &&
          data.nextNode.type !== "form" &&
          !(
            data.nextNode.type === "branch" &&
            data.nextNode.data?.evaluationType !== "CONDITION"
          )
        ) {
          await get().continueScenarioIfNeeded(
            data.nextNode,
            newScenarioSessionId
          );
        }
      } else if (data.type === "error") {
        // API 라우트에서 명시적으로 에러 반환 시
        throw new Error(data.message || "Failed to start scenario from API.");
      } else {
        // 예상치 못한 응답 타입
        throw new Error(`Unexpected response type from API: ${data.type}`);
      }
    } catch (error) {
      console.error(`Error opening scenario panel for ${scenarioId}:`, error);
      const errorKey = getErrorKey(error);
      const message =
        locales[language]?.[errorKey] || "Failed to start scenario.";
      showEphemeralToast(message, "error");

      // 오류 발생 시 생성된 세션 문서 및 버블 메시지 삭제 시도
      if (user && conversationId && newScenarioSessionId) {
        try {
          // 세션 문서 삭제
          const sessionRef = doc(
            get().db,
            "chats",
            user.uid,
            "conversations",
            conversationId,
            "scenario_sessions",
            newScenarioSessionId
          );
          await deleteDoc(sessionRef);
          console.log(
            `Cleaned up failed scenario session: ${newScenarioSessionId}`
          );

          // 메인 채팅에서 버블 메시지 제거 (타입과 ID로 식별)
          set((state) => ({
            messages: state.messages.filter(
              (msg) =>
                !(
                  msg.type === "scenario_bubble" &&
                  msg.scenarioSessionId === newScenarioSessionId
                )
            ),
          }));
          console.log(
            `Removed scenario bubble from main chat for session: ${newScenarioSessionId}`
          );
        } catch (cleanupError) {
          console.error(
            `Error cleaning up failed scenario session ${newScenarioSessionId}:`,
            cleanupError
          );
        }
      }
      // 활성 패널을 메인으로 되돌림
      setActivePanel("main");
    }
  },

  // ... (기존 setScenarioSelectedOption, subscribeToScenarioSession 등 함수 유지) ...
  setScenarioSelectedOption: async (scenarioSessionId, messageNodeId, selectedValue) => {
    const { user, currentConversationId, scenarioStates, language, showEphemeralToast } = get(); // --- 👈 [추가] ---
    if (!user || !currentConversationId || !scenarioSessionId) return;

    const scenarioState = scenarioStates[scenarioSessionId];
    if (!scenarioState) return;

    const originalMessages = scenarioState.messages; // --- 👈 [추가] 롤백용 원본 저장
    const updatedMessages = originalMessages.map(msg => {
        if (msg.node && msg.node.id === messageNodeId) {
            // Firestore는 undefined 저장을 지원하지 않으므로 null 사용 고려
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
    try { // --- 👇 [수정] Firestore 작업 오류 처리 및 롤백 ---
        const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", scenarioSessionId);
        await updateDoc(sessionRef, {
            messages: updatedMessages // 업데이트된 메시지 배열 전체 저장
        }); // 오류 발생 가능
    } catch (error) {
        console.error("Error updating scenario selected option in Firestore:", error);
        const errorKey = getErrorKey(error);
        const message = locales[language]?.[errorKey] || 'Failed to save selection in scenario.';
        showEphemeralToast(message, 'error');
        // Rollback UI on error
        set(state => ({
            scenarioStates: {
                ...state.scenarioStates,
                [scenarioSessionId]: {
                  ...state.scenarioStates[scenarioSessionId],
                  messages: originalMessages, // 원본 메시지 배열로 복구
                }
            },
        }));
    } // --- 👆 [수정] ---
  },

  subscribeToScenarioSession: (sessionId) => {
    const { user, currentConversationId, unsubscribeScenariosMap, language, showEphemeralToast } = get(); // --- 👈 [추가] ---
    // 구독 중복 방지 및 기본 조건 검사
    if (!user || !currentConversationId || unsubscribeScenariosMap[sessionId]) return;

    // --- 👇 [수정] Firestore 리스너 오류 처리 ---
    const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", sessionId);
    const unsubscribe = onSnapshot(sessionRef, (doc) => {
      if (doc.exists()) {
        const scenarioData = doc.data();
        set(state => {
            // isLoading 상태는 여기서 직접 변경하지 않고, API 호출 로직에서 관리
            const currentLocalState = state.scenarioStates[sessionId];
            const newScenarioStates = {
                ...state.scenarioStates,
                [sessionId]: {
                    ...(currentLocalState || {}), // 기존 로컬 상태 유지 (isLoading 등)
                    ...scenarioData // Firestore 데이터로 덮어쓰기
                }
            };
            const newActiveSessions = Object.keys(newScenarioStates); // 필요 시 업데이트

            return {
                scenarioStates: newScenarioStates,
                activeScenarioSessions: newActiveSessions, // 필요 시 업데이트
            };
        });
      } else {
        // 문서가 삭제된 경우: 구독 해지 및 로컬 상태 정리
        console.log(`Scenario session ${sessionId} not found or deleted.`);
        get().unsubscribeFromScenarioSession(sessionId); // 구독 해제 함수 호출
        // set 내부에서 관련 상태 정리 (unsubscribeFromScenarioSession이 처리)
      }
    }, (error) => { // 오류 콜백
        console.error(`Error listening to scenario session ${sessionId}:`, error);
        const errorKey = getErrorKey(error);
        const message = locales[language]?.[errorKey] || 'Error syncing scenario state.';
        showEphemeralToast(message, 'error');
        get().unsubscribeFromScenarioSession(sessionId); // 오류 발생 시 구독 해지
    });

    // 구독 해제 함수 저장
    set(state => ({
        unsubscribeScenariosMap: {
            ...state.unsubscribeScenariosMap,
            [sessionId]: unsubscribe
        }
    }));
    // --- 👆 [수정] ---
  },

  unsubscribeFromScenarioSession: (sessionId) => {
      set(state => {
          const newUnsubscribeMap = { ...state.unsubscribeScenariosMap };
          if (newUnsubscribeMap[sessionId]) {
              newUnsubscribeMap[sessionId](); // Firestore 구독 해지 함수 호출
              delete newUnsubscribeMap[sessionId]; // 맵에서 제거
          } else {
              // 이미 해제되었거나 없는 경우 경고 로그 (선택 사항)
              // console.warn(`Attempted to unsubscribe from non-existent or already unsubscribed session: ${sessionId}`);
          }

          const updatedStates = { ...state.scenarioStates };
          delete updatedStates[sessionId]; // 로컬 상태에서도 제거
          const updatedActiveSessions = Object.keys(updatedStates);

          // 현재 활성 패널/세션 ID가 해제된 세션이면 초기화
          const shouldResetActivePanel = state.activeScenarioSessionId === sessionId || state.lastFocusedScenarioSessionId === sessionId;

          return {
              unsubscribeScenariosMap: newUnsubscribeMap,
              scenarioStates: updatedStates,
              activeScenarioSessions: updatedActiveSessions,
              ...(shouldResetActivePanel ? {
                  activeScenarioSessionId: null,
                  lastFocusedScenarioSessionId: null, // lastFocused도 초기화
                  activePanel: 'main'
              } : {})
          };
      });
  },

    // --- 👇 [추가] 모든 시나리오 리스너 해제 함수 ---
  unsubscribeAllScenarioListeners: () => {
    const { unsubscribeScenariosMap } = get();
    Object.keys(unsubscribeScenariosMap).forEach(sessionId => {
      get().unsubscribeFromScenarioSession(sessionId);
    });
    // 상태 초기화는 unsubscribeFromScenarioSession 내부에서 처리됨
    // set({ unsubscribeScenariosMap: {} }); // 필요 없음
  },
  // --- 👆 [추가] ---


  endScenario: async (scenarioSessionId, status = 'completed') => {
    const { user, currentConversationId, language, showEphemeralToast } = get(); // --- 👈 [추가] ---
    if (!user || !currentConversationId || !scenarioSessionId) return;

    // --- 👇 [수정] Firestore 작업 오류 처리 ---
    const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", scenarioSessionId);
    try {
        await updateDoc(sessionRef, { status, state: null, updatedAt: serverTimestamp() }); // state도 null로 초기화, 오류 발생 가능
        // 로컬 상태 즉시 업데이트 (선택 사항, Firestore 구독이 처리할 수도 있음)
        set(state => {
            const updatedState = state.scenarioStates[scenarioSessionId]
                ? { ...state.scenarioStates[scenarioSessionId], status: status, state: null } // state: null 추가
                : { status: status, state: null }; // 만약 로컬 상태에 없다면 기본 정보만 설정

            // 현재 활성 패널/세션 ID가 종료된 세션이면 초기화
            const shouldResetActivePanel = state.activeScenarioSessionId === scenarioSessionId || state.lastFocusedScenarioSessionId === scenarioSessionId;

            return {
                scenarioStates: {
                    ...state.scenarioStates,
                    [scenarioSessionId]: updatedState
                },
                ...(shouldResetActivePanel ? {
                    activeScenarioSessionId: null,
                    lastFocusedScenarioSessionId: null, // lastFocused도 초기화
                    activePanel: 'main'
                 } : {})
            };
        });
    } catch (error) {
        console.error(`Error ending scenario ${scenarioSessionId} with status ${status}:`, error);
        const errorKey = getErrorKey(error);
        const message = locales[language]?.[errorKey] || 'Failed to update scenario status.';
        showEphemeralToast(message, 'error');
    }
    // --- 👆 [수정] ---
  },

  handleScenarioResponse: async (payload) => {
    const { scenarioSessionId } = payload;
    const { handleEvents, showToast, user, currentConversationId, language, endScenario, showEphemeralToast } = get(); // --- 👈 [추가] ---
    if (!user || !currentConversationId || !scenarioSessionId) return;

    const currentScenario = get().scenarioStates[scenarioSessionId];
    if (!currentScenario) {
        console.warn(`handleScenarioResponse called for non-existent session: ${scenarioSessionId}`);
        // 존재하지 않는 세션에 대한 응답 시도 시 사용자 알림
        showEphemeralToast(locales[language]?.errorUnexpected || 'An unexpected error occurred.', 'error');
        return;
    }
    const existingMessages = Array.isArray(currentScenario.messages) ? currentScenario.messages : [];

    // 로딩 상태 설정 (UI 즉시 반영)
    set(state => ({
        scenarioStates: { ...state.scenarioStates, [scenarioSessionId]: { ...currentScenario, isLoading: true } }
    }));

    const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", scenarioSessionId);

    try { // --- 👇 [수정] API 호출 및 후속 처리 전체를 try 블록으로 감쌈 ---
        let newMessages = [...existingMessages];

        // 사용자 입력이 있으면 메시지 배열에 추가하고 Firestore 업데이트 (오류 처리 추가)
        if (payload.userInput) {
            newMessages.push({ id: `user-${Date.now()}`, sender: 'user', text: payload.userInput });
            try {
                await updateDoc(sessionRef, { messages: newMessages, updatedAt: serverTimestamp() });
            } catch (error) {
                console.error("Error updating user message in Firestore:", error);
                // 오류 발생 시 로딩 상태 해제 및 함수 종료 (사용자에게 알림)
                const errorKey = getErrorKey(error);
                const message = locales[language]?.[errorKey] || 'Failed to send message.';
                showEphemeralToast(message, 'error');
                set(state => ({
                  scenarioStates: { ...state.scenarioStates, [scenarioSessionId]: { ...state.scenarioStates[scenarioSessionId], isLoading: false } }
                }));
                return; // 여기서 함수 종료
            }
        }

        // 백엔드 API 호출
        const response = await fetch('/api/chat', { // 네트워크 오류 발생 가능
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: {
                sourceHandle: payload.sourceHandle,
                text: payload.userInput
              },
              scenarioState: currentScenario.state,
              slots: { ...currentScenario.slots, ...(payload.formData || {}) },
              language: language,
              scenarioSessionId: scenarioSessionId,
            }),
        });
        if (!response.ok) { // API 라우트 오류
            const errorData = await response.json().catch(() => ({ message: `Server error: ${response.statusText}` }));
            throw new Error(errorData.message || `Server error: ${response.statusText}`);
        }
        const data = await response.json(); // 응답 파싱 오류 발생 가능

        // API 응답 처리
        handleEvents(data.events, scenarioSessionId, currentConversationId); // 이벤트 처리

        // 'setSlot' 노드는 메시지로 표시하지 않음
        if (data.nextNode && data.nextNode.type !== 'setSlot') {
            newMessages.push({ id: data.nextNode.id, sender: 'bot', node: data.nextNode });
        } else if (data.message && data.type !== 'scenario_validation_fail') {
            newMessages.push({ id: `bot-end-${Date.now()}`, sender: 'bot', text: data.message });
        }

        // Firestore 업데이트 페이로드 준비
        let updatePayload = {
            messages: newMessages,
            updatedAt: serverTimestamp(),
        };

        if (data.type === 'scenario_validation_fail') {
            // showToast 대신 showEphemeralToast 사용 가능
            showEphemeralToast(data.message, 'error'); // 토스트 알림
            updatePayload.status = 'active'; // 상태를 다시 active로
        } else if (data.type === 'scenario_end') {
            const finalStatus = data.slots?.apiFailed ? 'failed' : 'completed';
            updatePayload.status = finalStatus;
            updatePayload.state = null; // 시나리오 종료 시 상태 초기화
            updatePayload.slots = data.slots || currentScenario.slots; // 최종 슬롯 업데이트
            await updateDoc(sessionRef, updatePayload); // Firestore 업데이트 먼저 (오류 발생 가능)
            endScenario(scenarioSessionId, finalStatus); // 로컬 상태 변경 (내부 오류 처리)
            // 종료 시에는 isLoading을 false로 설정할 필요 없음 (리스너가 처리)
            return; // 자동 진행 불필요
        } else if (data.type === 'scenario') { // 진행 중
            updatePayload.status = 'active';
            updatePayload.state = data.scenarioState;
            updatePayload.slots = data.slots || currentScenario.slots;
        } else if (data.type === 'error') { // API 라우트에서 명시적 에러 반환
            throw new Error(data.message || "Scenario step failed.");
        } else { // 예상치 못한 응답
            throw new Error(`Unexpected response type from API: ${data.type}`);
        }

        // Firestore 업데이트 (진행 중 또는 검증 실패 시)
        await updateDoc(sessionRef, updatePayload); // 오류 발생 가능

        // 자동 진행 로직 (오류 처리는 continueScenarioIfNeeded 내부에서)
        if (data.type === 'scenario' && data.nextNode) {
            // setSlot 노드 포함 모든 비대화형 노드 자동 진행 시도
            const isInteractive = data.nextNode.type === 'slotfilling' ||
                                  data.nextNode.type === 'form' ||
                                  (data.nextNode.type === 'branch' && data.nextNode.data?.evaluationType !== 'CONDITION');
            if (!isInteractive) {
                await get().continueScenarioIfNeeded(data.nextNode, scenarioSessionId);
            }
        }

    } catch (error) { // --- 👆 [수정] 전체 로직 감싸기 완료 ---
        console.error(`Error handling scenario response for ${scenarioSessionId}:`, error);
        const errorKey = getErrorKey(error);
        const errorMessage = locales[language]?.[errorKey] || 'An error occurred during the scenario.';
        showEphemeralToast(errorMessage, 'error');

        // 오류 메시지를 시나리오 메시지 목록에 추가하고 상태를 failed로 업데이트
        const errorMessages = [...existingMessages, { id: `bot-error-${Date.now()}`, sender: 'bot', text: errorMessage }];
        try {
            await updateDoc(sessionRef, { messages: errorMessages, status: 'failed', state: null, updatedAt: serverTimestamp() });
            endScenario(scenarioSessionId, 'failed'); // 로컬 상태도 실패로 변경
        } catch (updateError) {
             console.error(`Failed to update scenario status to failed for ${scenarioSessionId}:`, updateError);
             // 추가적인 오류 처리 (예: UI 강제 업데이트)
              set(state => ({
                scenarioStates: {
                    ...state.scenarioStates,
                    [scenarioSessionId]: {
                        ...(state.scenarioStates[scenarioSessionId] || {}),
                        messages: errorMessages, // 메시지만이라도 업데이트
                        status: 'failed',
                        state: null,
                        isLoading: false // 로딩 확실히 해제
                    }
                }
             }));
        }
    } finally {
      // 로딩 상태 해제 (Firestore 구독이 최종 상태를 반영하지만, 즉각적인 해제를 위해 추가)
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
    if (!lastNode || !scenarioSessionId) {
      console.warn("continueScenarioIfNeeded: lastNode or scenarioSessionId is missing.");
      return;
    }

    const isInteractive = lastNode.type === 'slotfilling' ||
                          lastNode.type === 'form' ||
                          (lastNode.type === 'branch' && lastNode.data?.evaluationType !== 'CONDITION');

    // 'end' 노드도 진행 중지 조건에 포함
    if (!isInteractive && lastNode.id !== 'end') {
      console.log(`Node ${lastNode.id} (${lastNode.type}) is not interactive, continuing...`);
      // --- 👇 [수정] 자동 진행 시 handleScenarioResponse 호출 (오류 처리 포함) ---
      try {
          // 약간의 지연 (선택 사항)
          await new Promise(resolve => setTimeout(resolve, 300));
          // handleScenarioResponse 호출 (내부에서 오류 처리됨)
          await get().handleScenarioResponse({
            scenarioSessionId: scenarioSessionId,
            currentNodeId: lastNode.id, // 마지막 노드 ID 전달
            sourceHandle: null, // 자동 진행
            userInput: null, // 자동 진행
          });
      } catch (error) {
          // handleScenarioResponse 내부에서 catch되지 않은 예외 처리 (거의 발생 안 함)
          console.error(`[continueScenarioIfNeeded] Unexpected error during auto-continue for session ${scenarioSessionId}:`, error);
          const { language, showEphemeralToast, endScenario } = get();
          const errorKey = getErrorKey(error);
          const message = locales[language]?.[errorKey] || 'Scenario auto-continue failed.';
          showEphemeralToast(message, 'error');
          // 자동 진행 실패 시 시나리오를 failed 상태로 종료
          endScenario(scenarioSessionId, 'failed');
      }
      // --- 👆 [수정] ---
    } else {
        console.log(`Node ${lastNode.id} (${lastNode.type}) is interactive or end node, stopping auto-continue.`);
    }
  },
});