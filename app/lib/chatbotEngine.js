// app/lib/chatbotEngine.js

import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
// --- 👇 [수정] getGeminiResponseWithSlots 임포트 제거 ---
// import { getGeminiResponseWithSlots } from './gemini';
import { locales } from './locales';
// --- 👇 [수정] nodeHandlers 임포트 ---
import { nodeHandlers } from './nodeHandlers';

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


// findScenarioIdByTrigger 함수는 현재 사용되지 않는 것으로 보이므로 제거하거나 주석 처리합니다.
/*
export async function findScenarioIdByTrigger(message) {
  // ... (이전 코드)
}
*/

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
    return scenarioSnap.data();
  } else {
    // 시나리오를 찾지 못했을 때 더 명확한 에러 메시지
    console.error(`Scenario with ID "${scenarioId}" not found in Firestore.`);
    throw new Error(`Scenario with ID "${scenarioId}" not found!`);
  }
};

const evaluateCondition = (slotValue, operator, conditionValue) => {
  // ... (기존 코드 유지) ...
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
      case 'contains': return slotValue != null && slotValue.toString().includes(String(conditionValue ?? ''));
      case '!contains': return slotValue == null || !slotValue.toString().includes(String(conditionValue ?? ''));
      default:
        console.warn(`Unsupported operator used in condition: ${operator}`);
        return false;
    }
};


// --- 👇 [수정] export 추가 ---
export const getNextNode = (scenario, currentNodeId, sourceHandleId = null, slots = {}) => {
  // ... (기존 getNextNode 로직 유지) ...
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
            const slotValue = slots[condition.slot];
            const valueToCompare = condition.valueType === 'slot' ? slots[condition.value] : condition.value;

            if (evaluateCondition(slotValue, condition.operator, valueToCompare)) {
                // 조건 만족 시 해당 핸들 ID 찾기
                const conditionIndex = conditions.indexOf(condition);
                // replies 구조가 handleId를 직접 포함하도록 변경되었을 수 있음 (확인 필요)
                // 현재 코드 기준: replies 배열의 인덱스로 핸들 ID 찾기
                const handleId = sourceNode.data.replies?.[conditionIndex]?.value; // 예: { display: "Yes", value: "handle-yes" }
                if (handleId) {
                    nextEdge = scenario.edges.find(edge => edge.source === currentNodeId && edge.sourceHandle === handleId);
                    if (nextEdge) {
                        console.log(`Branch condition met: Slot ${condition.slot} ${condition.operator} ${valueToCompare}, Handle: ${handleId}, Edge: ${nextEdge.id}`);
                        break; // 첫 번째 만족하는 조건 사용
                    }
                }
            }
        }
        // 조건 만족하는 엣지 없으면 아래 기본/default 엣지 로직으로 넘어감
    }

    // 3. 명시적 sourceHandleId가 있는 엣지 찾기 (예: 버튼 클릭)
    if (!nextEdge && sourceHandleId) {
        nextEdge = scenario.edges.find(
          edge => edge.source === currentNodeId && edge.sourceHandle === sourceHandleId
        );
        if (nextEdge) console.log(`Source handle matched: ${sourceHandleId}, Edge: ${nextEdge.id}`);
    }

    // 4. sourceHandleId가 없고, 조건 분기 노드의 default 또는 핸들 없는 엣지 찾기
    if (!nextEdge && !sourceHandleId && sourceNode.type === 'branch' && sourceNode.data.evaluationType === 'CONDITION') {
        // 명시적 'default' 핸들 우선
        nextEdge = scenario.edges.find(edge => edge.source === currentNodeId && edge.sourceHandle === 'default');
        if (nextEdge) {
             console.log(`Branch default handle matched, Edge: ${nextEdge.id}`);
        } else {
             // 'default' 핸들도 없으면 핸들 ID 없는 엣지 (Fallback)
             nextEdge = scenario.edges.find(edge => edge.source === currentNodeId && !edge.sourceHandle);
             if (nextEdge) console.log(`Branch no handle (fallback) matched, Edge: ${nextEdge.id}`);
        }
    }

    // 5. 그 외 모든 노드 타입에서 핸들 ID 없는 엣지 찾기 (기본 경로)
    if (!nextEdge && !sourceHandleId && !(sourceNode.type === 'branch' && sourceNode.data.evaluationType === 'CONDITION')) {
        nextEdge = scenario.edges.find(edge => edge.source === currentNodeId && !edge.sourceHandle);
        if (nextEdge) console.log(`Default edge (no handle) matched, Edge: ${nextEdge.id}`);
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

    // 다음 엣지를 찾지 못한 경우 (시나리오 분기 종료)
    console.log(`No next edge found for node "${currentNodeId}" (handle: "${sourceHandleId}"). Ending branch.`);
    return null; // 다음 노드 없음
};

