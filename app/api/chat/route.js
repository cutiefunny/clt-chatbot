import { NextResponse } from 'next/server';
import { getScenario, getNextNode, interpolateMessage, findScenarioIdByTrigger, getScenarioList, validateInput, getNestedValue } from '../../lib/chatbotEngine';
import { getGeminiStream } from '../../lib/gemini';

async function handleScenario(scenario, scenarioState, message, slots) { // request 파라미터 제거
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
                scenarioState: { ...scenarioState, awaitingInput: true },
                slots: newSlots,
            });
        }
        newSlots[currentNode.data.slot] = message.text;
    }

    let nextNode;
    if (awaitingInput) {
         nextNode = getNextNode(scenario, currentId, message.sourceHandle, newSlots);
    } else {
        nextNode = getNextNode(scenario, currentId, message.sourceHandle, newSlots);
    }

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
            
            let interpolatedUrl = interpolateMessage(url, newSlots);

            if (interpolatedUrl.startsWith('/')) {
                const baseURL = process.env.NEXT_PUBLIC_API_BASE_URL ||
                              (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
                interpolatedUrl = `${baseURL}${interpolatedUrl}`;
            }

            const interpolatedHeaders = JSON.parse(interpolateMessage(headers || '{}', newSlots));
            const interpolatedBody = method !== 'GET' && body ? interpolateMessage(body, newSlots) : undefined;

            let isSuccess = false;
            try {
                const response = await fetch(interpolatedUrl, { method, headers: interpolatedHeaders, body: interpolatedBody });
                if (!response.ok) throw new Error(`API request failed with status ${response.status} for URL: ${interpolatedUrl}`);
                
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
            continue;
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
           break;
        }
        
        const nonInteractiveNext = getNextNode(scenario, nextNode.id, null, newSlots);
        if(!nonInteractiveNext) break;
        
        if (nextNode.type === 'message' && (!nextNode.data.replies || nextNode.data.replies.length === 0)) {
            currentId = nextNode.id;
            nextNode = getNextNode(scenario, currentId, null, newSlots);
        } else {
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
    // --- 👇 [수정된 부분] ---
    'GET_SCENARIO_LIST': async () => {
        const scenarios = await getScenarioList();
        return NextResponse.json({
            type: 'scenario_list',
            scenarios,
            message: '실행할 시나리오를 선택해주세요.',
            scenarioState: null // 상태를 null로 명시적으로 전달
        });
    },
    // --- 👆 [여기까지] ---
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
      return await handleScenario(scenario, scenarioState, message, slots); // request 제거
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