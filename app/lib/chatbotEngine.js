import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { getGeminiStream } from './gemini';
import { locales } from './locales';

// --- 👇 [수정] 데이터 구조를 시안에 맞춰 확장 ---
export const scenarioCategories = [
  {
    name: "Process Execution",
    subCategories: [
      {
        title: "Shipment & Booking",
        items: [
          { title: "Track Shipment", description: "Check the real-time status of your shipment", scenarioId: "faq-scenario" },
          { title: "New Booking", description: "Initiate a new shipping booking process", scenarioId: "reservation" },
          { title: "Vessel Schedule", description: "View vessel sailing and arrival schedules", scenarioId: "welcome" },
          { title: "Route Search", description: "Find optimal vessel routes for your cargo", scenarioId: "faq-scenario" }
        ]
      }
    ]
  },
  {
    name: "Contracts & Payments",
    subCategories: [
        {
            title: "Payment Inquiry",
            items: [
                { title: "Check Balance", description: "View your current account balance", scenarioId: "welcome" },
                { title: "Payment History", description: "Browse your past transaction records", scenarioId: "welcome" },
            ]
        }
    ]
  },
  {
    name: "Analytics & Reports",
    subCategories: [
        {
            title: "Report Generation",
            items: [
                { title: "Scenario List", description: "See all available scenarios", scenarioId: "GET_SCENARIO_LIST" },
            ]
        }
    ]
  }
];


// --- 👇 [수정] findScenarioIdByTrigger가 새 구조를 참조하도록 변경 ---
export function findScenarioIdByTrigger(message) {
  for (const category of scenarioCategories) {
    for (const subCategory of category.subCategories) {
        for (const item of subCategory.items) {
            if (message.toLowerCase().includes(item.title.toLowerCase())) {
                return item.scenarioId;
            }
        }
    }
  }
  return null;
}

export const getScenarioList = async () => {
  const scenariosCollection = collection(db, 'scenarios');
  const querySnapshot = await getDocs(scenariosCollection);
  return querySnapshot.docs.map(doc => doc.id);
};

export const getScenario = async (scenarioId) => {
  const scenarioRef = doc(db, 'scenarios', scenarioId);
  const scenarioSnap = await getDoc(scenarioRef);

  if (scenarioSnap.exists()) {
    return scenarioSnap.data();
  } else {
    throw new Error(`Scenario with ID "${scenarioId}" not found!`);
  }
};

const evaluateCondition = (slotValue, operator, conditionValue) => {
  const lowerCaseConditionValue = String(conditionValue).toLowerCase();
  if (lowerCaseConditionValue === 'true' || lowerCaseConditionValue === 'false') {
    const boolConditionValue = lowerCaseConditionValue === 'true';
    const boolSlotValue = String(slotValue).toLowerCase() === 'true';

    switch (operator) {
      case '==':
        return boolSlotValue === boolConditionValue;
      case '!=':
        return boolSlotValue !== boolConditionValue;
      default:
        return false;
    }
  }

  const numSlotValue = parseFloat(slotValue);
  const numConditionValue = parseFloat(conditionValue);

  switch (operator) {
    case '==':
      return slotValue == conditionValue;
    case '!=':
      return slotValue != conditionValue;
    case '>':
      return !isNaN(numSlotValue) && !isNaN(numConditionValue) && numSlotValue > numConditionValue;
    case '<':
      return !isNaN(numSlotValue) && !isNaN(numConditionValue) && numSlotValue < numConditionValue;
    case '>=':
      return !isNaN(numSlotValue) && !isNaN(numConditionValue) && numSlotValue >= numConditionValue;
    case '<=':
      return !isNaN(numSlotValue) && !isNaN(numConditionValue) && numSlotValue <= numConditionValue;
    case 'contains':
      return slotValue && slotValue.toString().includes(conditionValue);
    case '!contains':
      return !slotValue || !slotValue.toString().includes(conditionValue);
    default:
      return false;
  }
};


export const getNextNode = (scenario, currentNodeId, sourceHandleId = null, slots = {}) => {
  if (!currentNodeId) {
    const edgeTargets = new Set(scenario.edges.map(edge => edge.target));
    const startNode = scenario.nodes.find(node => !edgeTargets.has(node.id));
    return startNode;
  }

  const sourceNode = scenario.nodes.find(n => n.id === currentNodeId);
  let nextEdge;

  if (sourceNode && sourceNode.type === 'llm' && sourceNode.data.conditions?.length > 0) {
      const llmOutput = slots[sourceNode.data.outputVar] || '';
      const matchedCondition = sourceNode.data.conditions.find(cond =>
          llmOutput.toLowerCase().includes(cond.keyword.toLowerCase())
      );
      if (matchedCondition) {
          nextEdge = scenario.edges.find(edge => edge.source === currentNodeId && edge.sourceHandle === matchedCondition.id);
      }
  }
  
  if (!nextEdge && sourceNode && sourceNode.type === 'branch' && sourceNode.data.evaluationType === 'CONDITION') {
    const conditions = sourceNode.data.conditions || [];
    for (const condition of conditions) {
        const slotValue = slots[condition.slot];
        if (evaluateCondition(slotValue, condition.operator, condition.value)) {
            const handleId = sourceNode.data.replies[conditions.indexOf(condition)]?.value;
            if(handleId) {
                nextEdge = scenario.edges.find(edge => edge.source === currentNodeId && edge.sourceHandle === handleId);
                if (nextEdge) break;
            }
        }
    }
  }

  if (!nextEdge) {
    nextEdge = scenario.edges.find(
      edge => edge.source === currentNodeId && edge.sourceHandle === sourceHandleId
    );
  }

  if (!nextEdge && !sourceHandleId) {
      nextEdge = scenario.edges.find(edge => edge.source === currentNodeId && !edge.sourceHandle);
  }

  if (nextEdge) {
    return scenario.nodes.find(node => node.id === nextEdge.target);
  }

  return null;
};

