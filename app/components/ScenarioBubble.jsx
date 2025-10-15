"use client";

import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../store";
import { useTranslations } from "../hooks/useTranslations";
import styles from "./Chat.module.css";
import { validateInput } from "../lib/chatbotEngine";
import LogoIcon from "./icons/LogoIcon";
import ChevronDownIcon from "./icons/ChevronDownIcon";
import ArrowDropDownIcon from "./icons/ArrowDropDownIcon";
import CheckCircle from "./icons/CheckCircle";
import OpenInNewIcon from "./icons/OpenInNew";

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
      <div className={styles.formContainerSeparator} />
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
              <div className={styles.selectWrapper}>
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
                <ArrowDropDownIcon
                  style={{ color: "var(--Gray-07, #5E7599)" }}
                />
              </div>
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
    // --- 👇 [추가] ---
    case "canceled":
      text = t("statusCanceled");
      statusClass = "canceled";
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
  // --- 👇 [수정] 'canceled' 상태 추가 ---
  const isCompleted =
    activeScenario?.status === "completed" ||
    activeScenario?.status === "failed" ||
    activeScenario?.status === "canceled";
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

    if (isCollapsed) {
      setIsCollapsed(false);
      setTimeout(() => {
        const isLastMessage =
          messages.length > 0 &&
          messages[messages.length - 1].scenarioSessionId ===
            scenarioSessionId;

        if (isLastMessage) {
          setActivePanel("main");
          if (bubbleRef.current) {
            const contentHeight = bubbleRef.current.scrollHeight - 60;
            scrollBy(contentHeight);
          }
        }

        if (
          activeScenario?.status === "active" ||
          activeScenario?.status === "generating"
        ) {
          const focusDelay = isLastMessage ? 350 : 0;
          setTimeout(() => {
            setActivePanel("scenario", scenarioSessionId);
          }, focusDelay);
        }
      }, 400);
    } else {
      if (
        isFocused &&
        (activeScenario?.status === "active" ||
          activeScenario?.status === "generating")
      ) {
        setActivePanel("main");
      }
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
        } ${!isFocused && !isCompleted ? styles.dimmed : ""}`}
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
                className={`${styles.headerRestartButton}`}
                onClick={(e) => {
                  e.stopPropagation();
                  // --- 👇 [수정] 'canceled' 상태로 시나리오 종료 ---
                  endScenario(scenarioSessionId, "canceled");
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
                  {msg.sender === "bot" && msg.node?.type !== "form" && (
                    <LogoIcon />
                  )}
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
                            onClick={() => {
                              handleScenarioResponse({
                                scenarioSessionId: scenarioSessionId,
                                currentNodeId: msg.node.id,
                                sourceHandle: reply.value,
                                userInput: reply.display,
                              });
                              console.log(reply);
                            }}
                            disabled={isCompleted}
                          >
                            <span className={styles.optionButtonText}>
                              {reply.display}
                            </span>
                            {reply.display.toLowerCase().includes("link") ? (
                              <OpenInNewIcon />
                            ) : (
                              <CheckCircle />
                            )}
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
