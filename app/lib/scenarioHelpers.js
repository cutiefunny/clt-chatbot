// app/lib/scenarioHelpers.js
// 시나리오 엔진 헬퍼 함수들

import { getDeepValue } from './chatbotEngine';

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

/**
 * 시나리오의 시작 노드를 찾습니다.
 */
export const findStartNode = (scenario) => {
  if (scenario.startNodeId) {
    const startNode = scenario.nodes.find(node => node.id === scenario.startNodeId);
    if (startNode) return startNode;
    console.warn(`Specified startNodeId "${scenario.startNodeId}" not found.`);
  }
  
  const edgeTargets = new Set(scenario.edges.map(edge => edge.target));
  const defaultStartNode = scenario.nodes.find(node => !edgeTargets.has(node.id));
  if (defaultStartNode) return defaultStartNode;

  console.error("Could not determine the start node.");
  return null;
};

/**
 * LLM 노드의 조건부 분기 엣지를 찾습니다.
 */
export const findLlmConditionEdge = (scenario, sourceNode, currentNodeId, slots) => {
  if (sourceNode.type !== 'llm' || !Array.isArray(sourceNode.data.conditions) || sourceNode.data.conditions.length === 0) {
    return null;
  }

  const llmOutput = String(slots[sourceNode.data.outputVar] || '').toLowerCase();
  const matchedCondition = sourceNode.data.conditions.find(cond =>
    cond.keyword && llmOutput.includes(String(cond.keyword).toLowerCase())
  );
  
  if (matchedCondition) {
    const edge = scenario.edges.find(edge => edge.source === currentNodeId && edge.sourceHandle === matchedCondition.id);
    if (edge) console.log(`LLM condition matched: ${matchedCondition.keyword}, Edge: ${edge.id}`);
    return edge;
  }
  
  return null;
};

/**
 * branch 노드의 조건부 분기 엣지를 찾습니다.
 */
export const findBranchConditionEdge = (scenario, sourceNode, currentNodeId, slots) => {
  if (sourceNode.type !== 'branch' || sourceNode.data.evaluationType !== 'CONDITION') {
    return null;
  }

  const conditions = sourceNode.data.conditions || [];
  for (const condition of conditions) {
    const slotValue = getDeepValue(slots, condition.slot);
    const valueToCompare = condition.valueType === 'slot' ? getDeepValue(slots, condition.value) : condition.value;

    if (evaluateCondition(slotValue, condition.operator, valueToCompare)) {
      const conditionIndex = conditions.indexOf(condition);
      const handleId = sourceNode.data.replies?.[conditionIndex]?.value;
      if (handleId) {
        const edge = scenario.edges.find(edge => edge.source === currentNodeId && edge.sourceHandle === handleId);
        if (edge) {
          console.log(`Branch condition met: Slot ${condition.slot} ${condition.operator} ${valueToCompare}, Handle: ${handleId}, Edge: ${edge.id}`);
          return edge;
        }
      }
    }
  }
  
  const defaultEdge = scenario.edges.find(edge => edge.source === currentNodeId && edge.sourceHandle === 'default');
  if (defaultEdge) console.log(`Branch default handle matched, Edge: ${defaultEdge.id}`);
  return defaultEdge;
};

/**
 * 명시적 sourceHandleId가 있는 엣지를 찾습니다.
 */
export const findHandleEdge = (scenario, currentNodeId, sourceHandleId) => {
  if (!sourceHandleId) return null;
  
  const edge = scenario.edges.find(edge => edge.source === currentNodeId && edge.sourceHandle === sourceHandleId);
  if (edge) console.log(`Source handle matched: ${sourceHandleId}, Edge: ${edge.id}`);
  return edge;
};

/**
 * 기본/fallback 엣지를 찾습니다.
 */
export const findDefaultEdge = (scenario, sourceNode, currentNodeId, sourceHandleId) => {
  if (sourceHandleId) return null;
  
  const edge = scenario.edges.find(edge => edge.source === currentNodeId && !edge.sourceHandle);
  if (edge) {
    const logType = sourceNode.type === 'branch' ? 'Branch no handle (fallback)' : `Default edge (no handle) matched for node type ${sourceNode.type}`;
    console.log(`${logType}, Edge: ${edge.id}`);
  }
  return edge;
};

/**
 * 노드가 대화형(interactive)인지 판단합니다.
 */
export const isInteractiveNode = (node) => {
  return node.type === "slotfilling" || 
         node.type === "form" || 
         (node.type === "branch" && node.data?.evaluationType !== "CONDITION");
};
