"use client";

import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../store";
import { useTranslations } from "../hooks/useTranslations";
import styles from "./Chat.module.css";
import { validateInput } from "../lib/chatbotEngine";

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

export default function ScenarioChat() {
  const {
    isScenarioPanelOpen,
    activeScenarioSessionId,
    scenarioStates,
    handleScenarioResponse,
    setScenarioPanelOpen,
    endScenario,
  } = useChatStore();
  const { t, language } = useTranslations();

  const activeScenario = activeScenarioSessionId
    ? scenarioStates[activeScenarioSessionId]
    : null;
  // --- 👇 [수정된 부분] ---
  const isCompleted =
    activeScenario?.status === "completed" ||
    activeScenario?.status === "failed";
  // --- 👆 [여기까지] ---
  const scenarioMessages = activeScenario?.messages || [];
  const isScenarioLoading = activeScenario?.isLoading || false;
  const currentScenarioNodeId = activeScenario?.state?.currentNodeId;
  const scenarioId = activeScenario?.scenarioId;

  const historyRef = useRef(null);

  useEffect(() => {
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;

    const scrollToBottom = () => {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    };

    scrollToBottom();

    const observer = new MutationObserver(scrollToBottom);
    observer.observe(scrollContainer, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [scenarioMessages]);

  if (!isScenarioPanelOpen || !activeScenario) {
    return null;
  }

  const handleFormSubmit = (formData) => {
    handleScenarioResponse({
      scenarioSessionId: activeScenarioSessionId,
      currentNodeId: currentScenarioNodeId,
      formData: formData,
    });
  };

  return (
    <div className={styles.chatContainer} style={{ height: "100%" }}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <span className={styles.headerTitle}>
            {t("scenarioTitle")(scenarioId)}
          </span>
        </div>
        <div className={styles.headerButtons}>
          <button
            className={styles.headerRestartButton}
            onClick={(e) => {
              e.stopPropagation();
              setScenarioPanelOpen(false);
            }}
          >
            {t("hide")}
          </button>
          {!isCompleted && (
            <button
              className={`${styles.headerRestartButton} ${styles.dangerButton}`}
              onClick={(e) => {
                e.stopPropagation();
                endScenario(activeScenarioSessionId);
              }}
            >
              {t("end")}
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
            {msg.sender === "bot" && (
              <img
                src="/images/avatar.png"
                alt="Avatar"
                className={styles.avatar}
              />
            )}
            <div
              className={`GlassEffect ${styles.message} ${
                msg.sender === "bot" ? styles.botMessage : styles.userMessage
              }`}
            >
              <div className={`${styles.messageContentWrapper}`}>
                <div className={`${styles.messageContent}`}>
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
                              scenarioSessionId: activeScenarioSessionId,
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
  );
}
