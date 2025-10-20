"use client";

import { useChatStore } from "../store";
import styles from "./DevStateDisplay.module.css";

export default function DevStateDisplay() {
  const {
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
    selectedRow,
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
      slots: activeScenarioState.slots || {},
    };
  }

  if (selectedRow) {
    devState.selectedRow = selectedRow;
  }

  if (llmRawResponse) {
    devState.llmRawResponse = llmRawResponse;
  }

  if (Object.keys(devState).length <= 1 && !devState.generalSettings && !devState.selectedRow) {
    return null;
  }

  return (
    <div className={styles.stateContainer}>
      <h4 className={styles.title}>[Dev] Real-time State</h4>
      <pre className={styles.pre}>{JSON.stringify(devState, null, 2)}</pre>
    </div>
  );
}