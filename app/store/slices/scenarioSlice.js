// app/store/slices/scenarioSlice.js
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { locales } from "../../lib/locales";
import { getErrorKey } from "../../lib/errorHandler";

// .env의 NEXT_PUBLIC_API_BASE_URL 사용 (예: http://202.20.84.65:8083/api/v1)
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export const createScenarioSlice = (set, get) => ({
  scenarioStates: {},
  activeScenarioSessionId: null,
  activeScenarioSessions: [],
  scenarioCategories: [],
  availableScenarios: [], // [{id, title, description}, ...] 객체 배열로 관리
  unsubscribeScenariosMap: {},

  // 사용자 ID 가져오기 유틸리티 (따옴표 제거 및 공백 처리)
  getStoredUserId: () => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("userId");
      return stored ? stored.replace(/['"]+/g, '').trim() : "";
    }
    return "";
  },

  /**
   * 사용 가능한 시나리오 목록 로드 (ID와 제목 바인딩용)
   * 주소: http://202.20.84.65:8083/api/v1/scenarios
   */
  loadAvailableScenarios: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/scenarios`);
      if (response.ok) {
        const scenarios = await response.json();
        // API 응답 구조 [{id, title, description}, ...]를 상태에 저장
        set({ availableScenarios: Array.isArray(scenarios) ? scenarios : [] });
      } else {
        throw new Error(`Failed to load scenarios: ${response.status}`);
      }
    } catch (e) {
      console.error("Failed to load available scenarios:", e);
      set({ availableScenarios: [] });
    }
  },

  /**
   * 숏컷(카테고리) 데이터 로드
   * 주소: http://202.20.84.65:8083/api/v1/shortcut
   */
  loadScenarioCategories: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/shortcut`);
      if (response.ok) {
        const data = await response.json();
        set({ scenarioCategories: data });
        return data;
      }
    } catch (error) {
      console.error("Error loading shortcuts:", error);
    }
  },

  /**
   * 편집된 숏컷 데이터를 서버에 저장
   */
  saveScenarioCategories: async (newCategories) => {
    try {
      const response = await fetch(`${API_BASE_URL}/shortcut`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCategories)
      });
      if (response.ok) {
        set({ scenarioCategories: newCategories });
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error saving shortcuts:", error);
      return false;
    }
  },

  /**
   * 시나리오 패널 열기 및 초기 /chat 호출
   */
  openScenarioPanel: async (scenarioId, initialSlots = {}) => {
    const { user, currentConversationId, handleEvents, language, setActivePanel, addMessage, setForceScrollToBottom, showEphemeralToast, showScenarioBubbles } = get();
    if (!user) return;

    let conversationId = currentConversationId;
    let newScenarioSessionId = null;
    const userId = get().getStoredUserId(); // FastAPI 호출을 위한 usr_id

    try {
      // 대화방이 없을 경우 생성
      if (!conversationId) {
        const newConversationId = await get().createNewConversation(true);
        if (!newConversationId) throw new Error("Failed to ensure conversation ID.");
        
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Timeout")), 5000);
          const check = () => {
            if (get().currentConversationId === newConversationId) {
              clearTimeout(timeout);
              resolve();
            } else {
              setTimeout(check, 100);
            }
          };
          check();
        });
        conversationId = newConversationId;
      }

      // Firestore 세션 생성 (상태 공유용)
      const scenarioSessionsRef = collection(get().db, "chats", user.uid, "conversations", conversationId, "scenario_sessions");
      const newSessionDoc = await addDoc(scenarioSessionsRef, {
        scenarioId,
        status: "starting",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        messages: [],
        state: null,
        slots: initialSlots,
      });
      newScenarioSessionId = newSessionDoc.id;

      setActivePanel("main");
      setForceScrollToBottom(true);
      if (showScenarioBubbles) {
        await addMessage("user", { type: "scenario_bubble", scenarioSessionId: newScenarioSessionId });
      }

      get().subscribeToScenarioSession(newScenarioSessionId);
      setTimeout(() => setActivePanel("scenario", newScenarioSessionId), 100);

      // --- FastAPI /chat API 호출 (usr_id 바디 최상위에 포함) ---
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usr_id: userId, // 👈 필수 사용자 ID 최상단 추가
          conversation_id: conversationId,
          scenario_session_id: newScenarioSessionId,
          content: scenarioId,
          slots: initialSlots,
          language: language
        }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
      const data = await response.json();
      handleEvents(data.events, newScenarioSessionId, conversationId);

      // Firestore 세션 상태 업데이트
      const sessionRef = doc(get().db, "chats", user.uid, "conversations", conversationId, "scenario_sessions", newScenarioSessionId);
      let updatePayload = { updatedAt: serverTimestamp() };

      if (data.type === "scenario_start" || data.type === "scenario") {
        updatePayload.slots = { ...initialSlots, ...(data.slots || {}) };
        updatePayload.messages = [];
        
        if (data.nextNode) {
          if (data.nextNode.type !== "setSlot" && data.nextNode.type !== "set-slot") {
            updatePayload.messages.push({ id: data.nextNode.id, sender: "bot", node: data.nextNode });
          }
          const isInteractive = data.nextNode.type === "slotfilling" || data.nextNode.type === "form" || (data.nextNode.type === "branch" && data.nextNode.data?.evaluationType !== "CONDITION");
          updatePayload.state = { scenarioId, currentNodeId: data.nextNode.id, awaitingInput: isInteractive };
        } else if (data.message) {
          updatePayload.messages.push({ id: "end-message", sender: "bot", text: data.message });
          updatePayload.status = data.status || "completed";
        }
        updatePayload.status = data.status || "active";
        await updateDoc(sessionRef, updatePayload);

        if (data.nextNode && !updatePayload.state?.awaitingInput && data.nextNode.id !== 'end') {
          await get().continueScenarioIfNeeded(data.nextNode, newScenarioSessionId);
        }
      }
    } catch (error) {
      console.error(`Error opening scenario panel:`, error);
      setActivePanel("main");
    }
  },

  /**
   * 사용자의 시나리오 답변 처리
   */
  handleScenarioResponse: async (payload) => {
    const { scenarioSessionId } = payload;
    const { user, currentConversationId, language, endScenario, handleEvents } = get();
    if (!user || !currentConversationId || !scenarioSessionId) return;

    const currentScenario = get().scenarioStates[scenarioSessionId];
    if (!currentScenario) return;

    const userId = get().getStoredUserId();

    set(state => ({
        scenarioStates: { ...state.scenarioStates, [scenarioSessionId]: { ...currentScenario, isLoading: true } }
    }));

    const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", scenarioSessionId);

    try {
        let newMessages = [...(currentScenario.messages || [])];
        if (payload.userInput) {
            newMessages.push({ id: `user-${Date.now()}`, sender: 'user', text: payload.userInput });
            await updateDoc(sessionRef, { messages: newMessages, updatedAt: serverTimestamp() });
        }

        // --- FastAPI /chat API 호출 (usr_id 바디 최상위에 포함) ---
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              usr_id: userId, // 👈 필수 사용자 ID 최상단 추가
              conversation_id: currentConversationId,
              scenario_session_id: scenarioSessionId,
              content: payload.userInput || "",
              source_handle: payload.sourceHandle,
              scenario_state: currentScenario.state,
              slots: { ...currentScenario.slots, ...(payload.formData || {}) },
              language: language,
            }),
        });
        
        if (!response.ok) throw new Error("Chat API failed");
        const data = await response.json();
        handleEvents(data.events, scenarioSessionId, currentConversationId);

        if (data.nextNode && data.nextNode.type !== 'setSlot' && data.nextNode.type !== 'set-slot') {
            newMessages.push({ id: data.nextNode.id, sender: 'bot', node: data.nextNode });
        } else if (data.message && data.type !== 'scenario_validation_fail') {
            newMessages.push({ id: `bot-end-${Date.now()}`, sender: 'bot', text: data.message });
        }

        let updatePayload = { messages: newMessages, updatedAt: serverTimestamp() };

        if (data.type === 'scenario_end') {
            const finalStatus = data.slots?.apiFailed ? 'failed' : 'completed';
            updatePayload.status = finalStatus;
            updatePayload.state = null;
            await updateDoc(sessionRef, updatePayload);
            endScenario(scenarioSessionId, finalStatus); 
            return;
        } else if (data.type === 'scenario') {
            updatePayload.status = 'active';
            updatePayload.state = data.scenarioState;
            updatePayload.slots = data.slots || currentScenario.slots;
        }

        await updateDoc(sessionRef, updatePayload);

        if (data.type === 'scenario' && data.nextNode) {
            const isInteractive = data.nextNode.type === 'slotfilling' || data.nextNode.type === 'form' || (data.nextNode.type === 'branch' && data.nextNode.data?.evaluationType !== 'CONDITION');
            if (!isInteractive) await get().continueScenarioIfNeeded(data.nextNode, scenarioSessionId);
        }
    } catch (error) {
        console.error(`Error in handleScenarioResponse:`, error);
        endScenario(scenarioSessionId, 'failed');
    } finally {
      set(state => ({
        scenarioStates: { ...state.scenarioStates, [scenarioSessionId]: { ...(state.scenarioStates[scenarioSessionId] || {}), isLoading: false } }
      }));
    }
  },

  // ... (setScenarioSelectedOption, subscribeToScenarioSession, endScenario 등 나머지 기존 함수 유지)
  setScenarioSelectedOption: async (scenarioSessionId, messageNodeId, selectedValue) => {
    const { user, currentConversationId, scenarioStates } = get();
    if (!user || !currentConversationId || !scenarioSessionId) return;

    const scenarioState = scenarioStates[scenarioSessionId];
    if (!scenarioState) return;

    const updatedMessages = scenarioState.messages.map(msg => 
      (msg.node && msg.node.id === messageNodeId) ? { ...msg, selectedOption: selectedValue } : msg
    );

    set(state => ({
        scenarioStates: {
            ...state.scenarioStates,
            [scenarioSessionId]: { ...state.scenarioStates[scenarioSessionId], messages: updatedMessages },
        },
    }));

    try {
        const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", scenarioSessionId);
        await updateDoc(sessionRef, { messages: updatedMessages });
    } catch (error) {
        console.error("Error updating scenario option:", error);
    }
  },

  subscribeToScenarioSession: (sessionId) => {
    const { user, currentConversationId, unsubscribeScenariosMap } = get();
    if (!user || !currentConversationId || unsubscribeScenariosMap[sessionId]) return;

    const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", sessionId);
    const unsubscribe = onSnapshot(sessionRef, (doc) => {
      if (doc.exists()) {
        const scenarioData = doc.data();
        set(state => ({
            scenarioStates: { ...state.scenarioStates, [sessionId]: { ...(state.scenarioStates[sessionId] || {}), ...scenarioData } },
            activeScenarioSessions: Object.keys({ ...state.scenarioStates, [sessionId]: scenarioData })
        }));
      } else {
        get().unsubscribeFromScenarioSession(sessionId);
      }
    });

    set(state => ({ unsubscribeScenariosMap: { ...state.unsubscribeScenariosMap, [sessionId]: unsubscribe } }));
  },

  unsubscribeFromScenarioSession: (sessionId) => {
      set(state => {
          if (state.unsubscribeScenariosMap[sessionId]) state.unsubscribeScenariosMap[sessionId]();
          const newUnsubscribeMap = { ...state.unsubscribeScenariosMap };
          delete newUnsubscribeMap[sessionId];
          const updatedStates = { ...state.scenarioStates };
          delete updatedStates[sessionId];

          return {
              unsubscribeScenariosMap: newUnsubscribeMap,
              scenarioStates: updatedStates,
              activeScenarioSessions: Object.keys(updatedStates),
              ...(state.activeScenarioSessionId === sessionId ? { activeScenarioSessionId: null, activePanel: 'main' } : {})
          };
      });
  },

  unsubscribeAllScenarioListeners: () => {
    const { unsubscribeScenariosMap } = get();
    Object.keys(unsubscribeScenariosMap).forEach(id => get().unsubscribeFromScenarioSession(id));
  },

  endScenario: async (scenarioSessionId, status = 'completed') => {
    const { user, currentConversationId } = get(); 
    if (!user || !currentConversationId || !scenarioSessionId) return;

    const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", scenarioSessionId);
    try {
        await updateDoc(sessionRef, { status, state: null, updatedAt: serverTimestamp() }); 
        set(state => ({
            scenarioStates: {
                ...state.scenarioStates,
                [scenarioSessionId]: { ...(state.scenarioStates[scenarioSessionId] || {}), status, state: null }
            },
        }));
    } catch (error) {
        console.error(`Error ending scenario:`, error);
    }
  },

  continueScenarioIfNeeded: async (lastNode, scenarioSessionId) => {
    if (!lastNode || !scenarioSessionId) return;
    const isInteractive = lastNode.type === 'slotfilling' || lastNode.type === 'form' || (lastNode.type === 'branch' && lastNode.data?.evaluationType !== 'CONDITION');

    if (!isInteractive && lastNode.id !== 'end') {
      try {
          await new Promise(resolve => setTimeout(resolve, 300));
          await get().handleScenarioResponse({ scenarioSessionId, currentNodeId: lastNode.id, sourceHandle: null, userInput: null });
      } catch (error) {
          get().endScenario(scenarioSessionId, 'failed');
      }
    }
  },
});