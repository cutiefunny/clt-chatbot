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

// --- 👇 [수정된 부분 시작] interpolateMessage 함수 수정 ---
/**
 * 메시지 문자열 내의 {{slot.path}} 형식 플레이스홀더를 slots 객체 값으로 치환합니다.
 * URL 인코딩된 {{, }} (%7B%7B, %7D%7D)를 먼저 디코딩하고 치환합니다.
 * URL 파라미터 컨텍스트에서는 치환될 값을 URL 인코딩합니다.
 * @param {string} message - 플레이스홀더를 포함할 수 있는 원본 문자열
 * @param {object} slots - 슬롯 키와 값을 담고 있는 객체
 * @returns {string} - 플레이스홀더가 실제 값으로 치환된 문자열
 */
export const interpolateMessage = (message, slots) => {
    if (!message || typeof message !== 'string') return String(message || '');

    // 1. URL 인코딩된 중괄호 디코딩 (%7B%7B -> {{, %7D%7D -> }})
    let decodedMessage = message;
    try {
        // 정규식을 사용하여 전역 치환
        decodedMessage = decodedMessage.replace(/%7B%7B/g, '{{').replace(/%7D%7D/g, '}}');
    } catch (e) {
        console.error("Error during URL decoding in interpolateMessage:", e);
        // 디코딩 실패 시 원본 메시지로 계속 진행
    }

    // 2. 슬롯 값 치환
    const result = decodedMessage.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
        const path = key.trim();
        const value = getDeepValue(slots, path);

        if (value !== undefined && value !== null) {
            const stringValue = String(value);

            // 3. URL 파라미터 값인 경우 URL 인코딩 적용
            // 플레이스홀더 바로 앞에 '=' 또는 '&' 문자가 있는지 확인
            const matchIndex = decodedMessage.indexOf(match);
            const precedingChar = matchIndex > 0 ? decodedMessage[matchIndex - 1] : '';
            const isUrlParamValue = precedingChar === '=' || precedingChar === '&';

            if (isUrlParamValue) {
                try {
                    // 간단한 방법으로 이미 인코딩되었는지 확인 (완벽하지 않음)
                    // 디코딩 시도 시 에러가 발생하거나 결과가 원본과 다르면 이미 인코딩된 것으로 간주
                    let needsEncoding = true;
                    try {
                        if (decodeURIComponent(stringValue) !== stringValue) {
                            needsEncoding = false; // 이미 인코딩된 것으로 보임
                        }
                    } catch (decodeError) {
                         needsEncoding = false; // 디코딩 실패 시 이미 인코딩된 것으로 간주
                    }

                    if (needsEncoding) {
                        // console.log(`[interpolateMessage] Encoding URL parameter value for key "${path}": "${stringValue}"`);
                        return encodeURIComponent(stringValue);
                    } else {
                        // console.log(`[interpolateMessage] Value for key "${path}" seems already URL encoded, using as is: "${stringValue}"`);
                        return stringValue; // 이미 인코딩된 값이면 그대로 사용
                    }
                } catch (encodeError) {
                    console.error(`[interpolateMessage] Error encoding value for key "${path}":`, encodeError);
                    return stringValue; // 인코딩 실패 시 원본 문자열 반환
                }
            } else {
                // URL 파라미터 값이 아니면 그냥 문자열 값 반환
                return stringValue;
            }
        } else {
            // 슬롯 값이 없으면 원본 플레이스홀더 반환
            // console.warn(`[interpolateMessage] Slot value not found for key: "${path}". Returning placeholder.`);
            return match;
        }
    });

    return result;
};
// --- 👆 [수정된 부분 끝] ---


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
    // Note: iframe URL interpolation is now handled later in runScenario
    if (node.type === 'iframe' && node.data.url && scenarioSessionId) {
        // Add scenario session ID only if not already present
        // (interpolation might add it later, but we add it here as a fallback)
        try {
            const url = new URL(node.data.url);
            if (!url.searchParams.has('scenario_session_id')) {
                url.searchParams.set('scenario_session_id', scenarioSessionId);
                node.data.url = url.toString();
            }
        } catch (e) {
            console.warn("Could not parse URL to add session ID in handleInteractiveNode:", node.data.url);
             if (!node.data.url.includes('scenario_session_id=')) {
                 const separator = node.data.url.includes('?') ? '&' : '?';
                 node.data.url += `${separator}scenario_session_id=${scenarioSessionId}`;
             }
        }
    }
    // Return the node itself to stop the loop for user interaction
    return { nextNode: node };
}


