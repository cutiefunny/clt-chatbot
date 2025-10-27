// app/lib/nodeHandlers.js
import { getGeminiResponseWithSlots } from './gemini';
// chatbotEngine.js에서 필요한 함수들을 가져옵니다. (export 키워드가 추가되어야 함)
import { getNextNode, interpolateMessage, getDeepValue } from './chatbotEngine';

// --- 각 노드 핸들러 함수 정의 (chatbotEngine.js에서 이동) ---

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
    return { nextNode: node }; // nextNode를 현재 노드로 설정하여 루프 중단
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
    const { method, url, headers, body, params, responseMapping } = node.data;
    let interpolatedUrl = interpolateMessage(url, slots); // URL 보간

    // GET 요청 시 파라미터 처리
    if (method === 'GET' && params) {
        const queryParams = new URLSearchParams();
        for (const key in params) {
            if (Object.hasOwnProperty.call(params, key)) {
                const value = interpolateMessage(params[key], slots); // 파라미터 값 보간
                if (value) queryParams.append(key, value);
            }
        }
        const queryString = queryParams.toString();
        if (queryString) {
            interpolatedUrl += (interpolatedUrl.includes('?') ? '&' : '?') + queryString;
        }
    }

    // 상대 경로 URL 처리 (환경 변수 사용)
    if (interpolatedUrl.startsWith('/')) {
        const baseURL = process.env.NEXT_PUBLIC_API_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
        interpolatedUrl = `${baseURL}${interpolatedUrl}`;
    }

    // 헤더 및 본문 보간
    const interpolatedHeaders = JSON.parse(interpolateMessage(headers || '{}', slots));
    const interpolatedBody = method !== 'GET' && body ? interpolateMessage(body, slots) : undefined;

    // 마지막 요청 본문 슬롯 저장 (디버깅용)
    if (interpolatedBody) {
        slots['_lastApiRequestBody'] = interpolatedBody;
    } else if (slots['_lastApiRequestBody']) {
        delete slots['_lastApiRequestBody'];
    }

    let isSuccess = false; // API 호출 성공 여부 플래그
    try {
        // fetch API 호출
        const response = await fetch(interpolatedUrl, { method, headers: interpolatedHeaders, body: interpolatedBody });
        if (!response.ok) { // 응답 상태 코드가 2xx가 아닌 경우 에러 처리
            const errorBody = await response.text();
            throw new Error(`API request failed with status ${response.status}. Body: ${errorBody}`);
        }

        // 응답 JSON 파싱
        const result = await response.json();
        // 응답 매핑 설정에 따라 결과값을 슬롯에 저장
        if (responseMapping && responseMapping.length > 0) {
            responseMapping.forEach(mapping => {
                const value = getDeepValue(result, mapping.path); // 중첩된 값 가져오기
                if (value !== undefined) slots[mapping.slot] = value;
            });
        }
        isSuccess = true; // 성공 플래그 설정
    } catch (error) {
        console.error("API Node Error:", error);
        // 에러 발생 시 관련 슬롯 설정
        slots['apiError'] = error.message;
        slots['apiFailed'] = true;
        isSuccess = false; // 실패 플래그 설정
    }

    // 성공/실패 여부에 따라 다음 노드 결정 ('onSuccess' 또는 'onError' 핸들 사용)
    const nextNode = getNextNode(scenario, node.id, isSuccess ? 'onSuccess' : 'onError', slots);
    return { nextNode, slots, events: [] }; // 이벤트는 없음
}

// language 파라미터 추가
async function handleLlmNode(node, scenario, slots, language) {
    const interpolatedPrompt = interpolateMessage(node.data.prompt, slots); // 프롬프트 보간
    // Gemini API 호출 (슬롯 추출 기능 포함된 버전 사용)
    const geminiData = await getGeminiResponseWithSlots(interpolatedPrompt, language);

    const llmResponse = geminiData.response; // LLM 응답 텍스트

    // LLM이 추출한 슬롯을 기존 슬롯에 병합
    if (geminiData.slots) {
        slots = { ...slots, ...geminiData.slots };
    }

    // LLM 응답을 특정 슬롯에 저장하도록 설정된 경우
    if (node.data.outputVar) {
        slots[node.data.outputVar] = llmResponse;
    }

    // 다음 노드 결정 (LLM 노드는 조건 분기를 가질 수 있음)
    const nextNode = getNextNode(scenario, node.id, null, slots);
    return { nextNode, slots, events: [] }; // 이벤트는 없음
}


async function handleBranchNode(node, scenario, slots) {
  // 조건 분기(CONDITION) 타입의 경우, 조건 평가 후 다음 노드로 바로 진행
  if (node.data.evaluationType === 'CONDITION') {
    const nextNode = getNextNode(scenario, node.id, null, slots);
    return { nextNode, slots, events: [] };
  } else {
    // 일반 분기(REPLY) 타입의 경우, 사용자 입력을 기다려야 하므로 현재 노드 반환
    return { nextNode: node };
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

      // 값이 JSON 형태의 문자열인지 확인 후 파싱 시도
      if (typeof interpolatedValue === 'string' &&
          ( (interpolatedValue.startsWith('{') && interpolatedValue.endsWith('}')) ||
            (interpolatedValue.startsWith('[') && interpolatedValue.endsWith(']')) )
      ) {
        try {
          const parsedJson = JSON.parse(interpolatedValue);
          newSlots[assignment.key] = parsedJson; // 파싱 성공 시 객체/배열 저장
        } catch (e) {
          // 파싱 실패 시 문자열 그대로 저장
          newSlots[assignment.key] = interpolatedValue;
        }
      } else {
        // JSON 형태 아니면 그대로 저장
        newSlots[assignment.key] = interpolatedValue;
      }
    }
  }

  // 다음 노드 결정
  const nextNode = getNextNode(scenario, node.id, null, newSlots);
  return { nextNode, slots: newSlots, events: [] }; // 업데이트된 슬롯 반환
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
};