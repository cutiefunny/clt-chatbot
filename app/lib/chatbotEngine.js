import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

// 시나리오를 트리거하는 키워드와 시나리오 ID 맵
export const scenarioTriggers = {
  "reservation": "reservation", // --- [수정] ---
  "question": "faq-scenario",
  "welcome": "Welcome",
  "scenario list": "GET_SCENARIO_LIST"
};

/**
 * 사용자 메시지에서 키워드를 찾아 해당하는 시나리오 ID 또는 액션을 반환하는 함수
 * @param {string} message - 사용자 입력 메시지
 * @returns {string | null} - 발견된 시나리오 ID 또는 액션 ID, 없으면 null
 */
export function findScenarioIdByTrigger(message) {
  for (const keyword in scenarioTriggers) {
    if (message.toLowerCase().includes(keyword.toLowerCase())) {
      return scenarioTriggers[keyword];
    }
  }
  return null;
}

/**
 * Firestore에서 모든 시나리오의 목록(ID)을 가져오는 함수
 * @returns {Promise<string[]>} 시나리오 ID 목록 배열
 */
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

  // LLM 노드 분기 처리
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
    // 키 값의 앞뒤 공백을 제거하여 예상치 못한 데이터 오류를 방지합니다.
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

export async function runScenario(scenario, scenarioState, message, slots, scenarioSessionId) {
    const { scenarioId, currentNodeId, awaitingInput } = scenarioState;
    let currentId = currentNodeId;
    let newSlots = { ...slots };
    const events = [];
    
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

    let nextNode = getNextNode(scenario, currentId, message.sourceHandle, newSlots);

    while (nextNode) {
        nextNode.data.content = interpolateMessage(nextNode.data.content, newSlots);
        
        if (nextNode.type === 'toast') {
            const interpolatedToastMessage = interpolateMessage(nextNode.data.message, newSlots);
            events.push({
                type: 'toast',
                message: interpolatedToastMessage,
                toastType: nextNode.data.toastType || 'info',
            });
            nextNode = getNextNode(scenario, nextNode.id, null, newSlots);
            continue; 
        }

        if (['slotfilling', 'message', 'branch', 'form', 'iframe'].includes(nextNode.type)) {
            if (nextNode.type === 'iframe' && nextNode.data.url && scenarioSessionId) {
                try {
                    const url = new URL(nextNode.data.url);
                    url.searchParams.set('scenario_session_id', scenarioSessionId);
                    nextNode.data.url = url.toString();
                } catch (e) {
                    console.error("Invalid URL in iFrame node:", nextNode.data.url);
                    const separator = nextNode.data.url.includes('?') ? '&' : '?';
                    nextNode.data.url += `${separator}scenario_session_id=${scenarioSessionId}`;
                }
            }

            const isAwaiting = nextNode.type === 'slotfilling';
            return {
                type: 'scenario',
                nextNode,
                scenarioState: { scenarioId, currentNodeId: nextNode.id, awaitingInput: isAwaiting },
                slots: newSlots,
                events,
            };
        }

        if (nextNode.type === 'api') {
            const { method, url, headers, body, params, responseMapping } = nextNode.data;
            let interpolatedUrl = interpolateMessage(url, newSlots);

            if (method === 'GET' && params) {
                const queryParams = new URLSearchParams();
                for (const key in params) {
                    if (Object.hasOwnProperty.call(params, key)) {
                        const value = interpolateMessage(params[key], newSlots);
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

            const interpolatedHeaders = JSON.parse(interpolateMessage(headers || '{}', newSlots));
            const interpolatedBody = method !== 'GET' && body ? interpolateMessage(body, newSlots) : undefined;

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
                        if (value !== undefined) newSlots[mapping.slot] = value;
                    });
                }
                isSuccess = true;
            } catch (error) {
                console.error("API Node Error:", error);
                newSlots['apiError'] = error.message; 
                isSuccess = false;
            }

            nextNode = getNextNode(scenario, nextNode.id, isSuccess ? 'onSuccess' : 'onError', newSlots);
            continue;
        }
        
        if (nextNode.type === 'llm') {
            const { getGeminiStream } = await import('./gemini'); // 필요할 때만 import
            const interpolatedPrompt = interpolateMessage(nextNode.data.prompt, newSlots);
            const stream = await getGeminiStream(interpolatedPrompt);
            const reader = stream.getReader();
            const decoder = new TextDecoder();
            let llmResponse = '';
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                llmResponse += decoder.decode(value, { stream: true });
            }

            if (nextNode.data.outputVar) {
                newSlots[nextNode.data.outputVar] = llmResponse;
            }

            nextNode = getNextNode(scenario, nextNode.id, null, newSlots);
            continue;
        }
        break;
    }

    if (nextNode) {
        return {
            type: 'scenario',
            nextNode,
            scenarioState: { scenarioId, currentNodeId: nextNode.id, awaitingInput: false },
            slots: newSlots,
            events,
        };
    } else {
        return {
            type: 'scenario_end',
            message: '시나리오가 종료되었습니다.',
            scenarioState: null,
            slots: newSlots,
            events,
        };
    }
}