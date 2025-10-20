"use client";

import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../store";
import { useTranslations } from "../hooks/useTranslations";
import styles from "./Chat.module.css";
import { validateInput, interpolateMessage } from "../lib/chatbotEngine";

const FormRenderer = ({ node, onFormSubmit, disabled, language, slots }) => {
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
            {el.type !== "grid" && (
              <label className={styles.formLabel}>{el.label}</label>
            )}

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

            {/* --- 👇 [수정된 부분] --- */}
            {el.type === "dropbox" && (
              <select
                value={formData[el.name] || ""}
                onChange={(e) => handleInputChange(el.name, e.target.value)}
                disabled={disabled}
                onClick={(e) => e.stopPropagation()} // 이벤트 버블링 중단 (ScenarioChat에서는 필요 없을 수 있으나 일관성을 위해 추가)
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
            {/* --- 👆 [여기까지] --- */}

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

            {el.type === "grid" &&
              (() => {
                const columns = el.columns || 2;
                const nodeData = el.data;
                let sourceData = [];

                if (Array.isArray(nodeData)) {
                  sourceData = nodeData.map((item) =>
                    typeof item === "string"
                      ? interpolateMessage(item, slots)
                      : String(item || "")
                  );
                } else if (
                  typeof nodeData === "string" &&
                  nodeData.startsWith("{") &&
                  nodeData.endsWith("}")
                ) {
                  const slotName = nodeData.substring(1, nodeData.length - 1);
                  const slotValue = slots[slotName];
                  if (Array.isArray(slotValue)) {
                    sourceData = slotValue.map((item) => String(item || ""));
                  }
                }

                const rowsData = [];
                if (sourceData.length > 0) {
                  for (let i = 0; i < sourceData.length; i += columns) {
                    rowsData.push(sourceData.slice(i, i + columns));
                  }
                }

                return (
                  <table className={styles.formGridTable}>
                    <tbody>
                      {rowsData.map((row, r) => (
                        <tr key={r}>
                          {row.map((cellValue, c) => (
                            <td key={c}>{cellValue}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
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
    setScenarioPanelOpen, // Note: This function seems unused in the component logic below
    endScenario,
  } = useChatStore();
  const { t, language } = useTranslations();

  const activeScenario = activeScenarioSessionId
    ? scenarioStates[activeScenarioSessionId]
    : null;
  const isCompleted =
    activeScenario?.status === "completed" ||
    activeScenario?.status === "failed";
  const scenarioMessages = activeScenario?.messages || [];
  const isScenarioLoading = activeScenario?.isLoading || false;
  const currentScenarioNodeId = activeScenario?.state?.currentNodeId;
  const scenarioId = activeScenario?.scenarioId;

  const historyRef = useRef(null);
  const wasAtBottomRef = useRef(true);

  const updateWasAtBottom = () => {
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;
    const scrollableDistance =
      scrollContainer.scrollHeight -
      scrollContainer.clientHeight -
      scrollContainer.scrollTop;
    wasAtBottomRef.current = scrollableDistance <= 100;
  };

  useEffect(() => {
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;

    const scrollToBottom = () => {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
      wasAtBottomRef.current = true;
    };

    scrollToBottom();

    const observer = new MutationObserver(() => {
      if (!wasAtBottomRef.current) return;
      scrollToBottom();
    });
    observer.observe(scrollContainer, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [scenarioMessages]);

  useEffect(() => {
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      updateWasAtBottom();
    };

    updateWasAtBottom();
    scrollContainer.addEventListener("scroll", handleScroll);
    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    if (!wasAtBottomRef.current) return;
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;
    requestAnimationFrame(() => {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
      wasAtBottomRef.current = true;
    });
  }, [scenarioMessages, isScenarioLoading]);

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
              // Original code used setScenarioPanelOpen(false);
              // setActivePanel('main') might be more consistent?
              useChatStore.getState().setActivePanel("main");
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
        {scenarioMessages
          .filter((msg) => msg.node?.type !== "set-slot")
          .map((msg, index) => (
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
                className={`GlassEffect noOpacity ${styles.message} ${
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
                        slots={activeScenario?.slots}
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
                              // No stopPropagation needed here usually
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
