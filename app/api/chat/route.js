import { NextResponse } from 'next/server';
import { getScenario, getNextNode, interpolateMessage, findScenarioIdByTrigger, getScenarioList, runScenario } from '../../lib/chatbotEngine';
import { getGeminiStream } from '../../lib/gemini';
import { locales } from '../../lib/locales';

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
    '선박 예약': (payload, slots) => actionHandlers.START_SCENARIO({ scenarioId: '선박 예약' }, slots),
    'faq-scenario': (payload, slots) => actionHandlers.START_SCENARIO({ scenarioId: 'faq-scenario' }, slots),
    'Welcome': (payload, slots) => actionHandlers.START_SCENARIO({ scenarioId: 'Welcome' }, slots),
};


export async function POST(request) {
  try {
    const body = await request.json();
    const { message, scenarioState, slots, language = 'ko', scenarioSessionId } = body;

    if (scenarioSessionId && scenarioState && scenarioState.scenarioId) {
      const scenario = await getScenario(scenarioState.scenarioId);
      // --- 👇 [수정된 부분] ---
      const result = await runScenario(scenario, scenarioState, message, slots, scenarioSessionId);
      // --- 👆 [여기까지] ---
      return NextResponse.json(result);
    }
    
    if (!scenarioState && message.text) {
        const action = await determineAction(message.text);
        const handler = actionHandlers[action.type];

        if (handler) {
            return await handler(action.payload, slots, language);
        }
    }

    const stream = await getGeminiStream(message.text, language);
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