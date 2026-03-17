"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatbotEngine = void 0;
class ChatbotEngine {
    constructor(scenario) {
        this.scenario = scenario;
    }
    getNodeById(nodeId) {
        return this.scenario.nodes.find(n => n.id === nodeId);
    }
    interpolateMessage(message, slots) {
        if (typeof message !== 'string')
            return String(message ?? '');
        return message.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
            const val = this.getDeepValue(slots, path.trim());
            return val !== undefined && val !== null ? String(val) : `{{${path}}}`;
        });
    }
    getDeepValue(obj, path) {
        if (!path || typeof path !== 'string')
            return undefined;
        // [0] 형태의 배열 접근을 .0 형태로 정규화하고 불필요한 공백을 제거합니다.
        const normalizedPath = path.replace(/\[(\w+)\]/g, '.$1').replace(/^\./, '');
        const keys = normalizedPath.split('.').filter(k => k.trim() !== '').map(k => k.trim());
        let current = obj;
        for (const key of keys) {
            if (current === null || current === undefined)
                return undefined;
            current = current[key];
        }
        return current;
    }
    evaluateCondition(slotValue, operator, conditionValue) {
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
    }
    getNextNode(currentNodeId, sourceHandle = null, slots = {}) {
        const { nodes, edges } = this.scenario;
        const outgoingEdges = edges.filter(e => e.source === currentNodeId);
        if (outgoingEdges.length === 0)
            return null;
        const sourceNode = this.getNodeById(currentNodeId);
        // Branch node with CONDITION evaluation
        if (sourceNode?.type === 'branch' && sourceNode.data?.evaluationType === 'CONDITION') {
            const conditions = sourceNode.data.conditions || [];
            for (const condition of conditions) {
                const slotValue = this.getDeepValue(slots, condition.slot);
                const valueToCompare = condition.valueType === 'slot' ? this.getDeepValue(slots, condition.value) : condition.value;
                if (this.evaluateCondition(slotValue, condition.operator, valueToCompare)) {
                    const condIdx = conditions.indexOf(condition);
                    const handleId = sourceNode.data.replies?.[condIdx]?.value;
                    if (handleId) {
                        const edge = outgoingEdges.find(e => e.sourceHandle === handleId);
                        if (edge)
                            return this.getNodeById(edge.target) || null;
                    }
                }
            }
            const defaultEdge = outgoingEdges.find(e => e.sourceHandle === 'default');
            if (defaultEdge)
                return this.getNodeById(defaultEdge.target) || null;
        }
        // Single edge case
        if (outgoingEdges.length === 1) {
            return this.getNodeById(outgoingEdges[0].target) || null;
        }
        // Explicit sourceHandle case
        if (sourceHandle) {
            const selectedEdge = outgoingEdges.find(e => e.sourceHandle === sourceHandle);
            if (selectedEdge)
                return this.getNodeById(selectedEdge.target) || null;
        }
        // Fallback to first edge
        return this.getNodeById(outgoingEdges[0].target) || null;
    }
    isInteractiveNode(node) {
        if (!node)
            return false;
        if (node.type === 'message') {
            return !!(node.data?.replies && node.data.replies.length > 0);
        }
        if (node.type === 'form')
            return true;
        if (node.type === 'branch') {
            const evalType = node.data?.evaluationType;
            return evalType === 'BUTTON' || evalType === 'BUTTON_CLICK';
        }
        return node.type === 'slotfilling';
    }
    isAutoPassthroughNode(node) {
        if (!node)
            return false;
        return ['setSlot', 'set-slot', 'delay', 'api', 'toast', 'link'].includes(node.type);
    }
    getVersion() {
        return "1.0.3";
    }
    getCompletionMessage() {
        return "시나리오가 종료 되었습니다.";
    }
}
exports.ChatbotEngine = ChatbotEngine;
