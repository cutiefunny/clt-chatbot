// app/api/chat/route.js
import { NextResponse } from 'next/server';
import { getScenario, getNextNode, interpolateMessage, findActionByTrigger, getScenarioList, runScenario, getScenarioCategories } from '../../lib/chatbotEngine';
import { getLlmResponse } from '../../lib/llm';
import { locales } from '../../lib/locales';
// --- 👇 [수정] getErrorKey 임포트 제거 ---
// import { getErrorKey } from '../../lib/errorHandler';

const actionHandlers = {
    'GET_SCENARIO_LIST': async (payload, slots, language) => {
        try {
            const scenarios = await getScenarioList();
            return NextResponse.json({
                type: 'scenario_list',
                scenarios,
                message: locales[language].scenarioListMessage || locales['en'].scenarioListMessage,
                scenarioState: null
            });
        } catch (error) {
            console.error('[ActionHandler Error] GET_SCENARIO_LIST:', error);
            // --- 👇 [수정] errorLLMFail 사용 ---
            const message = locales[language]?.['errorLLMFail'] || 'Failed to get scenario list.';
            // --- 👆 [수정] ---
            return NextResponse.json({ type: 'error', message }, { status: 500 });
        }
    },
    'START_SCENARIO': async (payload, slots, language) => {
        const { scenarioId } = payload;
        try {
            const scenario = await getScenario(scenarioId);
            const startNode = getNextNode(scenario, null, null, slots);

            if (!startNode || !startNode.data) {
                const message = `Scenario '${scenarioId}' could not be started. (Content might be empty or start node missing)`;
                console.warn(message);
                return NextResponse.json({
                    type: 'scenario_end',
                    message: message,
                    scenarioState: null,
                    slots: slots
                });
            }

            if (startNode.data.content) {
                startNode.data.content = interpolateMessage(startNode.data.content, slots);
            }

            return NextResponse.json({
                type: 'scenario_start',
                nextNode: startNode,
                scenarioState: { scenarioId: scenarioId, currentNodeId: startNode.id, awaitingInput: startNode.type === 'slotfilling' },
                slots: slots
            });
        } catch (error) {
            console.error(`[ActionHandler Error] START_SCENARIO (${scenarioId}):`, error);
            // --- 👇 [수정] errorLLMFail 사용 ---
            const message = locales[language]?.['errorLLMFail'] || `Failed to start scenario '${scenarioId}'.`;
             // --- 👆 [수정] ---
            return NextResponse.json({ type: 'error', message: message }, { status: 500 });
        }
    },
};

// determineAction 함수 (변경 없음)
async function determineAction(messageText, language = 'ko') {
    if (Object.keys(actionHandlers).includes(messageText)) {
        return { type: messageText };
    }
    const triggeredAction = await findActionByTrigger(messageText);
    if (triggeredAction) {
        if (triggeredAction.type === 'custom') {
            return { type: triggeredAction.value };
        }
        if (triggeredAction.type === 'scenario') {
            return { type: 'START_SCENARIO', payload: { scenarioId: triggeredAction.value } };
        }
    }
    try {
        if (!messageText || typeof messageText !== 'string' || messageText.length > 100) {
             throw new Error("Invalid input, not a scenario ID.");
        }
        await getScenario(messageText);
        return { type: 'START_SCENARIO', payload: { scenarioId: messageText } };
    } catch (e) {
        // console.warn(`Input "${messageText}" is not a valid scenario ID or scenario load failed.`);
    }
    return { type: 'LLM_FALLBACK' };
}


export async function POST(request) {
  let language = 'ko';
  try {
    const body = await request.json();
    language = body.language || language;
    const { message, scenarioState, slots, scenarioSessionId, llmProvider, flowiseApiUrl } = body;

    // 1. 시나리오 진행 중
    if (scenarioSessionId && scenarioState && scenarioState.scenarioId) {
      const scenario = await getScenario(scenarioState.scenarioId);
      const result = await runScenario(scenario, scenarioState, message, slots, scenarioSessionId, language);
      return NextResponse.json(result);
    }

    // 2. 시나리오 재시작
    if (scenarioSessionId && !scenarioState && message && message.text) {
        const scenarioId = message.text;
        const handler = actionHandlers['START_SCENARIO'];
        if (handler) {
            const payload = { scenarioId };
            return await handler(payload, slots || {}, language);
        } else {
             console.error("START_SCENARIO handler not found!");
             throw new Error("Internal server error: Scenario start handler missing.");
        }
    }

    // 3. 일반 메시지 처리
    if (!scenarioState && message && message.text) {
        const action = await determineAction(message.text, language);
        const handler = actionHandlers[action.type];

        if (handler) {
            return await handler(action.payload, slots, language);
        }

        if (action.type === 'LLM_FALLBACK') {
            const categories = await getScenarioCategories();
            const allShortcuts = categories.flatMap(cat =>
                cat.subCategories.flatMap(subCat => subCat.items)
            );
            const uniqueShortcuts = [...new Map(allShortcuts.map(item => [item.title, item])).values()];

            const llmResult = await getLlmResponse(message.text, language, uniqueShortcuts, llmProvider, flowiseApiUrl);

            // --- 👇 [수정] getLlmResponse가 에러 객체를 반환하는 경우 처리 ---
            if (llmResult instanceof ReadableStream) {
                // 스트리밍 응답
                return new Response(llmResult, {
                    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
                });
            } else if (llmResult && llmResult.type === 'error') {
                // getLlmResponse에서 반환한 표준 에러 객체
                 console.error('LLM Error from getLlmResponse:', llmResult.message);
                 // 클라이언트에게도 표준 에러 객체 전달, 상태 코드는 503 (Service Unavailable) 또는 500 사용 가능
                 return NextResponse.json(llmResult, { status: 503 });
            } else if (llmResult && llmResult.response) {
                // 비-스트리밍 응답 (Gemini JSON) 또는 오류 시 대체 응답 (기존 로직 유지)
                return NextResponse.json({
                    type: 'llm_response_with_slots',
                    message: llmResult.response,
                    slots: llmResult.slots || {}, // slots가 없을 경우 빈 객체 보장
                });
            } else {
                 // llmResult가 예상치 못한 형태일 경우
                 console.error('Unexpected result from getLlmResponse:', llmResult);
                 throw new Error("Unexpected response format from LLM service.");
            }
            // --- 👆 [수정] ---
        }
    }

    // 모든 조건 불일치
    console.warn("Chat API received an unhandled request state:", { message, scenarioState, scenarioSessionId });
    return NextResponse.json({ type: 'error', message: locales[language]?.errorUnexpected || 'Invalid request.' }, { status: 400 });

  } catch (error) {
    // --- 👇 [수정] 메인 catch 블록에서 errorLLMFail 사용 ---
    console.error('Chat API Error:', error);
    // getErrorKey 대신 errorLLMFail 사용 (LLM 호출 실패 외 다른 오류도 이 메시지로 통일)
    const message = locales[language]?.['errorLLMFail'] || 'An unexpected error occurred. Please try again later.';

    return NextResponse.json(
      { type: 'error', message: message },
      { status: 500 } // 내부 서버 오류
    );
    // --- 👆 [수정] ---
  }
}