"use client";

import { useChatStore } from "../store";
import styles from "./DevStateDisplay.module.css";

export default function DevStateDisplay() {
  const {
    // --- 👇 [수정]: activeScenarioSessionId 대신 lastFocusedScenarioSessionId 사용 ---
    lastFocusedScenarioSessionId,
    // --- 👆 [수정] ---
    scenarioStates,
    // --- 👇 [삭제] 사용하지 않는 상태 제거 ---
    // maxFavorites,
    // hideCompletedScenarios,
    // hideDelayInHours,
    // fontSizeDefault,
    // fontSizeSmall,
    // isDevMode,
    // dimUnfocusedPanels,
    // llmProvider,
    // llmRawResponse,
    // selectedRow,
    // --- 👆 [여기까지] ---
  } = useChatStore();

  // --- 👇 [수정]: lastFocusedScenarioSessionId를 사용하여 상태 가져오기 ---
  const lastFocusedScenarioState =
    lastFocusedScenarioSessionId && scenarioStates[lastFocusedScenarioSessionId]
      ? scenarioStates[lastFocusedScenarioSessionId]
      : null;
  // --- 👆 [수정] ---

  // --- 👇 [수정된 부분 시작] ---
  // 표시할 상태 객체 초기화
  const devState = {};

  // --- 👇 [수정]: lastFocusedScenarioState에서 slots 정보 추가 ---
  // 마지막으로 포커스된 시나리오가 있을 경우 slots 정보만 추가
  if (lastFocusedScenarioState && lastFocusedScenarioState.slots) {
    devState.lastFocusedScenarioSlots = lastFocusedScenarioState.slots;
  }
  // --- 👆 [수정] ---

  // 표시할 상태가 없으면 컴포넌트 렌더링 안 함
  if (Object.keys(devState).length === 0) {
    return null;
  }
  // --- 👆 [수정된 부분 끝] ---


  return (
    <div className={styles.stateContainer}>
      <h4 className={styles.title}>[Dev] Real-time State</h4>
      {/* --- 👇 [수정] devState 객체를 JSON으로 표시 --- */}
      <pre className={styles.pre}>{JSON.stringify(devState, null, 2)}</pre>
    </div>
  );
}