// app/lib/nodeHandlers.js
import { getGeminiResponseWithSlots } from './gemini'; // 또는 getLlmResponse from './llm'
import { getNextNode, interpolateMessage, getDeepValue } from './chatbotEngine';
// import { getLlmResponse } from './llm';

// JSON 내부 문자열 재귀 보간 함수
function interpolateObjectStrings(obj, slots) {
  if (typeof obj !== 'object' || obj === null) {
    return obj; // 객체가 아니면 그대로 반환
  }

  if (Array.isArray(obj)) {
    // 배열이면 각 요소를 재귀적으로 처리
    return obj.map(item => interpolateObjectStrings(item, slots));
  }

  // 객체면 각 속성 값을 재귀적으로 처리
  const newObj = {};
  for (const key in obj) {
    if (Object.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (typeof value === 'string') {
        newObj[key] = interpolateMessage(value, slots); // 문자열이면 보간
      } else {
        newObj[key] = interpolateObjectStrings(value, slots); // 객체/배열이면 재귀 호출
      }
    }
  }
  return newObj;
}


// --- 각 노드 핸들러 함수 정의 ---

async function handleToastNode(node, scenario, slots, scenarioSessionId) {
  const interpolatedToastMessage = interpolateMessage(node.data.message, slots);
  const event = {
    type: 'toast',
    message: interpolatedToastMessage,
    toastType: node.data.toastType || 'info',
    scenarioSessionId: scenarioSessionId, // 이벤트 발생 시나리오 ID 포함
  };
  // 다음 노드를 결정합니다.
  const nextNode = getNextNode(scenario, node.id, null, slots);
  // 다음 노드 정보, 업데이트된 슬롯, 발생한 이벤트를 반환합니다.
  return { nextNode, slots, events: [event] };
}

async function handleInteractiveNode(node, scenario, slots, scenarioSessionId) {
    // iframe 노드이고 URL이 있으며 세션 ID가 있는 경우
    if (node.type === 'iframe' && node.data.url && scenarioSessionId) {
        try {
            // URL 객체를 생성하여 파싱 시도
            const url = new URL(node.data.url);
            // URL에 이미 scenario_session_id 파라미터가 없는지 확인
            if (!url.searchParams.has('scenario_session_id')) {
                // 파라미터가 없으면 추가
                url.searchParams.set('scenario_session_id', scenarioSessionId);
                // 수정된 URL을 노드 데이터에 다시 할당
                node.data.url = url.toString();
            }
        } catch (e) {
            // URL 파싱 실패 시 경고 로그 출력 및 수동 추가 시도
            console.warn("Could not parse URL to add session ID in handleInteractiveNode:", node.data.url);
             // URL에 이미 파라미터가 있는지 간단히 확인 후 추가
             if (!node.data.url.includes('scenario_session_id=')) {
                 const separator = node.data.url.includes('?') ? '&' : '?';
                 node.data.url += `${separator}scenario_session_id=${scenarioSessionId}`;
             }
        }
    }
    // 대화형 노드(slotfilling, message, form, iframe, 조건 없는 branch)는
    // 사용자 입력을 기다려야 하므로, 다음 노드를 진행하지 않고 현재 노드를 반환합니다.
    return { nextNode: node, slots: slots, events: [] }; // nextNode를 현재 노드로 설정하여 루프 중단, slots/events 반환 추가
}


async function handleLinkNode(node, scenario, slots) {
    const events = [];
    if (node.data.content) { // URL이 있는지 확인
        // 슬롯 값을 사용하여 URL 보간
        const interpolatedUrl = interpolateMessage(node.data.content, slots);
        // 'open_link' 타입의 이벤트 객체 생성
        events.push({
            type: 'open_link',
            url: interpolatedUrl,
        });
        console.log(`[handleLinkNode] Generated open_link event for URL: ${interpolatedUrl}`);
    } else {
        // URL이 없는 경우 경고 로그
        console.warn("[handleLinkNode] Link node has no content (URL).");
    }
    // 링크 노드는 실행 후 바로 다음 노드로 진행
    const nextNode = getNextNode(scenario, node.id, null, slots);
    return { nextNode, slots, events };
}


