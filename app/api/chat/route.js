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

    // 2. 기본 모드 처리 (키워드 확인)
    const triggeredAction = findScenarioIdByTrigger(message.text);

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