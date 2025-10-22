"use client";

import { useChatStore } from "../store";
import styles from "./DevStateDisplay.module.css";

export default function DevStateDisplay() {
  const {
    lastFocusedScenarioSessionId,
    scenarioStates,
  } = useChatStore();

  const lastFocusedScenarioState =
    lastFocusedScenarioSessionId && scenarioStates[lastFocusedScenarioSessionId]
      ? scenarioStates[lastFocusedScenarioSessionId]
      : null;

  // 표시할 상태 객체 초기화
  const devState = {};

  // 마지막으로 포커스된 시나리오가 있을 경우 slots 정보 추가
  if (lastFocusedScenarioState && lastFocusedScenarioState.slots) {
    // 슬롯 객체 복사 (원본 수정을 피하기 위해)
    const slotsToDisplay = { ...lastFocusedScenarioState.slots };

    // _lastApiRequestBody가 있으면 별도로 추출하고 원본 슬롯에서는 제거
    let apiRequestBody = null;
    if (slotsToDisplay['_lastApiRequestBody']) {
      apiRequestBody = slotsToDisplay['_lastApiRequestBody'];
      delete slotsToDisplay['_lastApiRequestBody']; // 슬롯 목록에는 중복 표시하지 않음
    }

    // 일반 슬롯 정보 추가
    if (Object.keys(slotsToDisplay).length > 0) {
        devState.lastFocusedScenarioSlots = slotsToDisplay;
    }

    // API 요청 본문 정보 추가 (JSON 파싱 시도)
    if (apiRequestBody) {
        try {
            // JSON 문자열이면 파싱해서 예쁘게 표시
            devState.lastApiRequestBody = JSON.parse(apiRequestBody);
        } catch (e) {
            // JSON 파싱 실패 시 문자열 그대로 표시
            devState.lastApiRequestBody = apiRequestBody;
        }
    }
  }

  // 표시할 상태가 없으면 컴포넌트 렌더링 안 함
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