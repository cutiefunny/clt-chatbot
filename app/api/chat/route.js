import { NextResponse } from 'next/server';
import { getScenario, getNextNode, interpolateMessage, findActionByTrigger, getScenarioList, runScenario, getScenarioCategories } from '../../lib/chatbotEngine';
import { getLlmResponse } from '../../lib/llm';
import { locales } from '../../lib/locales';

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
        const startNode = getNextNode(scenario, null, null, slots); // slots 전달

        if (!startNode || !startNode.data) {
            return NextResponse.json({
                type: 'scenario_end',
                message: `시나리오 '${scenarioId}'를 시작할 수 없습니다. (내용이 비어있거나 시작점이 없습니다.)`,
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
            scenarioState: { scenarioId: scenarioId, currentNodeId: startNode.id, awaitingInput: false },
            slots: slots
        });
    },
};

async function determineAction(messageText) {
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
        await getScenario(messageText);
        return { type: 'START_SCENARIO', payload: { scenarioId: messageText } };
    } catch (e) {}
    return { type: 'LLM_FALLBACK' };
}


export async function POST(request) {
  try {
    const body = await request.json();
    const { message, scenarioState, slots, language = 'ko', scenarioSessionId, llmProvider, flowiseApiUrl } = body;

    if (scenarioSessionId && scenarioState && scenarioState.scenarioId) {
      const scenario = await getScenario(scenarioState.scenarioId);
      const result = await runScenario(scenario, scenarioState, message, slots, scenarioSessionId);
      return NextResponse.json(result);
    }
    
    if (scenarioSessionId && !scenarioState && message && message.text) {
        const scenarioId = message.text;
        const handler = actionHandlers['START_SCENARIO'];
        const payload = { scenarioId };
        return await handler(payload, slots || {}, language);
    }

    if (!scenarioState && message.text) {
        const action = await determineAction(message.text);
        const handler = actionHandlers[action.type];
        if (handler) {
            return await handler(action.payload, slots, language);
        }
    }
    
    // --- 👇 [수정된 부분] ---
    const categories = await getScenarioCategories();
    const allShortcuts = categories.flatMap(cat => 
        cat.subCategories.flatMap(subCat => subCat.items)
    );
    const uniqueShortcuts = [...new Map(allShortcuts.map(item => [item.title, item])).values()];

    const llmResult = await getLlmResponse(message.text, language, uniqueShortcuts, llmProvider, flowiseApiUrl);

    if (llmResult instanceof ReadableStream) {
        return new Response(llmResult, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
            },
        });
    }

    // JSON 객체 (에러 등)가 반환될 경우에 대한 폴백
    return NextResponse.json({
        type: 'llm_response_with_slots',
        message: llmResult.response,
        slots: llmResult.slots,
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