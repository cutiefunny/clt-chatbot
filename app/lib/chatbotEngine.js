// app/lib/chatbotEngine.js

import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { getGeminiResponseWithSlots } from './gemini';
import { locales } from './locales';
let cachedScenarioCategories = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5분

/**
 * Firestore의 'shortcut' 컬렉션에서 시나리오 카테고리 데이터를 가져옵니다.
 * 성능을 위해 5분 동안 캐시된 데이터를 사용합니다.
 * @returns {Promise<Array>} 시나리오 카테고리 배열
 */
export async function getScenarioCategories() {
  const now = Date.now();
  if (cachedScenarioCategories && (now - lastFetchTime < CACHE_DURATION)) {
    return cachedScenarioCategories;
  }

  try {
    const shortcutRef = doc(db, "shortcut", "main");
    const docSnap = await getDoc(shortcutRef);

    if (docSnap.exists() && docSnap.data().categories) {
      cachedScenarioCategories = docSnap.data().categories;
      lastFetchTime = now;
      return cachedScenarioCategories;
    } else {
      console.warn("Shortcut document 'main' not found in Firestore. Returning empty array.");
      return [];
    }
  } catch (error) {
    console.error("Error fetching scenario categories from Firestore:", error);
    return []; // 오류 발생 시 빈 배열 반환
  }
}

export async function findActionByTrigger(message) {
  const scenarioCategories = await getScenarioCategories();
  if (!scenarioCategories) return null;

  for (const category of scenarioCategories) {
    for (const subCategory of category.subCategories) {
        for (const item of subCategory.items) {
            // 사용자가 입력한 텍스트가 아이템의 제목과 일치하는지 확인
            if (message.toLowerCase().trim() === item.title.toLowerCase().trim()) {
                return item.action; // { type: 'scenario', value: '...' } 또는 { type: 'custom', value: '...' }
            }
        }
    }
  }
  return null;
}

export async function findScenarioIdByTrigger(message) {
  const scenarioCategories = await getScenarioCategories();
  if (!scenarioCategories) return null;

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
    if (scenario.startNodeId) {
      const startNode = scenario.nodes.find(node => node.id === scenario.startNodeId);
      if (startNode) {
        console.log(`Starting scenario with specified startNodeId: ${scenario.startNodeId}`);
        return startNode;
      } else {
        console.warn(`Specified startNodeId "${scenario.startNodeId}" not found in nodes. Falling back to default start node finding logic.`);
      }
    }
    const edgeTargets = new Set(scenario.edges.map(edge => edge.target));
    const defaultStartNode = scenario.nodes.find(node => !edgeTargets.has(node.id));
    if (defaultStartNode) {
        console.log(`Starting scenario with default start node (no incoming edges): ${defaultStartNode.id}`);
        return defaultStartNode;
    } else {
        console.error("Could not determine the start node for the scenario.");
        return null;
    }
  }

  const sourceNode = scenario.nodes.find(n => n.id === currentNodeId);
  if (!sourceNode) {
      console.error(`Current node with ID "${currentNodeId}" not found in scenario.`);
      return null;
  }
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
        const valueToCompare = condition.valueType === 'slot' ? slots[condition.value] : condition.value;

        if (evaluateCondition(slotValue, condition.operator, valueToCompare)) {
            const conditionIndex = conditions.indexOf(condition);
            const handleId = sourceNode.data.replies?.[conditionIndex]?.value;
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
      if (sourceNode.type === 'branch' && sourceNode.data.evaluationType === 'CONDITION') {
          // --- 👇 [수정된 부분 시작] ---
          // 1. 명시적으로 'default' 핸들을 가진 엣지를 먼저 찾습니다.
          nextEdge = scenario.edges.find(edge => edge.source === currentNodeId && edge.sourceHandle === 'default');

          // 2. 'default' 핸들이 없으면, 핸들 ID가 없는 엣지를 찾습니다 (기존 fallback).
          if (!nextEdge) {
              nextEdge = scenario.edges.find(edge => edge.source === currentNodeId && !edge.sourceHandle);
          }
          // --- 👆 [수정된 부분 끝] ---
      } else {
          // 다른 노드 타입의 경우, 핸들 ID 없는 엣지만 찾음
          nextEdge = scenario.edges.find(edge => edge.source === currentNodeId && !edge.sourceHandle);
      }
  }

  if (nextEdge) {
    const nextNode = scenario.nodes.find(node => node.id === nextEdge.target);
    if (!nextNode) {
        console.error(`Next node with ID "${nextEdge.target}" (target of edge "${nextEdge.id}") not found.`);
        return null;
    }
    return nextNode;
  }

  console.log(`No next edge found for node "${currentNodeId}" with sourceHandle "${sourceHandleId}". Ending flow branch.`);
  return null;
};

