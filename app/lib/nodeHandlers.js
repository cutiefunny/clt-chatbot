// app/lib/nodeHandlers.js
import { getGeminiResponseWithSlots } from './gemini'; 
import { getNextNode, interpolateMessage, getDeepValue } from './chatbotEngine';
import { logger } from './logger';

// [수정] JSON 내부 문자열 재귀 보간 함수 (순환 참조 방지 추가)
function interpolateObjectStrings(obj, slots, visited = new WeakSet()) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  // 순환 참조 감지
  if (visited.has(obj)) {
      console.warn("[interpolateObjectStrings] Circular reference detected. Skipping object:", obj);
      return obj; 
  }
  visited.add(obj);

  if (Array.isArray(obj)) {
    return obj.map(item => interpolateObjectStrings(item, slots, visited));
  }

  const newObj = {};
  for (const key in obj) {
    if (Object.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (typeof value === 'string') {
        newObj[key] = interpolateMessage(value, slots);
      } else {
        newObj[key] = interpolateObjectStrings(value, slots, visited);
      }
    }
  }
  return newObj;
}

// --- [신규] API URL 생성 헬퍼 함수 ---
const buildApiUrl = (baseUrl, params, slots) => {
    let currentUrl = interpolateMessage(baseUrl, slots);
    
    // 상대 경로 처리
    if (currentUrl.startsWith('/')) {
        const appBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
        currentUrl = `${appBaseUrl}${currentUrl}`;
    }

    // GET 파라미터 처리
    if (params) {
        const queryParams = new URLSearchParams();
        for (const key in params) {
            if (Object.hasOwnProperty.call(params, key)) {
                const value = interpolateMessage(params[key], slots);
                if (value) queryParams.append(key, value);
            }
        }
        const queryString = queryParams.toString();
        if (queryString) {
            currentUrl += (currentUrl.includes('?') ? '&' : '?') + queryString;
        }
    }
    return currentUrl;
};

// --- [신규] Fetch 옵션 생성 헬퍼 함수 ---
const buildFetchOptions = (method, headers, body, slots) => {
    const currentHeaders = JSON.parse(interpolateMessage(headers || '{}', slots));
    let finalBody = undefined;
    let debugBody = null;

    if (method !== 'GET' && body) {
        try {
            const bodyObject = JSON.parse(body);
            // 순환 참조 방지 버전의 interpolateObjectStrings 사용
            const interpolatedBodyObject = interpolateObjectStrings(bodyObject, slots); 
            finalBody = JSON.stringify(interpolatedBodyObject);
            debugBody = finalBody;
        } catch (e) {
            console.error("Error processing API body:", e);
            finalBody = interpolateMessage(body, slots);
            debugBody = finalBody;
        }
    }

    return {
        options: {
            method: method,
            headers: { 'Content-Type': 'application/json', ...currentHeaders },
            body: finalBody
        },
        debugBody
    };
};


// --- 각 노드 핸들러 함수 정의 ---

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
    return { nextNode: node, slots: slots, events: [] };
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

