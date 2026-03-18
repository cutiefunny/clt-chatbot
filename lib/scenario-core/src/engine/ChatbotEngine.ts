import { ScenarioData, ScenarioNode } from '../types/index';

export interface EngineCallbacks {
  onMessage?: (node: ScenarioNode, updatedSlots: Record<string, any>) => void;
  onDelay?: (node: ScenarioNode) => Promise<void>;
  onApi?: (node: ScenarioNode, slots: Record<string, any>) => Promise<{ success: boolean; newSlots: Record<string, any> }>;
  onLlm?: (node: ScenarioNode, slots: Record<string, any>) => Promise<{ success: boolean; newSlots: Record<string, any> }>;
  onToast?: (node: ScenarioNode, slots: Record<string, any>) => void;
  onLink?: (node: ScenarioNode, slots: Record<string, any>) => void;
  onEnd?: (slots: Record<string, any>) => void;
  onError?: (error: any) => void;
}

export class ChatbotEngine {
  constructor(private scenario: ScenarioData) { }

  getNodeById(nodeId: string): ScenarioNode | undefined {
    return this.scenario.nodes.find(n => n.id === nodeId);
  }

  interpolateMessage(message: string, slots: Record<string, any>): string {
    if (typeof message !== 'string') return String(message ?? '');
    return message.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
      const val = this.getDeepValue(slots, path.trim());
      return val !== undefined && val !== null ? String(val) : `{{${path}}}`;
    });
  }

  getDeepValue(obj: any, path: string): any {
    if (!path || typeof path !== 'string') return undefined;

    // Try direct lookup first (if key exists as-is)
    if (obj && typeof obj === 'object' && path in obj) {
      return obj[path];
    }

    // Normalize [0] to .0 and handle leading dot
    const normalizedPath = path.replace(/\[(\s*['"]?(\w+)['"]?\s*)\]/g, '.$2').replace(/^\./, '');
    const keys = normalizedPath.split('.').filter(k => k.trim() !== '').map(k => k.trim());

    let current = obj;
    for (const key of keys) {
      if (current === null || current === undefined) {
        return undefined;
      }

      // Handle the case where current is an array and key is an index
      if (Array.isArray(current) && !isNaN(Number(key))) {
        current = current[Number(key)];
      } else {
        current = current[key];
      }
    }

    return current;
  }

  evaluateCondition(slotValue: any, operator: string, conditionValue: any): boolean {
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

  getNextNode(currentNodeId: string, sourceHandle: string | null = null, slots: any = {}): ScenarioNode | null {
    const { nodes, edges } = this.scenario;
    const outgoingEdges = edges.filter(e => e.source === currentNodeId);
    if (outgoingEdges.length === 0) return null;

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
            if (edge) return this.getNodeById(edge.target) || null;
          }
        }
      }
      const defaultEdge = outgoingEdges.find(e => e.sourceHandle === 'default');
      if (defaultEdge) return this.getNodeById(defaultEdge.target) || null;
    }

    // Single edge case
    if (outgoingEdges.length === 1) {
      return this.getNodeById(outgoingEdges[0].target) || null;
    }

    // Explicit sourceHandle case
    if (sourceHandle) {
      const selectedEdge = outgoingEdges.find(e => e.sourceHandle === sourceHandle);
      if (selectedEdge) return this.getNodeById(selectedEdge.target) || null;
    }

    // Fallback to first edge
    if (outgoingEdges.length > 0) {
      return this.getNodeById(outgoingEdges[0].target) || null;
    }

    // [New] Bubble up to parent node if current node is in a group and has no outgoing edges
    if (sourceNode?.parentNode) {
      return this.getNextNode(sourceNode.parentNode, sourceHandle, slots);
    }

    return null;
  }

  isInteractiveNode(node: ScenarioNode | undefined): boolean {
    if (!node) return false;
    if (node.type === 'message') {
      return !!(node.data?.replies && node.data.replies.length > 0);
    }
    if (node.type === 'form') return true;
    if (node.type === 'branch') {
      const evalType = node.data?.evaluationType;
      return evalType === 'BUTTON' || evalType === 'BUTTON_CLICK';
    }
    if (node.type === 'fixedmenu') return true;
    return node.type === 'slotfilling';
  }

  isAutoPassthroughNode(node: ScenarioNode | undefined): boolean {
    if (!node) return false;
    return ['setSlot', 'set-slot', 'delay', 'api', 'llm', 'toast', 'link'].includes(node.type);
  }

  applySetSlot(node: ScenarioNode, slots: Record<string, any>): Record<string, any> {
    const newSlots = { ...slots };
    const assignments = node?.data?.assignments || [];

    for (const assignment of assignments) {
      if (assignment.key) {
        let interpolatedValue = this.interpolateMessage(assignment.value, newSlots);
        try {
          const trimmedValue = interpolatedValue.trim();
          if ((trimmedValue.startsWith('{') && trimmedValue.endsWith('}')) || (trimmedValue.startsWith('[') && trimmedValue.endsWith(']'))) {
            newSlots[assignment.key] = JSON.parse(trimmedValue);
          } else if (trimmedValue.toLowerCase() === 'true') {
            newSlots[assignment.key] = true;
          } else if (trimmedValue.toLowerCase() === 'false') {
            newSlots[assignment.key] = false;
          } else if (!isNaN(Number(trimmedValue)) && trimmedValue !== '') {
            newSlots[assignment.key] = Number(trimmedValue);
          } else {
            newSlots[assignment.key] = interpolatedValue;
          }
        } catch (e) {
          newSlots[assignment.key] = interpolatedValue;
        }
      }
    }
    return newSlots;
  }

  async run(startNodeId: string | null | undefined, currentSlots: Record<string, any>, callbacks: EngineCallbacks = {}): Promise<{ status: 'active' | 'completed' | 'failed', currentNodeId: string | null, slots: Record<string, any> }> {
    let currentNode: ScenarioNode | null | undefined = startNodeId ? this.getNodeById(startNodeId) : null;
    let slots = { ...currentSlots };
    let isLoopActive = !!currentNode;
    let loopCount = 0;
    const MAX_LOOP_ITERATIONS = 100;

    while (isLoopActive && currentNode && loopCount < MAX_LOOP_ITERATIONS) {
      if (loopCount > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      loopCount++;

      if (this.isInteractiveNode(currentNode)) {
        return { status: 'active', currentNodeId: currentNode.id, slots };
      }

      if (currentNode.id === 'end' || currentNode.type === 'end') {
        break;
      }

      if (currentNode.type === 'delay') {
        if (callbacks.onDelay) await callbacks.onDelay(currentNode);
        currentNode = this.getNextNode(currentNode.id, null, slots);
      } else if (currentNode.type === 'api') {
        const currentId = currentNode.id;
        if (callbacks.onApi) {
          try {
            const result = await callbacks.onApi(currentNode, slots);
            slots = result.newSlots || slots;
            currentNode = this.getNextNode(currentId, result.success ? 'onSuccess' : 'onError', slots);
          } catch (e) {
            if (callbacks.onError) callbacks.onError(e);
            currentNode = this.getNextNode(currentId, 'onError', slots);
          }
        } else {
          currentNode = this.getNextNode(currentId, 'onError', slots);
        }
      } else if (currentNode.type === 'llm') {
        const currentId = currentNode.id;
        if (callbacks.onLlm) {
          try {
            const result = await callbacks.onLlm(currentNode, slots);
            slots = result.newSlots || slots;
            currentNode = this.getNextNode(currentId, result.success ? 'onSuccess' : 'onError', slots);
          } catch (e) {
            if (callbacks.onError) callbacks.onError(e);
            currentNode = this.getNextNode(currentId, 'onError', slots);
          }
        } else {
          currentNode = this.getNextNode(currentId, null, slots);
        }
      } else if (currentNode.type === 'setSlot' || currentNode.type === 'set-slot') {
        slots = this.applySetSlot(currentNode, slots);
        currentNode = this.getNextNode(currentNode.id, null, slots);
      } else if (currentNode.type === 'scenario') {
        const childNodes = this.scenario.nodes.filter(n => n.parentNode === currentNode?.id);
        const childNodeIds = new Set(childNodes.map(n => n.id));
        const innerStartNode = childNodes.find(n =>
          !this.scenario.edges.some(e => e.target === n.id && childNodeIds.has(e.source))
        );
        if (innerStartNode) {
          currentNode = innerStartNode;
        } else {
          currentNode = this.getNextNode(currentNode.id, null, slots);
        }
      } else if (currentNode.type === 'branch') {
        currentNode = this.getNextNode(currentNode.id, null, slots);
      } else if (currentNode.type === 'toast') {
        if (callbacks.onToast) callbacks.onToast(currentNode, slots);
        currentNode = this.getNextNode(currentNode.id, null, slots);
      } else if (currentNode.type === 'link') {
        if (callbacks.onLink) callbacks.onLink(currentNode, slots);
        currentNode = this.getNextNode(currentNode.id, null, slots);
      } else {
        // Link, Message (non-interactive), Toast etc.
        if (callbacks.onMessage) callbacks.onMessage(currentNode, slots);
        currentNode = this.getNextNode(currentNode.id, null, slots);
      }
    }

    // Termination Sequence
    if (callbacks.onMessage || callbacks.onEnd) {
      // 500ms delay before end message
      await new Promise(resolve => setTimeout(resolve, 500));

      if (callbacks.onMessage) {
        callbacks.onMessage({
          id: 'system-termination',
          type: 'message',
          data: { content: '시나리오가 종료되었습니다.', isSystem: true }
        } as any, slots);
      }

      // Another 500ms delay before final onEnd callback
      if (callbacks.onEnd) {
        await new Promise(resolve => setTimeout(resolve, 500));
        callbacks.onEnd(slots);
      }
    }

    return { status: 'completed', currentNodeId: null, slots };
  }
}