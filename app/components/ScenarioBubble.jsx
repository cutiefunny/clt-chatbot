"use client";

import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../store";
import { useTranslations } from "../hooks/useTranslations";
import styles from "./Chat.module.css";
import { validateInput } from "../lib/chatbotEngine";
import LogoIcon from "./icons/LogoIcon";
import ChevronDownIcon from "./icons/ChevronDownIcon";

const FormRenderer = ({ node, onFormSubmit, disabled, language }) => {
  const [formData, setFormData] = useState({});
  const dateInputRef = useRef(null);
  const { t } = useTranslations();

  const handleInputChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleMultiInputChange = (name, value, checked) => {
    setFormData((prev) => {
      const existing = prev[name] || [];
      const newValues = checked
        ? [...existing, value]
        : existing.filter((v) => v !== value);
      return { ...prev, [name]: newValues };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    for (const element of node.data.elements) {
      if (element.type === "input" || element.type === "date") {
        const value = formData[element.name] || "";
        const { isValid, message } = validateInput(
          value,
          element.validation,
          language
        );
        if (!isValid) {
          alert(message);
          return;
        }
      }
    }
    onFormSubmit(formData);
  };

  const handleDateInputClick = () => {
    try {
      dateInputRef.current?.showPicker();
    } catch (error) {
      console.error("Failed to show date picker:", error);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.formContainer}>
      <h3>{node.data.title}</h3>
      {node.data.elements?.map((el) => {
        const dateProps = {};
        if (el.type === "date" && el.validation) {
          if (el.validation.type === "today after") {
            dateProps.min = new Date().toISOString().split("T")[0];
          } else if (el.validation.type === "today before") {
            dateProps.max = new Date().toISOString().split("T")[0];
          } else if (el.validation.type === "custom") {
            if (el.validation.startDate)
              dateProps.min = el.validation.startDate;
            if (el.validation.endDate) dateProps.max = el.validation.endDate;
          }
        }
        return (
          <div key={el.id} className={styles.formElement}>
            <label className={styles.formLabel}>{el.label}</label>
            {el.type === "input" && (
              <input
                className={styles.formInput}
                type="text"
                placeholder={el.placeholder}
                value={formData[el.name] || ""}
                onChange={(e) => handleInputChange(el.name, e.target.value)}
                disabled={disabled}
              />
            )}

            {el.type === "date" && (
              <input
                ref={dateInputRef}
                className={styles.formInput}
                type="date"
                value={formData[el.name] || ""}
                onChange={(e) => handleInputChange(el.name, e.target.value)}
                onClick={handleDateInputClick}
                disabled={disabled}
                {...dateProps}
              />
            )}

            {el.type === "dropbox" && (
              <select
                value={formData[el.name] || ""}
                onChange={(e) => handleInputChange(el.name, e.target.value)}
                disabled={disabled}
              >
                <option value="" disabled>
                  {t("select")}
                </option>
                {el.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}
            {el.type === "checkbox" &&
              el.options?.map((opt) => (
                <div key={opt}>
                  <input
                    type="checkbox"
                    id={`${el.id}-${opt}`}
                    value={opt}
                    onChange={(e) =>
                      handleMultiInputChange(el.name, opt, e.target.checked)
                    }
                    disabled={disabled}
                  />
                  <label htmlFor={`${el.id}-${opt}`}>{opt}</label>
                </div>
              ))}
          </div>
        );
      })}
      {!disabled && (
        <button type="submit" className={styles.formSubmitButton}>
          {t("submit")}
        </button>
      )}
    </form>
  );
};

const ScenarioStatusBadge = ({ status, t }) => {
  if (!status) return null;
  let text;
  let statusClass;

  switch (status) {
    case "completed":
      text = t("statusCompleted");
      statusClass = "done";
      break;
    case "active":
      text = t("statusActive");
      statusClass = "incomplete";
      break;
    case "failed":
      text = t("statusFailed");
      statusClass = "failed";
      break;
    case "generating":
      text = t("statusGenerating");
      statusClass = "generating";
      break;
    default:
      return null;
  }
  return (
    <span className={`${styles.scenarioBadge} ${styles[statusClass]}`}>
      {text}
    </span>
  );
};

export default function ScenarioBubble({ scenarioSessionId }) {
  const {
    messages,
    scenarioStates,
    handleScenarioResponse,
    endScenario,
    setActivePanel,
    activePanel,
    activeScenarioSessionId: focusedSessionId,
    scrollBy,
  } = useChatStore();
  const { t, language } = useTranslations();

  const [isCollapsed, setIsCollapsed] = useState(false);

  const activeScenario = scenarioSessionId
    ? scenarioStates[scenarioSessionId]
    : null;
  const isCompleted =
    activeScenario?.status === "completed" ||
    activeScenario?.status === "failed";
  const scenarioMessages = activeScenario?.messages || [];
  const isScenarioLoading = activeScenario?.isLoading || false;
  const currentScenarioNodeId = activeScenario?.state?.currentNodeId;
  const scenarioId = activeScenario?.scenarioId;
  const isFocused =
    activePanel === "scenario" && focusedSessionId === scenarioSessionId;

  const historyRef = useRef(null);
  const bubbleRef = useRef(null);

  useEffect(() => {
    setIsCollapsed(false);
  }, []);

  useEffect(() => {
    const scrollContainer = historyRef.current;
    if (!scrollContainer || isCollapsed) return;

    const scrollToBottom = () => {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    };

    scrollToBottom();
    const observer = new MutationObserver(scrollToBottom);
    observer.observe(scrollContainer, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [scenarioMessages, isCollapsed]);

  if (!activeScenario) {
    return null;
  }

  const handleFormSubmit = (formData) => {
    handleScenarioResponse({
      scenarioSessionId: scenarioSessionId,
      currentNodeId: currentScenarioNodeId,
      formData: formData,
    });
  };

  const handleBubbleClick = (e) => {
    e.stopPropagation();
    if (!isCompleted) {
      setActivePanel("scenario", scenarioSessionId);
    }
  };

  const handleToggleCollapse = (e) => {
    e.stopPropagation();

    // 접혀있는 것을 펼칠 때
    if (isCollapsed) {
      // 1. 시나리오 버블을 펼침 (애니메이션 시작)
      setIsCollapsed(false);

      // 2. 버블이 다 펼쳐진 후 (CSS transition 0.4s)
      setTimeout(() => {
        const isLastMessage =
          messages.length > 0 &&
          messages[messages.length - 1].scenarioSessionId ===
            scenarioSessionId;

        // --- 👇 [수정] 마지막 메시지일 경우에만 스크롤 및 포커스 이동 ---
        if (isLastMessage) {
          // 3. 메인챗으로 포커스 이동
          setActivePanel("main");

          if (bubbleRef.current) {
            // 4. 시나리오 버블의 높이만큼 스크롤
            const contentHeight = bubbleRef.current.scrollHeight - 60; // 헤더 높이 제외
            scrollBy(contentHeight);
          }

          // 5. 시나리오가 진행중 상태인 경우 시나리오 버블로 포커스 이동
          if (
            activeScenario?.status === "active" ||
            activeScenario?.status === "generating"
          ) {
            // 스크롤 애니메이션(smooth) 시간 고려하여 약간의 딜레이 후 포커스
            setTimeout(() => {
              setActivePanel("scenario", scenarioSessionId);
            }, 350);
          }
        }
        // --- 👆 [여기까지] ---
      }, 400); // CSS transition 시간과 맞춤
    }
    // 펼쳐진 것을 접을 때
    else {
      setIsCollapsed(true);
    }
  };

  return (
    <div
      className={`${styles.messageRow} ${styles.userRow}`}
      onClick={handleBubbleClick}
      ref={bubbleRef}
    >
      <div
        className={`GlassEffect ${styles.scenarioBubbleContainer} ${
          isCollapsed ? styles.collapsed : ""
        } ${!isFocused ? styles.dimmed : ""}`}
      >
        <div
          className={styles.header}
          onClick={handleToggleCollapse}
          style={{ cursor: "pointer" }}
        >
          <div className={styles.headerContent}>
            <ChevronDownIcon isRotated={isCollapsed} />
            <span className={styles.headerTitle}>
              {t("scenarioTitle")(scenarioId)}
            </span>
          </div>
          <div className={styles.headerButtons}>
            <ScenarioStatusBadge status={activeScenario?.status} t={t} />
            {!isCompleted && (
              <button
                className={`${styles.headerRestartButton} `}
                onClick={(e) => {
                  e.stopPropagation();
                  endScenario(scenarioSessionId);
                }}
              >
                {t("cancel")}
              </button>
            )}
          </div>
        </div>

        <div className={styles.history} ref={historyRef}>
          {scenarioMessages.map((msg, index) => (
            <div
              key={`${msg.id}-${index}`}
              className={`${styles.messageRow} ${
                msg.sender === "user" ? styles.userRow : ""
              }`}
            >
              <div
                className={`GlassEffect ${styles.message} ${
                  msg.sender === "bot" ? styles.botMessage : styles.userMessage
                }`}
              >
                <div className={styles.scenarioMessageContentWrapper}>
                  {msg.sender === "bot" && <LogoIcon />}
                  <div className={styles.messageContent}>
                    {msg.node?.type === "form" ? (
                      <FormRenderer
                        node={msg.node}
                        onFormSubmit={handleFormSubmit}
                        disabled={isCompleted}
                        language={language}
                      />
                    ) : msg.node?.type === "iframe" ? (
                      <div className={styles.iframeContainer}>
                        <iframe
                          src={msg.node.data.url}
                          width={msg.node.data.width || "100%"}
                          height={msg.node.data.height || "250"}
                          style={{ border: "none", borderRadius: "18px" }}
                          title="chatbot-iframe"
                        ></iframe>
                      </div>
                    ) : msg.node?.type === "link" ? (
                      <div>
                        <span>Opening link in a new tab: </span>
                        <a
                          href={msg.node.data.content}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {msg.node.data.display || msg.node.data.content}
                        </a>
                      </div>
                    ) : (
                      <p>{msg.text || msg.node?.data.content}</p>
                    )}
                    {msg.node?.type === "branch" && msg.node.data.replies && (
                      <div className={styles.scenarioList}>
                        {msg.node.data.replies.map((reply) => (
                          <button
                            key={reply.value}
                            className={styles.optionButton}
                            onClick={() =>
                              handleScenarioResponse({
                                scenarioSessionId: scenarioSessionId,
                                currentNodeId: msg.node.id,
                                sourceHandle: reply.value,
                                userInput: reply.display,
                              })
                            }
                            disabled={isCompleted}
                          >
                            {reply.display}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {isScenarioLoading && (
            <div className={styles.messageRow}>
              <img
                src="/images/avatar-loading.png"
                alt="Avatar"
                className={styles.avatar}
              />
              <div className={`${styles.message} ${styles.botMessage}`}>
                <img
                  src="/images/Loading.gif"
                  alt={t("loading")}
                  style={{ width: "40px", height: "30px" }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}