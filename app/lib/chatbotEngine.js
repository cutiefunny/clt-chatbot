// app/lib/chatbotEngine.js

import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { locales } from './locales';
import { nodeHandlers } from './nodeHandlers'; // nodeHandlers 임포트
import { FASTAPI_BASE_URL, API_DEFAULTS } from './constants';

const SUPPORTED_SCHEMA_VERSION = "1.0";

let cachedScenarioCategories = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5분

/**
 * FastAPI의 /shortcut 엔드포인트에서 시나리오 카테고리 데이터를 가져옵니다.
 * 성능을 위해 5분 동안 캐시된 데이터를 사용합니다.
 * @returns {Promise<Array>} 시나리오 카테고리 배열 (subCategories 포함)
 */
export async function getScenarioCategories() {
  const now = Date.now();
  if (cachedScenarioCategories && (now - lastFetchTime < CACHE_DURATION)) {
    return cachedScenarioCategories;
  }

  try {
    // --- 👇 [수정] FastAPI 호출로 변경 ---
    const { TENANT_ID, STAGE_ID, SEC_OFC_ID } = API_DEFAULTS;
    const params = new URLSearchParams({
      ten_id: TENANT_ID,
      stg_id: STAGE_ID,
      sec_ofc_id: SEC_OFC_ID,
    });

    const response = await fetch(`${FASTAPI_BASE_URL}/shortcut?${params.toString()}`);
    
    if (response.ok) {
      const data = await response.json();
      // API 응답 구조: { name: string, subCategories: [...] }
      // 이를 배열 형태로 변환하여 저장 (기존 호환성 유지)
      const categoryData = [{
        name: data.name || "시나리오",
        subCategories: data.subCategories || []
      }];
      
      cachedScenarioCategories = categoryData;
      lastFetchTime = now;
      console.log('[getScenarioCategories] FastAPI에서 로드 성공:', categoryData);
      return cachedScenarioCategories;
    } else {
      console.warn(`Failed to fetch scenario categories from FastAPI (Status: ${response.status}). Returning empty array.`);
      return [];
    }
    // --- 👆 [수정] ---
  } catch (error) {
    console.error("Error fetching scenario categories from FastAPI:", error);
    return []; // 오류 발생 시 빈 배열 반환
  }
}

export async function findActionByTrigger(message) {
  const scenarioCategories = await getScenarioCategories();
  if (!scenarioCategories) return null;

  for (const category of scenarioCategories) {
    for (const subCategory of category.subCategories) {
        for (const item of subCategory.items) {
            // 사용자가 입력한 텍스트가 아이템의 제목과 정확히 일치하는지 확인 (대소문자 무시, 공백 제거)
            if (message.toLowerCase().trim() === item.title.toLowerCase().trim()) {
                // action 객체 유효성 검사 추가 (type과 value가 있는지)
                if (item.action && typeof item.action.type === 'string' && typeof item.action.value === 'string') {
                    return item.action;
                } else {
                    console.warn(`Invalid action found for item "${item.title}":`, item.action);
                    return null; // 유효하지 않으면 null 반환
                }
            }
        }
    }
  }
  return null; // 일치하는 아이템 없음
}

export const getScenarioList = async () => {
  const scenariosCollection = collection(db, 'scenarios');
  const querySnapshot = await getDocs(scenariosCollection);
  return querySnapshot.docs.map(doc => doc.id);
};

export const getScenario = async (scenarioId) => {
  // scenarioId 유효성 검사 추가
  if (!scenarioId || typeof scenarioId !== 'string') {
      throw new Error(`Invalid scenario ID provided: ${scenarioId}`);
  }
  const scenarioRef = doc(db, 'scenarios', scenarioId);
  const scenarioSnap = await getDoc(scenarioRef);

  if (scenarioSnap.exists()) {
    const scenarioData = scenarioSnap.data(); // 데이터 가져오기

    // 스키마 버전 확인
    if (!scenarioData.version || scenarioData.version !== SUPPORTED_SCHEMA_VERSION) {
        console.warn(`Scenario "${scenarioId}" has unsupported schema version "${scenarioData.version}". Expected "${SUPPORTED_SCHEMA_VERSION}". Proceeding with caution.`);
    }

    return scenarioData; // 시나리오 데이터 반환
  } else {
    // 시나리오를 찾지 못했을 때 더 명확한 에러 메시지
    console.error(`Scenario with ID "${scenarioId}" not found in Firestore.`);
    throw new Error(`Scenario with ID "${scenarioId}" not found!`);
  }
};

