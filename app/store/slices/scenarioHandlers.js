// app/store/slices/scenarioHandlers.js
// 시나리오 이벤트 및 상호작용 핸들링 함수들

import { locales } from "../../lib/locales";
import { getErrorKey } from "../../lib/errorHandler";
import { logger } from "../../lib/logger";
import { FASTAPI_BASE_URL } from "../../lib/constants";
import { evaluateCondition } from "../../lib/scenarioHelpers";
import { getDeepValue, interpolateMessage } from "../../lib/chatbotEngine";
import { buildApiUrl, buildFetchOptions, interpolateObjectStrings } from "../../lib/nodeHandlers";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ✅ 헬퍼 함수: 노드 ID로 노드 찾기
const getNodeById = (nodes, nodeId) => {
  return nodes?.find(n => n.id === nodeId);
};

// ✅ 헬퍼 함수: 현재 노드에서 다음 노드 결정 (로컬 처리)
const getNextNode = (nodes, edges, currentNodeId, sourceHandle = null, slots = {}) => {
  if (!nodes || !edges || !currentNodeId) return null;

  // 현재 노드에서 출발하는 엣지 찾기
  const outgoingEdges = edges.filter(e => e.source === currentNodeId);

  if (outgoingEdges.length === 0) {
    console.log(`[getNextNode] No outgoing edges from node ${currentNodeId}`);
    return null;
  }

  console.log(`[getNextNode] Found ${outgoingEdges.length} outgoing edge(s) from node ${currentNodeId}`);
  console.log(`[getNextNode] sourceHandle provided: ${sourceHandle}`);
  console.log(`[getNextNode] Available edges:`, outgoingEdges.map(e => ({ source: e.source, sourceHandle: e.sourceHandle, target: e.target })));

  const sourceNode = getNodeById(nodes, currentNodeId);

  // --- 🔴 [NEW] Block A: Branch CONDITION 타입 조건 평가 ---
  if (sourceNode?.type === 'branch' && sourceNode.data?.evaluationType === 'CONDITION') {
    const conditions = sourceNode.data.conditions || [];
    for (const condition of conditions) {
      const slotValue = getDeepValue(slots, condition.slot);
      const valueToCompare = condition.valueType === 'slot' ? getDeepValue(slots, condition.value) : condition.value;
      if (evaluateCondition(slotValue, condition.operator, valueToCompare)) {
        console.log(`[getNextNode] Branch CONDITION met: ${condition.slot} ${condition.operator} ${valueToCompare}`);
        const condIdx = conditions.indexOf(condition);
        const handleId = sourceNode.data.replies?.[condIdx]?.value;
        if (handleId) {
          const edge = outgoingEdges.find(e => e.sourceHandle === handleId);
          if (edge) {
            const nextNode = getNodeById(nodes, edge.target);
            console.log(`[getNextNode] Next node (branch condition): ${nextNode?.id}`);
            return nextNode;
          }
        }
      }
    }
    // 조건 불일치 시 default 핸들
    const defaultEdge = outgoingEdges.find(e => e.sourceHandle === 'default');
    if (defaultEdge) {
      console.log(`[getNextNode] Branch default handle matched`);
      const nextNode = getNodeById(nodes, defaultEdge.target);
      console.log(`[getNextNode] Next node (default): ${nextNode?.id}`);
      return nextNode;
    }
  }

  // Case 1: 단순 흐름 (엣지가 1개)
  if (outgoingEdges.length === 1) {
    console.log(`[getNextNode] Single edge found, using it`);
    const nextNodeId = outgoingEdges[0].target;
    const nextNode = getNodeById(nodes, nextNodeId);
    console.log(`[getNextNode] Next node (single edge):`, nextNode?.id);
    return nextNode;
  }

  // Case 2: 분기 (sourceHandle로 구분)
  if (sourceHandle) {
    const selectedEdge = outgoingEdges.find(e => e.sourceHandle === sourceHandle);
    if (selectedEdge) {
      console.log(`[getNextNode] ✅ Found matching edge with sourceHandle: ${sourceHandle}`);
      const nextNode = getNodeById(nodes, selectedEdge.target);
      console.log(`[getNextNode] Next node (matching handle):`, nextNode?.id);
      return nextNode;
    } else {
      console.warn(`[getNextNode] ⚠️ No edge found for sourceHandle: ${sourceHandle}. Available handles:`, outgoingEdges.map(e => e.sourceHandle));
    }
  }

  // Case 3: 기본값 (첫 번째 엣지)
  console.log(`[getNextNode] Using first edge as fallback`);
  const nextNodeId = outgoingEdges[0].target;
  const nextNode = getNodeById(nodes, nextNodeId);
  console.log(`[getNextNode] Next node (fallback):`, nextNode?.id);
  return nextNode;
};

