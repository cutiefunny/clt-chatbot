"use client";

import { useChatStore } from "../store";
import styles from "./DevStateDisplay.module.css";

export default function DevStateDisplay() {
  const {
    extractedSlots,
    activeScenarioSessionId,
    scenarioStates,
    // --- 👇 [추가] General Settings 상태 가져오기 ---
    maxFavorites,
    hideCompletedScenarios,
    hideDelayInHours,
    fontSizeDefault,
    fontSizeSmall,
    isDevMode,
    dimUnfocusedPanels,
  } = useChatStore();

  const activeScenarioState =
    activeScenarioSessionId && scenarioStates[activeScenarioSessionId]
      ? scenarioStates[activeScenarioSessionId]
      : null;

  const devState = {};

  // 1. General Settings 정보 추가
  devState.generalSettings = {
    isDevMode,
    dimUnfocusedPanels,
    maxFavorites,
    hideCompletedScenarios,
    hideDelayInHours,
    fontSizeDefault,
    fontSizeSmall,
  };

  // 2. 활성 시나리오 정보 추가
  if (activeScenarioState) {
    devState.activeScenario = {
      sessionId: activeScenarioSessionId,
      scenarioId: activeScenarioState.scenarioId,
      currentNodeId: activeScenarioState.state?.currentNodeId,
      status: activeScenarioState.status,
      slots: activeScenarioState.slots,
    };
  }

  // 3. LLM이 추출한 슬롯 정보 추가
  if (Object.keys(extractedSlots).length > 0) {
    devState.llmExtractedSlots = extractedSlots;
  }

  // 표시할 정보가 없으면 컴포넌트를 렌더링하지 않음 (generalSettings는 항상 있으므로 이 조건은 사실상 항상 true)
  if (Object.keys(devState).length === 0) {
    return null;
  }

  return (
    <div className={styles.stateContainer}>
      <h4 className={styles.title}>[Dev] Real-time State</h4>
      <pre className={styles.pre}>{JSON.stringify(devState, null, 2)}</pre>
    </div>
  );
}