// [리팩토링] handleApiNode
async function handleApiNode(node, scenario, slots) {
    const { method, url, headers, body, params, responseMapping, isMulti, apis } = node.data;
    let lastRequestBodyForDebug = null;

    // 단일 API 호출 처리 함수 (헬퍼 함수 활용)
    const executeSingleApi = async (apiConfig) => {
        const targetUrl = buildApiUrl(apiConfig.url, apiConfig.method === 'GET' ? apiConfig.params : null, slots);
        const { options, debugBody } = buildFetchOptions(apiConfig.method, apiConfig.headers, apiConfig.body, slots);
        
        lastRequestBodyForDebug = debugBody; // 디버깅용 저장 (마지막 요청 본문)

        const response = await fetch(targetUrl, options);
        const responseText = await response.text();

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}. URL: ${targetUrl}. Body: ${responseText}`);
        }
        
        const result = responseText ? JSON.parse(responseText) : null;
        return { result, mapping: apiConfig.responseMapping };
    };

    let isSuccess = false;
    let currentSlots = { ...slots };

    try {
        let results = [];
        if (isMulti && Array.isArray(apis)) {
             const settledResults = await Promise.allSettled(apis.map(api => executeSingleApi(api)));
             const fulfilled = settledResults.filter(r => r.status === 'fulfilled').map(r => r.value);
             const rejected = settledResults.filter(r => r.status === 'rejected');
             if (rejected.length > 0) throw rejected[0].reason;
             results = fulfilled;
        } else if (!isMulti) {
            // 단일 호출 구성을 객체로 만들어 전달
            const singleConfig = { url, method, headers, body, params, responseMapping };
            results.push(await executeSingleApi(singleConfig));
        } else {
             throw new Error("Invalid API node configuration: isMulti is true but 'apis' array is missing or invalid.");
        }

        // 결과 매핑
        const combinedNewSlots = {};
        results.forEach(({ result, mapping }) => {
            if (mapping && mapping.length > 0) {
                mapping.forEach(m => {
                    if (m.slot && typeof m.slot === 'string' && m.slot.trim() !== '') {
                        const value = getDeepValue(result, m.path);
                        if (value !== undefined) {
                            combinedNewSlots[m.slot] = value;
                        }
                    } else {
                        console.warn(`[handleApiNode] Invalid or empty slot name found in responseMapping. Path: "${m.path}", Slot: "${m.slot}". Skipping mapping.`);
                    }
                });
            }
        });
        currentSlots = { ...currentSlots, ...combinedNewSlots };
        isSuccess = true;

    } catch (error) {
        console.error("API Node Error:", error);
        currentSlots['apiError'] = error.message;
        currentSlots['apiFailed'] = true;
        isSuccess = false;
    } finally {
        if (lastRequestBodyForDebug) {
            currentSlots['_lastApiRequestBody'] = lastRequestBodyForDebug;
        } else if (currentSlots['_lastApiRequestBody']) {
            delete currentSlots['_lastApiRequestBody'];
        }
    }

    const nextNode = getNextNode(scenario, node.id, isSuccess ? 'onSuccess' : 'onError', currentSlots);
    return { nextNode, slots: currentSlots, events: [] };
}

async function handleLlmNode(node, scenario, slots, language) {
    const interpolatedPrompt = interpolateMessage(node.data.prompt, slots);
    const geminiData = await getGeminiResponseWithSlots(interpolatedPrompt, language);
    const llmResponseText = geminiData.response;
    const extractedSlots = geminiData.slots || {};
    let currentSlots = { ...slots };

    if (extractedSlots && Object.keys(extractedSlots).length > 0) {
        currentSlots = { ...currentSlots, ...extractedSlots };
    }

    if (node.data.outputVar) {
        currentSlots[node.data.outputVar] = llmResponseText;
    }

    const nextNode = getNextNode(scenario, node.id, null, currentSlots);
    return { nextNode, slots: currentSlots, events: [] };
}

async function handleBranchNode(node, scenario, slots) {
  if (node.data.evaluationType === 'CONDITION') {
    const nextNode = getNextNode(scenario, node.id, null, slots);
    return { nextNode, slots, events: [] };
  } else {
    return { nextNode: node, slots, events: [] };
  }
}

async function handleSetSlotNode(node, scenario, slots) {
  console.log('[handleSetSlotNode] Executing node:', node.id);

  const newSlots = { ...slots };
  const assignments = node.data.assignments || [];

  for (const assignment of assignments) {
    if (assignment.key) {
      let interpolatedValue = interpolateMessage(assignment.value, newSlots);

      try {
          const trimmedValue = interpolatedValue.trim();
          if ((trimmedValue.startsWith('{') && trimmedValue.endsWith('}')) || (trimmedValue.startsWith('[') && trimmedValue.endsWith(']'))) {
              newSlots[assignment.key] = JSON.parse(trimmedValue);
          } else if (trimmedValue.toLowerCase() === 'true') {
              newSlots[assignment.key] = true;
          } else if (trimmedValue.toLowerCase() === 'false') {
              newSlots[assignment.key] = false;
          } else if (!isNaN(trimmedValue) && trimmedValue !== '') {
               const num = Number(trimmedValue);
               if (!isNaN(num)) {
                   newSlots[assignment.key] = num;
               } else {
                   newSlots[assignment.key] = interpolatedValue;
               }
          } else {
              newSlots[assignment.key] = interpolatedValue;
          }
      } catch (e) {
          console.warn(`[handleSetSlotNode] Failed to parse JSON for slot "${assignment.key}", saving as string. Value:`, interpolatedValue);
          newSlots[assignment.key] = interpolatedValue;
      }
    }
  }

  const nextNode = getNextNode(scenario, node.id, null, newSlots);
  return { nextNode, slots: newSlots, events: [] };
}

async function handleDelayNode(node, scenario, slots) {
  const duration = node.data?.duration;
  if (typeof duration !== 'number' || duration < 0) {
    console.warn(`Invalid or missing duration in delay node ${node.id}: ${duration}. Skipping delay.`);
  } else {
    console.log(`[handleDelayNode] Delaying for ${duration}ms...`);
    await new Promise(resolve => setTimeout(resolve, duration));
    console.log(`[handleDelayNode] Delay finished.`);
  }
  const nextNode = getNextNode(scenario, node.id, null, slots);
  return { nextNode, slots, events: [] };
}

export const nodeHandlers = {
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
  'delay': handleDelayNode,
};