// ✅ 헬퍼 함수: 노드가 사용자 입력을 기다리는지 판정
const isInteractiveNode = (node) => {
  if (!node) return false;

  // message 타입: replies가 있으면 interactive, 없으면 non-interactive
  if (node.type === 'message') {
    const hasReplies = node.data?.replies && node.data.replies.length > 0;
    return hasReplies;
  }

  // ✅ form 노드: 기본적으로 interactive (사용자 입력 필요)
  if (node.type === 'form') {
    return true; // form은 항상 interactive
  }

  // ✅ branch 노드: evaluationType에 따라 구분
  // - BUTTON, BUTTON_CLICK: interactive (사용자 클릭 필요)
  // - SLOT_CONDITION, CONDITION: non-interactive (자동 평가)
  if (node.type === 'branch') {
    const evalType = node.data?.evaluationType;
    return evalType === 'BUTTON' || evalType === 'BUTTON_CLICK';
  }

  return node.type === 'slotfilling';
};

// ✅ 헬퍼 함수: 노드가 자동으로 진행되는 노드인지 판정
const isAutoPassthroughNode = (node) => {
  if (!node) return false;
  return (
    node.type === 'setSlot' ||
    node.type === 'set-slot' ||
    node.type === 'delay' ||
    node.type === 'api'
  );
};

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
      // --- [수정] ---

      setActivePanel("main");
      setForceScrollToBottom(true);

      if (showScenarioBubbles) {
        await addMessage("user", {
          type: "scenario_bubble",
          scenarioSessionId: newScenarioSessionId,
        });
      }

      // 🔴 [수정] 아래로 이동 (상태 초기화 이후)
      // get().subscribeToScenarioSession(newScenarioSessionId);

      // ✅ [NEW] scenariosForConversation에 새로운 시나리오 세션 추가 (목록 맨 아래)
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

      // ✅ [NEW] 프론트엔드에서 첫 번째 노드 결정
      const firstNodeId = scenarioData.start_node_id || scenarioData.nodes[0].id;
      const firstNode = getNodeById(scenarioData.nodes, firstNodeId);
      console.log(`[openScenarioPanel] First node:`, firstNode);

      // ✅ [NEW] 시나리오 상태 초기화 (nodes/edges 포함) - 반드시 setActivePanel 전에!
      set(state => {
        const updatedState = {
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
                sender: 'bot',
                text: firstNode.data?.content || firstNode.data?.title || '', // 🔴 [NEW] title 폴백 추가
                node: firstNode,
                type: 'scenario_message',  // ✅ 메타데이터 추가
              }] : [],
              state: {
                scenario_id: scenarioId,
                current_node_id: firstNodeId,
                awaiting_input: isInteractiveNode(firstNode),
              },
              isLoading: false,  // ✅ 로딩 상태 해제
            },
          },
        };
        console.log(`[openScenarioPanel] ✅ Scenario state initialized:`, {
          sessionId: newScenarioSessionId,
          firstNodeId,
          firstNodeType: firstNode?.type,
          firstNodeContent: firstNode?.data?.content,
          firstNodeTitle: firstNode?.data?.title,
          messagesCreated: updatedState.scenarioStates[newScenarioSessionId].messages,
        });
        return updatedState;
      });

      // ✅ [NEW] 상태 업데이트 완료 대기
      await sleep(100);
      const savedScenario = get().scenarioStates[newScenarioSessionId];
      console.log(`[openScenarioPanel] ✅ Saved scenario state:`, savedScenario);

      // ✅ [NEW] 상태 초기화 완료 후 패널 활성화
      console.log(`[openScenarioPanel] Activating scenario panel with session ID:`, newScenarioSessionId);
      await setActivePanel("scenario", newScenarioSessionId);
      console.log(`[openScenarioPanel] ✅ Scenario panel activated`);

      // ✅ [NEW] 자동 진행 필요 여부 판정
      const shouldAutoProgress = firstNode && (isAutoPassthroughNode(firstNode) || !isInteractiveNode(firstNode));

      if (shouldAutoProgress) {
        const reason = isAutoPassthroughNode(firstNode) ? 'auto-passthrough' : 'no-replies';
        console.log(`[openScenarioPanel] First node should auto-progress (${reason}), continuing...`);
        await sleep(300);
        await get().continueScenarioIfNeeded(firstNode, newScenarioSessionId);
      } else {
        console.log(`[openScenarioPanel] First node is interactive (has replies), waiting for user.`);
      }

      // ✅ [NEW] 구독 시작 (모든 초기화 완료 후)
      get().subscribeToScenarioSession(newScenarioSessionId);

      return;


      // --- [기존 코드 제거] FastAPI /chat 호출 더 이상 불필요 ---

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
            `${FASTAPI_BASE_URL}/conversations/${conversationId}/scenario-sessions/${newScenarioSessionId}`,
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
            console.log(
              `Removed scenario bubble from main chat for session: ${newScenarioSessionId}`
            );
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
      console.warn(`handleScenarioResponse called for non-existent session: ${scenarioSessionId}`);
      showEphemeralToast(locales[language]?.errorUnexpected || 'An unexpected error occurred.', 'error');
      return;
    }

    const { nodes, edges } = currentScenario;
    if (!nodes || !edges) {
      console.warn(`handleScenarioResponse: Scenario session missing nodes/edges.`);
      return;
    }

    const existingMessages = Array.isArray(currentScenario.messages) ? currentScenario.messages : [];
    const currentNodeId = currentScenario.state?.current_node_id;
    const currentNode = getNodeById(nodes, currentNodeId);

    console.log(`[handleScenarioResponse] Called with payload:`, {
      scenarioSessionId,
      sourceHandle: payload.sourceHandle,
      userInput: payload.userInput,
      formData: payload.formData
    });

    set(state => ({
      scenarioStates: { ...state.scenarioStates, [scenarioSessionId]: { ...currentScenario, isLoading: true } }
    }));

    try {
      let newMessages = [...existingMessages];

      // ✅ [NEW] 사용자 입력 추가
      if (payload.userInput) {
        console.log(`[handleScenarioResponse] Adding user message:`, payload.userInput);
        newMessages.push({
          id: `user-${Date.now()}`,
          sender: 'user',
          text: payload.userInput,
          type: 'scenario_message',  // ✅ 메타데이터 추가
        });
      }

      // ✅ [NEW] formData가 있으면 먼저 슬롯에 병합
      const updatedSlots = payload.formData
        ? { ...currentScenario.slots, ...payload.formData }
        : currentScenario.slots;

      // ✅ [NEW] 프론트엔드에서 다음 노드 결정 (slots 전달)
      console.log(`[handleScenarioResponse] Getting next node from currentNodeId: ${currentNodeId}`);
      const nextNode = getNextNode(nodes, edges, currentNodeId, payload.sourceHandle, updatedSlots);
      console.log(`[handleScenarioResponse] Result -> Current node: ${currentNodeId}, Next node: ${nextNode?.id || 'END'} (type: ${nextNode?.type})`);

      if (!nextNode) {
        // 시나리오 종료
        console.log(`[handleScenarioResponse] ✅ No next node, scenario complete.`);
        newMessages.push({
          id: `bot-complete-${Date.now()}`,
          sender: 'bot',
          text: locales[language]?.scenarioComplete || 'Scenario complete.',
          type: 'scenario_message',  // ✅ 메타데이터 추가
        });

        const updatePayload = {
          messages: newMessages,
          status: 'completed',
          state: null,
          slots: currentScenario.slots,
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
        ).then(r => {
          if (!r.ok) console.warn(`[handleScenarioResponse] Session PATCH failed (${r.status}), continuing...`);
          else return r.json();
        });

        // 🔴 [NEW] 완료 상태를 store에 업데이트
        set(state => {
          // ✅ [NEW] scenariosForConversation도 함께 업데이트
          const updatedScenarios = state.scenariosForConversation?.[currentConversationId]?.map(s =>
            s.sessionId === scenarioSessionId ? { ...s, status: 'completed' } : s
          ) || [];

          return {
            scenarioStates: {
              ...state.scenarioStates,
              [scenarioSessionId]: {
                ...state.scenarioStates[scenarioSessionId],
                messages: newMessages,
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

      // 다음 노드 메시지 추가
      if (nextNode.type !== 'setSlot' && nextNode.type !== 'set-slot') {
        newMessages.push({
          id: nextNode.id,
          sender: 'bot',
          text: nextNode.data?.content || nextNode.data?.title || '', // 🔴 [NEW] title 폴백 추가
          node: nextNode,
          type: 'scenario_message',  // ✅ 메타데이터 추가
        });
      }

      // ✅ [NEW] 상태 업데이트
      const updatePayload = {
        messages: newMessages,
        status: 'active',
        state: {
          scenario_id: currentScenario.scenario_id,
          current_node_id: nextNode.id,
          awaiting_input: isInteractiveNode(nextNode),
        },
        slots: payload.formData ? { ...currentScenario.slots, ...(payload.formData || {}) } : currentScenario.slots,
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
      ).then(r => {
        if (!r.ok) console.warn(`[handleScenarioResponse] Session PATCH failed (${r.status}), continuing...`);
        else return r.json();
      });

      // 🔴 [NEW] 상태를 먼저 업데이트해야 continueScenarioIfNeeded에서 올바른 상태를 사용
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

      // ✅ [NEW] 구독 시작 (상태 초기화 완료 후)
      get().subscribeToScenarioSession(scenarioSessionId);

      // ✅ [NEW] 다음 노드가 비대화형이면 자동 진행
      if (!isInteractiveNode(nextNode)) {
        await sleep(300);
        await get().continueScenarioIfNeeded(nextNode, scenarioSessionId);
      }

    } catch (error) {
      console.error(`Error handling scenario response for ${scenarioSessionId}:`, error);
      const errorKey = getErrorKey(error);
      const errorMessage = locales[language]?.[errorKey] || 'An error occurred during the scenario.';
      showEphemeralToast(errorMessage, 'error');

      const errorMessages = [...existingMessages, { id: `bot-error-${Date.now()}`, sender: 'bot', text: errorMessage }];
      try {
        await fetch(
          `${FASTAPI_BASE_URL}/conversations/${currentConversationId}/scenario-sessions/${scenarioSessionId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              usr_id: user.uid,
              messages: errorMessages,
              status: 'failed',
              state: null,
              slots: currentScenario.slots || {}
            }),
          }
        ).then(r => {
          if (!r.ok) console.warn(`[handleScenarioResponse] Session PATCH failed (${r.status}), continuing...`);
          else return r.json();
        });

        endScenario(scenarioSessionId, 'failed');
      } catch (updateError) {
        console.error(`Failed to update scenario status to failed for ${scenarioSessionId}:`, updateError);
        set(state => ({
          scenarioStates: {
            ...state.scenarioStates,
            [scenarioSessionId]: {
              ...(state.scenarioStates[scenarioSessionId] || {}),
              messages: errorMessages,
              status: 'failed',
              state: null,
              isLoading: false
            }
          }
        }));
        endScenario(scenarioSessionId, 'failed');
      }
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
    if (!lastNode || !scenarioSessionId) {
      console.warn("continueScenarioIfNeeded: lastNode or scenarioSessionId is missing.");
      return;
    }

    const currentScenario = get().scenarioStates[scenarioSessionId];
    if (!currentScenario) {
      console.warn(`continueScenarioIfNeeded: Scenario session ${scenarioSessionId} not found.`);
      return;
    }

    const { nodes, edges } = currentScenario;
    if (!nodes || !edges) {
      console.warn(`continueScenarioIfNeeded: Scenario session missing nodes/edges.`);
      return;
    }

    console.log(`[continueScenarioIfNeeded] Starting from node: ${lastNode.id} (${lastNode.type})`);

    let currentNode = lastNode;
    let isLoopActive = true;
    let loopCount = 0;
    const MAX_LOOP_ITERATIONS = 100; // 무한 루프 방지

    // ✅ [NEW] 프론트엔드에서 비대화형 노드들을 자동으로 진행
    while (isLoopActive && loopCount < MAX_LOOP_ITERATIONS) {
      loopCount++;
      console.log(`[continueScenarioIfNeeded] Loop iteration ${loopCount}, node: ${currentNode.id} (${currentNode.type})`);

      // 대화형 노드라면 종료 (사용자 입력 대기)
      if (isInteractiveNode(currentNode)) {
        console.log(`[continueScenarioIfNeeded] ✅ Reached interactive node: ${currentNode.id} (${currentNode.type}), stopping.`);

        // 🔴 [NEW] 대화형 노드에 도달했을 때 현재 상태를 서버에 저장
        const currentScenario = get().scenarioStates[scenarioSessionId];
        if (currentScenario) {
          try {
            const { user, currentConversationId } = get();
            await fetch(
              `${FASTAPI_BASE_URL}/conversations/${currentConversationId}/scenario-sessions/${scenarioSessionId}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  usr_id: user.uid,
                  messages: currentScenario.messages || [],
                  status: 'active',
                  state: {
                    scenario_id: currentScenario.scenario_id,
                    current_node_id: currentNode.id,
                    awaiting_input: true,
                  },
                  slots: currentScenario.slots || {},
                }),
              }
            ).then(r => {
              if (!r.ok) console.warn(`[continueScenarioIfNeeded] Final state PATCH failed (${r.status})`);
              else console.log(`[continueScenarioIfNeeded] ✅ Final state saved to server before user input`);
            });
          } catch (error) {
            console.error(`[continueScenarioIfNeeded] Error saving final state:`, error);
          }
        }

        // ✅ 다음 노드가 없으면 시나리오 완료 처리
        const nextNode = getNextNode(nodes, edges, currentNode.id, null, currentScenario.slots);
        if (!nextNode) {
          console.log(`[continueScenarioIfNeeded] Last interactive node reached, completing scenario.`);
          set(state => {
            const scenario = state.scenarioStates[scenarioSessionId];
            if (!scenario) return state;

            return {
              scenarioStates: {
                ...state.scenarioStates,
                [scenarioSessionId]: {
                  ...scenario,
                  status: 'completed',
                  state: {
                    scenario_id: scenario.scenario_id,
                    current_node_id: currentNode.id,
                    awaiting_input: false,
                  },
                },
              },
            };
          });
        }

        isLoopActive = false;
        break;
      }

      // 종료 노드라면 시나리오 끝
      if (currentNode.id === 'end' || currentNode.type === 'end') {
        console.log(`[continueScenarioIfNeeded] ✅ Reached end node, scenario complete.`);

        // 🔴 [NEW] 종료 전 최종 상태 저장
        const currentScenario = get().scenarioStates[scenarioSessionId];
        if (currentScenario) {
          try {
            const { user, currentConversationId } = get();
            await fetch(
              `${FASTAPI_BASE_URL}/conversations/${currentConversationId}/scenario-sessions/${scenarioSessionId}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  usr_id: user.uid,
                  messages: currentScenario.messages || [],
                  status: 'completed',
                  state: null,
                  slots: currentScenario.slots || {},
                }),
              }
            ).then(r => {
              if (!r.ok) console.warn(`[continueScenarioIfNeeded] End node state PATCH failed (${r.status})`);
              else console.log(`[continueScenarioIfNeeded] ✅ End node state saved to server`);
            });
          } catch (error) {
            console.error(`[continueScenarioIfNeeded] Error saving end node state:`, error);
          }
        }

        isLoopActive = false;
        break;
      }

      // 자동 진행 가능한 노드 처리
      // 1. replies가 없는 message 노드 (단순 표시만 하고 넘어감)
      if (currentNode.type === 'message' && !isInteractiveNode(currentNode)) {
        console.log(`[continueScenarioIfNeeded] Message node without replies (${currentNode.id}), auto-advancing...`);

        // ✅ 메시지 추가 및 서버에 저장
        const currentScenario = get().scenarioStates[scenarioSessionId];
        if (currentScenario) {
          const messages = [...(currentScenario.messages || [])];
          if (!messages.find(m => m.node?.id === currentNode.id)) {
            messages.push({
              id: currentNode.id,
              sender: 'bot',
              text: currentNode.data?.content || currentNode.data?.title || '', // 🔴 [NEW] title 폴백 추가
              node: currentNode,
              type: 'scenario_message',
            });
          }

          // 🔴 로컬 상태 업데이트
          set(state => ({
            scenarioStates: {
              ...state.scenarioStates,
              [scenarioSessionId]: {
                ...state.scenarioStates[scenarioSessionId],
                messages,
                state: {
                  scenario_id: currentScenario.scenario_id,
                  current_node_id: currentNode.id,
                  awaiting_input: false,
                },
              },
            },
          }));

          // 🔴 [NEW] 서버에 저장 (매 노드마다)
          try {
            const { user, currentConversationId } = get();
            await fetch(
              `${FASTAPI_BASE_URL}/conversations/${currentConversationId}/scenario-sessions/${scenarioSessionId}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  usr_id: user.uid,
                  messages: messages,
                  status: 'active',
                  state: {
                    scenario_id: currentScenario.scenario_id,
                    current_node_id: currentNode.id,
                    awaiting_input: false,
                  },
                  slots: currentScenario.slots || {},
                }),
              }
            ).then(r => {
              if (!r.ok) console.warn(`[continueScenarioIfNeeded] Session PATCH failed (${r.status}), continuing...`);
              else console.log(`[continueScenarioIfNeeded] ✅ Node state saved to server: ${currentNode.id}`);
            });
          } catch (error) {
            console.error(`[continueScenarioIfNeeded] Error saving node state to server:`, error);
          }
        }

        const nextNode = getNextNode(nodes, edges, currentNode.id, null, currentScenario.slots);
        if (nextNode) {
          console.log(`[continueScenarioIfNeeded] Next node from edge: ${nextNode.id}`);
          currentNode = nextNode;
        } else {
          console.log(`[continueScenarioIfNeeded] No next node from edges, scenario complete.`);

          // 🔴 [NEW] 시나리오 완료 메시지 추가
          const currentScenarioState = get().scenarioStates[scenarioSessionId];
          if (currentScenarioState) {
            const messages = [...(currentScenarioState.messages || [])];
            const { language } = get();
            messages.push({
              id: `bot-complete-${Date.now()}`,
              sender: 'bot',
              text: locales[language]?.scenarioComplete || 'Scenario has ended.',
              type: 'scenario_message',
            });

            set(state => {
              // ✅ [NEW] scenariosForConversation도 함께 업데이트
              const updatedScenarios = state.scenariosForConversation?.[currentScenarioState.conversation_id]?.map(s =>
                s.sessionId === scenarioSessionId ? { ...s, status: 'completed' } : s
              ) || [];

              return {
                scenarioStates: {
                  ...state.scenarioStates,
                  [scenarioSessionId]: {
                    ...state.scenarioStates[scenarioSessionId],
                    messages,
                    status: 'completed',
                  },
                },
                scenariosForConversation: {
                  ...state.scenariosForConversation,
                  [currentScenarioState.conversation_id]: updatedScenarios,
                },
              };
            });
          }

          isLoopActive = false;
          break;
        }
      }
      // ✅ [NEW] Branch 노드 자동 평가 (CONDITION, SLOT_CONDITION만 - BUTTON/BUTTON_CLICK은 제외)
      else if (currentNode.type === 'branch' &&
        currentNode.data?.evaluationType !== 'BUTTON' &&
        currentNode.data?.evaluationType !== 'BUTTON_CLICK') {
        console.log(`[continueScenarioIfNeeded] Branch node (${currentNode.data?.evaluationType}), auto-evaluating...`);

        // 조건 평가해서 다음 노드 결정
        const nextNode = getNextNode(nodes, edges, currentNode.id, null, currentScenario.slots);
        if (nextNode) {
          console.log(`[continueScenarioIfNeeded] Branch evaluated, next node: ${nextNode.id}`);
          currentNode = nextNode;
        } else {
          console.log(`[continueScenarioIfNeeded] Branch: no next node, stopping.`);
          isLoopActive = false;
          break;
        }
      }
      // 2. 자동 처리 노드 (delay, setSlot, api)
      else if (isAutoPassthroughNode(currentNode)) {
        console.log(`[continueScenarioIfNeeded] Auto-passthrough node (${currentNode.type}), processing...`);

        // 🔴 [NEW] Delay 노드는 프론트엔드에서 처리
        if (currentNode.type === 'delay') {
          console.log(`[continueScenarioIfNeeded] Delay node, waiting...`);

          get().setDelayLoading(true);
          await sleep(currentNode.data?.duration || currentNode.data?.delay_ms || currentNode.data?.delayMs || 1000);
          get().setDelayLoading(false);

          const nextNode = getNextNode(nodes, edges, currentNode.id, null, currentScenario.slots);
          if (nextNode) {
            console.log(`[continueScenarioIfNeeded] After delay, next node: ${nextNode.id}`);
            currentNode = nextNode;
          } else {
            console.log(`[continueScenarioIfNeeded] No next node after delay, stopping.`);
            isLoopActive = false;
            break;
          }
        }
        // setSlot 노드도 프론트엔드에서 처리 (상태만 업데이트)
        else if (currentNode.type === 'setSlot' || currentNode.type === 'set-slot') {
          console.log(`[continueScenarioIfNeeded] SetSlot node, updating slots...`);
          console.log(`[continueScenarioIfNeeded] SetSlot data:`, currentNode.data);

          // slots 업데이트 (assignments 배열 처리)
          const assignments = currentNode.data?.assignments || [];
          if (assignments.length > 0) {
            const currentScenario = get().scenarioStates[scenarioSessionId];
            if (currentScenario) {
              const updatedSlots = { ...currentScenario.slots };

              // 각 assignment 처리
              assignments.forEach(assignment => {
                const key = assignment.key;
                let value = assignment.value;

                // {{slotName}} 보간 처리 (interpolateMessage가 중첩 참조까지 처리)
                value = interpolateMessage(value, currentScenario.slots);

                updatedSlots[key] = value;
                console.log(`[continueScenarioIfNeeded] SetSlot updated: ${key} = ${value}`);
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

          const nextNode = getNextNode(nodes, edges, currentNode.id, null, currentScenario.slots);
          if (nextNode) {
            console.log(`[continueScenarioIfNeeded] After setSlot, next node: ${nextNode.id}`);
            currentNode = nextNode;
          } else {
            console.log(`[continueScenarioIfNeeded] No next node after setSlot, stopping.`);
            isLoopActive = false;
            break;
          }
        }
        // ✅ [NEW] API 노드는 프론트엔드에서 직접 처리
        else if (currentNode.type === 'api') {
          console.log(`[continueScenarioIfNeeded] API node, executing directly...`);

          try {
            const { method, url, headers, body, params, responseMapping, isMulti, apis } = currentNode.data;
            let isSuccess = false;
            let updatedSlots = { ...currentScenario.slots };

            // ✅ [NEW] API 로딩 시작
            get().setDelayLoading(true);

            // 단일 API 호출 처리
            const executeSingleApi = async (apiConfig) => {
              const targetUrl = buildApiUrl(apiConfig.url, apiConfig.method === 'GET' ? apiConfig.params : null, currentScenario.slots);
              const { options, debugBody } = buildFetchOptions(apiConfig.method, apiConfig.headers, apiConfig.body, currentScenario.slots);

              console.log(`[continueScenarioIfNeeded] API request:`, { url: targetUrl, method: apiConfig.method, body: debugBody });

              const response = await fetch(targetUrl, options);
              const responseText = await response.text();

              if (!response.ok) {
                throw new Error(`API request failed: ${response.status}. URL: ${targetUrl}. Response: ${responseText}`);
              }

              const result = responseText ? JSON.parse(responseText) : null;
              console.log(`[continueScenarioIfNeeded] API response:`, result);
              return { result, mapping: apiConfig.responseMapping };
            };

            // API 실행
            try {
              let results = [];
              if (isMulti && Array.isArray(apis)) {
                const settledResults = await Promise.allSettled(apis.map(api => executeSingleApi(api)));
                const fulfilled = settledResults.filter(r => r.status === 'fulfilled').map(r => r.value);
                const rejected = settledResults.filter(r => r.status === 'rejected');
                if (rejected.length > 0) throw rejected[0].reason;
                results = fulfilled;
              } else if (!isMulti) {
                const singleConfig = { url, method, headers, body, params, responseMapping };
                results.push(await executeSingleApi(singleConfig));
              } else {
                throw new Error("Invalid API node configuration: isMulti is true but 'apis' array is missing.");
              }

              // 결과 매핑
              const mappedSlots = {};
              results.forEach(({ result, mapping }) => {
                if (mapping && mapping.length > 0) {
                  mapping.forEach(m => {
                    if (m.slot && typeof m.slot === 'string' && m.slot.trim() !== '') {
                      const value = getDeepValue(result, m.path);
                      if (value !== undefined) {
                        mappedSlots[m.slot] = value;
                        console.log(`[continueScenarioIfNeeded] Mapped ${m.path} -> ${m.slot} = ${JSON.stringify(value)}`);
                      }
                    }
                  });
                }
              });

              updatedSlots = { ...updatedSlots, ...mappedSlots };
              isSuccess = true;

            } catch (apiError) {
              console.error(`[continueScenarioIfNeeded] API execution error:`, apiError);
              updatedSlots['apiError'] = apiError.message;
              updatedSlots['apiFailed'] = true;
              isSuccess = false;
            } finally {
              // ✅ [NEW] API 로딩 종료
              get().setDelayLoading(false);
            }

            // 슬롯 업데이트
            set(state => ({
              scenarioStates: {
                ...state.scenarioStates,
                [scenarioSessionId]: {
                  ...state.scenarioStates[scenarioSessionId],
                  slots: updatedSlots,
                },
              },
            }));
            currentScenario.slots = updatedSlots;

            // 다음 노드 결정 (onSuccess/onError handle 사용)
            const nextNode = getNextNode(nodes, edges, currentNode.id, isSuccess ? 'onSuccess' : 'onError', updatedSlots);
            if (nextNode) {
              currentNode = nextNode;
              console.log(`[continueScenarioIfNeeded] After API (${isSuccess ? 'success' : 'error'}), next node: ${currentNode.id}`);
            } else {
              console.log(`[continueScenarioIfNeeded] No next node from API, stopping.`);
              isLoopActive = false;
              break;
            }

          } catch (error) {
            console.error(`[continueScenarioIfNeeded] Error processing API node:`, error);
            const { language, showEphemeralToast } = get();
            const message = locales[language]?.['errorServer'] || 'API call failed.';
            showEphemeralToast(message, 'error');
            isLoopActive = false;
            break;
          }
        }
      } else {
        // 그 외 노드는 진행 불가
        console.log(`[continueScenarioIfNeeded] Unknown node type (${currentNode.type}), stopping.`);
        isLoopActive = false;
        break;
      }

      // 지연 처리 (UI 반응성 유지)
      await sleep(300);
    }

    if (loopCount >= MAX_LOOP_ITERATIONS) {
      console.error(`[continueScenarioIfNeeded] Loop limit reached, potential infinite loop detected!`);
      const { showEphemeralToast, endScenario } = get();
      showEphemeralToast('Scenario loop limit exceeded', 'error');
      endScenario(scenarioSessionId, 'failed');
      return;
    }

    // ✅ [NEW] 최종 상태 업데이트 (로컬 상태)
    const nextNode = getNextNode(nodes, edges, currentNode.id, null, currentScenario.slots);
    const isLastNode = !nextNode;

    const scenarioState = get().scenarioStates[scenarioSessionId];
    const messages = [...(scenarioState?.messages || [])];
    if (!messages.find(m => m.node?.id === currentNode.id)) {
      messages.push({
        id: currentNode.id,
        sender: 'bot',
        text: currentNode.data?.content || currentNode.data?.title || '',
        node: currentNode,
        type: 'scenario_message',
      });
    }

    set(state => {
      const scenario = state.scenarioStates[scenarioSessionId];
      if (!scenario) return state;

      return {
        scenarioStates: {
          ...state.scenarioStates,
          [scenarioSessionId]: {
            ...scenario,
            messages,
            status: isLastNode ? 'completed' : 'active',
            state: {
              scenario_id: scenario.scenario_id,
              current_node_id: currentNode.id,
              awaiting_input: isLastNode ? false : isInteractiveNode(currentNode),
            },
          },
        },
      };
    });

    // ✅ [NEW] 백엔드에도 업데이트 저장
    try {
      const { user, currentConversationId } = get();
      const payload = {
        messages,
        state: {
          scenario_id: scenarioState.scenario_id,
          current_node_id: currentNode.id,
          awaiting_input: isLastNode ? false : isInteractiveNode(currentNode),
        },
        slots: scenarioState.slots || {},
        status: isLastNode ? 'completed' : 'active',
      };

      const response = await fetch(
        `${FASTAPI_BASE_URL}/conversations/${currentConversationId}/scenario-sessions/${scenarioSessionId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            usr_id: user.uid,
            ...payload
          }),
        }
      );

      if (!response.ok) {
        console.warn(`[continueScenarioIfNeeded] Failed to save auto-progress state to backend: ${response.status}`);
      } else {
        console.log(`[continueScenarioIfNeeded] ✅ Auto-progress state saved to backend at node: ${currentNode.id}`);
      }
    } catch (error) {
      console.error(`[continueScenarioIfNeeded] Error saving auto-progress state:`, error);
    }

    if (!nextNode) {
      console.log(`[continueScenarioIfNeeded] ✅ Scenario completed at last node: ${currentNode.id}`);
    } else {
      console.log(`[continueScenarioIfNeeded] ✅ Auto-continue complete, stopped at node: ${currentNode.id}`);
    }
  },
});
