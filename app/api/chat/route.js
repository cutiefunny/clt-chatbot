// app/api/chat/route.js
import { NextResponse } from 'next/server';
import { getScenario, getNextNode, interpolateMessage, findActionByTrigger, getScenarioList, runScenario, getScenarioCategories } from '../../lib/chatbotEngine';
import { getLlmResponse } from '../../lib/llm';
import { locales } from '../../lib/locales';
// --- 👇 [수정] getErrorKey 임포트 ---
import { getErrorKey } from '../../lib/errorHandler';

const actionHandlers = {
    'GET_SCENARIO_LIST': async (payload, slots, language) => {
        try { // --- 👇 [수정] actionHandler 내부에도 오류 처리 추가 ---
            const scenarios = await getScenarioList();
            return NextResponse.json({
                type: 'scenario_list',
                scenarios,
                message: locales[language].scenarioListMessage || locales['en'].scenarioListMessage, // 기본값 추가
                scenarioState: null
            });
        } catch (error) {
            console.error('[ActionHandler Error] GET_SCENARIO_LIST:', error);
            const errorKey = getErrorKey(error);
            const message = locales[language]?.[errorKey] || locales['en']?.[errorKey] || 'Failed to get scenario list.';
            // 핸들러에서 직접 에러 응답 반환
            return NextResponse.json({ type: 'error', message }, { status: 500 });
        }
    },
    'START_SCENARIO': async (payload, slots, language) => { // --- 👇 [수정] language 파라미터 추가 ---
        const { scenarioId } = payload;
        try { // --- 👇 [수정] actionHandler 내부에도 오류 처리 추가 ---
            const scenario = await getScenario(scenarioId);
            const startNode = getNextNode(scenario, null, null, slots); // slots 전달

            if (!startNode || !startNode.data) {
                // 시나리오 시작 실패 시, 사용자에게 보여줄 메시지를 locales에서 가져옴
                const message = `Scenario '${scenarioId}' could not be started. (Content might be empty or start node missing)`; // 간단한 영어 메시지 또는 locales 사용
                console.warn(message); // 서버 로그에는 경고 남김
                return NextResponse.json({
                    type: 'scenario_end', // 또는 'error' 타입 사용 고려
                    message: message, // 사용자 친화적 메시지
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
                scenarioState: { scenarioId: scenarioId, currentNodeId: startNode.id, awaitingInput: startNode.type === 'slotfilling' }, // awaitingInput 바로 설정
                slots: slots
            });
        } catch (error) {
            console.error(`[ActionHandler Error] START_SCENARIO (${scenarioId}):`, error);
            const errorKey = getErrorKey(error);
            // --- 👇 [수정] 언어에 맞는 오류 메시지 사용 ---
            const message = locales[language]?.[errorKey] || locales['en']?.[errorKey] || `Failed to start scenario '${scenarioId}'.`;
            return NextResponse.json({ type: 'error', message: message }, { status: 500 });
        }
    },
};

// --- 👇 [수정] determineAction에서 언어별 locales 사용하도록 수정 ---
async function determineAction(messageText, language = 'ko') {
    // 1. 직접적인 액션 핸들러 키 확인 (기존과 동일)
    if (Object.keys(actionHandlers).includes(messageText)) {
        return { type: messageText };
    }

    // 2. 트리거를 통한 액션 찾기 (기존과 동일)
    const triggeredAction = await findActionByTrigger(messageText);
    if (triggeredAction) {
        if (triggeredAction.type === 'custom') {
            return { type: triggeredAction.value };
        }
        if (triggeredAction.type === 'scenario') {
            return { type: 'START_SCENARIO', payload: { scenarioId: triggeredAction.value } };
        }
    }

    // 3. 메시지 텍스트 자체가 시나리오 ID인지 확인 (기존과 동일)
    try {
        // getScenario 호출 전 검증 로직 추가 (선택 사항)
        if (!messageText || typeof messageText !== 'string' || messageText.length > 100) {
             // 너무 길거나 유효하지 않은 입력은 시나리오 ID로 간주하지 않음
             throw new Error("Invalid input, not a scenario ID.");
        }
        await getScenario(messageText); // 시나리오 존재 여부 확인
        return { type: 'START_SCENARIO', payload: { scenarioId: messageText } };
    } catch (e) {
        // getScenario에서 오류 발생 시 (시나리오 없음 등), 무시하고 LLM Fallback으로 진행
        // console.warn(`Input "${messageText}" is not a valid scenario ID or scenario load failed.`);
    }

    // 4. 모든 조건 불일치 시 LLM Fallback (기존과 동일)
    return { type: 'LLM_FALLBACK' };
}


export async function POST(request) {
  let language = 'ko'; // 기본 언어 설정
  try {
    const body = await request.json();
    // 요청 본문에서 language 값 가져오기, 없으면 기본값 사용
    language = body.language || language;
    const { message, scenarioState, slots, scenarioSessionId, llmProvider, flowiseApiUrl } = body;

    // 1. 시나리오 진행 중인 경우
    if (scenarioSessionId && scenarioState && scenarioState.scenarioId) {
      const scenario = await getScenario(scenarioState.scenarioId);
      // --- 👇 [수정] runScenario 호출 시 language 전달 ---
      const result = await runScenario(scenario, scenarioState, message, slots, scenarioSessionId, language);
      return NextResponse.json(result);
    }

    // 2. 시나리오 ID 직접 입력 또는 히스토리 패널에서 시나리오 재시작
    // (시나리오 상태는 없지만 세션 ID와 메시지 텍스트(시나리오ID)가 있는 경우)
    if (scenarioSessionId && !scenarioState && message && message.text) {
        const scenarioId = message.text;
        const handler = actionHandlers['START_SCENARIO'];
        if (handler) {
            const payload = { scenarioId };
            // --- 👇 [수정] START_SCENARIO 핸들러 호출 시 language 전달 ---
            return await handler(payload, slots || {}, language);
        } else {
             console.error("START_SCENARIO handler not found!");
             throw new Error("Internal server error: Scenario start handler missing."); // 에러 발생시켜 아래 catch에서 처리
        }
    }

    // 3. 일반 메시지 처리 (액션 트리거 확인 또는 LLM 호출)
    if (!scenarioState && message && message.text) {
        // --- 👇 [수정] determineAction 호출 시 language 전달 ---
        const action = await determineAction(message.text, language);
        const handler = actionHandlers[action.type];

        // 액션 핸들러가 존재하는 경우 (GET_SCENARIO_LIST 등)
        if (handler) {
            // --- 👇 [수정] 핸들러 호출 시 language 전달 ---
            return await handler(action.payload, slots, language);
        }

        // LLM_FALLBACK 처리
        if (action.type === 'LLM_FALLBACK') {
            const categories = await getScenarioCategories();
            const allShortcuts = categories.flatMap(cat =>
                cat.subCategories.flatMap(subCat => subCat.items)
            );
            const uniqueShortcuts = [...new Map(allShortcuts.map(item => [item.title, item])).values()];

            // --- 👇 [수정] getLlmResponse 호출 시 language 전달 ---
            const llmResult = await getLlmResponse(message.text, language, uniqueShortcuts, llmProvider, flowiseApiUrl);

            // 스트리밍 응답 처리
            if (llmResult instanceof ReadableStream) {
                return new Response(llmResult, {
                    headers: {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                    },
                });
            }

            // 비-스트리밍 응답 또는 오류 객체 처리
            // getLlmResponse가 오류 시 { response: "...", slots: {} } 형태를 반환한다고 가정
            return NextResponse.json({
                type: 'llm_response_with_slots',
                message: llmResult.response,
                slots: llmResult.slots,
            });
        }
    }

    // 모든 조건에 해당하지 않는 경우 (예: 빈 메시지) - 기본 응답 또는 오류 처리
    console.warn("Chat API received an unhandled request state:", { message, scenarioState, scenarioSessionId });
    return NextResponse.json({ type: 'error', message: locales[language]?.errorUnexpected || 'Invalid request.' }, { status: 400 });

  } catch (error) {
    // --- 👇 [수정] 통합 오류 처리 ---
    console.error('Chat API Error:', error);
    const errorKey = getErrorKey(error);
    // language 변수를 사용하여 해당 언어의 오류 메시지를 가져옴
    const message = locales[language]?.[errorKey] || locales['en']?.[errorKey] || 'An unexpected error occurred.';

    return NextResponse.json(
      { type: 'error', message: message, // 표준화된 오류 메시지 사용
        // 개발 환경에서는 상세 오류 정보를 포함할 수 있음 (선택 사항)
        // detail: process.env.NODE_ENV === 'development' ? error.message : undefined,
        // stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
       },
      { status: 500 } // 내부 서버 오류 상태 코드
    );
    // --- 👆 [수정] ---
  }
}