async function handleLinkNode(node, scenario, slots) {
    const events = [];
    if (node.data.content) {
        const interpolatedUrl = interpolateMessage(node.data.content, slots);
        events.push({
            type: 'open_link',
            url: interpolatedUrl,
        });
        console.log(`[handleLinkNode] Generated open_link event for URL: ${interpolatedUrl}`);
    } else {
        console.warn("[handleLinkNode] Link node has no content (URL).");
    }
    const nextNode = getNextNode(scenario, node.id, null, slots);
    return { nextNode, slots, events };
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

    if (interpolatedBody) {
        slots['_lastApiRequestBody'] = interpolatedBody;
    } else if (slots['_lastApiRequestBody']) {
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
                const value = getDeepValue(result, mapping.path);
                if (value !== undefined) slots[mapping.slot] = value;
            });
        }
        isSuccess = true;
    } catch (error) {
        console.error("API Node Error:", error);
        slots['apiError'] = error.message;
        slots['apiFailed'] = true;
        isSuccess = false;
    }

    const nextNode = getNextNode(scenario, node.id, isSuccess ? 'onSuccess' : 'onError', slots);
    return { nextNode, slots, events: [] };
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
    const nextNode = getNextNode(scenario, node.id, null, slots);
    return { nextNode, slots, events: [] };
  } else {
    return { nextNode: node };
  }
}

