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

    console.log('[_startScenarioEngine] Raw API response:', data);
    console.log('[_startScenarioEngine] nextNode from API:', data.nextNode);
    if (data.nextNode) {
      console.log('[_startScenarioEngine] nextNode keys:', Object.keys(data.nextNode));
      console.log('[_startScenarioEngine] nextNode.id:', data.nextNode.id);
      console.log('[_startScenarioEngine] nextNode.type:', data.nextNode.type);
    }

    return data;
  },

  /**
   * 헬퍼: 시나리오 세션 상태 업데이트
   */
  _updateScenarioSessionState: async (sessionId, scenarioId, initialSlots, data) => {
    // 초기 메시지 배열 생성
    const initialMessages = [];
    if (data.nextNode && data.nextNode.type !== 'setSlot' && data.nextNode.type !== 'set-slot') {
      initialMessages.push({ 
        id: data.nextNode.id, 
        sender: 'bot', 
        node: data.nextNode 
      });
    }

    console.log('[_updateScenarioSessionState] data.nextNode:', data.nextNode ? { id: data.nextNode.id, type: data.nextNode.type } : 'undefined');

    // state 설정: nextNode가 없으면 start 노드로 간주
    let stateValue;
    const nodeId = data.nextNode?.id || 'start';
    
    if (data.nextNode && data.nextNode.id) {
      const isInteractive = data.nextNode.type === "slotfilling" || 
                           data.nextNode.type === "form" || 
                           (data.nextNode.type === "branch" && data.nextNode.data?.evaluationType !== "CONDITION");
      
      stateValue = { 
        scenarioId, 
        currentNodeId: data.nextNode.id, 
        awaitingInput: isInteractive 
      };
    } else {
      console.warn('[_updateScenarioSessionState] WARNING: nextNode or nextNode.id is missing! Using "start" as fallback.');
      stateValue = {
        scenarioId,
        currentNodeId: "start",
        awaitingInput: false
      };
    }

    const updatePayload = { 
      slots: { ...initialSlots, ...(data.slots || {}) },
      status: "active",
      state: stateValue
    };

    console.log('[_updateScenarioSessionState] Sending payload:', JSON.stringify(updatePayload, null, 2));
    const updateResult = await updateScenarioSession(sessionId, updatePayload);
    
    if (!updateResult) {
      console.error('[_updateScenarioSessionState] Failed to update session. Server returned error.');
    }
    
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
    
    // 이벤트 핸들러 맵
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
      
      console.log('[openScenarioPanel] Complete API response from _startScenarioEngine:', JSON.stringify(data, null, 2));
      console.log('[openScenarioPanel] nextNode details:', { 
        hasNextNode: !!data.nextNode, 
        nextNodeId: data.nextNode?.id, 
        nextNodeType: data.nextNode?.type,
        nextNodeKeys: data.nextNode ? Object.keys(data.nextNode) : [] 
      });
      
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
   * 사용자의 시나리오 답변 처리 (핵심 수정 부분)
   */
  handleScenarioResponse: async (payload) => {
    const { scenarioSessionId } = payload;
    const { currentConversationId, language, endScenario, handleEvents } = get();
    
    if (!currentConversationId || !scenarioSessionId) return;

    const currentScenario = get().scenarioStates[scenarioSessionId];
    if (!currentScenario) return;

    const userId = getUserId();
    
    console.log('[handleScenarioResponse] Called with payload:', { userInput: payload.userInput, currentNodeId: payload.currentNodeId });

    // 로딩 상태 시작
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
          type: "scenario_bubble"
        });
        
        console.log('[handleScenarioResponse] API Response:', { type: data.type, nextNodeId: data.nextNode?.id, nextNodeType: data.nextNode?.type, hasMessage: !!data.message });
        
        // 이벤트 처리
        handleEvents(data.events, scenarioSessionId, currentConversationId);

        // 봇 메시지 추가 로직
        if (data.nextNode && data.nextNode.type !== 'setSlot' && data.nextNode.type !== 'set-slot') {
            newMessages.push({ id: data.nextNode.id, sender: 'bot', node: data.nextNode });
        } else if (data.message && data.type !== 'scenario_validation_fail') {
            newMessages.push({ id: `bot-end-${Date.now()}`, sender: 'bot', text: data.message });
        }

        // 기본 Payload 구성
        let updatePayload = { 
          messages: newMessages,
          slots: { ...currentScenario.slots, ...(payload.formData || {}), ...(data.slots || {}) },
          status: currentScenario.status || "active"
        };

        // 시나리오 종료 처리
        if (data.type === 'scenario_end') {
            const finalStatus = data.slots?.apiFailed ? 'failed' : 'completed';
            updatePayload.status = finalStatus;
            updatePayload.state = null; // 종료 시 state 제거
            
            await updateScenarioSession(scenarioSessionId, updatePayload);
            endScenario(scenarioSessionId, finalStatus); 
            return;
        } 
        // 시나리오 진행 중 처리
        else if (data.type === 'scenario') {
            updatePayload.status = 'active';
            // state 구성: currentNodeId 필수 포함
            const stateData = data.scenarioState || currentScenario.state;
            const currentNodeId = data.nextNode?.id || stateData?.currentNodeId || 'start';
            
            updatePayload.state = {
              scenarioId: stateData?.scenarioId || currentScenario.state?.scenarioId,
              currentNodeId: currentNodeId,
              awaitingInput: stateData?.awaitingInput || false
            }; 
            updatePayload.slots = data.slots || currentScenario.slots;
            
            console.log('[handleScenarioResponse] Updated state payload:', JSON.stringify(updatePayload.state, null, 2));
        }

        // --- 👇 [핵심 수정] 서버 업데이트 결과 확인 및 무한 루프 차단 ---
        const updateResult = await updateScenarioSession(scenarioSessionId, updatePayload);

        // 업데이트가 실패했다면(422 등), 더 이상 진행하지 않고 중단합니다.
        if (!updateResult) {
            console.error(`[handleScenarioResponse] Failed to update session ${scenarioSessionId}. Stopping execution to prevent loop.`);
            // 로딩 상태 해제 및 에러 표시 (선택적)
            set(state => ({
              scenarioStates: {
                ...state.scenarioStates,
                [scenarioSessionId]: { 
                  ...state.scenarioStates[scenarioSessionId], 
                  isLoading: false 
                }
              }
            }));
            return; // ★ 여기서 함수를 종료하여 재귀 호출을 막습니다.
        }
        // --- 👆 [수정 완료] ---

        // 로컬 상태 동기화 (성공 시에만)
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

        // 자동 진행 로직 (Interactive 노드가 아닐 경우)
        if (data.type === 'scenario' && data.nextNode && data.nextNode.id) {
            console.log('[handleScenarioResponse] Next node info:', { id: data.nextNode.id, type: data.nextNode.type });
            
            const isInteractive = data.nextNode.type === 'slotfilling' || 
                                 data.nextNode.type === 'form' || 
                                 (data.nextNode.type === 'branch' && data.nextNode.data?.evaluationType !== 'CONDITION');
            
            console.log('[handleScenarioResponse] Is interactive?', isInteractive);
            
            if (!isInteractive && data.nextNode.id !== 'end') {
                console.log('[handleScenarioResponse] Calling continueScenarioIfNeeded with node:', data.nextNode.id);
                await get().continueScenarioIfNeeded(data.nextNode, scenarioSessionId);
            } else if (isInteractive || data.nextNode.id === 'end') {
                console.log('[handleScenarioResponse] Node is interactive or is end node. Stopping auto-continue.');
            }
        } else {
            console.log('[handleScenarioResponse] No valid nextNode provided. Stopping scenario.');
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

  subscribeToScenarioSession: async (sessionId) => {
    const { currentConversationId } = get();
    if (!currentConversationId) return;

    try {
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
    set({ scenarioStates: {}, activeScenarioSessions: [] });
  },

  endScenario: async (scenarioSessionId, status = 'completed') => {
    try {
        const currentScenario = get().scenarioStates[scenarioSessionId];
        
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
        
        if (status === 'canceled') {
          get().setActivePanel('main');
        }
    } catch (error) {
        handleError("Error ending scenario", error);
    }
  },

  continueScenarioIfNeeded: async (lastNode, scenarioSessionId) => {
    if (!lastNode || !scenarioSessionId || !lastNode.id) {
      console.log('[continueScenarioIfNeeded] Invalid node or sessionId. Stopping.');
      return;
    }
    
    console.log('[continueScenarioIfNeeded] Called with node:', { id: lastNode.id, type: lastNode.type });
    
    const isInteractive = lastNode.type === 'slotfilling' || 
                         lastNode.type === 'form' || 
                         (lastNode.type === 'branch' && lastNode.data?.evaluationType !== 'CONDITION');

    console.log('[continueScenarioIfNeeded] Is interactive?', isInteractive, 'Is end?', lastNode.id === 'end');

    if (!isInteractive && lastNode.id !== 'end') {
      try {
          console.log('[continueScenarioIfNeeded] Continuing scenario...');
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
    } else {
      console.log('[continueScenarioIfNeeded] Node is interactive or is end node. Not continuing.');
    }
  },
});