async function handleApiNode(node, scenario, slots) {
    const { method, url, headers, body, params, responseMapping, isMulti, apis } = node.data;

    // 마지막 요청 본문 슬롯 저장용 변수
    let lastRequestBodyForDebug = null;

    // API 호출 처리 함수 (단일/다중 공통 로직)
    const processApiCall = async (apiCallData) => {
        // URL 보간 (GET 파라미터 포함)
        let currentUrl = interpolateMessage(apiCallData.url, slots);
        if (apiCallData.method === 'GET' && apiCallData.params) {
            const queryParams = new URLSearchParams();
            for (const key in apiCallData.params) {
                if (Object.hasOwnProperty.call(apiCallData.params, key)) {
                    const value = interpolateMessage(apiCallData.params[key], slots);
                    if (value) queryParams.append(key, value);
                }
            }
            const queryString = queryParams.toString();
            if (queryString) {
                currentUrl += (currentUrl.includes('?') ? '&' : '?') + queryString;
            }
        }

        // 상대 경로 처리
        if (currentUrl.startsWith('/')) {
            const baseURL = process.env.NEXT_PUBLIC_API_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
            currentUrl = `${baseURL}${currentUrl}`;
        }

        // 헤더 보간
        const currentHeaders = JSON.parse(interpolateMessage(apiCallData.headers || '{}', slots));
        let finalBody = undefined;

        // 본문 보간 (재귀적)
        if (apiCallData.method !== 'GET' && apiCallData.body) {
            try {
                const bodyObject = JSON.parse(apiCallData.body);
                const interpolatedBodyObject = interpolateObjectStrings(bodyObject, slots);
                finalBody = JSON.stringify(interpolatedBodyObject);
                lastRequestBodyForDebug = finalBody; // 디버깅용 저장
            } catch (e) {
                console.error("Error processing API body for interpolation:", e, "Original body:", apiCallData.body);
                finalBody = interpolateMessage(apiCallData.body, slots); // Fallback
                lastRequestBodyForDebug = finalBody;
            }
        }

        // fetch API 호출
        const response = await fetch(currentUrl, {
             method: apiCallData.method,
             headers: { 'Content-Type': 'application/json', ...currentHeaders },
             body: finalBody
        });

        // 응답 처리
        const responseText = await response.text(); // 텍스트 먼저 받고
        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}. URL: ${currentUrl}. Body: ${responseText}`);
        }
        // 텍스트가 비어있지 않으면 JSON 파싱 시도
        const result = responseText ? JSON.parse(responseText) : null;
        return { result, mapping: apiCallData.responseMapping };
    };


    let isSuccess = false;
    let currentSlots = { ...slots }; // 현재 슬롯 복사본 사용

    try {
        let results = [];
        if (isMulti && Array.isArray(apis)) {
             const settledResults = await Promise.allSettled(apis.map(api => processApiCall(api)));
             const fulfilled = settledResults.filter(r => r.status === 'fulfilled').map(r => r.value);
             const rejected = settledResults.filter(r => r.status === 'rejected');
             if (rejected.length > 0) throw rejected[0].reason;
             results = fulfilled;
        } else if (!isMulti) {
            results.push(await processApiCall({ url, method, headers, body, params, responseMapping }));
        } else {
             throw new Error("Invalid API node configuration: isMulti is true but 'apis' array is missing or invalid.");
        }

        // 결과 매핑
        const combinedNewSlots = {};
        results.forEach(({ result, mapping }) => {
            if (mapping && mapping.length > 0) {
                mapping.forEach(m => {
                    const value = getDeepValue(result, m.path);
                    if (value !== undefined) combinedNewSlots[m.slot] = value;
                });
            }
        });
        currentSlots = { ...currentSlots, ...combinedNewSlots }; // 슬롯 업데이트

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

    const nextNode = getNextNode(scenario, node.id, isSuccess ? 'onSuccess' : 'onError', currentSlots); // 업데이트된 currentSlots 사용
    return { nextNode, slots: currentSlots, events: [] }; // 최종 슬롯 반환
}


async function handleLlmNode(node, scenario, slots, language) {
    const interpolatedPrompt = interpolateMessage(node.data.prompt, slots); // 프롬프트 보간

    // getLlmResponse 사용 예시 (gemini.js 직접 사용 대신)
    // const { llmProvider, flowiseApiUrl } = useChatStore.getState(); // 전역 설정 가져오기
    // const llmResult = await getLlmResponse(interpolatedPrompt, language, [], llmProvider, flowiseApiUrl);
    // let llmResponseText = llmResult.response;
    // let extractedSlots = llmResult.slots || {};

    // 현재 코드 유지 (gemini.js 직접 사용)
    const geminiData = await getGeminiResponseWithSlots(interpolatedPrompt, language);
    const llmResponseText = geminiData.response; // LLM 응답 텍스트
    const extractedSlots = geminiData.slots || {};
    let currentSlots = { ...slots }; // 슬롯 복사

    // LLM이 추출한 슬롯을 기존 슬롯에 병합
    if (extractedSlots && Object.keys(extractedSlots).length > 0) {
        currentSlots = { ...currentSlots, ...extractedSlots };
    }

    // LLM 응답을 특정 슬롯에 저장하도록 설정된 경우
    if (node.data.outputVar) {
        currentSlots[node.data.outputVar] = llmResponseText;
    }

    // 다음 노드 결정 (getNextNode가 LLM 조건 분기 처리)
    const nextNode = getNextNode(scenario, node.id, null, currentSlots); // 업데이트된 currentSlots 사용
    return { nextNode, slots: currentSlots, events: [] }; // 최종 슬롯 반환
}


async function handleBranchNode(node, scenario, slots) {
  // 조건 분기(CONDITION) 타입의 경우, 조건 평가 후 다음 노드로 바로 진행
  if (node.data.evaluationType === 'CONDITION') {
    const nextNode = getNextNode(scenario, node.id, null, slots);
    return { nextNode, slots, events: [] };
  } else {
    // 일반 분기(REPLY/BUTTON) 타입의 경우, 사용자 입력을 기다려야 하므로 현재 노드 반환
    return { nextNode: node, slots, events: [] }; // slots, events 추가
  }
}

async function handleSetSlotNode(node, scenario, slots) {
  console.log('[handleSetSlotNode] Executing node:', node.id);

  const newSlots = { ...slots }; // 기존 슬롯 복사
  const assignments = node.data.assignments || []; // 할당 목록 가져오기

  // 각 할당 규칙 처리
  for (const assignment of assignments) {
    if (assignment.key) { // 슬롯 키가 있는지 확인
      // 값 보간 (이전 할당 결과를 다음 보간에 사용 가능)
      let interpolatedValue = interpolateMessage(assignment.value, newSlots);

      // 타입 변환 로직
      try {
          const trimmedValue = interpolatedValue.trim();
          if ((trimmedValue.startsWith('{') && trimmedValue.endsWith('}')) || (trimmedValue.startsWith('[') && trimmedValue.endsWith(']'))) {
              // JSON 파싱 시도
              newSlots[assignment.key] = JSON.parse(trimmedValue);
          } else if (trimmedValue.toLowerCase() === 'true') {
              newSlots[assignment.key] = true;
          } else if (trimmedValue.toLowerCase() === 'false') {
              newSlots[assignment.key] = false;
          } else if (!isNaN(trimmedValue) && trimmedValue !== '') {
               // 숫자 변환 시도 (Number() 사용)
               const num = Number(trimmedValue);
               // Number('')는 0이 되므로, 빈 문자열은 숫자로 변환하지 않도록 체크
               if (!isNaN(num)) {
                   newSlots[assignment.key] = num;
               } else {
                   newSlots[assignment.key] = interpolatedValue; // 숫자 변환 실패 시 문자열 유지
               }
          } else {
              newSlots[assignment.key] = interpolatedValue; // 다른 모든 경우는 문자열 유지
          }
      } catch (e) {
          // JSON 파싱 실패 시 문자열 그대로 저장
          console.warn(`[handleSetSlotNode] Failed to parse JSON for slot "${assignment.key}", saving as string. Value:`, interpolatedValue);
          newSlots[assignment.key] = interpolatedValue;
      }
    }
  }

  // 다음 노드 결정
  const nextNode = getNextNode(scenario, node.id, null, newSlots);
  return { nextNode, slots: newSlots, events: [] }; // 업데이트된 슬롯 반환
}

// Delay 노드 핸들러
async function handleDelayNode(node, scenario, slots) {
  const duration = node.data?.duration; // data 객체 확인
  // duration 유효성 검사 (숫자이고 0 이상)
  if (typeof duration !== 'number' || duration < 0) {
    console.warn(`Invalid or missing duration in delay node ${node.id}: ${duration}. Skipping delay.`);
  } else {
    console.log(`[handleDelayNode] Delaying for ${duration}ms...`);
    // 지정된 시간만큼 대기 (Promise 사용)
    await new Promise(resolve => setTimeout(resolve, duration));
    console.log(`[handleDelayNode] Delay finished.`);
  }
  // 딜레이 후 다음 노드 결정
  const nextNode = getNextNode(scenario, node.id, null, slots);
  // 다음 노드 정보와 현재 슬롯 반환 (슬롯 변경 없음)
  return { nextNode, slots, events: [] };
}

// --- nodeHandlers 객체 정의 및 export ---
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
  'delay': handleDelayNode, // delay 핸들러 등록
};