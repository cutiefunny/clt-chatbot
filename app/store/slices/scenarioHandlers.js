// app/store/slices/scenarioHandlers.js
// 시나리오 이벤트 및 상호작용 핸들링 함수들

import { locales } from "../../lib/locales";
import { getErrorKey } from "../../lib/errorHandler";
import { logger } from "../../lib/logger";
import { FASTAPI_BASE_URL } from "../../lib/constants";
import { ChatbotEngine } from "@clt-chatbot/scenario-core";
import { buildApiUrl, buildFetchOptions, interpolateObjectStrings } from "../../lib/nodeHandlers";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const createScenarioHandlersSlice = (set, get) => ({
  setScenarioSelectedOption: async (scenarioSessionId, messageNodeId, selectedValue) => {
    const { user, currentConversationId, scenarioStates, language, showEphemeralToast } = get();
    if (!user || !currentConversationId || !scenarioSessionId) return;

    const scenarioState = scenarioStates[scenarioSessionId];
    if (!scenarioState) return;

    const originalMessages = Array.isArray(scenarioState.messages) ? scenarioState.messages : [];
    const updatedMessages = originalMessages.map(msg => {
      if (msg.node && msg.node.id === messageNodeId) {
        return { ...msg, selectedOption: selectedValue };
      }
      return msg;
    });

    set(state => ({
      scenarioStates: {
        ...state.scenarioStates,
        [scenarioSessionId]: {
          ...state.scenarioStates[scenarioSessionId],
          messages: updatedMessages,
        },
      },
    }));

    try {
      const currentScenario = get().scenarioStates[scenarioSessionId];
      await fetch(
        `${FASTAPI_BASE_URL}/conversations/${currentConversationId}/scenario-sessions/${scenarioSessionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            usr_id: user.uid,
            messages: updatedMessages,
            state: currentScenario?.state || {},
          }),
        }
      ).then(r => {
        if (!r.ok) console.warn(`[setScenarioSelectedOption] Session PATCH failed (${r.status}), continuing...`);
        else return r.json();
      });
    } catch (error) {
      console.error("Error updating scenario selected option via FastAPI:", error);
      const errorKey = getErrorKey(error);
      const message = locales[language]?.[errorKey] || 'Failed to save selection in scenario.';
      showEphemeralToast(message, 'error');
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

  updateScenarioStatus: async (sessionId, newStatus) => {
    const { user, currentConversationId } = get();
    if (!user || !currentConversationId || !sessionId) return;

    // Local state update
    set(state => ({
      scenarioStates: {
        ...state.scenarioStates,
        [sessionId]: {
          ...state.scenarioStates[sessionId],
          status: newStatus,
        }
      },
      scenariosForConversation: {
        ...state.scenariosForConversation,
        [currentConversationId]: state.scenariosForConversation[currentConversationId]?.map(s =>
          s.id === sessionId || s.sessionId === sessionId ? { ...s, status: newStatus } : s
        )
      }
    }));

    // Server update (transient status like 'generating' might not need server sync, but keeping it for now if needed)
    if (newStatus !== 'generating') {
      try {
        await fetch(`${FASTAPI_BASE_URL}/conversations/${currentConversationId}/scenario-sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usr_id: user.uid, status: newStatus })
        });
      } catch (error) {
        console.warn(`[updateScenarioStatus] Failed to sync ${newStatus} to server:`, error);
      }
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
    let scenarioData = null;

    try {
      // ✅ [NEW] 시나리오 메타데이터 로드 (nodes/edges 포함)
      console.log(`[openScenarioPanel] Loading scenario data for ${scenarioId}...`);
      const scenarioResponse = await fetch(
        `${FASTAPI_BASE_URL}/builder/scenarios/${scenarioId}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!scenarioResponse.ok) {
        throw new Error(`Failed to load scenario: ${scenarioResponse.status}`);
      }

      scenarioData = await scenarioResponse.json();
      console.log(`[openScenarioPanel] Scenario loaded:`, scenarioData);

      if (!scenarioData.nodes || scenarioData.nodes.length === 0) {
        throw new Error("Scenario has no nodes");
      }

      if (!conversationId) {
        const newConversationId = await get().createNewConversation(true);
        if (!newConversationId) {
          throw new Error(
            "Failed to ensure conversation ID for starting scenario."
          );
        }
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Timeout waiting for conversation load")),
            5000
          );
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

      // --- [수정] FastAPI로 시나리오 세션 생성 ---
      const createSessionResponse = await fetch(
        `${FASTAPI_BASE_URL}/conversations/${conversationId}/scenario-sessions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            usr_id: user.uid,
            scenario_id: scenarioId,
            slots: initialSlots,
            initial_context: {},
          }),
        }
      );

      if (!createSessionResponse.ok) {
        throw new Error(`Failed to create scenario session: ${createSessionResponse.status}`);
      }

      // 응답에서 session ID 추출
      const sessionData = await createSessionResponse.json();
      newScenarioSessionId = sessionData.id || sessionData.session_id;

      const engine = new ChatbotEngine({ nodes: scenarioData.nodes, edges: scenarioData.edges || [] });

      // ✅ [NEW] 첫 번째 노드 결정 (상태 저장을 위해 앞당김)
      const firstNodeId = scenarioData.start_node_id || scenarioData.nodes[0].id;
      const firstNode = engine.getNodeById(firstNodeId);
      const isInteractive = engine.isInteractiveNode(firstNode);

      // ✨ [Auto-correction & Initial Save]
      // 초기 상태(첫 메시지 및 노드 정보)를 서버에 즉시 저장하여 새로고침 시에도 복구되도록 함
      try {
        const initialMessages = firstNode ? [{
          id: firstNode.id,
          role: 'bot',
          sender: 'bot',
          text: firstNode.data?.content || firstNode.data?.title || '',
          node: firstNode,
          type: 'scenario_message',
        }] : [];

        await fetch(
          `${FASTAPI_BASE_URL}/conversations/${currentConversationId}/scenario-sessions/${newScenarioSessionId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              usr_id: user.uid,
              status: 'active',
              messages: initialMessages,
              state: {
                scenario_id: scenarioId,
                current_node_id: firstNodeId,
                awaiting_input: isInteractive,
              },
              slots: initialSlots || {},
            }),
          }
        );
      } catch (patchErr) {
        console.warn("Failed to save initial scenario state to server:", patchErr);
      }

      setActivePanel("main");
      setForceScrollToBottom(true);

      if (showScenarioBubbles) {
        await addMessage("user", {
          type: "scenario_bubble",
          scenarioSessionId: newScenarioSessionId,
        });
      }

      // ✅ [NEW] scenariosForConversation에 새로운 시나리오 세션 추가
      set(state => {
        const currentScenarios = state.scenariosForConversation?.[conversationId] || [];
        const newScenarioInfo = {
          id: newScenarioSessionId,
          sessionId: newScenarioSessionId,
          scenario_id: scenarioId,
          scenarioId: scenarioId,
          name: scenarioData.name,
          title: scenarioData.name,
          created_at: new Date().toISOString(),
          status: 'active',
        };

        return {
          scenariosForConversation: {
            ...state.scenariosForConversation,
            [conversationId]: [...currentScenarios, newScenarioInfo],
          },
        };
      });

      // ✅ [NEW] 시나리오 상태 초기화 (로컬 메모리)
      set(state => ({
        scenarioStates: {
          ...state.scenarioStates,
          [newScenarioSessionId]: {
            id: newScenarioSessionId,
            conversation_id: conversationId,
            scenario_id: scenarioId,
            title: scenarioData.name,
            nodes: scenarioData.nodes,
            edges: scenarioData.edges || [],
            status: 'active',
            slots: initialSlots || {},
            messages: firstNode ? [{
              id: firstNode.id,
              role: 'bot',
              sender: 'bot',
              text: firstNode.data?.content || firstNode.data?.title || '',
              node: firstNode,
              type: 'scenario_message',
            }] : [],
            state: {
              scenario_id: scenarioId,
              current_node_id: firstNodeId,
              awaiting_input: isInteractive,
            },
            isLoading: false,
          },
        },
      }));

      await sleep(100);
      await setActivePanel("scenario", newScenarioSessionId);

      // ✅ [NEW] 자동 진행 필요 여부 판정
      const shouldAutoProgress = firstNode && (engine.isAutoPassthroughNode(firstNode) || !isInteractive);

      if (shouldAutoProgress) {
        await sleep(300);
        await get().continueScenarioIfNeeded(firstNode, newScenarioSessionId);
      }

      get().subscribeToScenarioSession(newScenarioSessionId);

      return;

    } catch (error) {
      console.error(`Error opening scenario panel for ${scenarioId}:`, error);
      const errorKey = getErrorKey(error);
      const message =
        locales[language]?.[errorKey] || "Failed to start scenario.";
      showEphemeralToast(message, "error");

      if (user && conversationId && newScenarioSessionId) {
        try {
          // FastAPI로 시나리오 세션 삭제
          await fetch(
            `${FASTAPI_BASE_URL}/conversations/${currentConversationId}/scenario-sessions/${newScenarioSessionId}`,
            {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ usr_id: user.uid }),
            }
          );

          console.log(
            `Cleaned up failed scenario session: ${newScenarioSessionId}`
          );

          if (showScenarioBubbles) {
            set((state) => ({
              messages: state.messages.filter(
                (msg) =>
                  !(
                    msg.type === "scenario_bubble" &&
                    msg.scenarioSessionId === newScenarioSessionId
                  )
              ),
            }));
          }
        } catch (cleanupError) {
          console.error(
            `Error cleaning up failed scenario session ${newScenarioSessionId}:`,
            cleanupError
          );
        }
      }
      setActivePanel("main");
    }
  },

  handleScenarioResponse: async (payload) => {
    const { scenarioSessionId } = payload;
    const { user, currentConversationId, language, endScenario, showEphemeralToast } = get();
    if (!user || !currentConversationId || !scenarioSessionId) return;

    const currentScenario = get().scenarioStates[scenarioSessionId];
    if (!currentScenario) {
      showEphemeralToast(locales[language]?.errorUnexpected || 'An unexpected error occurred.', 'error');
      return;
    }

    const { nodes, edges } = currentScenario;
    if (!nodes || !edges) return;

    const existingMessages = Array.isArray(currentScenario.messages) ? currentScenario.messages : [];
    const currentNodeId = currentScenario.state?.current_node_id;

    const engine = new ChatbotEngine({ nodes: currentScenario.nodes, edges: currentScenario.edges || [] });
    const currentNode = engine.getNodeById(currentNodeId);

    set(state => ({
      scenarioStates: { ...state.scenarioStates, [scenarioSessionId]: { ...currentScenario, isLoading: true } }
    }));

    try {
      let newMessages = [...existingMessages];

      if (payload.userInput) {
        newMessages.push({
          id: `user-${Date.now()}`,
          role: 'user',
          sender: 'user',
          text: payload.userInput,
          type: 'scenario_message',
        });
      }

      const updatedSlots = payload.formData
        ? { ...currentScenario.slots, ...payload.formData }
        : currentScenario.slots;

      const nextNode = engine.getNextNode(currentNodeId, payload.sourceHandle, updatedSlots);

      if (!nextNode) {
        const completeMessage = locales[language]?.scenarioComplete || 'Scenario complete.';

        newMessages.push({
          id: `bot-complete-${Date.now()}`,
          role: 'bot',
          sender: 'bot',
          text: completeMessage,
          type: 'scenario_message',
        });

        const updatePayload = {
          messages: newMessages,
          status: 'completed',
          state: null,
          slots: updatedSlots,
        };

        await fetch(
          `${FASTAPI_BASE_URL}/conversations/${currentConversationId}/scenario-sessions/${scenarioSessionId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              usr_id: user.uid,
              ...updatePayload
            }),
          }
        );

        set(state => {
          const updatedScenarios = state.scenariosForConversation?.[currentConversationId]?.map(s =>
            s.sessionId === scenarioSessionId ? { ...s, status: 'completed' } : s
          ) || [];

          return {
            scenarioStates: {
              ...state.scenarioStates,
              [scenarioSessionId]: {
                ...state.scenarioStates[scenarioSessionId],
                messages: newMessages,
                slots: updatedSlots,
                status: 'completed',
                state: null,
                isLoading: false,
              }
            },
            scenariosForConversation: {
              ...state.scenariosForConversation,
              [currentConversationId]: updatedScenarios,
            },
          };
        });

        endScenario(scenarioSessionId, 'completed');
        return;
      }

      if (nextNode.type !== 'setSlot' && nextNode.type !== 'set-slot') {
        newMessages.push({
          id: nextNode.id,
          role: 'bot',
          sender: 'bot',
          text: nextNode.data?.content || nextNode.data?.title || '',
          node: nextNode,
          type: 'scenario_message',
        });
      }

      const updatePayload = {
        messages: newMessages,
        status: 'active',
        state: {
          scenario_id: currentScenario.scenario_id,
          current_node_id: nextNode.id,
          awaiting_input: engine.isInteractiveNode(nextNode),
        },
        slots: updatedSlots,
      };

      await fetch(
        `${FASTAPI_BASE_URL}/conversations/${currentConversationId}/scenario-sessions/${scenarioSessionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            usr_id: user.uid,
            ...updatePayload
          }),
        }
      );

      set(state => ({
        scenarioStates: {
          ...state.scenarioStates,
          [scenarioSessionId]: {
            ...state.scenarioStates[scenarioSessionId],
            messages: newMessages,
            state: updatePayload.state,
            slots: updatePayload.slots,
            isLoading: false,
          }
        }
      }));

      get().subscribeToScenarioSession(scenarioSessionId);

      if (!engine.isInteractiveNode(nextNode)) {
        await sleep(300);
        await get().continueScenarioIfNeeded(nextNode, scenarioSessionId);
      }

    } catch (error) {
      console.error(`Error handling scenario response:`, error);
      const errorKey = getErrorKey(error);
      const errorMessage = locales[language]?.[errorKey] || 'An error occurred during the scenario.';
      showEphemeralToast(errorMessage, 'error');
    } finally {
      set(state => {
        if (state.scenarioStates[scenarioSessionId]) {
          return {
            scenarioStates: { ...state.scenarioStates, [scenarioSessionId]: { ...state.scenarioStates[scenarioSessionId], isLoading: false } }
          };
        }
        return state;
      });
    }
  },

  continueScenarioIfNeeded: async (lastNode, scenarioSessionId) => {
    if (!lastNode || !scenarioSessionId) return;

    const currentScenario = get().scenarioStates[scenarioSessionId];
    if (!currentScenario) return;

    const { nodes, edges } = currentScenario;
    if (!nodes || !edges) return;

    let currentNode = lastNode;
    let isLoopActive = true;
    let loopCount = 0;
    const MAX_LOOP_ITERATIONS = 100;

    const engine = new ChatbotEngine({ nodes: currentScenario.nodes, edges: currentScenario.edges || [] });

    while (isLoopActive && loopCount < MAX_LOOP_ITERATIONS) {
      loopCount++;

      if (engine.isInteractiveNode(currentNode)) {
        try {
          const { user, currentConversationId } = get();
          await fetch(
            `${FASTAPI_BASE_URL}/conversations/${currentConversationId}/scenario-sessions/${scenarioSessionId}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                usr_id: user.uid,
                messages: get().scenarioStates[scenarioSessionId]?.messages || [],
                status: 'active',
                state: {
                  scenario_id: currentScenario.scenario_id,
                  current_node_id: currentNode.id,
                  awaiting_input: true,
                },
                slots: get().scenarioStates[scenarioSessionId]?.slots || {},
              }),
            }
          );
        } catch (error) {
          console.error(`[continueScenarioIfNeeded] Error saving state:`, error);
        }
        isLoopActive = false;
        break;
      }

      if (currentNode.id === 'end' || currentNode.type === 'end') {
        isLoopActive = false;
        break;
      }

      if (currentNode.type === 'message' && !engine.isInteractiveNode(currentNode)) {
        const scenario = get().scenarioStates[scenarioSessionId];
        if (scenario) {
          const messages = [...(scenario.messages || [])];
          if (!messages.find(m => m.node?.id === currentNode.id)) {
            messages.push({
              id: currentNode.id,
              role: 'bot',
              sender: 'bot',
              text: currentNode.data?.content || currentNode.data?.title || '',
              node: currentNode,
              type: 'scenario_message',
            });
          }

          set(state => ({
            scenarioStates: {
              ...state.scenarioStates,
              [scenarioSessionId]: {
                ...state.scenarioStates[scenarioSessionId],
                messages,
                state: {
                  scenario_id: scenario.scenario_id,
                  current_node_id: currentNode.id,
                  awaiting_input: false,
                },
              },
            },
          }));
        }

        const nextNode = engine.getNextNode(currentNode.id, null, get().scenarioStates[scenarioSessionId].slots);
        if (nextNode) {
          currentNode = nextNode;
        } else {
          isLoopActive = false;
          break;
        }
      }
      else if (currentNode.type === 'branch' &&
        currentNode.data?.evaluationType !== 'BUTTON' &&
        currentNode.data?.evaluationType !== 'BUTTON_CLICK') {
        const nextNode = engine.getNextNode(currentNode.id, null, get().scenarioStates[scenarioSessionId].slots);
        if (nextNode) {
          currentNode = nextNode;
        } else {
          isLoopActive = false;
          break;
        }
      }
      else if (engine.isAutoPassthroughNode(currentNode)) {
        if (currentNode.type === 'delay') {
          get().updateScenarioStatus(scenarioSessionId, 'generating');
          get().setDelayLoading(true);
          await sleep(currentNode.data?.duration || currentNode.data?.delay_ms || 1000);
          get().setDelayLoading(false);
          get().updateScenarioStatus(scenarioSessionId, 'active');

          const nextNode = engine.getNextNode(currentNode.id, null, get().scenarioStates[scenarioSessionId].slots);
          if (nextNode) currentNode = nextNode;
          else { isLoopActive = false; break; }
        }
        else if (currentNode.type === 'setSlot' || currentNode.type === 'set-slot') {
          const assignments = currentNode.data?.assignments || [];
          if (assignments.length > 0) {
            const scenario = get().scenarioStates[scenarioSessionId];
            if (scenario) {
              const updatedSlots = { ...scenario.slots };
              assignments.forEach(assignment => {
                updatedSlots[assignment.key] = engine.interpolateMessage(assignment.value, scenario.slots);
              });
              set(state => ({
                scenarioStates: {
                  ...state.scenarioStates,
                  [scenarioSessionId]: {
                    ...state.scenarioStates[scenarioSessionId],
                    slots: updatedSlots,
                  },
                },
              }));
            }
          }
          const nextNode = engine.getNextNode(currentNode.id, null, get().scenarioStates[scenarioSessionId].slots);
          if (nextNode) currentNode = nextNode;
          else { isLoopActive = false; break; }
        }
        else if (currentNode.type === 'api') {
          try {
            get().updateScenarioStatus(scenarioSessionId, 'generating');
            get().setDelayLoading(true);

            const { method, url, headers, body, params, responseMapping, isMulti, apis } = currentNode.data;
            const scenario = get().scenarioStates[scenarioSessionId];
            let apiSuccess = false;
            let finalSlots = { ...scenario.slots };

            const executeApi = async (config) => {
              const targetUrl = buildApiUrl(config.url, config.method === 'GET' ? config.params : null, scenario.slots, engine);
              const { options } = buildFetchOptions(config.method, config.headers, config.body, scenario.slots, engine);
              const res = await fetch(targetUrl, options);
              if (!res.ok) throw new Error(`API error: ${res.status}`);
              const json = await res.json();
              const mapped = {};
              if (config.responseMapping) {
                config.responseMapping.forEach(m => {
                  const val = engine.getDeepValue(json, m.path);
                  if (val !== undefined) mapped[m.slot] = val;
                });
              }
              return mapped;
            };

            try {
              if (isMulti && Array.isArray(apis)) {
                const results = await Promise.all(apis.map(a => executeApi(a)));
                results.forEach(r => { finalSlots = { ...finalSlots, ...r }; });
              } else {
                const r = await executeApi({ method, url, headers, body, params, responseMapping });
                finalSlots = { ...finalSlots, ...r };
              }
              apiSuccess = true;
            } catch (err) {
              console.error(err);
              apiSuccess = false;
            }

            set(state => ({
              scenarioStates: {
                ...state.scenarioStates,
                [scenarioSessionId]: {
                  ...state.scenarioStates[scenarioSessionId],
                  slots: finalSlots,
                },
              },
            }));

            const nextNode = engine.getNextNode(currentNode.id, apiSuccess ? 'onSuccess' : 'onError', finalSlots);
            if (nextNode) currentNode = nextNode;
            else { isLoopActive = false; break; }
          } finally {
            get().setDelayLoading(false);
            get().updateScenarioStatus(scenarioSessionId, 'active');
          }
        }
      } else {
        isLoopActive = false;
        break;
      }
      await sleep(300);
    }

    // Final update
    const nextNode = engine.getNextNode(currentNode.id, null, get().scenarioStates[scenarioSessionId].slots);
    const isLast = !nextNode;
    const scenario = get().scenarioStates[scenarioSessionId];
    const messages = [...(scenario?.messages || [])];

    if (!messages.find(m => m.node?.id === currentNode.id)) {
      messages.push({
        id: currentNode.id,
        role: 'bot',
        sender: 'bot',
        text: currentNode.data?.content || currentNode.data?.title || '',
        node: currentNode,
        type: 'scenario_message',
      });
    }

    const finalPayload = {
      messages,
      status: isLast ? 'completed' : 'active',
      state: isLast ? null : {
        scenario_id: scenario.scenario_id,
        current_node_id: currentNode.id,
        awaiting_input: engine.isInteractiveNode(currentNode),
      },
      slots: scenario.slots || {},
    };

    set(state => ({
      scenarioStates: {
        ...state.scenarioStates,
        [scenarioSessionId]: { ...scenario, ...finalPayload }
      }
    }));

    try {
      const { user, currentConversationId } = get();
      await fetch(
        `${FASTAPI_BASE_URL}/conversations/${currentConversationId}/scenario-sessions/${scenarioSessionId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usr_id: user.uid, ...finalPayload }),
        }
      );
    } catch (error) {
      console.error(error);
    }
  },
});
