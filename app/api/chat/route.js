import { NextResponse } from 'next/server';
import { getScenario, getNextNode, interpolateMessage, findScenarioIdByTrigger, getScenarioList, validateInput, getNestedValue } from '../../lib/chatbotEngine';
import { getGeminiStream } from '../../lib/gemini';

async function handleScenario(scenario, scenarioState, message, slots) {
    const { scenarioId, currentNodeId, awaitingInput } = scenarioState;
    let currentId = currentNodeId;
    let newSlots = { ...slots };

    if (awaitingInput) {
        const currentNode = scenario.nodes.find(n => n.id === currentId);
        const validation = currentNode.data.validation;
        const { isValid, message: validationMessage } = validateInput(message.text, validation);

        if (!isValid) {
            return NextResponse.json({
                type: 'scenario_validation_fail',
                message: validationMessage,
                scenarioState: { ...scenarioState, awaitingInput: true }, // Awaiting input again
                slots: newSlots,
            });
        }
        newSlots[currentNode.data.slot] = message.text;
    }

    let nextNode;
    if (awaitingInput) {
         // Input was valid, proceed from the current node
         nextNode = getNextNode(scenario, currentId, message.sourceHandle, newSlots);
    } else {
        // This is not a response to a slot-filling request, so get the next node based on the handle
        nextNode = getNextNode(scenario, currentId, message.sourceHandle, newSlots);
    }

    // Process nodes until an interactive one is found
    while (nextNode) {
        const interpolatedContent = interpolateMessage(nextNode.data.content, newSlots);
        nextNode.data.content = interpolatedContent;

        if (nextNode.type === 'slotfilling') {
            return NextResponse.json({
                type: 'scenario',
                nextNode,
                scenarioState: { scenarioId, currentNodeId: nextNode.id, awaitingInput: true },
                slots: newSlots,
            });
        }

        if (nextNode.type === 'api') {
            const { method, url, headers, body, responseMapping } = nextNode.data;
            const interpolatedUrl = interpolateMessage(url, newSlots);
            const interpolatedHeaders = JSON.parse(interpolateMessage(headers || '{}', newSlots));
            const interpolatedBody = method !== 'GET' && body ? interpolateMessage(body, newSlots) : undefined;

            let isSuccess = false;
            try {
                const response = await fetch(interpolatedUrl, { method, headers: interpolatedHeaders, body: interpolatedBody });
                if (!response.ok) throw new Error(`API request failed with status ${response.status}`);
                
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
                isSuccess = false;
            }
            
            nextNode = getNextNode(scenario, nextNode.id, isSuccess ? 'onSuccess' : 'onError', newSlots);
            continue; // Continue processing with the next node
        }

        if (nextNode.type === 'llm') {
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

        if (nextNode.type === 'message' || nextNode.type === 'branch' || nextNode.type === 'form') {
           // These are interactive nodes that require user response
           break;
        }
        
        // For non-interactive nodes like 'message' without replies, just move to the next one
        const nonInteractiveNext = getNextNode(scenario, nextNode.id, null, newSlots);
        if(!nonInteractiveNext) break; // End of path
        
        // If the message node has no replies and an edge exists, proceed automatically
        if (nextNode.type === 'message' && (!nextNode.data.replies || nextNode.data.replies.length === 0)) {
            currentId = nextNode.id; // Update currentId to the message node we just processed
            nextNode = getNextNode(scenario, currentId, null, newSlots);
        } else {
             // It's an interactive node, so we break to send it to the user
            break;
        }
    }

    if (nextNode) {
        return NextResponse.json({
            type: 'scenario',
            nextNode,
            scenarioState: { scenarioId, currentNodeId: nextNode.id, awaitingInput: false },
            slots: newSlots,
        });
    } else {
        return NextResponse.json({
            type: 'scenario_end',
            message: '시나리오가 종료되었습니다.',
            scenarioState: null,
            slots: newSlots,
        });
    }
}

// --- 👇 [추가된 부분] ---

/**
 * 사용자 메시지를 기반으로 수행할 작업을 결정하는 헬퍼 함수
 * @param {string} messageText - 사용자 입력 텍스트
 * @returns {Promise<{type: string, payload?: any}>} - 작업 유형과 필요한 데이터를 담은 객체
 */
async function determineAction(messageText) {
    // 1. 키워드 기반 트리거 확인
    const triggeredAction = findScenarioIdByTrigger(messageText);
    if (triggeredAction) {
        return { type: triggeredAction };
    }

    // 2. 메시지 자체가 시나리오 ID인지 확인
    try {
        await getScenario(messageText);
        // getScenario가 에러를 던지지 않으면 해당 ID의 시나리오가 존재함
        return { type: 'START_SCENARIO', payload: { scenarioId: messageText } };
    } catch (e) {
        // 시나리오 없음, 무시하고 다음으로 진행
    }

    // 3. 위 조건에 해당하지 않으면 기본 LLM 호출
    return { type: 'LLM_FALLBACK' };
}

// 각 작업 유형에 따른 핸들러 함수 맵
const actionHandlers = {
    'GET_SCENARIO_LIST': async () => {
        const scenarios = await getScenarioList();
        return NextResponse.json({
            type: 'scenario_list',
            scenarios,
            message: '실행할 시나리오를 선택해주세요.'
        });
    },
    'START_SCENARIO': async (payload, slots) => {
        const { scenarioId } = payload;
        const scenario = await getScenario(scenarioId);
        const startNode = getNextNode(scenario, null, null);

        const interpolatedContent = interpolateMessage(startNode.data.content, slots);
        startNode.data.content = interpolatedContent;

        return NextResponse.json({
            type: 'scenario_start',
            nextNode: startNode,
            scenarioState: { scenarioId: scenarioId, currentNodeId: startNode.id, awaitingInput: false },
            slots: {}
        });
    },
    // 키워드 트리거로 시나리오를 시작하는 경우 (예: "예약")
    'reservation-scenario': (payload, slots) => actionHandlers.START_SCENARIO({ scenarioId: 'reservation-scenario' }, slots),
    'faq-scenario': (payload, slots) => actionHandlers.START_SCENARIO({ scenarioId: 'faq-scenario' }, slots),
    'Welcome': (payload, slots) => actionHandlers.START_SCENARIO({ scenarioId: 'Welcome' }, slots),
};
// --- 👆 [여기까지] ---


export async function POST(request) {
  try {
    const body = await request.json();
    const { message, scenarioState, slots } = body;
    
    // 1. 시나리오가 이미 진행 중인 경우 우선 처리
    if (scenarioState && scenarioState.scenarioId) {
      const scenario = await getScenario(scenarioState.scenarioId);
      return await handleScenario(scenario, scenarioState, message, slots);
    }
    
    // --- 👇 [수정된 부분] ---

    // 2. 새로운 메시지에 대한 작업 결정
    const action = await determineAction(message.text);
    const handler = actionHandlers[action.type];

    if (handler) {
        // 결정된 작업에 맞는 핸들러 실행
        return await handler(action.payload, slots);
    }

    // 3. 지정된 작업이 없는 경우, 기본 Gemini API 호출 (LLM_FALLBACK)
    const stream = await getGeminiStream(message.text);
    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });

    // --- 👆 [여기까지] ---

  } catch (error) {
    console.error('Chat API Error:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred.' },
      { status: 500 }
    );
  }
}