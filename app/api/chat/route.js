import { NextResponse } from 'next/server';
import { getScenario, getNextNode, interpolateMessage, findScenarioIdByTrigger, getScenarioList } from '../../lib/chatbotEngine';
import { getGeminiStream } from '../../lib/gemini';

export async function POST(request) {
  try {
    const body = await request.json();
    const { message, scenarioState, slots } = body;
    const { scenarioId, currentNodeId } = scenarioState || {};

    // 1. 시나리오 모드 처리
    if (scenarioId && currentNodeId) {
      const scenario = await getScenario(scenarioId);
      const nextNode = getNextNode(scenario, currentNodeId, message.sourceHandle);

      if (nextNode) {
        if (nextNode.data && nextNode.data.content) {
          nextNode.data.content = interpolateMessage(nextNode.data.content, slots);
        }
        return NextResponse.json({
          type: 'scenario',
          nextNode,
          scenarioState: { scenarioId, currentNodeId: nextNode.id },
        });
      } else {
        return NextResponse.json({
          type: 'scenario_end',
          message: '필요한 도움이 더 있으신가요?',
          scenarioState: null,
        });
      }
    }

    // --- 👇 [수정/추가된 부분] ---
    // 2. 기본 모드 처리
    
    // 2a. 직접 시나리오 ID로 시작 시도
    try {
        const potentialScenario = await getScenario(message.text);
        if (potentialScenario) { // 시나리오가 존재하면 바로 시작
            const startNode = getNextNode(potentialScenario, null, null);
            if (startNode.data && startNode.data.content) {
                startNode.data.content = interpolateMessage(startNode.data.content, slots);
            }
            return NextResponse.json({
                type: 'scenario_start',
                nextNode: startNode,
                scenarioState: { scenarioId: message.text, currentNodeId: startNode.id },
            });
        }
    } catch (e) {
        // getScenario에서 에러 발생 시 (해당 ID의 시나리오가 없음), 무시하고 다음 로직으로 진행
    }
    
    // 2b. 키워드로 시나리오 트리거 (기존 로직)
    const triggeredAction = findScenarioIdByTrigger(message.text);
    // --- 👆 [여기까지 수정/추가] ---

    // "시나리오 목록" 키워드 처리
    if (triggeredAction === 'GET_SCENARIO_LIST') {
      const scenarios = await getScenarioList();
      return NextResponse.json({
        type: 'scenario_list',
        scenarios, // 시나리오 목록 배열
        message: '실행할 시나리오를 선택해주세요.'
      });
    }
    
    // 다른 시나리오 트리거 처리
    if (triggeredAction) {
      const scenario = await getScenario(triggeredAction);
      const startNode = getNextNode(scenario, null, null);
      
      if (startNode.data && startNode.data.content) {
        startNode.data.content = interpolateMessage(startNode.data.content, slots);
      }
      
      return NextResponse.json({
        type: 'scenario_start',
        nextNode: startNode,
        scenarioState: { scenarioId: triggeredAction, currentNodeId: startNode.id },
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