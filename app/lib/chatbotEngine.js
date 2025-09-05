import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

// 시나리오를 트리거하는 키워드와 시나리오 ID 맵
const scenarioTriggers = {
  "예약": "선박 예약",
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

export const getScenario = async (scenarioId) => {
  const scenarioRef = doc(db, 'scenarios', scenarioId);
  const scenarioSnap = await getDoc(scenarioRef);

  if (scenarioSnap.exists()) {
    return scenarioSnap.data();
  } else {
    throw new Error(`Scenario with ID "${scenarioId}" not found!`);
  }
};

export const getNextNode = (scenario, currentNodeId, sourceHandleId = null, slots = {}) => {
  if (!currentNodeId) {
    const edgeTargets = new Set(scenario.edges.map(edge => edge.target));
    const startNode = scenario.nodes.find(node => !edgeTargets.has(node.id));
    return startNode;
  }

  const sourceNode = scenario.nodes.find(n => n.id === currentNodeId);
  let nextEdge;

  // LLM 노드 분기 처리
  if (sourceNode && sourceNode.type === 'llm' && sourceNode.data.conditions?.length > 0) {
      const llmOutput = slots[sourceNode.data.outputVar] || '';
      const matchedCondition = sourceNode.data.conditions.find(cond => 
          llmOutput.toLowerCase().includes(cond.keyword.toLowerCase())
      );
      if (matchedCondition) {
          nextEdge = scenario.edges.find(edge => edge.source === currentNodeId && edge.sourceHandle === matchedCondition.id);
      }
  }
  
  if (!nextEdge) {
    nextEdge = scenario.edges.find(
      edge => edge.source === currentNodeId && edge.sourceHandle === sourceHandleId
    );
  }
  
  if (!nextEdge && !sourceHandleId) {
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

// --- 👇 [추가된 헬퍼 함수] ---
export const getNestedValue = (obj, path) => {
    if (!path) return undefined;
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
};

export const validateInput = (value, validation) => {
  if (!validation) return { isValid: true };

  switch (validation.type) {
    case 'email':
      return {
        isValid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        message: '유효한 이메일 주소를 입력해주세요.'
      };
    case 'phone number':
      return {
        isValid: /^\d{2,3}-\d{3,4}-\d{4}$/.test(value),
        message: '유효한 전화번호(XXX-XXXX-XXXX)를 입력해주세요.'
      };
    case 'custom':
      if (validation.regex) {
        try {
          const isValid = new RegExp(validation.regex).test(value);
          return { isValid, message: isValid ? '' : validation.errorMessage || '입력 형식이 올바르지 않습니다.' };
        } catch (e) {
          console.error("Invalid regex:", validation.regex);
          return { isValid: false, message: '시나리오에 설정된 정규식이 올바르지 않습니다.' };
        }
      }
      return { isValid: true };
    default:
      return { isValid: true };
  }
};