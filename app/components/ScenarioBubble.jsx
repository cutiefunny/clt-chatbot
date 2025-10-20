"use client";

import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../store"; // useChatStore 임포트 확인
import { useTranslations } from "../hooks/useTranslations";
import styles from "./Chat.module.css";
import { validateInput, interpolateMessage } from "../lib/chatbotEngine";
import LogoIcon from "./icons/LogoIcon";
import ChevronDownIcon from "./icons/ChevronDownIcon";
import ArrowDropDownIcon from "./icons/ArrowDropDownIcon";
import CheckCircle from "./icons/CheckCircle";
import OpenInNewIcon from "./icons/OpenInNew";

const FormRenderer = ({ node, onFormSubmit, disabled, language, slots, onGridRowClick }) => {
  const [formData, setFormData] = useState({});
  const dateInputRef = useRef(null);
  const { t } = useTranslations();

  // --- handleInputChange, handleMultiInputChange, handleSubmit, handleDateInputClick 함수 생략 ---
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


  const hasSlotBoundGrid = node.data.elements?.some(el =>
    el.type === 'grid' &&
    el.optionsSlot &&
    Array.isArray(slots[el.optionsSlot]) &&
    slots[el.optionsSlot].length > 0 &&
    typeof slots[el.optionsSlot][0] === 'object' &&
    slots[el.optionsSlot][0] !== null
  );

  return (
    <form onSubmit={handleSubmit} className={styles.formContainer}>
      <h3>{node.data.title}</h3>
      <div className={styles.formContainerSeparator} />
      {node.data.elements?.map((el) => {
        const dateProps = {};
        // --- Date props 계산 로직 생략 ---
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
            {el.type === "grid" ? (() => {
                const gridDataFromSlot = el.optionsSlot ? slots[el.optionsSlot] : null;
                const hasSlotData = Array.isArray(gridDataFromSlot) && gridDataFromSlot.length > 0;

                if (hasSlotData) {
                    const isDynamicObjectArray = typeof gridDataFromSlot[0] === 'object' && gridDataFromSlot[0] !== null && !Array.isArray(gridDataFromSlot[0]);
                    if (isDynamicObjectArray) {
                        const originalDisplayKeys = el.displayKeys && el.displayKeys.length > 0 ? el.displayKeys : Object.keys(gridDataFromSlot[0] || {});
                        const filteredKeys = el.hideNullColumns
                            ? originalDisplayKeys.filter(key => gridDataFromSlot.some(obj => obj[key] !== null && obj[key] !== undefined && obj[key] !== ""))
                            : originalDisplayKeys;

                        // 컬럼 키가 하나도 없을 경우 렌더링하지 않음 (Hydration 오류 방지 - 1단계)
                        if (filteredKeys.length === 0 && !el.hideNullColumns) {
                           console.warn("Grid rendering skipped: No keys found in data object.", el, gridDataFromSlot[0]);
                           return <div>No data columns found.</div>; // Or some placeholder
                        }
                         // hideNullColumns에 의해 모든 키가 필터링 된 경우
                        if (filteredKeys.length === 0 && el.hideNullColumns) {
                            console.warn("Grid rendering skipped: All columns were hidden due to hideNullColumns.", el);
                            return <div>All columns hidden.</div>; // Or some placeholder
                        }


                        const columnWidths = filteredKeys.reduce((acc, key) => {
                            const headerLength = key.length;
                            const maxLength = gridDataFromSlot.reduce((max, obj) => {
                                const valueStr = String(interpolateMessage(obj[key] || '', slots));
                                return Math.max(max, valueStr.length);
                            }, 0);
                            acc[key] = Math.max(headerLength, maxLength) + 2;
                            return acc;
                        }, {});


                        return (
                            <div key={el.id} style={{ overflowX: 'auto', width: '100%' }}>
                                <table className={styles.formGridTable} style={{ tableLayout: 'auto' }}>
                                    <thead>
                                        <tr>
                                            {filteredKeys.map(key => (
                                              <th key={key} style={{ minWidth: `${columnWidths[key]}ch`, textAlign: 'left', padding: '10px 12px' }}>{key}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {gridDataFromSlot.map((dataObject, index) => {
                                            // --- 👇 [수정] cells 배열 생성 및 빈 배열 방지 ---
                                            const cells = filteredKeys.map(key => (
                                                <td key={key} style={{ minWidth: `${columnWidths[key]}ch`, whiteSpace: 'nowrap' }}>
                                                  {interpolateMessage(dataObject[key] || '', slots)}
                                                </td>
                                            ));
                                            // filteredKeys가 비어있지 않음을 위에서 보장했으므로, cells도 비어있지 않음.
                                            // 만약을 대비해 cells가 비었을 경우 빈 td 추가 (Hydration 오류 방지 - 2단계)
                                            if (cells.length === 0) {
                                                cells.push(<td key="empty-cell">&nbsp;</td>);
                                            }
                                            // --- 👆 [여기까지] ---
                                            return (
                                                <tr key={`${el.id}-${index}`} onClick={() => !disabled && onGridRowClick(el, dataObject)} style={{ cursor: disabled ? 'default' : 'pointer' }}>
                                                    {cells}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        );
                    } else {
                        // 2차원 배열 렌더링 (기존 로직 유지)
                        const rows = gridDataFromSlot.length;
                        const columns = gridDataFromSlot[0]?.length || 0;
                        return (
                            <table key={el.id} className={styles.formGridTable}>
                                <tbody>
                                    {[...Array(rows)].map((_, r) => (
                                        <tr key={r}>
                                            {[...Array(columns)].map((_, c) => {
                                                const cellValue = gridDataFromSlot[r] ? gridDataFromSlot[r][c] : '';
                                                return <td key={c}>{interpolateMessage(cellValue || '', slots)}</td>;
                                            })}
                                            {/* 2차원 배열에서도 빈 행 방지 */}
                                            {columns === 0 && <td key="empty-cell">&nbsp;</td>}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        );
                    }
                } else {
                     // 수동 입력 데이터 렌더링 (기존 로직 유지)
                    const rows = el.rows || 2;
                    const columns = el.columns || 2;
                    return (
                        <table key={el.id} className={styles.formGridTable}>
                            <tbody>
                                {[...Array(rows)].map((_, r) => (
                                    <tr key={r}>
                                        {[...Array(columns)].map((_, c) => {
                                            const cellIndex = r * columns + c;
                                            const cellValue = el.data && el.data[cellIndex] ? el.data[cellIndex] : '';
                                            return <td key={c}>{interpolateMessage(cellValue, slots)}</td>;
                                        })}
                                         {/* 수동 입력에서도 빈 행 방지 */}
                                        {columns === 0 && <td key="empty-cell">&nbsp;</td>}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    );
                }
            })() : (
              // 다른 폼 요소 렌더링
              <>
                <label className={styles.formLabel}>{el.label}</label>

                {el.type === "input" && (
                  <input
                    className={styles.formInput}
                    type="text"
                    placeholder={el.placeholder}
                    value={formData[el.name] || ""}
                    onChange={(e) => handleInputChange(el.name, e.target.value)}
                    disabled={disabled}
                    onClick={(e) => e.stopPropagation()} // Prevent bubble click
                  />
                )}

                {el.type === "date" && (
                  <input
                    ref={dateInputRef}
                    className={styles.formInput}
                    type="date"
                    value={formData[el.name] || ""}
                    onChange={(e) => handleInputChange(el.name, e.target.value)}
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent bubble click
                      handleDateInputClick();
                    }}
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
                      onClick={(e) => e.stopPropagation()} // 이벤트 버블링 중단
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
                    <div key={opt} onClick={(e) => e.stopPropagation()}>
                      {" "}
                      {/* Prevent bubble click */}
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
              </>
            )}
          </div>
        );
      })}
      {!hasSlotBoundGrid && !disabled && (
        <button
          type="submit"
          className={styles.formSubmitButton}
          onClick={(e) => e.stopPropagation()}
        >
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
    dimUnfocusedPanels,
    setScenarioSelectedOption,
    setSelectedRow
  } = useChatStore();
  const { t, language } = useTranslations();

  const [isCollapsed, setIsCollapsed] = useState(false);

  const activeScenario = scenarioSessionId
    ? scenarioStates[scenarioSessionId]
    : null;
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
  const previousHeightRef = useRef(0);

  useEffect(() => {
    setIsCollapsed(false);
  }, []);

  useEffect(() => {
    if (!bubbleRef.current) return;
    previousHeightRef.current = bubbleRef.current.scrollHeight;
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

  useEffect(() => {
    if (!bubbleRef.current) return;

    const updateScrollForGrowth = () => {
      if (!bubbleRef.current) return;

      const currentHeight = bubbleRef.current.scrollHeight;
      const previousHeight = previousHeightRef.current || currentHeight;
      const heightDiff = currentHeight - previousHeight;

      if (heightDiff > 0 && !isCollapsed) {
        scrollBy(heightDiff);
      }

      previousHeightRef.current = currentHeight;
    };

    requestAnimationFrame(updateScrollForGrowth);
  }, [scenarioMessages, isScenarioLoading, isCollapsed, scrollBy]);


  if (!activeScenario) {
    return null;
  }

  const handleGridRowSelected = (gridElement, selectedRowData) => {
    setSelectedRow(selectedRowData);

    const targetSlot = gridElement.selectSlot || 'selectedGridItem';
    const updatedSlots = {
      ...activeScenario.slots,
      [targetSlot]: selectedRowData,
    };

    handleScenarioResponse({
      scenarioSessionId: scenarioSessionId,
      currentNodeId: currentScenarioNodeId,
      sourceHandle: null,
      userInput: null,
      formData: updatedSlots,
    });
  };

  const handleFormSubmit = (formData) => {
    handleScenarioResponse({
      scenarioSessionId: scenarioSessionId,
      currentNodeId: currentScenarioNodeId,
      formData: formData,
    });
  };

  const handleBubbleClick = (e) => {
    const formElements = ["INPUT", "SELECT", "BUTTON", "LABEL", "OPTION", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD"];
    if (formElements.includes(e.target.tagName)) {
      const clickedRow = e.target.closest('tr');
      const isSelectableRow = clickedRow && clickedRow.closest('table')?.classList.contains(styles.formGridTable) && clickedRow.tagName === 'TR' && clickedRow.onclick;

      if (isSelectableRow) {
          // Let the row's onClick handler manage the event
      } else {
          // Prevent bubble click for other form elements NOT part of a selectable row
          e.stopPropagation();
      }
      return; // Always return to prevent the bubble click handler from proceeding further for form elements
    }
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
          messages[messages.length - 1].scenarioSessionId === scenarioSessionId;

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
        } ${!isFocused && dimUnfocusedPanels ? styles.dimmed : ""} ${
          isFocused ? styles.focusedBubble : ""
        }`}
      >
        <div
          className={styles.header}
          onClick={handleToggleCollapse}
          style={{ cursor: "pointer" }}
        >
          {/* Header content */}
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
                  endScenario(scenarioSessionId, "canceled");
                }}
              >
                {t("cancel")}
              </button>
            )}
          </div>
        </div>

        <div className={styles.history} ref={historyRef}>
          {/* Messages loop */}
          {scenarioMessages
            .filter((msg) => msg.node?.type !== "set-slot")
            .map((msg, index) => (
              <div
                key={`${msg.id}-${index}`}
                className={`${styles.messageRow} ${
                  msg.sender === "user" ? styles.userRow : ""
                }`}
              >
                <div
                  className={`GlassEffect ${styles.message} ${
                    msg.sender === "bot"
                      ? styles.botMessage
                      : styles.userMessage
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
                          slots={activeScenario?.slots}
                          onGridRowClick={handleGridRowSelected} // Pass the handler
                        />
                      ) : // Other message types (iframe, link, branch, text)
                       msg.node?.type === "iframe" ? (
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
                          {msg.node.data.replies.map((reply) => {
                            const selectedOption = msg.selectedOption;
                            const isSelected = selectedOption === reply.display;
                            const isDimmed = selectedOption && !isSelected;

                            return (
                              <button
                                key={reply.value}
                                className={`${styles.optionButton} ${
                                  isSelected ? styles.selected : ""
                                } ${isDimmed ? styles.dimmed : ""}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (selectedOption) return;
                                  setScenarioSelectedOption(
                                    scenarioSessionId,
                                    msg.node.id,
                                    reply.display
                                  );
                                  handleScenarioResponse({
                                    scenarioSessionId: scenarioSessionId,
                                    currentNodeId: msg.node.id,
                                    sourceHandle: reply.value,
                                    userInput: reply.display,
                                  });
                                }}
                                disabled={isCompleted || !!selectedOption}
                              >
                                <span className={styles.optionButtonText}>
                                  {reply.display}
                                </span>
                                {reply.display
                                  .toLowerCase()
                                  .includes("link") ? (
                                  <OpenInNewIcon />
                                ) : (
                                  <CheckCircle />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          {/* Loading indicator */}
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