const evaluateCondition = (slotValue, operator, conditionValue) => {
    const lowerCaseConditionValue = String(conditionValue ?? '').toLowerCase(); // null/undefined 방지
    const boolConditionValue = lowerCaseConditionValue === 'true';
    // slotValue도 null/undefined일 수 있으므로 안전하게 문자열 변환
    const boolSlotValue = String(slotValue ?? '').toLowerCase() === 'true';

    if (lowerCaseConditionValue === 'true' || lowerCaseConditionValue === 'false') {
        switch (operator) {
          case '==': return boolSlotValue === boolConditionValue;
          case '!=': return boolSlotValue !== boolConditionValue;
          default: return false; // 불리언 비교는 ==, != 만 지원
        }
    }

    // 숫자 비교 전 유효성 검사 강화
    const numSlotValue = slotValue !== null && slotValue !== undefined && slotValue !== '' ? parseFloat(slotValue) : NaN;
    const numConditionValue = conditionValue !== null && conditionValue !== undefined && conditionValue !== '' ? parseFloat(conditionValue) : NaN;
    const bothAreNumbers = !isNaN(numSlotValue) && !isNaN(numConditionValue);

    switch (operator) {
      // 동등 비교는 타입 변환 고려 (==), 엄격 비교(===)는 필요시 추가
      case '==': return String(slotValue ?? '') == String(conditionValue ?? '');
      case '!=': return String(slotValue ?? '') != String(conditionValue ?? '');
      // 숫자 비교는 유효한 숫자인 경우에만 수행
      case '>': return bothAreNumbers && numSlotValue > numConditionValue;
      case '<': return bothAreNumbers && numSlotValue < numConditionValue;
      case '>=': return bothAreNumbers && numSlotValue >= numConditionValue;
      case '<=': return bothAreNumbers && numSlotValue <= numConditionValue;
      // 문자열 포함 여부 비교 (slotValue가 문자열화 가능한지 확인)
      case 'contains': return slotValue != null && String(slotValue).includes(String(conditionValue ?? ''));
      case '!contains': return slotValue == null || !String(slotValue).includes(String(conditionValue ?? ''));
      default:
        console.warn(`Unsupported operator used in condition: ${operator}`);
        return false;
    }
};