/**
 * 객체와 경로 문자열을 받아 중첩된 값을 안전하게 가져오는 함수.
 * 경로 예: 'user.name', 'items[0].id', 'data.vvdInfo[0].vvd'
 * @param {object} obj - 값을 찾을 대상 객체
 * @param {string} path - 점(.) 또는 대괄호([])를 사용한 경로 문자열
 * @returns {*} - 찾은 값 또는 undefined
 */
const getDeepValue = (obj, path) => {
    if (!path || !obj) return undefined;
    // 경로를 . 기준으로 나누되, 대괄호 안의 내용은 보존
    // 정규식을 수정하여 대괄호 안의 숫자나 문자열 키도 처리하도록 개선
    const keys = path.match(/[^.[\]]+|\[(?:(-?\d+)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]/g);
    if (!keys) return undefined; // 경로 파싱 실패

    let value = obj;
    try {
        for (let key of keys) {
            let actualKey = key;
            // 대괄호 표기법 처리 (예: [0], ["key"], ['key'])
            const bracketMatch = key.match(/^\[(?:(-?\d+)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]$/);
            if (bracketMatch) {
                if (bracketMatch[1]) { // 숫자 인덱스
                    actualKey = parseInt(bracketMatch[1], 10);
                } else if (bracketMatch[3]) { // 따옴표로 감싸진 키
                    // 역슬래시 이스케이프 처리 (\", \', \\)
                    actualKey = bracketMatch[3].replace(/\\(['"\\])/g, '$1');
                }
            }

            // Check if value is null or undefined before proceeding
            if (value === null || typeof value === 'undefined') {
                 return undefined;
            }

            // Check if the key exists or if it's a valid array index
            if (typeof value === 'object' && actualKey in value) {
                value = value[actualKey];
            } else if (Array.isArray(value) && Number.isInteger(actualKey) && actualKey >= 0 && actualKey < value.length) {
                value = value[actualKey];
            } else {
                return undefined; // 경로 중간에 값이 없거나 객체/배열이 아닌 경우
            }
        }
        return value;
    } catch (e) {
        console.error(`Error accessing path "${path}" at key "${key}":`, e);
        return undefined; // 접근 중 오류 발생 시
    }
};


/**
 * 메시지 문자열 내의 {{slot.path[index].property}} 형식의 플레이스홀더를
 * slots 객체의 실제 값으로 치환하는 함수.
 * @param {string} message - 플레이스홀더를 포함할 수 있는 원본 문자열
 * @param {object} slots - 슬롯 키와 값을 담고 있는 객체
 * @returns {string} - 플레이스홀더가 실제 값으로 치환된 문자열
 */
export const interpolateMessage = (message, slots) => {
    if (!message || typeof message !== 'string') return String(message || ''); // 입력값이 문자열이 아니면 그대로 반환
    return message.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
        const path = key.trim(); // 경로 문자열 추출 (예: 'vvdInfo[0].vvd')
        const value = getDeepValue(slots, path); // 중첩된 값 가져오기
        // 값이 존재하면 문자열로 변환하여 반환, 없으면 원본 플레이스홀더({{..}}) 반환
        return value !== undefined && value !== null ? String(value) : match;
    });
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

async function handleToastNode(node, scenario, slots, scenarioSessionId) {
  const interpolatedToastMessage = interpolateMessage(node.data.message, slots);
  const event = {
    type: 'toast',
    message: interpolatedToastMessage,
    toastType: node.data.toastType || 'info',
    scenarioSessionId: scenarioSessionId,
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

// --- 👇 [수정] handleLinkNode 수정 ---
async function handleLinkNode(node, scenario, slots) {
    const events = [];
    if (node.data.content) {
         // URL 보간
        const interpolatedUrl = interpolateMessage(node.data.content, slots);
        // 서버에서는 window.open을 호출할 수 없으므로, 클라이언트에게 이벤트를 보냄
        events.push({
            type: 'open_link',
            url: interpolatedUrl,
            // 필요하다면 target 속성도 전달 가능: target: node.data.target || '_blank'
        });
        console.log(`[handleLinkNode] Generated open_link event for URL: ${interpolatedUrl}`);
    } else {
        console.warn("[handleLinkNode] Link node has no content (URL).");
    }
    const nextNode = getNextNode(scenario, node.id, null, slots);
    // nextNode와 함께 이벤트를 반환
    return { nextNode, slots, events };
}
// --- 👆 [수정] ---


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

    // 디버깅을 위해 실제 전송될 요청 본문을 슬롯에 저장
    if (interpolatedBody) {
        slots['_lastApiRequestBody'] = interpolatedBody;
    } else if (slots['_lastApiRequestBody']) {
        // GET 요청 등 body가 없는 경우 이전 값 제거
        delete slots['_lastApiRequestBody'];
    }

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
              // --- 👇 [수정된 부분] getDeepValue 사용 ---
                const value = getDeepValue(result, mapping.path);
              // --- 👆 [수정된 부분] ---
                if (value !== undefined) slots[mapping.slot] = value;
            });
        }
        isSuccess = true;
    } catch (error) {
        console.error("API Node Error:", error);
        slots['apiError'] = error.message;
        slots['apiFailed'] = true; // API 실패 플래그 설정
        isSuccess = false;
    }

    const nextNode = getNextNode(scenario, node.id, isSuccess ? 'onSuccess' : 'onError', slots);
    return { nextNode, slots, events: [] }; // slots 객체 반환
}

async function handleLlmNode(node, scenario, slots, language) {
    const interpolatedPrompt = interpolateMessage(node.data.prompt, slots);
    const geminiData = await getGeminiResponseWithSlots(interpolatedPrompt, language);

    const llmResponse = geminiData.response;

    if (geminiData.slots) {
        slots = { ...slots, ...geminiData.slots };
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

async function handleSetSlotNode(node, scenario, slots) {
  console.log('[handleSetSlotNode] Executing node:', node.id);
  console.log('[handleSetSlotNode] Slots before assignment:', { ...slots });

  const newSlots = { ...slots };
  const assignments = node.data.assignments || [];

  for (const assignment of assignments) {
    if (assignment.key) {
      // 1. 값을 우선 보간합니다.
      let interpolatedValue = interpolateMessage(assignment.value, newSlots);

      // 2. 보간된 값이 JSON 형태의 문자열인지 확인합니다.
      if (typeof interpolatedValue === 'string' &&
          ( (interpolatedValue.startsWith('{') && interpolatedValue.endsWith('}')) ||
            (interpolatedValue.startsWith('[') && interpolatedValue.endsWith(']')) )
      ) {
        try {
          // 3. JSON 파싱을 시도합니다.
          const parsedJson = JSON.parse(interpolatedValue);
          // 4. 파싱 성공 시, 객체/배열을 할당합니다.
          newSlots[assignment.key] = parsedJson;
        } catch (e) {
          // 5. 파싱 실패 시, 원본 문자열을 그대로 할당합니다.
          console.warn(`[handleSetSlotNode] Failed to parse JSON for key "${assignment.key}", assigning as string. Value:`, interpolatedValue);
          newSlots[assignment.key] = interpolatedValue;
        }
      } else {
        // 6. JSON 형태가 아니거나 문자열이 아닌 경우, 보간된 값을 그대로 할당합니다.
        newSlots[assignment.key] = interpolatedValue;
      }
    }
  }

  console.log('[handleSetSlotNode] Slots after assignment:', { ...newSlots });

  const nextNode = getNextNode(scenario, node.id, null, newSlots);
  return { nextNode, slots: newSlots, events: [] };
}

const nodeHandlers = {
  'toast': handleToastNode,
  'slotfilling': handleInteractiveNode,
  'message': handleInteractiveNode,
  'branch': handleBranchNode,
  'form': handleInteractiveNode,
  'iframe': handleInteractiveNode,
  'link': handleLinkNode,
  'api': handleApiNode,
  'llm': handleLlmNode,
  'setSlot': handleSetSlotNode,
};

export async function runScenario(scenario, scenarioState, message, slots, scenarioSessionId, language) {
    const { scenarioId, currentNodeId, awaitingInput } = scenarioState;
    let currentId = currentNodeId;
    let newSlots = { ...slots };
    const allEvents = [];

    if (awaitingInput) {
        const currentNode = scenario.nodes.find(n => n.id === currentId);
        if (!currentNode) {
             console.error(`Error in runScenario: Node with ID "${currentId}" not found.`);
             return {
                 type: 'scenario_end',
                 message: 'Error: Scenario node not found.',
                 scenarioState: null,
                 slots: newSlots,
                 events: allEvents,
             };
        }
        const validation = currentNode.data?.validation; // Add null check for data
        const { isValid, message: validationMessage } = validateInput(message?.text, validation, language); // Add null check for message

        if (!isValid) {
            return {
                type: 'scenario_validation_fail',
                message: validationMessage,
                scenarioState: { ...scenarioState, awaitingInput: true },
                slots: newSlots,
                events: [],
            };
        }
        // Ensure data and slot properties exist before assignment
        if (currentNode.data && currentNode.data.slot) {
            newSlots[currentNode.data.slot] = message?.text; // Add null check for message
        } else {
             console.warn(`Node "${currentId}" is awaiting input but has no data.slot defined.`);
        }
    }

    let currentNode = getNextNode(scenario, currentId, message?.sourceHandle, newSlots); // Add null check for message

    while (currentNode) {
        // interpolateMessage는 이제 노드 핸들러 내부에서 필요시 호출됨 (중복 방지)
        // if (currentNode.data) {
        //     currentNode.data.content = interpolateMessage(currentNode.data.content, newSlots);
        // }

        const handler = nodeHandlers[currentNode.type];

        if (handler) {
            const result = await handler(currentNode, scenario, newSlots, scenarioSessionId, language);
            // Handle cases where handler might return null or undefined result
            if (!result) {
                console.error(`Handler for node type "${currentNode.type}" (ID: ${currentNode.id}) returned an invalid result.`);
                currentNode = null; // Terminate loop on handler error
                break;
            }
            newSlots = result.slots || newSlots;
            if (result.events) allEvents.push(...result.events);

            // Check if the node returned itself (interactive node)
            if (result.nextNode && result.nextNode.id === currentNode.id) {
                currentNode = result.nextNode; // Keep the current node
                break; // Stop the loop for interactive nodes
            }

            // Move to the next node determined by the handler
            currentNode = result.nextNode;
        } else {
            // No handler found for this node type, treat as end or break loop
            console.warn(`No handler found for node type: ${currentNode.type}. Ending scenario flow.`);
            currentNode = null; // Ensure loop terminates
        }
    }

    if (currentNode) {
        // Loop stopped because an interactive node was returned
        const isAwaiting = currentNode.type === 'slotfilling'; // Slotfilling still requires waiting
       // Interpolate content right before returning for display
       if (currentNode.data && currentNode.data.content) {
            currentNode.data.content = interpolateMessage(currentNode.data.content, newSlots);
       }
       // Interpolate form title if it's a form node
       if (currentNode.type === 'form' && currentNode.data && currentNode.data.title) {
           currentNode.data.title = interpolateMessage(currentNode.data.title, newSlots);
       }
        // Interpolate form element labels and placeholders
        if (currentNode.type === 'form' && currentNode.data && Array.isArray(currentNode.data.elements)) {
            currentNode.data.elements.forEach(el => {
                if (el.label) el.label = interpolateMessage(el.label, newSlots);
                if (el.placeholder) el.placeholder = interpolateMessage(el.placeholder, newSlots);

                // Check for input elements with a default value and update slots if needed
                if (el.type === 'input' && el.defaultValue !== undefined && el.defaultValue !== null && el.name && newSlots[el.name] === undefined) {
                  console.log(`[runScenario] Applying default value for form input "${el.name}": "${el.defaultValue}"`);
                  newSlots[el.name] = el.defaultValue; // Assign default value if slot is empty
                }
            });
        }
        // Interpolate branch replies display text
        if (currentNode.type === 'branch' && currentNode.data && Array.isArray(currentNode.data.replies)) {
             currentNode.data.replies.forEach(reply => {
                 if (reply.display) reply.display = interpolateMessage(reply.display, newSlots);
             });
        }

        return {
            type: 'scenario',
            nextNode: currentNode,
            scenarioState: { scenarioId, currentNodeId: currentNode.id, awaitingInput: isAwaiting },
            slots: newSlots, // Return updated slots including default values
            events: allEvents,
        };
    } else {
        // Loop finished (reached end or no next node/handler)
        return {
            type: 'scenario_end',
            message: interpolateMessage(locales[language]?.scenarioEnded(scenarioId) || 'Scenario ended.', newSlots), // Interpolate end message
            scenarioState: null,
            slots: newSlots,
            events: allEvents,
        };
    }
}