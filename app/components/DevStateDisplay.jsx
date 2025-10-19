"use client";

import { useChatStore } from "../store";
import styles from "./DevStateDisplay.module.css";

export default function DevStateDisplay() {
  const {
    extractedSlots,
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
    llmRawResponse, // --- 👈 [추가]
  } = useChatStore();

  const activeScenarioState =
    activeScenarioSessionId && scenarioStates[activeScenarioSessionId]
      ? scenarioStates[activeScenarioSessionId]
      : null;

  const devState = {};

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

  if (activeScenarioState) {
    devState.activeScenario = {
      sessionId: activeScenarioSessionId,
      scenarioId: activeScenarioState.scenarioId,
      currentNodeId: activeScenarioState.state?.currentNodeId,
      status: activeScenarioState.status,
      slots: activeScenarioState.slots,
    };
  }

  if (Object.keys(extractedSlots).length > 0) {
    devState.llmExtractedSlots = extractedSlots;
  }
  
  // --- 👇 [추가된 부분] ---
  if (llmRawResponse) {
    devState.llmRawResponse = llmRawResponse;
  }
  // --- 👆 [여기까지] ---

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