export const getNextNode = (scenario, currentNodeId, sourceHandleId = null, slots = {}) => {
    if (!scenario || !Array.isArray(scenario.nodes) || !Array.isArray(scenario.edges)) {
        console.error("Invalid scenario object passed to getNextNode:", scenario);
        return null; // 잘못된 시나리오 객체면 null 반환
    }

    // 시작 노드 결정
    if (!currentNodeId) {
      // 명시적 시작 노드 ID 확인
      if (scenario.startNodeId) {
        const startNode = scenario.nodes.find(node => node.id === scenario.startNodeId);
        if (startNode) return startNode;
        console.warn(`Specified startNodeId "${scenario.startNodeId}" not found.`);
      }
      // 기본 시작 노드 (들어오는 엣지 없는 노드) 찾기
      const edgeTargets = new Set(scenario.edges.map(edge => edge.target));
      const defaultStartNode = scenario.nodes.find(node => !edgeTargets.has(node.id));
      if (defaultStartNode) return defaultStartNode;

      console.error("Could not determine the start node.");
      return null; // 시작 노드 못 찾으면 null
    }

    // 현재 노드 찾기
    const sourceNode = scenario.nodes.find(n => n.id === currentNodeId);
    if (!sourceNode) {
        console.error(`Current node with ID "${currentNodeId}" not found.`);
        return null;
    }

    let nextEdge = null; // 다음 엣지 초기화

    // 1. LLM 노드의 조건부 분기 처리
    if (sourceNode.type === 'llm' && Array.isArray(sourceNode.data.conditions) && sourceNode.data.conditions.length > 0) {
        const llmOutput = String(slots[sourceNode.data.outputVar] || '').toLowerCase();
        const matchedCondition = sourceNode.data.conditions.find(cond =>
            cond.keyword && llmOutput.includes(String(cond.keyword).toLowerCase())
        );
        if (matchedCondition) {
            nextEdge = scenario.edges.find(edge => edge.source === currentNodeId && edge.sourceHandle === matchedCondition.id);
            if (nextEdge) console.log(`LLM condition matched: ${matchedCondition.keyword}, Edge: ${nextEdge.id}`);
        }
    }

    // 2. 조건 분기(branch) 노드 처리
    if (!nextEdge && sourceNode.type === 'branch' && sourceNode.data.evaluationType === 'CONDITION') {
        const conditions = sourceNode.data.conditions || [];
        for (const condition of conditions) {
            // 조건 값 가져오기 (슬롯 값 또는 직접 입력 값)
            const slotValue = getDeepValue(slots, condition.slot); // getDeepValue 사용
            const valueToCompare = condition.valueType === 'slot' ? getDeepValue(slots, condition.value) : condition.value; // getDeepValue 사용

            if (evaluateCondition(slotValue, condition.operator, valueToCompare)) {
                // 조건 만족 시 해당 핸들 ID 찾기
                const conditionIndex = conditions.indexOf(condition);
                const handleId = sourceNode.data.replies?.[conditionIndex]?.value;
                if (handleId) {
                    nextEdge = scenario.edges.find(edge => edge.source === currentNodeId && edge.sourceHandle === handleId);
                    if (nextEdge) {
                        console.log(`Branch condition met: Slot ${condition.slot} ${condition.operator} ${valueToCompare}, Handle: ${handleId}, Edge: ${nextEdge.id}`);
                        break; // 첫 번째 만족하는 조건 사용
                    }
                }
            }
        }
        // 조건 만족하는 엣지 없으면 default 엣지 확인
         if (!nextEdge) {
             nextEdge = scenario.edges.find(edge => edge.source === currentNodeId && edge.sourceHandle === 'default');
             if (nextEdge) console.log(`Branch default handle matched, Edge: ${nextEdge.id}`);
         }
        // default도 없으면 아래 기본/fallback 엣지 로직으로 넘어감
    }

    // 3. 명시적 sourceHandleId가 있는 엣지 찾기 (예: 버튼 클릭)
    if (!nextEdge && sourceHandleId) {
        nextEdge = scenario.edges.find(
          edge => edge.source === currentNodeId && edge.sourceHandle === sourceHandleId
        );
        if (nextEdge) console.log(`Source handle matched: ${sourceHandleId}, Edge: ${nextEdge.id}`);
    }

    // 4. sourceHandleId가 없고, 조건 분기 노드의 default 핸들 없는 엣지 찾기 (Fallback)
    if (!nextEdge && !sourceHandleId && sourceNode.type === 'branch') {
        // 핸들 ID 없는 엣지 (Fallback)
        nextEdge = scenario.edges.find(edge => edge.source === currentNodeId && !edge.sourceHandle);
        if (nextEdge) console.log(`Branch no handle (fallback) matched, Edge: ${nextEdge.id}`);
    }

    // 5. 그 외 모든 노드 타입에서 핸들 ID 없는 엣지 찾기 (기본 경로)
    if (!nextEdge && !sourceHandleId && sourceNode.type !== 'branch') { // branch 아닌 경우만
        nextEdge = scenario.edges.find(edge => edge.source === currentNodeId && !edge.sourceHandle);
        if (nextEdge) console.log(`Default edge (no handle) matched for node type ${sourceNode.type}, Edge: ${nextEdge.id}`);
    }

    // 찾은 엣지에 연결된 다음 노드 반환
    if (nextEdge) {
        const nextNode = scenario.nodes.find(node => node.id === nextEdge.target);
        if (!nextNode) {
            console.error(`Next node ID "${nextEdge.target}" not found (from edge ${nextEdge.id}).`);
            return null; // 다음 노드 없으면 null
        }
        return nextNode;
    }

    // 그룹 노드 처리
    console.log(`No explicit next edge found for node "${currentNodeId}" (handle: "${sourceHandleId}").`);
    if (sourceNode?.parentNode) {
        console.log(`Node "${currentNodeId}" is inside group "${sourceNode.parentNode}". Checking parent node for outgoing edges.`);
        return getNextNode(scenario, sourceNode.parentNode, null, slots);
    } else {
        console.log(`Node "${currentNodeId}" is not in a group or parent has no outgoing edges. Ending branch.`);
        return null; // 다음 노드 없음
    }
};