export const interpolateMessage = (message, slots) => {
    if (!message) return '';
    return message.replace(/\{([^}]+)\}/g, (match, key) => {
        const trimmedKey = key.trim();
        return slots.hasOwnProperty(trimmedKey) ? slots[trimmedKey] : match;
    });
};

export const getNestedValue = (obj, path) => {
    if (!path) return undefined;
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
};

export const validateInput = (value, validation, language = 'ko') => {
  if (!validation) return { isValid: true };
  const t = (key, ...args) => {
    const message = locales[language][key] || key;
    if (typeof message === 'function') {
        return message(...args);
    }
    return message;
  }

  const getErrorMessage = (defaultKey) => validation.errorMessage || t(defaultKey);

  switch (validation.type) {
    case 'email':
      return {
        isValid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        message: getErrorMessage('validationEmail')
      };
    case 'phone number':
      return {
        isValid: /^\d{2,3}-\d{3,4}-\d{4}$/.test(value),
        message: getErrorMessage('validationPhone')
      };
    case 'custom':
      if (validation.regex) {
        try {
          const isValid = new RegExp(validation.regex).test(value);
          return { isValid, message: isValid ? '' : getErrorMessage('validationFormat') };
        } catch (e) {
          console.error("Invalid regex:", validation.regex);
          return { isValid: false, message: t('validationRegexError') };
        }
      }
       if (validation.startDate && validation.endDate) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { isValid: false, message: getErrorMessage('validationFormat') };
            const selectedDate = new Date(value);
            const startDate = new Date(validation.startDate);
            const endDate = new Date(validation.endDate);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            const isValid = selectedDate >= startDate && selectedDate <= endDate;
            return { isValid, message: isValid ? '' : t('validationDateRange', validation.startDate, validation.endDate) };
        }
      return { isValid: true };
    case 'today after':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { isValid: false, message: getErrorMessage('validationFormat') };
        const selectedDateAfter = new Date(value);
        const todayAfter = new Date();
        todayAfter.setHours(0, 0, 0, 0);
        const isAfterValid = selectedDateAfter >= todayAfter;
        return { isValid: isAfterValid, message: isAfterValid ? '' : t('validationDateAfter')};
    case 'today before':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { isValid: false, message: getErrorMessage('validationFormat') };
        const selectedDateBefore = new Date(value);
        const todayBefore = new Date();
        todayBefore.setHours(23, 59, 59, 999);
        const isBeforeValid = selectedDateBefore <= todayBefore;
        return { isValid: isBeforeValid, message: isBeforeValid ? '' : t('validationDateBefore')};
    default:
      return { isValid: true };
  }
};

async function handleToastNode(node, scenario, slots) {
  const interpolatedToastMessage = interpolateMessage(node.data.message, slots);
  const event = {
    type: 'toast',
    message: interpolatedToastMessage,
    toastType: node.data.toastType || 'info',
  };
  const nextNode = getNextNode(scenario, node.id, null, slots);
  return { nextNode, slots, events: [event] };
}

async function handleInteractiveNode(node, scenario, slots, scenarioSessionId) {
    if (node.type === 'iframe' && node.data.url && scenarioSessionId) {
        try {
            const url = new URL(node.data.url);
            url.searchParams.set('scenario_session_id', scenarioSessionId);
            node.data.url = url.toString();
        } catch (e) {
            console.error("Invalid URL in iFrame node:", node.data.url);
            const separator = node.data.url.includes('?') ? '&' : '?';
            node.data.url += `${separator}scenario_session_id=${scenarioSessionId}`;
        }
    }
    // 대화형 노드는 자기 자신을 nextNode로 반환하여 루프를 멈추게 함
    return { nextNode: node };
}

async function handleLinkNode(node, scenario, slots) {
    if (node.data.content) {
        window.open(node.data.content, '_blank', 'noopener,noreferrer');
    }
    const nextNode = getNextNode(scenario, node.id, null, slots);
    return { nextNode, slots, events: [] };
}


