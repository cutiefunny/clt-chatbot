// app/store/slices/scenarioSlice.js
import { locales } from "../../lib/locales";
import { getErrorKey, handleError } from "../../lib/errorHandler";
import { getUserId } from "../../lib/utils";
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

  /**
   * 헬퍼: 시나리오 세션 생성 및 초기 상태 설정
   */
  _createScenarioSession: async (conversationId, scenarioId, initialSlots) => {
    const sessionData = await createScenarioSession(conversationId, scenarioId);
    const newScenarioSessionId = sessionData.id;

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

    return newScenarioSessionId;
  },

  /**
   * 헬퍼: 시나리오 엔진 가동 (chat API 호출)
   */
  _startScenarioEngine: async (scenarioId, sessionId, conversationId, initialSlots, language) => {
    const userId = getUserId();
    
    const data = await sendChatMessage({
      usr_id: userId,
      conversation_id: conversationId,
      scenario_session_id: sessionId,
      content: scenarioId,
      slots: initialSlots,
      language: language,
      type: "scenario_bubble"  // 시나리오 호출 타입 표시
    });

    return data;
  },

  /**
   * 헬퍼: 시나리오 세션 상태 업데이트
   */
  _updateScenarioSessionState: async (sessionId, scenarioId, initialSlots, data) => {
    // 초기 메시지 배열 생성 - nextNode가 있으면 첫 번째 노드 메시지로 추가
    const initialMessages = [];
    if (data.nextNode && data.nextNode.type !== 'setSlot' && data.nextNode.type !== 'set-slot') {
      initialMessages.push({ 
        id: data.nextNode.id, 
        sender: 'bot', 
        node: data.nextNode 
      });
    }

    // state는 항상 필수 - data.nextNode가 있으면 해당 노드 정보 사용, 없으면 시작 노드 사용
    let stateValue;
    if (data.nextNode) {
      const isInteractive = data.nextNode.type === "slotfilling" || 
                           data.nextNode.type === "form" || 
                           (data.nextNode.type === "branch" && data.nextNode.data?.evaluationType !== "CONDITION");
      
      stateValue = { 
        scenarioId, 
        currentNodeId: data.nextNode.id, 
        awaitingInput: isInteractive 
      };
    } else {
      // nextNode가 없을 때 기본 시작 노드 정보 사용
      stateValue = {
        scenarioId,
        currentNodeId: "start",
        awaitingInput: false
      };
    }

    const updatePayload = { 
      slots: { ...initialSlots, ...(data.slots || {}) },
      messages: initialMessages,
      status: "active",
      state: stateValue
    };

    await updateScenarioSession(sessionId, updatePayload);
    
    // 로컬 상태 동기화
    set(state => ({
      scenarioStates: {
        ...state.scenarioStates,
        [sessionId]: { 
          ...state.scenarioStates[sessionId], 
          ...updatePayload 
        }
      }
    }));

    return updatePayload;
  },

  /**
   * 이벤트 처리 함수
   */
  handleEvents: (events, scenarioSessionId, conversationId) => {
    if (!events || !Array.isArray(events)) return;
    
    const { addMessage } = get();
    
    // 이벤트 핸들러 맵 (Strategy 패턴)
    const eventHandlers = {
      message: (event) => {
        if (event.content) {
          addMessage("bot", { text: event.content });
        }
      },
      
      update_slots: (event) => {
        if (event.slots) {
          set(state => ({
            scenarioStates: {
              ...state.scenarioStates,
              [scenarioSessionId]: {
                ...state.scenarioStates[scenarioSessionId],
                slots: { 
                  ...state.scenarioStates[scenarioSessionId]?.slots, 
                  ...event.slots 
                }
              }
            }
          }));
        }
      },
      
      toast: (event) => {
        if (event.message) {
          get().showEphemeralToast(event.message, event.toastType || 'info');
        }
      }
    };
    
    // 이벤트 처리
    events.forEach(event => {
      const handler = eventHandlers[event.type];
      if (handler) {
        handler(event);
      } else {
        console.warn(`Unhandled event type: ${event.type}`, event);
      }
    });
  },

  /**
   * 사용 가능한 시나리오 목록 로드
   */
  loadAvailableScenarios: async () => {
    try {
      const scenarios = await fetchScenarios();
      set({ availableScenarios: Array.isArray(scenarios) ? scenarios : [] });
    } catch (e) {
      handleError("Failed to load available scenarios", e);
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
      handleError("Error loading shortcuts", error);
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
      showScenarioBubbles,
      _createScenarioSession,
      _startScenarioEngine,
      _updateScenarioSessionState
    } = get();

    let conversationId = currentConversationId;

    try {
      // 1. 대화방 보장
      if (!conversationId) {
        conversationId = await get().createNewConversation(true);
        if (!conversationId) throw new Error("Failed to create conversation.");
      }

      // 2. 시나리오 세션 생성
      const newScenarioSessionId = await _createScenarioSession(conversationId, scenarioId, initialSlots);

      // 3. UI 업데이트
      setActivePanel("main");
      setForceScrollToBottom(true);
      
      if (showScenarioBubbles) {
        await addMessage("user", { type: "scenario_bubble", scenarioSessionId: newScenarioSessionId });
      }

      setTimeout(() => setActivePanel("scenario", newScenarioSessionId), 100);

      // 4. 엔진 가동
      const data = await _startScenarioEngine(scenarioId, newScenarioSessionId, conversationId, initialSlots, language);
      
      // 5. 이벤트 처리
      handleEvents(data.events, newScenarioSessionId, conversationId);

      // 6. 세션 상태 업데이트
      const updatePayload = await _updateScenarioSessionState(newScenarioSessionId, scenarioId, initialSlots, data);

      // 7. 자동 계속 실행 (필요시)
      if (data.nextNode && !updatePayload.state?.awaitingInput && data.nextNode.id !== 'end') {
        await get().continueScenarioIfNeeded(data.nextNode, newScenarioSessionId);
      }

    } catch (error) {
      handleError("Error opening scenario panel", error);
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

    const userId = getUserId();

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
          type: "scenario_bubble"  // 시나리오 응답 타입 표시
        });
        handleEvents(data.events, scenarioSessionId, currentConversationId);

        // 메시지 추가 로직
        if (data.nextNode && data.nextNode.type !== 'setSlot' && data.nextNode.type !== 'set-slot') {
            newMessages.push({ id: data.nextNode.id, sender: 'bot', node: data.nextNode });
        } else if (data.message && data.type !== 'scenario_validation_fail') {
            newMessages.push({ id: `bot-end-${Date.now()}`, sender: 'bot', text: data.message });
        }

        let updatePayload = { 
          messages: newMessages,
          slots: { ...currentScenario.slots, ...(payload.formData || {}), ...(data.slots || {}) },
          status: currentScenario.status || "active"
        };

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
        handleError("Error in handleScenarioResponse", error);
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
        handleError("Error updating scenario option", error);
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
      handleError("Error fetching session data", error);
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
        const currentScenario = get().scenarioStates[scenarioSessionId];
        
        // state는 항상 필수 - 종료 시에도 기본 구조 유지
        const stateValue = currentScenario?.state ? {
          ...currentScenario.state,
          currentNodeId: "end",
          awaitingInput: false
        } : {
          scenarioId: currentScenario?.scenarioId || "",
          currentNodeId: "end",
          awaitingInput: false
        };
        
        const updatePayload = { 
          status, 
          state: stateValue,
          slots: currentScenario?.slots || {},
          messages: currentScenario?.messages || []
        };
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
        
        // canceled 상태일 때 시나리오 패널 닫기
        if (status === 'canceled') {
          get().setActivePanel('main');
        }
    } catch (error) {
        handleError("Error ending scenario", error);
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
          handleError("Error continuing scenario", error);
          get().endScenario(scenarioSessionId, 'failed');
      }
    }
  },
});