export const getDeepValue = (obj, path) => {
    if (!path || typeof path !== 'string' || !obj || typeof obj !== 'object') return undefined;
    let tempPath = path.replace(/\[([^\]]+)\]/g, (match, key) => `[${key.replace(/\./g, '__DOT__')}]`);
    const keys = tempPath.match(/[^.[\]]+|\[[^\]]+\]/g);
    if (!keys) return undefined;
    let value = obj;
    for (const key of keys) {
        if (value === null || typeof value === 'undefined') return undefined;
        let actualKey = key.replace(/__DOT__/g, '.');
        const bracketMatch = actualKey.match(/^\[(['"]?)(.+)\1\]$/);
        if (bracketMatch) {
            actualKey = bracketMatch[2];
             const index = parseInt(actualKey, 10);
             if (!isNaN(index) && String(index) === actualKey) actualKey = index;
        }
        if (Array.isArray(value)) {
            if (typeof actualKey === 'number' && actualKey >= 0 && actualKey < value.length) value = value[actualKey];
            else return undefined;
        } else if (typeof value === 'object') {
            if (actualKey in value) value = value[actualKey];
            else return undefined;
        } else {
             return undefined;
        }
    }
    return value;
};


export const interpolateMessage = (message, slots) => {
    if (message === null || typeof message === 'undefined') return '';
    if (typeof message !== 'string') message = String(message);
    let decodedMessage = message;
    try { decodedMessage = decodedMessage.replace(/%7B%7B/g, '{{').replace(/%7D%7D/g, '}}'); } catch (e) { console.error("URL decoding error in interpolateMessage:", e); }

    const result = decodedMessage.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
        const path = key.trim();
        const value = getDeepValue(slots, path);

        if (value !== undefined && value !== null) {
            let stringValue;
            if (typeof value === 'object') {
                try { stringValue = JSON.stringify(value); }
                catch (e) { console.warn(`[interpolate] Failed to stringify object for slot "${path}". Using default string representation.`); stringValue = String(value); }
            } else { stringValue = String(value); }

            const matchIndex = decodedMessage.indexOf(match);
            const precedingChar = matchIndex > 0 ? decodedMessage[matchIndex - 1] : '';
            const isUrlParamValue = precedingChar === '=' || precedingChar === '&';

            if (isUrlParamValue) {
                try {
                    let needsEncoding = true;
                    try { if (decodeURIComponent(stringValue) === stringValue) needsEncoding = false; } catch (decodeError) { needsEncoding = true; }
                    return needsEncoding ? encodeURIComponent(stringValue) : stringValue;
                } catch (encodeError) {
                    console.error(`Error encoding URL param "${path}":`, encodeError);
                    return stringValue;
                }
            } else {
                return stringValue;
            }
        } else {
            console.warn(`[interpolate] Slot value not found for key: "${path}". Returning placeholder.`);
            return match;
        }
    });
    return result;
};


export const validateInput = (value, validation, language = 'ko') => {
    if (!validation) return { isValid: true };
    const t = (key, ...args) => {
        const msgOrFn = locales[language]?.[key] || locales['en']?.[key] || key;
        return typeof msgOrFn === 'function' ? msgOrFn(...args) : msgOrFn;
    };
    const getErrorMessage = (defaultKey) => validation.errorMessage || t(defaultKey);
    const valueStr = String(value ?? '');

    switch (validation.type) {
        case 'email':
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return { isValid: emailRegex.test(valueStr), message: getErrorMessage('validationEmail') };
        case 'phone number':
            const phoneRegex = /^\d{2,3}-\d{3,4}-\d{4}$/;
            return { isValid: phoneRegex.test(valueStr), message: getErrorMessage('validationPhone') };
        case 'custom':
            if (validation.regex) {
                try {
                    const isValid = new RegExp(validation.regex).test(valueStr);
                    return { isValid, message: isValid ? '' : getErrorMessage('validationFormat') };
                } catch (e) {
                    console.error("Invalid regex in validation:", validation.regex, e);
                    return { isValid: false, message: t('validationRegexError') };
                }
            }
            if (validation.startDate && validation.endDate) {
                 const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                 if (!dateRegex.test(valueStr)) return { isValid: false, message: getErrorMessage('validationFormat') };
                 try {
                     const selectedDate = new Date(valueStr);
                     const startDate = new Date(validation.startDate);
                     const endDate = new Date(validation.endDate);
                     selectedDate.setHours(0, 0, 0, 0);
                     startDate.setHours(0, 0, 0, 0);
                     endDate.setHours(0, 0, 0, 0);
                     const isValid = selectedDate >= startDate && selectedDate <= endDate;
                     return { isValid, message: isValid ? '' : t('validationDateRange', validation.startDate, validation.endDate) };
                 } catch (e) {
                     console.error("Invalid date format for range validation:", valueStr, e);
                     return { isValid: false, message: getErrorMessage('validationFormat') };
                 }
            }
            return { isValid: true };
        case 'today after':
             const dateRegexAfter = /^\d{4}-\d{2}-\d{2}$/;
             if (!dateRegexAfter.test(valueStr)) return { isValid: false, message: getErrorMessage('validationFormat') };
             try {
                const selectedDate = new Date(valueStr);
                const today = new Date();
                selectedDate.setHours(0, 0, 0, 0);
                today.setHours(0, 0, 0, 0);
                const isValid = selectedDate >= today;
                return { isValid, message: isValid ? '' : t('validationDateAfter')};
             } catch (e) {
                 console.error("Invalid date format for 'today after' validation:", valueStr, e);
                 return { isValid: false, message: getErrorMessage('validationFormat') };
             }
        case 'today before':
            const dateRegexBefore = /^\d{4}-\d{2}-\d{2}$/;
             if (!dateRegexBefore.test(valueStr)) return { isValid: false, message: getErrorMessage('validationFormat') };
             try {
                const selectedDate = new Date(valueStr);
                const today = new Date();
                selectedDate.setHours(0, 0, 0, 0);
                today.setHours(0, 0, 0, 0);
                const isValid = selectedDate <= today;
                return { isValid, message: isValid ? '' : t('validationDateBefore')};
             } catch (e) {
                 console.error("Invalid date format for 'today before' validation:", valueStr, e);
                 return { isValid: false, message: getErrorMessage('validationFormat') };
             }
        default:
          console.warn(`Unknown validation type: ${validation.type}`);
          return { isValid: true };
    }
};


export async function runScenario(scenario, scenarioState, message, slots, scenarioSessionId, language) {
    if (!scenario || typeof scenario !== 'object' || !scenarioState || typeof scenarioState !== 'object') {
        console.error("runScenario called with invalid scenario or state:", { scenario, scenarioState });
        const errorMsg = locales[language]?.errorUnexpected || 'Scenario execution error.';
        return { type: 'scenario_end', message: errorMsg, scenarioState: null, slots: slots || {}, events: [] };
    }

    const { scenarioId, currentNodeId, awaitingInput } = scenarioState;
    let currentId = currentNodeId;
    let newSlots = { ...slots }; // 슬롯 복사
    const allEvents = []; // 이벤트 누적 배열

    // 1. 사용자 입력 처리 (awaitingInput 상태일 때)
    if (awaitingInput) {
        const currentNode = scenario.nodes?.find(n => n.id === currentId);
        if (!currentNode) {
             console.error(`Error in runScenario: Current node "${currentId}" not found during input processing.`);
             const errorMsg = locales[language]?.errorUnexpected || 'Scenario state error.';
             return { type: 'scenario_end', message: errorMsg, scenarioState: null, slots: newSlots, events: [] };
        }
        // 입력값 유효성 검사
        const validation = currentNode.data?.validation;
        const inputText = message?.text ?? '';
        const { isValid, message: validationMessage } = validateInput(inputText, validation, language);

        if (!isValid) {
            // 유효성 검사 실패 시, 현재 노드 유지하고 오류 메시지 반환
            return {
                type: 'scenario_validation_fail',
                message: validationMessage,
                nextNode: currentNode,
                scenarioState: scenarioState,
                slots: newSlots,
                events: allEvents,
            };
        }
        // 유효성 검사 통과 시 슬롯 업데이트
        if (currentNode.data?.slot) {
            newSlots[currentNode.data.slot] = inputText;
        } else {
             console.warn(`Node "${currentId}" awaited input but has no slot defined.`);
        }
    }

    // 2. 다음 노드 결정
    let currentNode = getNextNode(scenario, currentId, message?.sourceHandle, newSlots);

    // 3. 비대화형 노드 자동 진행 루프
    while (currentNode) {
        const handler = nodeHandlers[currentNode.type]; // nodeHandlers에서 핸들러 가져오기

        if (handler) {
            try { // 핸들러 실행 오류 처리
                // 핸들러 실행 (delay 핸들러는 await Promise 포함)
                const result = await handler(currentNode, scenario, newSlots, scenarioSessionId, language); // language 전달

                if (!result) { // 핸들러가 유효하지 않은 결과 반환 시
                    throw new Error(`Handler for node type "${currentNode.type}" (ID: ${currentNode.id}) returned invalid result.`);
                }

                newSlots = result.slots || newSlots; // 슬롯 업데이트
                if (result.events) allEvents.push(...result.events); // 이벤트 누적

                // 핸들러가 현재 노드를 다시 반환하면 (대화형 노드), 루프 중단
                if (result.nextNode && result.nextNode.id === currentNode.id) {
                    currentNode = result.nextNode;
                    break;
                }
                // 다음 노드로 진행
                currentNode = result.nextNode;

            } catch (handlerError) { // 핸들러 실행 중 오류 발생 시
                console.error(`Error executing handler for node ${currentNode?.id} (${currentNode?.type}):`, handlerError);
                const errorMsg = locales[language]?.errorUnexpected || 'An error occurred during scenario execution.';
                // 오류 발생 시 시나리오 종료 처리
                 return { type: 'scenario_end', message: errorMsg, scenarioState: null, slots: newSlots, events: allEvents, status: 'failed' }; // status: 'failed' 추가
            }
        } else { // 핸들러가 없는 노드 타입일 경우
            console.warn(`No handler found for node type: ${currentNode.type}. Ending scenario flow.`);
            currentNode = null; // 루프 종료
        }
    } // End of while loop

    // 4. 최종 결과 반환 (대화형 노드에서 멈췄거나, 시나리오 종료)
    if (currentNode) { // 대화형 노드에서 멈춘 경우
        console.log(`[runScenario] Interactive node ${currentNode.id} reached. Awaiting input.`);

        try {
            const nodeToReturn = JSON.parse(JSON.stringify(currentNode)); // 원본 복사

            // Form 노드 기본값 슬롯 업데이트 로직
            if (nodeToReturn.type === 'form') {
                let initialSlotsUpdate = {};
                (nodeToReturn.data.elements || []).forEach(element => {
                    if (element.name && element.defaultValue !== undefined && element.defaultValue !== null && String(element.defaultValue).trim() !== '') {
                         let resolvedValue = interpolateMessage(String(element.defaultValue), newSlots);
                         if (element.type === 'checkbox' && !Array.isArray(element.defaultValue)) {
                             resolvedValue = typeof element.defaultValue === 'string'
                               ? element.defaultValue.split(',').map(s => s.trim())
                               : [resolvedValue];
                         }
                         if (newSlots[element.name] === undefined) {
                            initialSlotsUpdate[element.name] = resolvedValue;
                         }
                    }
                });
                if (Object.keys(initialSlotsUpdate).length > 0) {
                    newSlots = { ...newSlots, ...initialSlotsUpdate };
                    console.log(`[runScenario] Applied default values for form node ${currentNode.id}. Updated slots:`, initialSlotsUpdate);
                }
            }

            // 반환 전 보간 로직 강화 (업데이트된 newSlots 사용)
            if (nodeToReturn.data) {
                if (nodeToReturn.data.content) nodeToReturn.data.content = interpolateMessage(nodeToReturn.data.content, newSlots);
                if (nodeToReturn.type === 'iframe' && nodeToReturn.data.url) nodeToReturn.data.url = interpolateMessage(nodeToReturn.data.url, newSlots);
                if (nodeToReturn.type === 'link' && nodeToReturn.data.display) nodeToReturn.data.display = interpolateMessage(nodeToReturn.data.display, newSlots);
                if (nodeToReturn.type === 'form' && nodeToReturn.data.title) nodeToReturn.data.title = interpolateMessage(nodeToReturn.data.title, newSlots);
                if (nodeToReturn.type === 'form' && Array.isArray(nodeToReturn.data.elements)) {
                    nodeToReturn.data.elements.forEach(el => {
                        if (el.label) el.label = interpolateMessage(el.label, newSlots);
                        if (el.placeholder) el.placeholder = interpolateMessage(el.placeholder, newSlots);
                        if ((el.type === 'dropbox' || el.type === 'checkbox') && Array.isArray(el.options)) {
                           el.options = el.options.map(opt => typeof opt === 'string' ? interpolateMessage(opt, newSlots) : opt);
                        }
                    });
                }
                if (nodeToReturn.type === 'branch' && Array.isArray(nodeToReturn.data.replies)) {
                     nodeToReturn.data.replies.forEach(reply => { if (reply.display) reply.display = interpolateMessage(reply.display, newSlots); });
                }
            }

            // awaitingInput 상태 결정 로직 수정
            const isAwaiting = nodeToReturn.type === 'slotfilling' ||
                               nodeToReturn.type === 'form' ||
                               (nodeToReturn.type === 'branch' && nodeToReturn.data?.evaluationType !== 'CONDITION');


            return {
                type: 'scenario',
                nextNode: nodeToReturn,
                scenarioState: { scenarioId, currentNodeId: nodeToReturn.id, awaitingInput: isAwaiting },
                slots: newSlots,
                events: allEvents,
            };
        } catch (processingError) {
             console.error(`Error during interactive node processing for node ${currentNode.id}:`, processingError);
             const errorMsg = locales[language]?.errorUnexpected || 'Scenario data processing error.';
             return { type: 'scenario_end', message: errorMsg, scenarioState: null, slots: newSlots, events: allEvents, status: 'failed' };
        }

    } else { // 시나리오 종료
        console.log(`[runScenario] Scenario ${scenarioId} ended.`);
        const endMessage = interpolateMessage(locales[language]?.scenarioEnded(scenarioId) || 'Scenario ended.', newSlots);
        return {
            type: 'scenario_end',
            message: endMessage,
            scenarioState: null,
            slots: newSlots,
            events: allEvents,
            status: newSlots.apiFailed ? 'failed' : 'completed',
        };
    }
}