import { NextResponse } from 'next/server';
import { getScenario, getNextNode, interpolateMessage, findActionByTrigger, getScenarioList, runScenario, getScenarioCategories } from '../../lib/chatbotEngine';
import { getGeminiStream } from '../../lib/gemini';
import { locales } from '../../lib/locales';

// --- 👇 [수정] actionHandlers를 간소화하고, 커스텀 액션에 집중 ---
const actionHandlers = {
    'GET_SCENARIO_LIST': async (payload, slots, language) => {
        const scenarios = await getScenarioList();
        return NextResponse.json({
            type: 'scenario_list',
            scenarios,
            message: locales[language].scenarioListMessage,
            scenarioState: null
        });
    },
    'START_SCENARIO': async (payload, slots) => {
        const { scenarioId } = payload;
        const scenario = await getScenario(scenarioId);
        const startNode = getNextNode(scenario, null, null);

        if (!startNode || !startNode.data) {
            return NextResponse.json({
                type: 'scenario_end',
                message: `시나리오 '${scenarioId}'를 시작할 수 없습니다. (내용이 비어있거나 시작점이 없습니다.)`,
                scenarioState: null,
                slots: {}
            });
        }

        if (startNode.data.content) {
            const interpolatedContent = interpolateMessage(startNode.data.content, slots);
            startNode.data.content = interpolatedContent;
        }

        return NextResponse.json({
            type: 'scenario_start',
            nextNode: startNode,
            scenarioState: { scenarioId: scenarioId, currentNodeId: startNode.id, awaitingInput: false },
            slots: {}
        });
    },
};

// --- 👇 [수정] 동작을 결정하는 로직을 체계적으로 변경 ---
async function determineAction(messageText) {
    // 1. 메시지가 actionHandlers에 직접 정의된 커스텀 액션인지 확인
    if (Object.keys(actionHandlers).includes(messageText)) {
        return { type: messageText };
    }

    // 2. 메시지가 숏컷의 'title'과 일치하는지 확인 (사용자가 직접 입력한 경우)
    const triggeredAction = await findActionByTrigger(messageText);
    if (triggeredAction) {
        if (triggeredAction.type === 'custom') {
            // 커스텀 액션일 경우, 해당 액션 값을 타입으로 반환
            return { type: triggeredAction.value };
        }
        if (triggeredAction.type === 'scenario') {
            // 시나리오일 경우, START_SCENARIO 타입과 시나리오 ID를 payload로 반환
            return { type: 'START_SCENARIO', payload: { scenarioId: triggeredAction.value } };
        }
    }

    // 3. 메시지가 시나리오 ID와 직접 일치하는지 확인
    try {
        await getScenario(messageText);
        return { type: 'START_SCENARIO', payload: { scenarioId: messageText } };
    } catch (e) {
        // 일치하는 시나리오가 없으면 다음 단계로 진행
    }

    // 4. 위 모든 조건에 해당하지 않으면 LLM으로 처리
    return { type: 'LLM_FALLBACK' };
}


export async function POST(request) {
  try {
    const body = await request.json();
    const { message, scenarioState, slots, language = 'ko', scenarioSessionId } = body;

    // Case 1: Continue existing scenario
    if (scenarioSessionId && scenarioState && scenarioState.scenarioId) {
      const scenario = await getScenario(scenarioState.scenarioId);
      const result = await runScenario(scenario, scenarioState, message, slots, scenarioSessionId);
      return NextResponse.json(result);
    }
    
    // Case 2: Start a new scenario for a pre-created session
    if (scenarioSessionId && !scenarioState && message && message.text) {
        const scenarioId = message.text;
        const handler = actionHandlers['START_SCENARIO'];
        const payload = { scenarioId };
        return await handler(payload, slots || {}, language);
    }

    // Case 3: A regular message from user, determine what to do
    if (!scenarioState && message.text) {
        const action = await determineAction(message.text);
        const handler = actionHandlers[action.type];

        if (handler) {
            return await handler(action.payload, slots, language);
        }
    }

    // --- 👇 [수정된 부분] ---
    // Fallback to LLM
    // LLM 호출 전, 숏컷 목록을 가져와 프롬프트에 포함
    const categories = await getScenarioCategories();
    const shortcuts = categories.flatMap(cat => 
        cat.subCategories.flatMap(subCat => 
            subCat.items.map(item => ({
                title: item.title,
                description: item.description
            }))
        )
    );

    const stream = await getGeminiStream(message.text, language, shortcuts);
    // --- 👆 [여기까지] ---
    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });

  } catch (error) {
    console.error('Chat API Error:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred.' },
      { status: 500 }
    );
  }
}