// app/components/ScenarioChat.jsx
"use client";

// --- 👇 [수정] useRef, useCallback 임포트 (xlsx 라이브러리 임포트 제거) ---
import { useEffect, useRef, useState, useCallback } from "react";
// import * as XLSX from "xlsx"; // [제거]
// --- 👆 [수정] ---
import { useChatStore } from "../store";
import { useTranslations } from "../hooks/useTranslations";
import styles from "./Chat.module.css";
import { validateInput, interpolateMessage } from "../lib/chatbotEngine";
import LogoIcon from "./icons/LogoIcon";
import ArrowDropDownIcon from "./icons/ArrowDropDownIcon";
import CheckCircle from "./icons/CheckCircle";
import OpenInNewIcon from "./icons/OpenInNew";
import CloseIcon from "./icons/CloseIcon";
import ScenarioExpandIcon from "./icons/ScenarioExpandIcon";
import ScenarioCollapseIcon from "./icons/ScenarioCollapseIcon";
import MarkdownRenderer from "./MarkdownRenderer";
// --- 👇 [추가] 추출된 컴포넌트 임포트 ---
import FormRenderer from "./FormRenderer";
import ScenarioStatusBadge from "./ScenarioStatusBadge";
// --- 👆 [추가] ---
import {
  openLinkThroughParent,
  postToParent,
  PARENT_ORIGIN,
  SCENARIO_PANEL_WIDTH,
  delayParentAnimationIfNeeded,
} from "../lib/parentMessaging";

// --- 👇 [제거] 엑셀 날짜 변환 헬퍼 (FormRenderer.jsx로 이동) ---
// function convertExcelDate(serial) { ... }
// --- 👆 [제거] ---

// --- 👇 [제거] FormRenderer 컴포넌트 (FormRenderer.jsx로 이동) ---
// const FormRenderer = ({ ... }) => { ... };
// --- 👆 [제거] ---

// --- 👇 [제거] ScenarioStatusBadge 컴포넌트 (ScenarioStatusBadge.jsx로 이동) ---
// const ScenarioStatusBadge = ({ ... }) => { ... };
// --- 👆 [제거] ---

