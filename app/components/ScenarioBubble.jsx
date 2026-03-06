// app/components/ScenarioBubble.jsx
"use client";

// --- 👇 [수정] 임포트 정리 (xlsx 제거, 컴포넌트 추가) ---
import { useCallback, useRef, useEffect, useState } from "react";
// import * as XLSX from "xlsx"; // [제거]
import { useChatStore } from "../store";
import { useTranslations } from "../hooks/useTranslations";
import styles from "./Chat.module.css";
import { validateInput, interpolateMessage } from "../lib/chatbotEngine";
import LogoIcon from "./icons/LogoIcon";
import ArrowDropDownIcon from "./icons/ArrowDropDownIcon";
import CheckCircle from "./icons/CheckCircle";
import OpenInNewIcon from "./icons/OpenInNew";
import ChevronDownIcon from "./icons/ChevronDownIcon";
import FormRenderer from "./FormRenderer";
import ScenarioStatusBadge from "./ScenarioStatusBadge";

// ScenarioBubble 컴포넌트 본체
export default function ScenarioBubble({ scenarioSessionId, messageData }) {
  // ✅ [최적화] selector를 사용하여 특정 시나리오 상태만 구독
  // 다른 시나리오의 상태 변경 시 이 컴포넌트는 리렌더링되지 않음
  const activeScenario = useChatStore(
    (state) => scenarioSessionId ? state.scenarioStates[scenarioSessionId] : null,
    (prev, next) => {
      // 깊은 비교를 위한 커스텀 비교 함수
      if (prev === next) return true;
      if (!prev || !next) return prev === next;
      // messages, status, slots, title 비교
      return (
        prev.messages?.length === next.messages?.length &&
        prev.status === next.status &&
        JSON.stringify(prev.slots) === JSON.stringify(next.slots) &&
        prev.title === next.title
      );
    }
  );

  const endScenario = useChatStore((state) => state.endScenario);
  const setActivePanel = useChatStore((state) => state.setActivePanel);
  const activePanel = useChatStore((state) => state.activePanel);
  const focusedSessionId = useChatStore((state) => state.activeScenarioSessionId);
  const dimUnfocusedPanels = useChatStore((state) => state.dimUnfocusedPanels);
  const openScenarioPanel = useChatStore((state) => state.openScenarioPanel);
  const { t } = useTranslations(); // language 제거

  const isCompleted =
    activeScenario?.status === "completed" ||
    activeScenario?.status === "failed" ||
    activeScenario?.status === "canceled";
  const scenarioTitle = activeScenario?.title || messageData?.text || "Scenario";
  const scenarioBody = activeScenario?.messages?.[0]?.text || activeScenario?.messages?.[0]?.node?.data?.content || messageData?.text || "";  // ✅ body content 가져오기
  const isFocused =
    activePanel === "scenario" && focusedSessionId === scenarioSessionId;

  // ✅ activeScenario가 없으면 로딩 상태로 표시 (시나리오 세션 아직 로드 안 됨)
  if (!activeScenario && scenarioSessionId) {
    // ✅ 클릭 시 패널 열기
    const handleLoadClick = async (e) => {
      e.stopPropagation();
      // 이미 생성된 시나리오 세션을 활성화하고 데이터 로드
      const store = useChatStore.getState();
      await store.subscribeToScenarioSession(scenarioSessionId);
      setActivePanel("scenario", scenarioSessionId);
    };

    return (
      <div
        className={`${styles.messageRow} ${styles.userRow}`}
        style={{ cursor: "pointer" }}
        onClick={handleLoadClick}
      >
        <div className={`GlassEffect ${styles.scenarioBubbleContainer}`}>
          <div className={styles.header}>
            <div className={styles.headerContent}>
              {/* 🔴 [NEW] 로딩 중 상태 배지 표시 */}
              <ScenarioStatusBadge
                status="generating"
                t={t}
                isSelected={false}
                styles={styles}
              />
              <span className={styles.scenarioHeaderTitle}>
                {t("scenarioTitle")(messageData?.text || "Scenario")}
              </span>
            </div>
            <div className={styles.headerButtons}>
              <div style={{ rotate: "270deg" }}>
                <ChevronDownIcon />
              </div>
            </div>
          </div>
          {/* ✅ messageData.text 표시 */}
          {messageData?.text && (
            <div className={styles.messageContent}>
              <p>{messageData.text}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ✅ scenarioSessionId가 없지만 messageData가 있으면 (백엔드에서 아직 전달 안 된 상태)
  if (!activeScenario && !scenarioSessionId && messageData?.type === "scenario_bubble") {
    return (
      <div
        className={`${styles.messageRow} ${styles.userRow}`}
        style={{ cursor: "pointer" }}
      >
        <div className={`GlassEffect ${styles.scenarioBubbleContainer}`}>
          <div className={styles.header}>
            <div className={styles.headerContent}>
              {/* 🔴 [NEW] 아직 sessionId가 없을 때 대기 상태 배지 표시 */}
              <ScenarioStatusBadge
                status="generating"
                t={t}
                isSelected={false}
                styles={styles}
              />
              <span className={styles.scenarioHeaderTitle}>
                {t("scenarioTitle")(messageData?.text || "Scenario")}
              </span>
            </div>
            <div className={styles.headerButtons}>
              <div style={{ rotate: "270deg" }}>
                <ChevronDownIcon />
              </div>
            </div>
          </div>
          {messageData?.text && (
            <div className={styles.messageContent}>
              <p>{messageData.text}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!activeScenario && !scenarioSessionId) {
    return null;
  }

  const handleBubbleClick = (e) => {
    const formElements = [
      "INPUT",
      "SELECT",
      "BUTTON",
      "LABEL",
      "OPTION",
      "TABLE",
      "THEAD",
      "TBODY",
      "TR",
      "TH",
      "TD",
    ];
    if (formElements.includes(e.target.tagName)) {
      const clickedRow = e.target.closest("tr");
      const isSelectableRow =
        clickedRow &&
        clickedRow.closest("table")?.classList.contains(styles.formGridTable) &&
        clickedRow.tagName === "TR" &&
        clickedRow.onclick;
      if (!isSelectableRow) {
        e.stopPropagation();
      }
      return;
    }

    e.stopPropagation();

    // ✅ scenarioSessionId가 있으면 직접 활성화
    if (scenarioSessionId) {
      setActivePanel("scenario", scenarioSessionId);
    }
  };

  return (
    <div
      data-message-id={scenarioSessionId}
      className={`${styles.messageRow} ${styles.userRow}`}
      onClick={handleBubbleClick}
      style={{ cursor: "pointer" }}
    >
      <div
        className={`GlassEffect ${styles.scenarioBubbleContainer} ${styles.collapsed
          } ${
          // !isFocused 이고 dimUnfocusedPanels 가 true인 경우 dimmed 처리
          // 단, 종료된(completed, failed, canceled) 상태일 때만 dimmed 처리
          !isFocused && dimUnfocusedPanels && isCompleted ? styles.dimmed : ""
          } ${isFocused ? styles.focusedBubble : ""}`}
      >
        <div className={styles.header} style={{ cursor: "pointer" }}>
          <div className={styles.headerContent}>
            {/* --- 👇 [수정] 컴포넌트 사용 --- */}
            <ScenarioStatusBadge
              status={activeScenario?.status}
              t={t}
              isSelected={isFocused}
              styles={styles} // ScenarioBubble.jsx는 Chat.module.css를 사용하므로
            />
            {/* --- 👆 [수정] --- */}

            <span className={styles.scenarioHeaderTitle}>
              {t("scenarioTitle")(
                interpolateMessage(scenarioTitle, activeScenario?.slots)
              )}
            </span>
          </div>
          <div className={styles.headerButtons}>
            <div style={{ rotate: "270deg" }}>
              <ChevronDownIcon />
            </div>
          </div>
        </div>
        {/* ✅ Body content 표시 */}
        {scenarioBody && (
          <div className={styles.messageContent}>
            <p>{scenarioBody}</p>
          </div>
        )}
      </div>
    </div>
  );
}