import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

// 시나리오를 트리거하는 키워드와 시나리오 ID 맵
const scenarioTriggers = {
  "예약": "reservation-scenario",
  "문의": "faq-scenario",
  "welcome": "Welcome",
  "시나리오 목록": "GET_SCENARIO_LIST" // <-- 시나리오 목록 요청 키워드 추가
};

/**
 * 사용자 메시지에서 키워드를 찾아 해당하는 시나리오 ID 또는 액션을 반환하는 함수
 * @param {string} message - 사용자 입력 메시지
 * @returns {string | null} - 발견된 시나리오 ID 또는 액션 ID, 없으면 null
 */
export function findScenarioIdByTrigger(message) {
  for (const keyword in scenarioTriggers) {
    if (message.toLowerCase().includes(keyword.toLowerCase())) {
      return scenarioTriggers[keyword];
    }
  }
  return null;
}

/**
 * Firestore에서 모든 시나리오의 목록(ID)을 가져오는 함수
 * @returns {Promise<string[]>} 시나리오 ID 목록 배열
 */
export const getScenarioList = async () => {
  const scenariosCollection = collection(db, 'scenarios');
  const querySnapshot = await getDocs(scenariosCollection);
  return querySnapshot.docs.map(doc => doc.id);
};


// --- 기존 함수들은 그대로 유지 ---

export const getScenario = async (scenarioId) => {
  const scenarioRef = doc(db, 'scenarios', scenarioId);
  const scenarioSnap = await getDoc(scenarioRef);

  if (scenarioSnap.exists()) {
    return scenarioSnap.data();
  } else {
    throw new Error(`Scenario with ID "${scenarioId}" not found!`);
  }
};

export const getNextNode = (scenario, currentNodeId, sourceHandleId = null) => {
  if (!currentNodeId) {
    const edgeTargets = new Set(scenario.edges.map(edge => edge.target));
    const startNode = scenario.nodes.find(node => !edgeTargets.has(node.id));
    return startNode;
  }

  let nextEdge = scenario.edges.find(
    edge => edge.source === currentNodeId && edge.sourceHandle === sourceHandleId
  );
  
  if (!nextEdge && sourceHandleId === null) {
      nextEdge = scenario.edges.find(edge => edge.source === currentNodeId && !edge.sourceHandle);
  }

  if (nextEdge) {
    return scenario.nodes.find(node => node.id === nextEdge.target);
  }

  return null;
};

export const interpolateMessage = (message, slots) => {
    if (!message) return '';
    return message.replace(/\{([^}]+)\}/g, (match, key) => {
        return slots.hasOwnProperty(key) ? slots[key] : match;
    });
};