// ScenarioChat 컴포넌트 본체 (변경 없음)
export default function ScenarioChat() {
  const {
    activeScenarioSessionId,
    scenarioStates,
    handleScenarioResponse,
    endScenario,
    setActivePanel,
    setScenarioSelectedOption,
    isScenarioPanelExpanded,
    toggleScenarioPanelExpanded,
  } = useChatStore();
  const { t, language } = useTranslations();

  const activeScenario = activeScenarioSessionId
    ? scenarioStates[activeScenarioSessionId]
    : null;
  const isCompleted =
    activeScenario?.status === "completed" ||
    activeScenario?.status === "failed" ||
    activeScenario?.status === "canceled";
  const scenarioMessages = activeScenario?.messages || [];
  const isScenarioLoading = activeScenario?.isLoading || false;
  const currentScenarioNodeId = activeScenario?.state?.currentNodeId;
  const scenarioId = activeScenario?.scenarioId;

  const historyRef = useRef(null);
  const wasAtBottomRef = useRef(true);

  // 스크롤 관련 함수 및 useEffect (기존 코드 유지)
  const updateWasAtBottom = useCallback(() => {
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;
    const scrollableDistance =
      scrollContainer.scrollHeight -
      scrollContainer.clientHeight -
      scrollContainer.scrollTop;
    wasAtBottomRef.current = scrollableDistance <= 5;
  }, []);

  useEffect(() => {
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;
    const handleScrollEvent = () => {
      updateWasAtBottom();
    };
    updateWasAtBottom(); // 초기 상태 설정
    scrollContainer.addEventListener("scroll", handleScrollEvent);
    return () => {
      scrollContainer.removeEventListener("scroll", handleScrollEvent);
    };
  }, [updateWasAtBottom]);

  useEffect(() => {
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;
    const scrollToBottomIfNeeded = () => {
      if (wasAtBottomRef.current) {
        requestAnimationFrame(() => {
          if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
          }
        });
      }
    };
    const observer = new MutationObserver(scrollToBottomIfNeeded);
    observer.observe(scrollContainer, { childList: true, subtree: true });
    scrollToBottomIfNeeded();
    return () => observer.disconnect();
  }, [scenarioMessages, isScenarioLoading]);

  // 로딩 상태 렌더링 (기존 코드 유지)
  if (!activeScenario) {
    return (
      <div className={styles.scenarioChatContainer}>
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <span className={styles.headerTitle}>Loading Scenario...</span>
          </div>
        </div>
        <div className={`${styles.history} ${styles.loadingState}`}>
          <p>{t("loading")}</p>
        </div>
      </div>
    );
  }

  // 핸들러 함수들 (기존 코드 유지)
  const handleFormSubmit = (formData) => {
    handleScenarioResponse({
      scenarioSessionId: activeScenarioSessionId,
      currentNodeId: currentScenarioNodeId,
      formData: formData,
      userInput: null,
      sourceHandle: null,
    });
  };

  const handleGridRowSelected = (gridElement, selectedRowData) => {
    const targetSlot = gridElement.selectSlot || "selectedRow";
    const updatedSlots = {
      ...activeScenario.slots,
      [targetSlot]: selectedRowData,
    };

    handleScenarioResponse({
      scenarioSessionId: activeScenarioSessionId,
      currentNodeId: currentScenarioNodeId,
      sourceHandle: null,
      userInput: null,
      formData: updatedSlots,
    });
  };

  // 메시지 그룹핑 로직 (기존 코드 유지)
  const groupedMessages = [];
  let currentChain = [];

  scenarioMessages.forEach((msg) => {
    if (msg.node?.type === "set-slot") {
      return;
    }
    const isChained = msg.node?.data?.chainNext === true;
    const isUserMsg = msg.sender === "user";
    if (isUserMsg) {
      if (currentChain.length > 0) {
        groupedMessages.push(currentChain);
        currentChain = [];
      }
      groupedMessages.push(msg);
    } else {
      currentChain.push(msg);
      if (!isChained) {
        groupedMessages.push(currentChain);
        currentChain = [];
      }
    }
  });
  if (currentChain.length > 0) {
    groupedMessages.push(currentChain);
  }

  return (
    <div className={styles.scenarioChatContainer}>
      <div className={styles.scenarioHeader}>
        <div className={styles.headerContent}>
          {/* --- 👇 [수정] 컴포넌트 사용 --- */}
          <ScenarioStatusBadge
            status={activeScenario?.status}
            t={t}
            styles={styles}
          />
          {/* --- 👆 [수정] --- */}
          <span className={styles.headerTitle}>
            {t("scenarioTitle")(
              interpolateMessage(scenarioId || "Scenario", activeScenario.slots)
            )}
          </span>
        </div>
        <div className={styles.headerButtons}>
          {!isCompleted && (
            <button
              className={`${styles.headerRestartButton}`}
              onClick={(e) => {
                e.stopPropagation();
                endScenario(activeScenarioSessionId, "canceled");
              }}
            >
              {t("cancel")}
            </button>
          )}
          <button
            className={`${styles.headerCloseButton} ${
              styles.headerExpandButton
            } ${
              isScenarioPanelExpanded ? styles.headerExpandButtonActive : ""
            }`}
            onClick={(e) => {
              e.stopPropagation();
              toggleScenarioPanelExpanded();
            }}
            aria-pressed={isScenarioPanelExpanded}
          >
            {isScenarioPanelExpanded ? (
              <ScenarioCollapseIcon />
            ) : (
              <ScenarioExpandIcon />
            )}
          </button>

          <button
            className={styles.headerCloseButton}
            onClick={async (e) => {
              e.stopPropagation();
              console.log(
                `[Call Window Method] callChatbotResize(width: -${SCENARIO_PANEL_WIDTH}) to ${PARENT_ORIGIN} with Close Scenario Chat`
              );
              postToParent("callChatbotResize", {
                width: -SCENARIO_PANEL_WIDTH,
              });
              await delayParentAnimationIfNeeded();
              await setActivePanel("main");
            }}
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      <div className={styles.history} ref={historyRef}>
        {groupedMessages.map((group, index) => {
          if (!Array.isArray(group)) {
            const msg = group;
            return (
              <div
                key={msg.id || `${activeScenarioSessionId}-msg-${index}`}
                className={`${styles.messageRow} ${styles.userRow}`}
              >
                <div
                  className={`GlassEffect ${styles.message} ${styles.userMessage}`}
                >
                  <div className={styles.messageContent}>
                    <MarkdownRenderer
                      content={interpolateMessage(
                        msg.text,
                        activeScenario.slots
                      )}
                    />
                  </div>
                </div>
              </div>
            );
          }

          const chain = group;
          return (
            <div
              key={chain[0].id || `${activeScenarioSessionId}-chain-${index}`}
              className={`${styles.messageRow}`}
            >
              <div
                className={`GlassEffect ${styles.message} ${
                  styles.botMessage
                } ${
                  chain.some(
                    (msg) =>
                      msg.node?.type === "form" ||
                      msg.node?.data?.elements?.some(
                        (el) => el.type === "grid"
                      ) ||
                      msg.node?.type === "iframe"
                  )
                    ? styles.gridMessage
                    : ""
                }`}
              >
                <div
                  className={
                    chain.some((msg) => msg.node?.type === "form")
                      ? styles.scenarioFormMessageContentWrapper
                      : styles.scenarioMessageContentWrapper
                  }
                >
                  {chain.some((msg) => msg.node?.type !== "form") && (
                    <LogoIcon className={styles.avatar} />
                  )}

                  <div className={styles.messageContent}>
                    {chain.map((msg) => (
                      <div
                        key={msg.id}
                        className={styles.chainedMessageItem}
                      >
                        {msg.node?.type === "form" ? (
                          // --- 👇 [수정] 컴포넌트 사용 ---
                          <FormRenderer
                            node={msg.node}
                            onFormSubmit={handleFormSubmit}
                            disabled={isCompleted}
                            language={language}
                            slots={activeScenario.slots}
                            onGridRowClick={handleGridRowSelected}
                          />
                          // --- 👆 [수정] ---
                        ) : msg.node?.type === "iframe" ? (
                          <div className={styles.iframeContainer}>
                            <iframe
                              src={interpolateMessage(
                                msg.node.data.url,
                                activeScenario.slots
                              )}
                              width={msg.node.data.width || "604px"}
                              height={msg.node.data.height || "250"}
                              style={{ border: "none", borderRadius: "8px" }}
                              title="chatbot-iframe"
                            ></iframe>
                          </div>
                        ) : msg.node?.type === "link" ? (
                          <div>
                            <a
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                openLinkThroughParent(
                                  interpolateMessage(
                                    msg.node.data.content,
                                    activeScenario.slots
                                  )
                                );
                              }}
                              target="_self"
                              rel="noopener noreferrer"
                              className={styles.linkNode}
                            >
                              {interpolateMessage(
                                msg.node.data.display || msg.node.data.content,
                                activeScenario.slots
                              )}
                              <OpenInNewIcon
                                style={{
                                  marginLeft: "4px",
                                  verticalAlign: "middle",
                                  width: "16px",
                                  height: "16px",
                                }}
                              />
                            </a>
                          </div>
                        ) : (
                          <MarkdownRenderer
                            content={interpolateMessage(
                              msg.text || msg.node?.data?.content,
                              activeScenario.slots
                            )}
                          />
                        )}
                        {msg.node?.type === "branch" &&
                          msg.node.data.replies && (
                            <div className={styles.scenarioList}>
                              {msg.node.data.replies.map((reply) => {
                                const selectedOption = msg.selectedOption;
                                const interpolatedDisplayText =
                                  interpolateMessage(
                                    reply.display,
                                    activeScenario?.slots
                                  );
                                const isSelected =
                                  selectedOption === interpolatedDisplayText;
                                const isDimmed = selectedOption && !isSelected;
                                return (
                                  <button
                                    key={reply.value}
                                    className={`${styles.optionButton} ${
                                      isSelected ? styles.selected : ""
                                    } ${isDimmed ? styles.dimmed : ""}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (selectedOption || isCompleted) return;
                                      setScenarioSelectedOption(
                                        activeScenarioSessionId,
                                        msg.node.id,
                                        interpolatedDisplayText
                                      );
                                      handleScenarioResponse({
                                        scenarioSessionId:
                                          activeScenarioSessionId,
                                        currentNodeId: msg.node.id,
                                        sourceHandle: reply.value,
                                        userInput: interpolatedDisplayText,
                                      });
                                    }}
                                    disabled={isCompleted || !!selectedOption}
                                  >
                                    <span className={styles.optionButtonText}>
                                      {interpolatedDisplayText}
                                    </span>
                                    {interpolatedDisplayText
                                      .toLowerCase()
                                      .includes("link") ? (
                                      <OpenInNewIcon
                                        style={{ color: "currentColor" }}
                                      />
                                    ) : (
                                      <CheckCircle />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {isScenarioLoading && (
          <div className={styles.messageRow}>
            <div
              className={`GlassEffect ${styles.message} ${styles.botMessage}`}
            >
              <div className={styles.scenarioMessageContentWrapper}>
                <LogoIcon className={styles.avatar} />
                <div className={styles.messageContent}>
                  <img
                    src="/images/Loading.gif"
                    alt={t("loading")}
                    style={{ width: "40px", height: "20px" }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}