// --- 👇 [수정] export 추가 ---
export const getDeepValue = (obj, path) => {
  // ... (기존 getDeepValue 로직 유지) ...
    if (!path || typeof path !== 'string' || !obj || typeof obj !== 'object') return undefined;

    const keys = path.match(/[^.[\]]+|\[(?:(-?\d+)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]/g);
    if (!keys) return undefined; // 경로 파싱 실패 시 undefined

    let value = obj;
    for (const key of keys) {
        if (value === null || typeof value === 'undefined') return undefined; // 중간 경로 값 없음

        let actualKey = key;
        const bracketMatch = key.match(/^\[(?:(-?\d+)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]$/);

        if (bracketMatch) { // 대괄호 표기법 처리
            if (bracketMatch[1]) { // 숫자 인덱스
                actualKey = parseInt(bracketMatch[1], 10);
                if (isNaN(actualKey)) return undefined; // 유효하지 않은 숫자 인덱스
            } else if (bracketMatch[3]) { // 따옴표 키
                actualKey = bracketMatch[3].replace(/\\(['"\\])/g, '$1'); // 이스케이프 처리
            } else {
                return undefined; // 잘못된 대괄호 형식
            }
        }

        // 객체 속성 접근 또는 배열 인덱스 접근
        if (Array.isArray(value)) {
            if (typeof actualKey === 'number' && actualKey >= 0 && actualKey < value.length) {
                value = value[actualKey];
            } else {
                return undefined; // 유효하지 않은 배열 인덱스
            }
        } else if (typeof value === 'object') {
             // hasOwnProperty 체크는 프로토타입 체인 오염 방지에 도움될 수 있으나, 여기서는 in 연산자로 충분
            if (actualKey in value) {
                value = value[actualKey];
            } else {
                return undefined; // 객체에 해당 키 없음
            }
        } else {
             return undefined; // 객체나 배열이 아닌 값에 접근 시도
        }
    }
    return value; // 최종 값 반환
};

// --- 👇 [수정] export 추가 ---
export const interpolateMessage = (message, slots) => {
  // ... (기존 interpolateMessage 로직 유지) ...
    if (!message || typeof message !== 'string') return String(message ?? '');

    let decodedMessage = message;
    try {
        decodedMessage = decodedMessage.replace(/%7B%7B/g, '{{').replace(/%7D%7D/g, '}}');
    } catch (e) { console.error("URL decoding error in interpolateMessage:", e); }

    const result = decodedMessage.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
        const path = key.trim();
        const value = getDeepValue(slots, path); // Use the safer getDeepValue

        if (value !== undefined && value !== null) {
            const stringValue = String(value);
            const matchIndex = decodedMessage.indexOf(match);
            const precedingChar = matchIndex > 0 ? decodedMessage[matchIndex - 1] : '';
            const isUrlParamValue = precedingChar === '=' || precedingChar === '&';

            if (isUrlParamValue) {
                try {
                    // 간단한 인코딩 확인 (완벽하지 않음)
                    let needsEncoding = true;
                    try { if (decodeURIComponent(stringValue) !== stringValue) needsEncoding = false; }
                    catch (decodeError) { needsEncoding = false; }

                    return needsEncoding ? encodeURIComponent(stringValue) : stringValue;
                } catch (encodeError) {
                    console.error(`Error encoding URL param "${path}":`, encodeError);
                    return stringValue; // 인코딩 실패 시 원본 반환
                }
            } else {
                return stringValue; // 일반 값은 그대로 반환
            }
        } else {
            console.warn(`[interpolate] Slot value not found for key: "${path}". Returning placeholder.`);
            return match; // 슬롯 값 없으면 플레이스홀더 유지
        }
    });
    return result;
};


export const validateInput = (value, validation, language = 'ko') => {
  // ... (기존 validateInput 로직 유지) ...
    if (!validation) return { isValid: true }; // 유효성 검사 없으면 항상 유효
    // 언어별 메시지 함수
    const t = (key, ...args) => {
        const msgOrFn = locales[language]?.[key] || locales['en']?.[key] || key;
        return typeof msgOrFn === 'function' ? msgOrFn(...args) : msgOrFn;
    };
    const getErrorMessage = (defaultKey) => validation.errorMessage || t(defaultKey);
    const valueStr = String(value ?? ''); // null/undefined 방지

    switch (validation.type) {
        case 'email':
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return { isValid: emailRegex.test(valueStr), message: getErrorMessage('validationEmail') };
        case 'phone number':
            // 간단한 형식 (xxx-xxxx-xxxx), 더 엄격하게 하려면 수정 필요
            const phoneRegex = /^\d{2,3}-\d{3,4}-\d{4}$/;
            return { isValid: phoneRegex.test(valueStr), message: getErrorMessage('validationPhone') };
        case 'custom':
            if (validation.regex) { // 커스텀 정규식
                try {
                    const isValid = new RegExp(validation.regex).test(valueStr);
                    return { isValid, message: isValid ? '' : getErrorMessage('validationFormat') };
                } catch (e) {
                    console.error("Invalid regex in validation:", validation.regex, e);
                    return { isValid: false, message: t('validationRegexError') };
                }
            }
            if (validation.startDate && validation.endDate) { // 날짜 범위
                 const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                 if (!dateRegex.test(valueStr)) return { isValid: false, message: getErrorMessage('validationFormat') };
                 try {
                     const selectedDate = new Date(valueStr);
                     const startDate = new Date(validation.startDate);
                     const endDate = new Date(validation.endDate);
                     // 시간 부분 제거하여 날짜만 비교
                     selectedDate.setHours(0, 0, 0, 0);
                     startDate.setHours(0, 0, 0, 0);
                     endDate.setHours(0, 0, 0, 0); // endDate는 포함되므로 시간 제거
                     const isValid = selectedDate >= startDate && selectedDate <= endDate;
                     return { isValid, message: isValid ? '' : t('validationDateRange', validation.startDate, validation.endDate) };
                 } catch (e) {
                     console.error("Invalid date format for range validation:", valueStr, e);
                     return { isValid: false, message: getErrorMessage('validationFormat') };
                 }
            }
            return { isValid: true }; // regex나 날짜 범위 없으면 통과
        case 'today after': // 오늘 포함 이후 날짜
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
        case 'today before': // 오늘 포함 이전 날짜
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
        default: // 알 수 없는 타입은 유효한 것으로 간주
          console.warn(`Unknown validation type: ${validation.type}`);
          return { isValid: true };
    }
};

// --- 👇 [수정] 핸들러 함수들 및 nodeHandlers 객체 제거 ---
/*
async function handleToastNode(...) { ... }
async function handleInteractiveNode(...) { ... }
async function handleLinkNode(...) { ... }
async function handleApiNode(...) { ... }
async function handleLlmNode(...) { ... }
async function handleBranchNode(...) { ... }
async function handleSetSlotNode(...) { ... }

const nodeHandlers = { ... };
*/
// --- 👆 [수정] ---

export async function runScenario(scenario, scenarioState, message, slots, scenarioSessionId, language) {
    // scenario, scenarioState 유효성 검사 추가
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
        // message.text가 없을 경우 빈 문자열로 처리
        const inputText = message?.text ?? '';
        const { isValid, message: validationMessage } = validateInput(inputText, validation, language);

        if (!isValid) {
            // 유효성 검사 실패 시, 현재 노드 유지하고 오류 메시지 반환 (새 타입 정의)
            return {
                type: 'scenario_validation_fail', // 새 타입
                message: validationMessage,
                nextNode: currentNode, // 현재 노드 유지
                scenarioState: scenarioState, // 상태 유지
                slots: newSlots, // 슬롯 유지
                events: allEvents, // 기존 이벤트 유지
            };
        }
        // 유효성 검사 통과 시 슬롯 업데이트
        if (currentNode.data?.slot) {
            newSlots[currentNode.data.slot] = inputText;
        } else {
             console.warn(`Node "${currentId}" awaited input but has no slot defined.`);
        }
    }

    // 2. 다음 노드 결정 (getNextNode 내부 오류 처리)
    let currentNode = getNextNode(scenario, currentId, message?.sourceHandle, newSlots);

    // 3. 비대화형 노드 자동 진행 루프
    while (currentNode) {
        // --- 👇 [수정] nodeHandlers 객체 사용 ---
        const handler = nodeHandlers[currentNode.type];
        // --- 👆 [수정] ---

        if (handler) {
            try { // 핸들러 실행 오류 처리
                // 핸들러 실행 (API 호출, 슬롯 설정 등)
                // handleLlmNode에 language 전달
                const result = await handler(currentNode, scenario, newSlots, scenarioSessionId, language);

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
        // console.log(`[runScenario] Interactive node ${currentNode.id} reached. Awaiting input.`);

        // --- 👇 [수정] 반환 전 보간 로직 강화 ---
        try {
            // 보간 전에 원본 데이터를 복사 (원본 시나리오 객체 변경 방지)
            const nodeToReturn = JSON.parse(JSON.stringify(currentNode));

            // 각 타입별 보간 처리
            if (nodeToReturn.data) {
                if (nodeToReturn.data.content) nodeToReturn.data.content = interpolateMessage(nodeToReturn.data.content, newSlots);
                if (nodeToReturn.type === 'iframe' && nodeToReturn.data.url) nodeToReturn.data.url = interpolateMessage(nodeToReturn.data.url, newSlots);
                if (nodeToReturn.type === 'form' && nodeToReturn.data.title) nodeToReturn.data.title = interpolateMessage(nodeToReturn.data.title, newSlots);
                if (nodeToReturn.type === 'form' && Array.isArray(nodeToReturn.data.elements)) {
                    nodeToReturn.data.elements.forEach(el => {
                        if (el.label) el.label = interpolateMessage(el.label, newSlots);
                        if (el.placeholder) el.placeholder = interpolateMessage(el.placeholder, newSlots);
                        // 기본값 보간은 FormRenderer에서 처리하는 것이 더 적합할 수 있음 (상태 관리 용이)
                        // if (el.type === 'input' && ...) newSlots[el.name] = interpolateMessage(...)
                        if (el.type === 'dropbox' && Array.isArray(el.options)) el.options = el.options.map(opt => interpolateMessage(opt, newSlots));
                        if (el.type === 'checkbox' && Array.isArray(el.options)) el.options = el.options.map(opt => interpolateMessage(opt, newSlots));
                        // Grid 데이터 보간은 ScenarioBubble/FormRenderer에서 처리
                    });
                }
                if (nodeToReturn.type === 'branch' && Array.isArray(nodeToReturn.data.replies)) {
                     nodeToReturn.data.replies.forEach(reply => { if (reply.display) reply.display = interpolateMessage(reply.display, newSlots); });
                }
            }

            // awaitInput 결정: slotfilling 또는 form 타입일 때만 true
            const isAwaiting = nodeToReturn.type === 'slotfilling' || nodeToReturn.type === 'form';

            return {
                type: 'scenario',
                nextNode: nodeToReturn, // 보간된 노드 데이터 반환
                scenarioState: { scenarioId, currentNodeId: nodeToReturn.id, awaitingInput: isAwaiting },
                slots: newSlots,
                events: allEvents,
            };
        } catch (interpolationError) {
             console.error(`Error during node data interpolation for node ${currentNode.id}:`, interpolationError);
             const errorMsg = locales[language]?.errorUnexpected || 'Scenario data processing error.';
             return { type: 'scenario_end', message: errorMsg, scenarioState: null, slots: newSlots, events: allEvents, status: 'failed' };
        }
        // --- 👆 [수정] ---

    } else { // 시나리오 종료
        console.log(`[runScenario] Scenario ${scenarioId} ended.`);
        const endMessage = interpolateMessage(locales[language]?.scenarioEnded(scenarioId) || 'Scenario ended.', newSlots);
        return {
            type: 'scenario_end',
            message: endMessage,
            scenarioState: null, // 상태 초기화
            slots: newSlots, // 최종 슬롯 반환
            events: allEvents, // 누적된 이벤트 반환
            status: newSlots.apiFailed ? 'failed' : 'completed', // 최종 상태 결정
        };
    }
}