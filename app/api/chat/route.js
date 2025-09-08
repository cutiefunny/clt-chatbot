import { NextResponse } from 'next/server';
import { getScenario, getNextNode, interpolateMessage, findScenarioIdByTrigger, getScenarioList, runScenario } from '../../lib/chatbotEngine';
import { getGeminiStream } from '../../lib/gemini';

async function determineAction(messageText) {
    const triggeredAction = findScenarioIdByTrigger(messageText);
    if (triggeredAction) {
        return { type: triggeredAction };
    }

    try {
        await getScenario(messageText);
        return { type: 'START_SCENARIO', payload: { scenarioId: messageText } };
    } catch (e) {
        // Scenario not found, proceed to LLM
    }

    return { type: 'LLM_FALLBACK' };
}

const actionHandlers = {
    'GET_SCENARIO_LIST': async () => {
        const scenarios = await getScenarioList();
        return NextResponse.json({
            type: 'scenario_list',
            scenarios,
            message: '실행할 시나리오를 선택해주세요.',
            scenarioState: null
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
    '선박 예약': (payload, slots) => actionHandlers.START_SCENARIO({ scenarioId: '선박 예약' }, slots),
    'faq-scenario': (payload, slots) => actionHandlers.START_SCENARIO({ scenarioId: 'faq-scenario' }, slots),
    'Welcome': (payload, slots) => actionHandlers.START_SCENARIO({ scenarioId: 'Welcome' }, slots),
};


export async function POST(request) {
  try {
    const body = await request.json();
    const { message, scenarioState, slots } = body;

    if (scenarioState && scenarioState.scenarioId) {
      const scenario = await getScenario(scenarioState.scenarioId);
      // --- 👇 [수정] 분리된 시나리오 실행 함수 호출 ---
      const result = await runScenario(scenario, scenarioState, message, slots);
      return NextResponse.json(result);
    }

    const action = await determineAction(message.text);
    const handler = actionHandlers[action.type];

    if (handler) {
        return await handler(action.payload, slots);
    }

    const stream = await getGeminiStream(message.text);
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