async function handleSetSlotNode(node, scenario, slots) {
  console.log('[handleSetSlotNode] Executing node:', node.id);
  // console.log('[handleSetSlotNode] Slots before assignment:', JSON.stringify(slots)); // Avoid excessive logging if needed

  const newSlots = { ...slots };
  const assignments = node.data.assignments || [];

  for (const assignment of assignments) {
    if (assignment.key) {
      let interpolatedValue = interpolateMessage(assignment.value, newSlots); // Use already updated newSlots for sequential interpolation

      if (typeof interpolatedValue === 'string' &&
          ( (interpolatedValue.startsWith('{') && interpolatedValue.endsWith('}')) ||
            (interpolatedValue.startsWith('[') && interpolatedValue.endsWith(']')) )
      ) {
        try {
          const parsedJson = JSON.parse(interpolatedValue);
          newSlots[assignment.key] = parsedJson;
        } catch (e) {
          // console.warn(`[handleSetSlotNode] Failed to parse JSON for key "${assignment.key}", assigning as string. Value:`, interpolatedValue);
          newSlots[assignment.key] = interpolatedValue;
        }
      } else {
        newSlots[assignment.key] = interpolatedValue;
      }
    }
  }

  // console.log('[handleSetSlotNode] Slots after assignment:', JSON.stringify(newSlots)); // Avoid excessive logging if needed

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
             return { /* ... error response ... */ };
        }
        const validation = currentNode.data?.validation;
        const { isValid, message: validationMessage } = validateInput(message?.text, validation, language);

        if (!isValid) {
            return { /* ... validation fail response ... */ };
        }
        if (currentNode.data && currentNode.data.slot) {
            newSlots[currentNode.data.slot] = message?.text;
        } else {
             console.warn(`Node "${currentId}" is awaiting input but has no data.slot defined.`);
        }
    }

    let currentNode = getNextNode(scenario, currentId, message?.sourceHandle, newSlots);

    while (currentNode) {
        const handler = nodeHandlers[currentNode.type];

        if (handler) {
            // console.log(`[runScenario] Before handler for node ${currentNode.id} (${currentNode.type}). Slots:`, JSON.stringify(newSlots)); // Less verbose logging
            const result = await handler(currentNode, scenario, newSlots, scenarioSessionId, language);

            if (!result) {
                console.error(`Handler for node type "${currentNode.type}" (ID: ${currentNode.id}) returned an invalid result.`);
                currentNode = null;
                break;
            }
            newSlots = result.slots || newSlots;
            // console.log(`[runScenario] After handler for node ${currentNode.id} (${currentNode.type}). Updated Slots:`, JSON.stringify(newSlots)); // Less verbose logging

            if (result.events) allEvents.push(...result.events);

            if (result.nextNode && result.nextNode.id === currentNode.id) {
                currentNode = result.nextNode;
                break;
            }
            currentNode = result.nextNode;
        } else {
            console.warn(`No handler found for node type: ${currentNode.type}. Ending scenario flow.`);
            currentNode = null;
        }
    }

    if (currentNode) {
        // console.log(`[runScenario] Preparing to return interactive node ${currentNode.id}. Final slots before interpolation:`, JSON.stringify(newSlots));
        // console.log(`[runScenario] Value of reqData specifically:`, newSlots.reqData);

       // Interpolate basic content
       if (currentNode.data && currentNode.data.content) {
            currentNode.data.content = interpolateMessage(currentNode.data.content, newSlots);
       }
       // Interpolate iframe URL (Now handled by the updated interpolateMessage)
       if (currentNode.type === 'iframe' && currentNode.data && currentNode.data.url) {
           const originalUrl = currentNode.data.url;
           currentNode.data.url = interpolateMessage(currentNode.data.url, newSlots); // Should now work correctly
           console.log(`[runScenario] Interpolating iframe URL. Original: "${originalUrl}", Interpolated: "${currentNode.data.url}"`);
            if (originalUrl !== currentNode.data.url && currentNode.data.url.includes('%7B%7BreqData%7D%7D')) {
               // This case should ideally not happen anymore, but log if it does
               console.error(`[runScenario] !!! reqData interpolation seems incorrect, placeholder remnant found: ${currentNode.data.url} !!!`);
           } else if (originalUrl === currentNode.data.url && originalUrl.includes('%7B%7BreqData%7D%7D')) {
               // Log if interpolation completely failed (shouldn't happen if slot exists)
               console.error(`[runScenario] !!! reqData interpolation FAILED for iframe URL !!!`);
           }
       }
       // Interpolate form title
       if (currentNode.type === 'form' && currentNode.data && currentNode.data.title) {
           currentNode.data.title = interpolateMessage(currentNode.data.title, newSlots);
       }
        // Interpolate form elements
        if (currentNode.type === 'form' && currentNode.data && Array.isArray(currentNode.data.elements)) {
            currentNode.data.elements.forEach(el => {
                if (el.label) el.label = interpolateMessage(el.label, newSlots);
                if (el.placeholder) el.placeholder = interpolateMessage(el.placeholder, newSlots);
                // Assign default value only if the slot is currently undefined in newSlots
                if (el.type === 'input' && el.defaultValue !== undefined && el.defaultValue !== null && el.name && newSlots[el.name] === undefined) {
                  // Interpolate the default value itself before assigning
                  newSlots[el.name] = interpolateMessage(String(el.defaultValue), newSlots);
                  // console.log(`[runScenario] Applied interpolated default value for form input "${el.name}": "${newSlots[el.name]}"`);
                }
                 // Interpolate dropbox options
                if (el.type === 'dropbox' && Array.isArray(el.options)) {
                    el.options = el.options.map(opt => interpolateMessage(opt, newSlots));
                }
                // Interpolate checkbox options
                if (el.type === 'checkbox' && Array.isArray(el.options)) {
                    el.options = el.options.map(opt => interpolateMessage(opt, newSlots));
                }
            });
        }
        // Interpolate branch replies
        if (currentNode.type === 'branch' && currentNode.data && Array.isArray(currentNode.data.replies)) {
             currentNode.data.replies.forEach(reply => {
                 if (reply.display) reply.display = interpolateMessage(reply.display, newSlots);
             });
        }

        return {
            type: 'scenario',
            nextNode: currentNode,
            scenarioState: { scenarioId, currentNodeId: currentNode.id, awaitingInput: currentNode.type === 'slotfilling' },
            slots: newSlots,
            events: allEvents,
        };
    } else {
        // Scenario end
        return {
            type: 'scenario_end',
            message: interpolateMessage(locales[language]?.scenarioEnded(scenarioId) || 'Scenario ended.', newSlots),
            scenarioState: null,
            slots: newSlots,
            events: allEvents,
        };
    }
}