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


export async function POST(request) {
  try {
    const body = await request.json();
    const { message, scenarioState, slots } = body;
    
    // 1. 시나리오 모드 처리
    if (scenarioState && scenarioState.scenarioId) {
      const scenario = await getScenario(scenarioState.scenarioId);
      return await handleScenario(scenario, scenarioState, message, slots);
    }
    
    // 2. 기본 모드 처리 (시나리오 시작점)
    let triggeredAction = findScenarioIdByTrigger(message.text);
    let potentialScenario;
    try {
        potentialScenario = await getScenario(message.text);
    } catch(e) {
        // 시나리오 없음, 무시
    }

    if (potentialScenario) {
        triggeredAction = message.text;
    }

    if (triggeredAction === 'GET_SCENARIO_LIST') {
      const scenarios = await getScenarioList();
      return NextResponse.json({
        type: 'scenario_list',
        scenarios,
        message: '실행할 시나리오를 선택해주세요.'
      });
    }
    
    if (triggeredAction) {
      const scenario = await getScenario(triggeredAction);
      const startNode = getNextNode(scenario, null, null);
      
      const interpolatedContent = interpolateMessage(startNode.data.content, slots);
      startNode.data.content = interpolatedContent;
      
      return NextResponse.json({
        type: 'scenario_start',
        nextNode: startNode,
        scenarioState: { scenarioId: triggeredAction, currentNodeId: startNode.id, awaitingInput: false },
        slots: {}
      });
    }

    // 3. Gemini API 호출
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