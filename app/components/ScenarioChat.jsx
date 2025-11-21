// app/components/ScenarioChat.jsx
"use client";

import { useCallback } from "react";
import { useChatStore } from "../store";
import { useTranslations } from "../hooks/useTranslations";
import { useAutoScroll } from "../hooks/useAutoScroll"; // [추가] 훅 임포트
import styles from "./Chat.module.css";
import { validateInput, interpolateMessage } from "../lib/chatbotEngine";
import LogoIcon from "./icons/LogoIcon";
import CheckCircle from "./icons/CheckCircle";
import OpenInNewIcon from "./icons/OpenInNew";
import CloseIcon from "./icons/CloseIcon";
import ScenarioExpandIcon from "./icons/ScenarioExpandIcon";
import ScenarioCollapseIcon from "./icons/ScenarioCollapseIcon";
import MarkdownRenderer from "./MarkdownRenderer";
import FormRenderer from "./FormRenderer";
import ScenarioStatusBadge from "./ScenarioStatusBadge";
import {
  openLinkThroughParent,
  postToParent,
  PARENT_ORIGIN,
  SCENARIO_PANEL_WIDTH,
  delayParentAnimationIfNeeded,
} from "../lib/parentMessaging";

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
    setScenarioSlots,
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
  const currentSlots = activeScenario?.slots || {};

  // [리팩토링] 커스텀 스크롤 훅 사용 (ref 및 effect 로직 대체)
  const { scrollRef } = useAutoScroll(scenarioMessages, isScenarioLoading);

  // 로딩 상태 렌더링
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

  const handleFormSubmit = (formData) => {
    handleScenarioResponse({
      scenarioSessionId: activeScenarioSessionId,
      currentNodeId: currentScenarioNodeId,
      formData: formData,
      userInput: null,
      sourceHandle: null,
    });
  };

  const handleFormElementApiCall = async (element, localFormData) => {
    const currentNode = activeScenario?.messages
        .find(msg => msg.node?.id === currentScenarioNodeId)?.node;

    if (!currentNode || currentNode.type !== 'form') {
        console.warn("API Call ABORTED: currentNode is not the form node.");
        return;
    }
    const formElements = currentNode.data.elements;
    const elementConfig = formElements.find(e => e.id === element.id);
    
    if (!elementConfig || !elementConfig.apiConfig || !elementConfig.resultSlot) {
      alert("Search element is not configured correctly. (Missing API URL or Result Slot)");
      return;
    }

    const { apiConfig, resultSlot } = elementConfig;
    const searchTerm = localFormData[elementConfig.name] || '';
    
    let formSlotUpdates = {};
    if (Array.isArray(formElements)) {
        formElements.forEach(el => {
            if (el.name && localFormData.hasOwnProperty(el.name)) {
                formSlotUpdates[el.name] = localFormData[el.name];
            }
        });
    }

    let updatedSlotsForApi = { ...currentSlots, ...formSlotUpdates };
    setScenarioSlots(activeScenarioSessionId, updatedSlotsForApi);

    const allValues = { ...updatedSlotsForApi, value: searchTerm };
    const method = apiConfig.method || 'POST'; 
    
    const { showEphemeralToast } = useChatStore.getState();

    try {
      const interpolatedUrl = interpolateMessage(apiConfig.url, allValues);
      
      let customHeaders = {};
      if (apiConfig.headers) {
          try {
              const interpolatedHeadersString = interpolateMessage(apiConfig.headers, allValues);
              customHeaders = JSON.parse(interpolatedHeadersString);
          } catch (e) {
              console.error("Error processing or parsing API headers JSON:", e, apiConfig.headers);
          }
      }

      const fetchOptions = {
        method: method,
        headers: {
            ...customHeaders
        },
      };

      if (method === 'POST') {
        const interpolatedBody = interpolateMessage(apiConfig.bodyTemplate, allValues);
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
            errorMessage += errorJson.message || t('errorServer');
        } catch (e) {
            errorMessage += t('errorServer');
        }
        throw new Error(errorMessage); 
      }

      const responseData = await response.json();
      setScenarioSlots(activeScenarioSessionId, { ...updatedSlotsForApi, [resultSlot]: responseData });
      
    } catch (error) { 
      console.error("Form element API call failed:", error);
      let toastMessage;
      
      if (error.name === 'AbortError' || error.message.includes('fetch failed') || error.message.includes('Failed to fetch')) {
          toastMessage = t('errorApiRequest'); 
      } else if (error.message.includes('(')) {
          toastMessage = `${t('errorApiRequest')} ${error.message}`;
      } else {
          toastMessage = t('errorUnexpected');
      }

      showEphemeralToast(toastMessage, 'error');
    }
  };

  const groupedMessages = [];
  let currentChain = [];
  scenarioMessages.forEach((msg) => {
    if (msg.node?.type === "set-slot" || msg.node?.type === "setSlot") {
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
              // 시나리오: scenarioPanel에 scenarioPanelOpen 클래스가 있으면 postToParent 호출 방지
              const panelElem = document.querySelector('.scenarioPanel');
              if (panelElem && panelElem.classList.contains('scenarioPanelOpen')) {
                // 이미 열려있으면(확장상태), 리사이즈 메시지(postToParent) 보내지 않고 패널 전환만
                toggleScenarioPanelExpanded(false); // 내부에서 확장/축소만 처리(후킹 가능하도록 인자 추가)
              } else {
                // 아니면 기본동작
                toggleScenarioPanelExpanded();
              }
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

      <div className={styles.history} ref={scrollRef}>
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
          const isRichContent = chain.some(
            (msg) =>
              msg.node?.type === "form" ||
              (msg.node?.data?.elements && 
                msg.node.data.elements.some((el) => el.type === "grid")) ||
              msg.node?.type === "iframe" ||
              containsMarkdownTable(msg)
          );

          let widthClass = "";
          if (isRichContent) {
            widthClass = styles.gridMessage;
          } else {
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
                          <FormRenderer
                            node={msg.node}
                            onFormSubmit={handleFormSubmit}
                            disabled={
                              isCompleted ||
                              msg.node.id !== currentScenarioNodeId
                            }
                            language={language}
                            slots={currentSlots}
                            setScenarioSlots={setScenarioSlots}
                            activeScenarioSessionId={activeScenarioSessionId}
                            onFormElementApiCall={handleFormElementApiCall}
                          />
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