async function handleApiNode(node, scenario, slots) {
    const { method, url, headers, body, params, responseMapping } = node.data;
    let interpolatedUrl = interpolateMessage(url, slots);
    
    if (method === 'GET' && params) {
        const queryParams = new URLSearchParams();
        for (const key in params) {
            if (Object.hasOwnProperty.call(params, key)) {
                const value = interpolateMessage(params[key], slots);
                if (value) queryParams.append(key, value);
            }
        }
        const queryString = queryParams.toString();
        if (queryString) {
            interpolatedUrl += (interpolatedUrl.includes('?') ? '&' : '?') + queryString;
        }
    }

    if (interpolatedUrl.startsWith('/')) {
        const baseURL = process.env.NEXT_PUBLIC_API_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
        interpolatedUrl = `${baseURL}${interpolatedUrl}`;
    }

    const interpolatedHeaders = JSON.parse(interpolateMessage(headers || '{}', slots));
    const interpolatedBody = method !== 'GET' && body ? interpolateMessage(body, slots) : undefined;

    let isSuccess = false;
    try {
        const response = await fetch(interpolatedUrl, { method, headers: interpolatedHeaders, body: interpolatedBody });
        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`API request failed with status ${response.status}. Body: ${errorBody}`);
        }

        const result = await response.json();
        if (responseMapping && responseMapping.length > 0) {
            responseMapping.forEach(mapping => {
                const value = getNestedValue(result, mapping.path);
                if (value !== undefined) slots[mapping.slot] = value;
            });
        }
        isSuccess = true;
    } catch (error) {
        console.error("API Node Error:", error);
        slots['apiError'] = error.message;
        isSuccess = false;
    }

    const nextNode = getNextNode(scenario, node.id, isSuccess ? 'onSuccess' : 'onError', slots);
    return { nextNode, slots, events: [] };
}

async function handleLlmNode(node, scenario, slots, language) {
    const interpolatedPrompt = interpolateMessage(node.data.prompt, slots);
    const stream = await getGeminiStream(interpolatedPrompt, language);
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let llmResponse = '';
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        llmResponse += decoder.decode(value, { stream: true });
    }

    if (node.data.outputVar) {
        slots[node.data.outputVar] = llmResponse;
    }

    const nextNode = getNextNode(scenario, node.id, null, slots);
    return { nextNode, slots, events: [] };
}

async function handleBranchNode(node, scenario, slots) {
  if (node.data.evaluationType === 'CONDITION') {
    // 자동 노드: 즉시 다음 노드를 찾아 반환
    const nextNode = getNextNode(scenario, node.id, null, slots);
    return { nextNode, slots, events: [] };
  } else {
    // 대화형 노드: 노드 자신을 반환하여 UI 렌더링
    return { nextNode: node };
  }
}

const nodeHandlers = {
  'toast': handleToastNode,
  'slotfilling': handleInteractiveNode,
  'message': handleInteractiveNode,
  'branch': handleBranchNode, // branch 핸들러 교체
  'form': handleInteractiveNode,
  'iframe': handleInteractiveNode,
  'link': handleLinkNode,
  'api': handleApiNode,
  'llm': handleLlmNode,
};

export async function runScenario(scenario, scenarioState, message, slots, scenarioSessionId, language) {
    const { scenarioId, currentNodeId, awaitingInput } = scenarioState;
    let currentId = currentNodeId;
    let newSlots = { ...slots };
    const allEvents = [];
    
    if (awaitingInput) {
        const currentNode = scenario.nodes.find(n => n.id === currentId);
        const validation = currentNode.data.validation;
        const { isValid, message: validationMessage } = validateInput(message.text, validation, language);

        if (!isValid) {
            return {
                type: 'scenario_validation_fail',
                message: validationMessage,
                scenarioState: { ...scenarioState, awaitingInput: true },
                slots: newSlots,
                events: [],
            };
        }
        newSlots[currentNode.data.slot] = message.text;
    }

    let currentNode = getNextNode(scenario, currentId, message.sourceHandle, newSlots);

    while (currentNode) {
        if (currentNode.data) {
            currentNode.data.content = interpolateMessage(currentNode.data.content, newSlots);
        }
        
        const handler = nodeHandlers[currentNode.type];
        
        if (handler) {
            const result = await handler(currentNode, scenario, newSlots, scenarioSessionId, language);
            newSlots = result.slots || newSlots;
            if (result.events) allEvents.push(...result.events);

            // 핸들러가 자기 자신을 반환하면, 대화형 노드이므로 루프를 중단
            if (result.nextNode && result.nextNode.id === currentNode.id) {
                currentNode = result.nextNode;
                break;
            }
            
            // 핸들러가 다음 노드를 반환하면, 자동 노드이므로 루프 계속
            currentNode = result.nextNode;
        } else {
            // 핸들러가 없는 노드(예: end)이면 루프 중단
            break;
        }
    }

    if (currentNode) {
        const isAwaiting = currentNode.type === 'slotfilling';
        return {
            type: 'scenario',
            nextNode: currentNode,
            scenarioState: { scenarioId, currentNodeId: currentNode.id, awaitingInput: isAwaiting },
            slots: newSlots,
            events: allEvents,
        };
    } else {
        return {
            type: 'scenario_end',
            message: '시나리오가 종료되었습니다.',
            scenarioState: null,
            slots: newSlots,
            events: allEvents,
        };
    }
}