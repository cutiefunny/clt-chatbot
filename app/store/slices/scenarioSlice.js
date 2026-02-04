// app/store/slices/scenarioSlice.js
import { locales } from "../../lib/locales";
import { getErrorKey } from "../../lib/errorHandler";
import { 
  fetchScenarios, 
  fetchScenarioSessions, 
  createScenarioSession, 
  updateScenarioSession,
  sendChatMessage,
  fetchShortcuts
} from "../../lib/api";

export const createScenarioSlice = (set, get) => ({
  scenarioStates: {},
  activeScenarioSessionId: null,
  activeScenarioSessions: [],
  scenarioCategories: [],
  availableScenarios: [], 
  // Firebase 리스너 맵은 더 이상 필요하지 않지만 인터페이스 유지를 위해 빈 객체로 둠
  unsubscribeScenariosMap: {},

  getStoredUserId: () => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("userId");
      return stored ? stored.replace(/['"]+/g, '').trim() : "";
    }
    return "";
  },

  /**
   * 사용 가능한 시나리오 목록 로드
   */
  loadAvailableScenarios: async () => {
    try {
      const scenarios = await fetchScenarios();
      set({ availableScenarios: Array.isArray(scenarios) ? scenarios : [] });
    } catch (e) {
      console.error("Failed to load available scenarios:", e);
      set({ availableScenarios: [] });
    }
  },

  /**
   * 숏컷(카테고리) 데이터 로드
   */
  loadScenarioCategories: async () => {
    try {
      const data = await fetchShortcuts();
      if (data) {
        set({ scenarioCategories: data });
        return data;
      }
    } catch (error) {
      console.error("Error loading shortcuts:", error);
    }
  },

  /**
   * 시나리오 패널 열기 및 초기 /chat 호출
   */
  openScenarioPanel: async (scenarioId, initialSlots = {}) => {
    const { 
      currentConversationId, 
      handleEvents, 
      language, 
      setActivePanel, 
      addMessage, 
      setForceScrollToBottom, 
      showScenarioBubbles 
    } = get();

    let conversationId = currentConversationId;
    const userId = get().getStoredUserId();

    try {
      // 1. 대화방 보장
      if (!conversationId) {
        conversationId = await get().createNewConversation(true);
        if (!conversationId) throw new Error("Failed to create conversation.");
      }

      // 2. FastAPI를 통한 시나리오 세션 생성
      const sessionData = await createScenarioSession(conversationId, scenarioId);
      const newScenarioSessionId = sessionData.id;

      // 로컬 상태 초기화 (리스너 대신 직접 설정)
      set(state => ({
        scenarioStates: {
          ...state.scenarioStates,
          [newScenarioSessionId]: {
            ...sessionData,
            messages: [],
            slots: initialSlots,
            isLoading: false
          }
        },
        activeScenarioSessions: [...state.activeScenarioSessions, newScenarioSessionId]
      }));

      setActivePanel("main");
      setForceScrollToBottom(true);
      
      if (showScenarioBubbles) {
        await addMessage("user", { type: "scenario_bubble", scenarioSessionId: newScenarioSessionId });
      }

      // 패널 전환
      setTimeout(() => setActivePanel("scenario", newScenarioSessionId), 100);

      // 3. 엔진 가동 (chat API 호출)
      const data = await sendChatMessage({
        usr_id: userId,
        conversation_id: conversationId,
        scenario_session_id: newScenarioSessionId,
        content: scenarioId,
        slots: initialSlots,
        language: language
      });
      
      // 이벤트 처리
      handleEvents(data.events, newScenarioSessionId, conversationId);

      // 4. 응답 결과를 바탕으로 세션 상태 업데이트 (FastAPI)
      let updatePayload = { 
        updated_at: new Date().toISOString(),
        slots: { ...initialSlots, ...(data.slots || {}) }
      };

      if (data.nextNode) {
        const isInteractive = data.nextNode.type === "slotfilling" || 
                             data.nextNode.type === "form" || 
                             (data.nextNode.type === "branch" && data.nextNode.data?.evaluationType !== "CONDITION");
        
        updatePayload.state = { 
          scenarioId, 
          currentNodeId: data.nextNode.id, 
          awaitingInput: isInteractive 
        };
        updatePayload.status = "active";
      }

      await updateScenarioSession(newScenarioSessionId, updatePayload);
      
      // 로컬 상태 동기화
      set(state => ({
        scenarioStates: {
          ...state.scenarioStates,
          [newScenarioSessionId]: { 
            ...state.scenarioStates[newScenarioSessionId], 
            ...updatePayload 
          }
        }
      }));

      if (data.nextNode && !updatePayload.state?.awaitingInput && data.nextNode.id !== 'end') {
        await get().continueScenarioIfNeeded(data.nextNode, newScenarioSessionId);
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
    const { currentConversationId, language, endScenario, handleEvents } = get();
    
    if (!currentConversationId || !scenarioSessionId) return;

    const currentScenario = get().scenarioStates[scenarioSessionId];
    if (!currentScenario) return;

    const userId = get().getStoredUserId();

    set(state => ({
        scenarioStates: { 
          ...state.scenarioStates, 
          [scenarioSessionId]: { ...currentScenario, isLoading: true } 
        }
    }));

    try {
        let newMessages = [...(currentScenario.messages || [])];
        if (payload.userInput) {
            newMessages.push({ id: `user-${Date.now()}`, sender: 'user', text: payload.userInput });
            // 로컬 상태 먼저 업데이트
            set(state => ({
              scenarioStates: {
                ...state.scenarioStates,
                [scenarioSessionId]: { ...state.scenarioStates[scenarioSessionId], messages: newMessages }
              }
            }));
        }

        // chat API 호출
        const data = await sendChatMessage({
          usr_id: userId,
          conversation_id: currentConversationId,
          scenario_session_id: scenarioSessionId,
          content: payload.userInput || "",
          source_handle: payload.sourceHandle,
          scenario_state: currentScenario.state,
          slots: { ...currentScenario.slots, ...(payload.formData || {}) },
          language: language,
        });
        handleEvents(data.events, scenarioSessionId, currentConversationId);

        // 메시지 추가 로직
        if (data.nextNode && data.nextNode.type !== 'setSlot' && data.nextNode.type !== 'set-slot') {
            newMessages.push({ id: data.nextNode.id, sender: 'bot', node: data.nextNode });
        } else if (data.message && data.type !== 'scenario_validation_fail') {
            newMessages.push({ id: `bot-end-${Date.now()}`, sender: 'bot', text: data.message });
        }

        let updatePayload = { messages: newMessages };

        if (data.type === 'scenario_end') {
            const finalStatus = data.slots?.apiFailed ? 'failed' : 'completed';
            updatePayload.status = finalStatus;
            updatePayload.state = null;
            
            await updateScenarioSession(scenarioSessionId, updatePayload);
            endScenario(scenarioSessionId, finalStatus); 
            return;
        } else if (data.type === 'scenario') {
            updatePayload.status = 'active';
            updatePayload.state = data.scenarioState;
            updatePayload.slots = data.slots || currentScenario.slots;
        }

        // 서버 업데이트
        await updateScenarioSession(scenarioSessionId, updatePayload);

        // 로컬 상태 동기화
        set(state => ({
          scenarioStates: {
            ...state.scenarioStates,
            [scenarioSessionId]: { 
              ...state.scenarioStates[scenarioSessionId], 
              ...updatePayload,
              isLoading: false 
            }
          }
        }));

        if (data.type === 'scenario' && data.nextNode) {
            const isInteractive = data.nextNode.type === 'slotfilling' || 
                                 data.nextNode.type === 'form' || 
                                 (data.nextNode.type === 'branch' && data.nextNode.data?.evaluationType !== 'CONDITION');
            if (!isInteractive) await get().continueScenarioIfNeeded(data.nextNode, scenarioSessionId);
        }
    } catch (error) {
        console.error(`Error in handleScenarioResponse:`, error);
        endScenario(scenarioSessionId, 'failed');
    }
  },

  setScenarioSelectedOption: async (scenarioSessionId, messageNodeId, selectedValue) => {
    const { scenarioStates } = get();
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
        await updateScenarioSession(scenarioSessionId, { messages: updatedMessages });
    } catch (error) {
        console.error("Error updating scenario option:", error);
    }
  },

  // 리스너 대신 초기 로드 함수로 대체
  subscribeToScenarioSession: async (sessionId) => {
    const { currentConversationId } = get();
    if (!currentConversationId) return;

    try {
      // API를 통해 세션 데이터 단발성 조회
      const sessions = await fetchScenarioSessions(currentConversationId);
      const sessionData = sessions.find(s => s.id === sessionId);
      
      if (sessionData) {
        set(state => ({
          scenarioStates: { 
            ...state.scenarioStates, 
            [sessionId]: { ...(state.scenarioStates[sessionId] || {}), ...sessionData } 
          },
          activeScenarioSessions: Array.from(new Set([...state.activeScenarioSessions, sessionId]))
        }));
      }
    } catch (error) {
      console.error("Error fetching session data:", error);
    }
  },

  unsubscribeFromScenarioSession: (sessionId) => {
      set(state => {
          const updatedStates = { ...state.scenarioStates };
          delete updatedStates[sessionId];

          return {
              scenarioStates: updatedStates,
              activeScenarioSessions: state.activeScenarioSessions.filter(id => id !== sessionId),
              ...(state.activeScenarioSessionId === sessionId ? { activeScenarioSessionId: null, activePanel: 'main' } : {})
          };
      });
  },

  unsubscribeAllScenarioListeners: () => {
    // REST API 환경에서는 정리할 리스너가 없음
    set({ scenarioStates: {}, activeScenarioSessions: [] });
  },

  endScenario: async (scenarioSessionId, status = 'completed') => {
    try {
        const updatePayload = { status, state: null };
        await updateScenarioSession(scenarioSessionId, updatePayload); 
        
        set(state => ({
            scenarioStates: {
                ...state.scenarioStates,
                [scenarioSessionId]: { 
                  ...(state.scenarioStates[scenarioSessionId] || {}), 
                  ...updatePayload 
                }
            },
        }));
    } catch (error) {
        console.error(`Error ending scenario:`, error);
    }
  },

  continueScenarioIfNeeded: async (lastNode, scenarioSessionId) => {
    if (!lastNode || !scenarioSessionId) return;
    const isInteractive = lastNode.type === 'slotfilling' || 
                         lastNode.type === 'form' || 
                         (lastNode.type === 'branch' && lastNode.data?.evaluationType !== 'CONDITION');

    if (!isInteractive && lastNode.id !== 'end') {
      try {
          await new Promise(resolve => setTimeout(resolve, 300));
          await get().handleScenarioResponse({ 
            scenarioSessionId, 
            currentNodeId: lastNode.id, 
            sourceHandle: null, 
            userInput: null 
          });
      } catch (error) {
          get().endScenario(scenarioSessionId, 'failed');
      }
    }
  },
});