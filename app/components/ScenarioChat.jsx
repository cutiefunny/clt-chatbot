// app/components/ScenarioChat.jsx
"use client";

// --- 👇 [수정] 임포트 정리 (useCallback 추가) ---
import { useEffect, useRef, useState, useCallback } from "react";
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

// ScenarioChat 컴포넌트 본체
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
    // --- 👇 [수정] setSlots 대신 setScenarioSlots 가져오기 ---
    setScenarioSlots,
    // --- 👆 [수정] ---
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
  // --- 👇 [수정] 현재 시나리오의 슬롯 가져오기 (이전과 동일) ---
  const currentSlots = activeScenario?.slots || {};
  // --- 👆 [수정] ---

  const historyRef = useRef(null);
  const wasAtBottomRef = useRef(true);

  // 스크롤 관련 함수 및 useEffect (기존과 동일)
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
    updateWasAtBottom();
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

  // 로딩 상태 렌더링 (기존과 동일)
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

  // 핸들러 함수들
  const handleFormSubmit = (formData) => {
    handleScenarioResponse({
      scenarioSessionId: activeScenarioSessionId,
      currentNodeId: currentScenarioNodeId,
      formData: formData,
      userInput: null,
      sourceHandle: null,
    });
  };

  // --- 👇 [수정] Form Element API 호출 핸들러 (headers 반영 + 토스트 에러 메시지) ---
  const handleFormElementApiCall = useCallback(async (element, localFormData) => {
    const currentNode = activeScenario?.messages
        .find(msg => msg.node?.id === currentScenarioNodeId)?.node;

    if (!currentNode || currentNode.type !== 'form') {
        console.warn("API Call ABORTED: currentNode is not the form node.");
        return;
    }
    const elementConfig = currentNode.data.elements.find(e => e.id === element.id);
    
    if (!elementConfig || !elementConfig.apiConfig || !elementConfig.resultSlot) {
      alert("Search element is not configured correctly. (Missing API URL or Result Slot)");
      return;
    }

    const { apiConfig, resultSlot } = elementConfig;
    const searchTerm = localFormData[elementConfig.name] || '';
    // 💡 currentSlots (시나리오 슬롯)와 'value' (검색어)를 사용
    const allValues = { ...currentSlots, value: searchTerm };
    const method = apiConfig.method || 'POST'; 
    
    // store의 showEphemeralToast를 가져옵니다.
    const { showEphemeralToast } = useChatStore.getState();

    try {
      const interpolatedUrl = interpolateMessage(apiConfig.url, allValues);
      
      let customHeaders = {};
      if (apiConfig.headers) {
          try {
              // 1. 슬롯을 사용하여 헤더 문자열 보간
              const interpolatedHeadersString = interpolateMessage(apiConfig.headers, allValues);
              // 2. JSON 파싱
              customHeaders = JSON.parse(interpolatedHeadersString);
          } catch (e) {
              console.error("Error processing or parsing API headers JSON:", e, apiConfig.headers);
              // 파싱 오류 시 경고만 출력하고 기본 헤더만 사용
          }
      }

      const fetchOptions = {
        method: method,
        // 모든 메소드에 사용자 정의 헤더 적용
        headers: {
            ...customHeaders
        },
      };

      if (method === 'POST') {
        const interpolatedBody = interpolateMessage(apiConfig.bodyTemplate, allValues);
        // POST 시 Content-Type: application/json 기본 추가 (customHeaders가 덮어쓸 수 있도록 먼저 추가)
        fetchOptions.headers = {
            'Content-Type': 'application/json',
            ...fetchOptions.headers
        };
        fetchOptions.body = interpolatedBody;
      }
      
      const response = await fetch(interpolatedUrl, fetchOptions);

      if (!response.ok) {
        let errorBody = await response.text();
        let errorMessage = `(${response.status}) `;
        try {
            const errorJson = JSON.parse(errorBody);
            // JSON 응답에 'message' 필드가 있으면 사용
            errorMessage += errorJson.message || t('errorServer');
        } catch (e) {
            // JSON 파싱 실패 시, 범용 오류 메시지 사용
            errorMessage += t('errorServer');
        }
        throw new Error(errorMessage); 
      }

      const responseData = await response.json();

      // 💡 setScenarioSlots (성공 로직 유지)
      setScenarioSlots(activeScenarioSessionId, { ...currentSlots, [resultSlot]: responseData });
      
    } catch (error) { // --- 👈 [수정된 catch 블록] ---
      console.error("Form element API call failed:", error);
      
      let toastMessage;
      
      // 'fetch failed' 또는 'Failed to fetch'와 같은 메시지로 네트워크 오류를 판단합니다.
      if (error.name === 'AbortError' || error.message.includes('fetch failed') || error.message.includes('Failed to fetch')) {
          // 네트워크/타임아웃 오류 시 errorApiRequest 사용
          toastMessage = t('errorApiRequest'); 
      } else if (error.message.includes('(')) {
          // HTTP 상태 코드나 서버 메시지가 포함된 오류
          toastMessage = `${t('errorApiRequest')} ${error.message}`;
      } else {
          // 기타 예상치 못한 오류
          toastMessage = t('errorUnexpected');
      }

      showEphemeralToast(toastMessage, 'error');
    }
  }, [activeScenario, currentScenarioNodeId, currentSlots, setScenarioSlots, activeScenarioSessionId, t]); // t를 의존성 배열에 추가
  // --- 👆 [수정] Form Element API 호출 핸들러 (headers 반영 + 토스트 에러 메시지) ---


  // 메시지 그룹핑 로직 (기존과 동일)
  const groupedMessages = [];
  let currentChain = [];
  scenarioMessages.forEach((msg) => {
    if (msg.node?.type === "set-slot" || msg.node?.type === "setSlot") { // 💡 setSlot 타입 체크
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

  const containsMarkdownTable = (msg) => {
    const content = msg.text || msg.node?.data?.content;
    if (typeof content === "string") {
      return content.includes("|---");
    }
    return false;
  };

  return (
    <div className={styles.scenarioChatContainer}>
      <div className={styles.scenarioHeader}>
        <div className={styles.headerContent}>
          <ScenarioStatusBadge
            status={activeScenario?.status}
            t={t}
            styles={styles}
            isSelected={true} 
          />
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
            // (사용자 메시지 렌더링 - 기존과 동일)
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

          // --- 👇 [수정] isRichContent 계산 로직 (undefined 방지) ---
          const isRichContent = chain.some(
            (msg) =>
              msg.node?.type === "form" ||
              (msg.node?.data?.elements && 
                msg.node.data.elements.some((el) => el.type === "grid")) ||
              msg.node?.type === "iframe" ||
              containsMarkdownTable(msg)
          );
          // --- 👆 [수정] ---

          let widthClass = "";
          if (isRichContent) {
            widthClass = styles.gridMessage;
          } else {
            // (너비 계산 로직 - 기존과 동일)
            const allTextContents = chain.map((msg) => {
              return String(msg.text || msg.node?.data?.content || "");
            });
            const lines = allTextContents.join("\n").split("\n");
            const maxLineLength = lines.reduce((maxLength, currentLine) => {
              return Math.max(maxLength, currentLine.length);
            }, 0);
            const SHORT_THRESHOLD = 10;
            const MEDIUM_THRESHOLD = 30;
            if (maxLineLength < SHORT_THRESHOLD) {
              widthClass = styles.width30;
            } else if (maxLineLength < MEDIUM_THRESHOLD) {
              widthClass = styles.width60;
            } else {
              widthClass = styles.gridMessage;
            }
          }


          return (
            <div
              key={chain[0].id || `${activeScenarioSessionId}-chain-${index}`}
              className={`${styles.messageRow}`}
            >
              <div
                className={`GlassEffect ${styles.message} ${
                  styles.botMessage
                } ${widthClass}`}
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
                          // --- 👇 [수정] FormRenderer에 새 props 전달 ---
                          <FormRenderer
                            node={msg.node}
                            onFormSubmit={handleFormSubmit}
                            disabled={
                              isCompleted ||
                              msg.node.id !== currentScenarioNodeId
                            }
                            language={language}
                            slots={currentSlots} // 💡 현재 시나리오 슬롯 전달
                            setScenarioSlots={setScenarioSlots} // 💡 시나리오 슬롯 업데이터 전달
                            activeScenarioSessionId={activeScenarioSessionId} // 💡 세션 ID 전달
                            onFormElementApiCall={handleFormElementApiCall} // 💡 API 핸들러 전달
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
                                // (버튼 렌더링 로직 - 기존과 동일)
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
          // (로딩 인디케이터 - 기존과 동일)
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