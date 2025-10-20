"use client";

import { useChatStore } from "../store";
import styles from "./DevStateDisplay.module.css";

export default function DevStateDisplay() {
  const {
    // extractedSlots 제거
    activeScenarioSessionId,
    scenarioStates,
    maxFavorites,
    hideCompletedScenarios,
    hideDelayInHours,
    fontSizeDefault,
    fontSizeSmall,
    isDevMode,
    dimUnfocusedPanels,
    llmProvider,
    llmRawResponse, 
  } = useChatStore();

  const activeScenarioState =
    activeScenarioSessionId && scenarioStates[activeScenarioSessionId]
      ? scenarioStates[activeScenarioSessionId]
      : null;

  const devState = {};

  // General Settings는 그대로 유지
  devState.generalSettings = {
    llmProvider,
    isDevMode,
    dimUnfocusedPanels,
    maxFavorites,
    hideCompletedScenarios,
    hideDelayInHours,
    fontSizeDefault,
    fontSizeSmall,
  };
  
  // --- 👇 [수정된 부분] ---
  // 활성 시나리오 정보와 슬롯을 명확하게 표시
  if (activeScenarioState) {
    devState.activeScenario = {
      sessionId: activeScenarioSessionId,
      scenarioId: activeScenarioState.scenarioId,
      currentNodeId: activeScenarioState.state?.currentNodeId,
      status: activeScenarioState.status,
      // 시나리오 슬롯을 여기에 표시
      slots: activeScenarioState.slots || {}, 
    };
  } else {
     // 활성 시나리오가 없을 경우 'slots' 필드를 최상위에 표시 (예: LLM 단독 응답 시)
     // 참고: 현재 구조상 LLM 슬롯은 extractedSlots 상태에 별도로 저장되므로, 
     // 시나리오가 없을 때 LLM 슬롯을 보려면 아래 주석 해제 필요
     // if (Object.keys(extractedSlots).length > 0) {
     //   devState.slots = extractedSlots;
     // }
  }
  // --- 👆 [여기까지] ---

  if (llmRawResponse) {
    devState.llmRawResponse = llmRawResponse;
  }

  // 표시할 상태가 없으면 컴포넌트 렌더링 안 함
  if (Object.keys(devState).length <= 1 && !devState.generalSettings) { // generalSettings만 있을 경우 제외
    return null;
  }

  return (
    <div className={styles.stateContainer}>
      <h4 className={styles.title}>[Dev] Real-time State</h4>
      <pre className={styles.pre}>{JSON.stringify(devState, null, 2)}</pre>
    </div>
  );
}