// app/lib/scenarioHelpers.js
// 시나리오 엔진 헬퍼 함수들

import { getDeepValue } from "./chatbotEngine";

/**
 * 조건을 평가합니다.
 */
export const evaluateCondition = (slotValue, operator, conditionValue) => {
  const lowerCaseConditionValue = String(conditionValue ?? '').toLowerCase();
  const boolConditionValue = lowerCaseConditionValue === 'true';
  const boolSlotValue = String(slotValue ?? '').toLowerCase() === 'true';

  if (lowerCaseConditionValue === 'true' || lowerCaseConditionValue === 'false') {
    switch (operator) {
      case '==': return boolSlotValue === boolConditionValue;
      case '!=': return boolSlotValue !== boolConditionValue;
      default: return false;
    }
  }

  const numSlotValue = slotValue !== null && slotValue !== undefined && slotValue !== '' ? parseFloat(slotValue) : NaN;
  const numConditionValue = conditionValue !== null && conditionValue !== undefined && conditionValue !== '' ? parseFloat(conditionValue) : NaN;
  const bothAreNumbers = !isNaN(numSlotValue) && !isNaN(numConditionValue);

  switch (operator) {
    case '==': return String(slotValue ?? '') == String(conditionValue ?? '');
    case '!=': return String(slotValue ?? '') != String(conditionValue ?? '');
    case '>': return bothAreNumbers && numSlotValue > numConditionValue;
    case '<': return bothAreNumbers && numSlotValue < numConditionValue;
    case '>=': return bothAreNumbers && numSlotValue >= numConditionValue;
    case '<=': return bothAreNumbers && numSlotValue <= numConditionValue;
    case 'contains': return slotValue != null && String(slotValue).includes(String(conditionValue ?? ''));
    case '!contains': return slotValue == null || !String(slotValue).includes(String(conditionValue ?? ''));
    default:
      console.warn(`Unsupported operator used in condition: ${operator}`);
      return false;
  }
};

// ✅ 헬퍼 함수: 노드 ID로 노드 찾기
export const getNodeById = (nodes, nodeId) => {
  return nodes?.find(n => n.id === nodeId);
};

// ✅ 헬퍼 함수: 현재 노드에서 다음 노드 결정 (로컬 처리)
export const getNextNode = (nodes, edges, currentNodeId, sourceHandle = null, slots = {}) => {
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
export const isInteractiveNode = (node) => {
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
export const isAutoPassthroughNode = (node) => {
  if (!node) return false;
  return (
    node.type === 'setSlot' ||
    node.type === 'set-slot' ||
    node.type === 'delay' ||
    node.type === 'api'
  );
};
