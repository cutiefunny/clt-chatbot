// app/store/slices/scenarioSlice.js
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  deleteDoc,
} from "firebase/firestore";
import { locales } from "../../lib/locales";
import { getErrorKey } from "../../lib/errorHandler";

// 환경 변수에서 기본 API 주소를 가져옵니다.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export const createScenarioSlice = (set, get) => ({
  scenarioStates: {},
  activeScenarioSessionId: null,
  activeScenarioSessions: [],
  scenarioCategories: [],
  availableScenarios: [],
  unsubscribeScenariosMap: {},

  setScenarioSlots: (sessionId, newSlots) => {
    set(state => {
      if (!sessionId || !state.scenarioStates[sessionId]) {
        console.warn(`[setScenarioSlots] Invalid or non-existent scenario session ID: ${sessionId}`);
        return state;
      }
      
      const updatedScenarioState = {
        ...state.scenarioStates[sessionId],
        slots: newSlots,
      };

      return {
        scenarioStates: {
          ...state.scenarioStates,
          [sessionId]: updatedScenarioState,
        }
      };
    });
  },

  /**
   * 시나리오 엔진에서 사용 가능한 시나리오 ID 목록 로드
   * (엔진 엔드포인트가 /scenarios 라고 가정)
   */
  loadAvailableScenarios: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/scenarios`);
      if (response.ok) {
        const scenarios = await response.json();
        // API 응답이 이미 [{id, title, description}, ...] 형식이므로 그대로 저장
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
   * [수정] 메인 API 서버에서 숏컷(카테고리) 데이터를 로드합니다.
   * 주소: http://202.20.84.65:8083/api/v1/shortcut (NEXT_PUBLIC_API_BASE_URL 활용)
   */
  loadScenarioCategories: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/shortcut`);
      if (response.ok) {
        const data = await response.json();
        // 제공해주신 배열 형태의 데이터를 그대로 저장합니다.
        set({ scenarioCategories: data });
        return data;
      } else {
        throw new Error(`Failed to load shortcuts: ${response.status}`);
      }
    } catch (error) {
      console.error("Error loading shortcuts from API:", error);
      const { language, showEphemeralToast } = get();
      const errorKey = getErrorKey(error);
      const message = locales[language]?.[errorKey] || "Failed to load shortcut list.";
      showEphemeralToast(message, "error");
    }
  },

  /**
   * [수정] 편집된 숏컷 데이터를 서버에 저장합니다.
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
      console.error("Error saving shortcuts to API:", error);
      return false;
    }
  },

  openScenarioPanel: async (scenarioId, initialSlots = {}) => {
    const {
      user,
      currentConversationId,
      handleEvents,
      language,
      setActivePanel,
      addMessage,
      setForceScrollToBottom,
      showEphemeralToast,
      showScenarioBubbles,
    } = get();
    if (!user) return;

    let conversationId = currentConversationId;
    let newScenarioSessionId = null;

    try {
      // 대화방 자동 생성 로직 (생략 가능하나 기존 흐름 유지)
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

      // Firestore 세션 생성 (점진적 제거 대상)
      const scenarioSessionsRef = collection(
        get().db,
        "chats",
        user.uid,
        "conversations",
        conversationId,
        "scenario_sessions"
      );
      const newSessionDoc = await addDoc(scenarioSessionsRef, {
        scenarioId: scenarioId,
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
        await addMessage("user", {
          type: "scenario_bubble",
          scenarioSessionId: newScenarioSessionId,
        });
      }

      get().subscribeToScenarioSession(newScenarioSessionId);

      setTimeout(() => {
        setActivePanel("scenario", newScenarioSessionId);
      }, 100);

      // /api/chat 호출 (내부 프록시)
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: { text: scenarioId },
          scenarioSessionId: newScenarioSessionId,
          slots: initialSlots,
          language: language,
        }),
      });
      if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
      
      const data = await response.json();
      handleEvents(data.events, newScenarioSessionId, conversationId);

      const sessionRef = doc(get().db, "chats", user.uid, "conversations", conversationId, "scenario_sessions", newScenarioSessionId);
      let updatePayload = { updatedAt: serverTimestamp() };

      if (data.type === "scenario_start" || data.type === "scenario") {
        updatePayload.slots = { ...initialSlots, ...(data.slots || {}) };
        updatePayload.messages = [];
        updatePayload.state = null;

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

        if (data.nextNode && data.nextNode.type !== "slotfilling" && data.nextNode.type !== "form" && !(data.nextNode.type === "branch" && data.nextNode.data?.evaluationType !== "CONDITION")) {
          await get().continueScenarioIfNeeded(data.nextNode, newScenarioSessionId);
        }
      }
    } catch (error) {
      console.error(`Error opening scenario panel:`, error);
      showEphemeralToast("Failed to start scenario.", "error");
      setActivePanel("main");
    }
  },

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
        set(state => {
            const newScenarioStates = {
                ...state.scenarioStates,
                [sessionId]: { ...(state.scenarioStates[sessionId] || {}), ...scenarioData }
            };
            return { scenarioStates: newScenarioStates, activeScenarioSessions: Object.keys(newScenarioStates) };
        });
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

  handleScenarioResponse: async (payload) => {
    const { scenarioSessionId } = payload;
    const { handleEvents, user, currentConversationId, language, endScenario } = get();
    if (!user || !currentConversationId || !scenarioSessionId) return;

    const currentScenario = get().scenarioStates[scenarioSessionId];
    if (!currentScenario) return;

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

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: { sourceHandle: payload.sourceHandle, text: payload.userInput },
              scenarioState: currentScenario.state,
              slots: { ...currentScenario.slots, ...(payload.formData || {}) },
              language,
              scenarioSessionId,
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