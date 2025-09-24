import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { getGeminiStream } from './gemini';

// --- 시나리오 트리거 및 기본 헬퍼 함수들 (기존과 동일) ---

export const scenarioTriggers = {
  "reservation": "reservation",
  "question": "faq-scenario",
  "welcome": "Welcome",
  "scenario list": "GET_SCENARIO_LIST"
};

export function findScenarioIdByTrigger(message) {
  for (const keyword in scenarioTriggers) {
    if (message.toLowerCase().includes(keyword.toLowerCase())) {
      return scenarioTriggers[keyword];
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

export const validateInput = (value, validation) => {
  if (!validation) return { isValid: true };
  const getErrorMessage = (defaultMessage) => validation.errorMessage || defaultMessage;
  switch (validation.type) {
    case 'email':
      return {
        isValid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        message: getErrorMessage('유효한 이메일 주소를 입력해주세요.')
      };
    case 'phone number':
      return {
        isValid: /^\d{2,3}-\d{3,4}-\d{4}$/.test(value),
        message: getErrorMessage('유효한 전화번호(XXX-XXXX-XXXX)를 입력해주세요.')
      };
    case 'custom':
      if (validation.regex) {
        try {
          const isValid = new RegExp(validation.regex).test(value);
          return { isValid, message: isValid ? '' : getErrorMessage('입력 형식이 올바르지 않습니다.') };
        } catch (e) {
          console.error("Invalid regex:", validation.regex);
          return { isValid: false, message: '시나리오에 설정된 정규식이 올바르지 않습니다.' };
        }
      }
      return { isValid: true };
    default:
      return { isValid: true };
  }
};


// --- 👇 [리팩토링된 부분 시작] ---

/**
 * 각 노드 타입에 맞는 핸들러 함수를 매핑합니다.
 */
const nodeHandlers = {
  'toast': handleToastNode,
  'slotfilling': handleInteractiveNode,
  'message': handleInteractiveNode,
  'branch': handleInteractiveNode,
  'form': handleInteractiveNode,
  'iframe': handleInteractiveNode,
  'api': handleApiNode,
  'llm': handleLlmNode,
};

/**
 * Toast 노드를 처리합니다.
 * @returns {Promise<{nextNode: object, slots: object, events: object[]}>}
 */
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

/**
 * 사용자 입력이 필요한 노드(slotfilling, message, branch, form, iframe)를 처리합니다.
 * @returns {Promise<{nextNode: object}>}
 */
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
    return { nextNode: node };
}


/**
 * API 노드를 처리합니다.
 * @returns {Promise<{nextNode: object, slots: object, events: object[]}>}
 */
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

/**
 * LLM 노드를 처리합니다.
 * @returns {Promise<{nextNode: object, slots: object, events: object[]}>}
 */
async function handleLlmNode(node, scenario, slots) {
    const interpolatedPrompt = interpolateMessage(node.data.prompt, slots);
    const stream = await getGeminiStream(interpolatedPrompt);
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


/**
 * 시나리오를 실행하고 다음 상태를 반환하는 메인 함수입니다.
 */
export async function runScenario(scenario, scenarioState, message, slots, scenarioSessionId) {
    const { scenarioId, currentNodeId, awaitingInput } = scenarioState;
    let currentId = currentNodeId;
    let newSlots = { ...slots };
    const allEvents = [];
    
    // 1. 사용자 입력 처리 (Awaiting Input)
    if (awaitingInput) {
        const currentNode = scenario.nodes.find(n => n.id === currentId);
        const validation = currentNode.data.validation;
        const { isValid, message: validationMessage } = validateInput(message.text, validation);

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

    // 2. 다음 노드 찾기
    let currentNode = getNextNode(scenario, currentId, message.sourceHandle, newSlots);

    // 3. 인터랙티브 노드가 나올 때까지 노드 순차 실행
    while (currentNode) {
        currentNode.data.content = interpolateMessage(currentNode.data.content, newSlots);
        
        const handler = nodeHandlers[currentNode.type];
        
        if (handler) {
            const result = await handler(currentNode, scenario, newSlots, scenarioSessionId);
            newSlots = result.slots || newSlots;
            if (result.events) allEvents.push(...result.events);

            // 인터랙티브 노드(사용자 입력 대기)에 도달하면 루프 중단
            if (['slotfilling', 'message', 'branch', 'form', 'iframe'].includes(currentNode.type)) {
                currentNode = result.nextNode;
                break;
            }
            currentNode = result.nextNode;

        } else {
             // 핸들러가 없는 경우 루프 중단 (예: end 노드)
            break;
        }
    }

    // 4. 최종 결과 반환
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
// --- 👆 [리팩토링된 부분 끝] ---