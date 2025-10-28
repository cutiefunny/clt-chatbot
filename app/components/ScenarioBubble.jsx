"use client";

import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../store"; // useChatStore 임포트 확인
import { useTranslations } from "../hooks/useTranslations";
import styles from "./Chat.module.css";
import { validateInput, interpolateMessage } from "../lib/chatbotEngine"; // interpolateMessage 임포트 확인
import LogoIcon from "./icons/LogoIcon";
import ChevronDownIcon from "./icons/ChevronDownIcon";
import ArrowDropDownIcon from "./icons/ArrowDropDownIcon";
import CheckCircle from "./icons/CheckCircle";
import OpenInNewIcon from "./icons/OpenInNew";

const FormRenderer = ({
  node,
  onFormSubmit,
  disabled,
  language,
  slots,
  onGridRowClick,
}) => {
  const [formData, setFormData] = useState({});
  const dateInputRef = useRef(null);
  const { t } = useTranslations();

  // useEffect를 사용하여 defaultValue로 formData 초기화
  useEffect(() => {
    const initialFormData = {};
    if (node.data && Array.isArray(node.data.elements)) {
      node.data.elements.forEach((el) => {
        if (
          el.type === "input" &&
          el.defaultValue !== undefined &&
          el.defaultValue !== null &&
          el.name
        ) {
          // --- 👇 [수정] defaultValue도 interpolateMessage로 처리 ---
          initialFormData[el.name] = interpolateMessage(
            String(el.defaultValue),
            slots
          );
          // --- 👆 [수정] ---
        }
        // 다른 타입(dropbox, checkbox 등)의 defaultValue 처리도 필요하다면 여기에 추가
      });
    }
    setFormData(initialFormData);
    // --- 👇 [수정] slots도 의존성 배열에 추가 ---
  }, [node.data.elements, slots]);
  // --- 👆 [수정] ---

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
    const finalFormData = { ...formData }; // 현재 formData 복사

    for (const element of node.data.elements) {
      // --- 👇 [수정] 제출 시 검증할 값 가져오기 (formData 우선, 없으면 보간된 defaultValue) ---
      let valueToValidate = formData[element.name];
      if (
        valueToValidate === undefined &&
        element.type === "input" &&
        element.defaultValue !== undefined
      ) {
        valueToValidate = interpolateMessage(
          String(element.defaultValue),
          slots
        );
        finalFormData[element.name] = valueToValidate; // 제출 데이터에도 추가
      }
      valueToValidate = valueToValidate ?? ""; // null/undefined면 빈 문자열로
      // --- 👆 [수정] ---

      if (element.type === "input" || element.type === "date") {
        const { isValid, message } = validateInput(
          valueToValidate, // 검증할 값 사용
          element.validation,
          language
        );
        if (!isValid) {
          alert(message);
          return;
        }
      }
    }
    onFormSubmit(finalFormData); // 최종 데이터 제출
  };

  const handleDateInputClick = () => {
    try {
      dateInputRef.current?.showPicker();
    } catch (error) {
      console.error("Failed to show date picker:", error);
    }
  };

  const hasSlotBoundGrid = node.data.elements?.some(
    (el) =>
      el.type === "grid" &&
      el.optionsSlot &&
      Array.isArray(slots[el.optionsSlot]) &&
      slots[el.optionsSlot].length > 0 &&
      typeof slots[el.optionsSlot][0] === "object" &&
      slots[el.optionsSlot][0] !== null
  );

  return (
    <form onSubmit={handleSubmit} className={styles.formContainer}>
      {/* --- 👇 [수정] 폼 제목도 보간 처리 --- */}
      <h3>{interpolateMessage(node.data.title, slots)}</h3>
      {/* --- 👆 [수정] --- */}
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

        let dropboxOptions = [];
        if (el.type === "dropbox") {
          if (el.optionsSlot && Array.isArray(slots[el.optionsSlot])) {
            dropboxOptions = slots[el.optionsSlot].map(String);
          } else if (Array.isArray(el.options)) {
            dropboxOptions = el.options;
          }
        }

        return (
          <div key={el.id} className={styles.formElement}>
            {el.type === "grid" ? (
              (() => {
                const gridDataFromSlot = el.optionsSlot
                  ? slots[el.optionsSlot]
                  : null;
                const hasSlotData =
                  Array.isArray(gridDataFromSlot) &&
                  gridDataFromSlot.length > 0;

                if (hasSlotData) {
                  const isDynamicObjectArray =
                    typeof gridDataFromSlot[0] === "object" &&
                    gridDataFromSlot[0] !== null &&
                    !Array.isArray(gridDataFromSlot[0]);
                  if (isDynamicObjectArray) {
                    const originalDisplayKeys =
                      el.displayKeys && el.displayKeys.length > 0
                        ? el.displayKeys
                        : Object.keys(gridDataFromSlot[0] || {});
                    const filteredKeys = el.hideNullColumns
                      ? originalDisplayKeys.filter((key) =>
                          gridDataFromSlot.some(
                            (obj) =>
                              obj[key] !== null &&
                              obj[key] !== undefined &&
                              obj[key] !== ""
                          )
                        )
                      : originalDisplayKeys;

                    if (filteredKeys.length === 0 && !el.hideNullColumns) {
                      console.warn(
                        "Grid rendering skipped: No keys found in data object.",
                        el,
                        gridDataFromSlot[0]
                      );
                      return <div>No data columns found.</div>;
                    }
                    if (filteredKeys.length === 0 && el.hideNullColumns) {
                      console.warn(
                        "Grid rendering skipped: All columns were hidden due to hideNullColumns.",
                        el
                      );
                      return <div>All columns hidden.</div>;
                    }

                    const columnWidths = filteredKeys.reduce((acc, key) => {
                      const headerLength = key.length;
                      const maxLength = gridDataFromSlot.reduce((max, obj) => {
                        const valueStr = String(
                          interpolateMessage(obj[key] || "", slots)
                        );
                        return Math.max(max, valueStr.length);
                      }, 0);
                      // --- 👇 [수정] 최소 너비 추가 및 너비 계산 방식 미세 조정 ---
                      acc[key] = Math.max(
                        5,
                        Math.max(headerLength, maxLength) + 2
                      ); // 최소 5ch 보장
                      // --- 👆 [수정] ---
                      return acc;
                    }, {});

                    return (
                      <div
                        key={el.id}
                        style={{ overflowX: "auto", width: "100%" }}
                      >
                        <table
                          className={styles.formGridTable}
                          style={{ tableLayout: "auto" }}
                        >
                          <thead>
                            <tr>
                              {filteredKeys.map((key) => (
                                // --- 👇 [수정] 헤더도 보간 처리 ---
                                <th
                                  key={key}
                                  style={{
                                    minWidth: `${columnWidths[key]}ch`,
                                    textAlign: "left",
                                    padding: "10px 12px",
                                  }}
                                >
                                  {interpolateMessage(key, slots)}
                                </th>
                                // --- 👆 [수정] ---
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {gridDataFromSlot.map((dataObject, index) => {
                              const cells = filteredKeys.map((key) => (
                                <td
                                  key={key}
                                  style={{
                                    minWidth: `${columnWidths[key]}ch`,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {interpolateMessage(
                                    dataObject[key] || "",
                                    slots
                                  )}
                                </td>
                              ));
                              if (cells.length === 0) {
                                cells.push(<td key="empty-cell">&nbsp;</td>);
                              }
                              return (
                                <tr
                                  key={`${el.id}-${index}`}
                                  onClick={() =>
                                    !disabled && onGridRowClick(el, dataObject)
                                  }
                                  style={{
                                    cursor: disabled ? "default" : "pointer",
                                  }}
                                >
                                  {cells}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  } else {
                    const rows = gridDataFromSlot.length;
                    const columns = gridDataFromSlot[0]?.length || 0;
                    return (
                      <table key={el.id} className={styles.formGridTable}>
                        <tbody>
                          {[...Array(rows)].map((_, r) => (
                            <tr key={r}>
                              {[...Array(columns)].map((_, c) => {
                                const cellValue = gridDataFromSlot[r]
                                  ? gridDataFromSlot[r][c]
                                  : "";
                                return (
                                  <td key={c}>
                                    {interpolateMessage(cellValue || "", slots)}
                                  </td>
                                );
                              })}
                              {columns === 0 && (
                                <td key="empty-cell">&nbsp;</td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  }
                } else {
                  const rows = el.rows || 2;
                  const columns = el.columns || 2;
                  return (
                    <table key={el.id} className={styles.formGridTable}>
                      <tbody>
                        {[...Array(rows)].map((_, r) => (
                          <tr key={r}>
                            {[...Array(columns)].map((_, c) => {
                              const cellIndex = r * columns + c;
                              const cellValue =
                                el.data && el.data[cellIndex]
                                  ? el.data[cellIndex]
                                  : "";
                              return (
                                <td key={c}>
                                  {interpolateMessage(cellValue, slots)}
                                </td>
                              );
                            })}
                            {columns === 0 && <td key="empty-cell">&nbsp;</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                }
              })()
            ) : (
              <>
                {/* --- 👇 [수정] 라벨도 보간 처리 --- */}
                <label className={styles.formLabel}>
                  {interpolateMessage(el.label, slots)}
                </label>
                {/* --- 👆 [수정] --- */}

                {el.type === "input" && (
                  <input
                    className={styles.formInput}
                    type="text"
                    // --- 👇 [수정] placeholder도 보간 처리 ---
                    placeholder={interpolateMessage(el.placeholder, slots)}
                    // --- 👆 [수정] ---
                    // --- 👇 [수정] value를 formData에서 가져오되, 없으면 보간된 defaultValue 사용 ---
                    value={
                      formData[el.name] ??
                      interpolateMessage(String(el.defaultValue ?? ""), slots)
                    }
                    // --- 👆 [수정] ---
                    onChange={(e) => handleInputChange(el.name, e.target.value)}
                    disabled={disabled}
                    onClick={(e) => e.stopPropagation()}
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
                      e.stopPropagation();
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
                      onChange={(e) =>
                        handleInputChange(el.name, e.target.value)
                      }
                      disabled={disabled}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="" disabled>
                        {t("select")}
                      </option>
                      {dropboxOptions.map((opt) => (
                        // --- 👇 [수정] 옵션 텍스트도 보간 처리 ---
                        <option key={opt} value={opt}>
                          {interpolateMessage(opt, slots)}
                        </option>
                        // --- 👆 [수정] ---
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
                      <input
                        type="checkbox"
                        id={`${el.id}-${opt}`}
                        value={opt}
                        onChange={(e) =>
                          handleMultiInputChange(el.name, opt, e.target.checked)
                        }
                        disabled={disabled}
                      />
                      {/* --- 👇 [수정] 체크박스 라벨도 보간 처리 --- */}
                      <label htmlFor={`${el.id}-${opt}`}>
                        {interpolateMessage(opt, slots)}
                      </label>
                      {/* --- 👆 [수정] --- */}
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

//  --- 👇 [수정] hyh - link slot 새창이 아닌 현재창 링크 변경 함수 ---
const PARENT_ORIGIN = "http://172.20.130.91:9110";
const connectParentLink = (data) => {
  try {
    if (!window.parent) throw new Error("not parent window.");
    const msg = { action: "callScreenOpen", payload: { url: data } };
    window.parent.postMessage(msg, PARENT_ORIGIN);
  } catch (err) {
    console.error("link faild:", err);
  }
};
// --- 👆 [수정] ---

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
    const targetSlot = gridElement.selectSlot || "selectedRow";

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
              {/* --- 👇 [수정] 시나리오 제목도 보간 처리 --- */}
              {t("scenarioTitle")(
                interpolateMessage(scenarioId, activeScenario?.slots)
              )}
              {/* --- 👆 [수정] --- */}
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
            .filter((msg) => msg.node?.type !== "set-slot") // set-slot 노드는 화면에 표시 X
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
                  } ${
                    msg.node?.data?.elements?.some((el) => el.type === "grid")
                      ? styles.gridMessage
                      : ""
                  }`}
                >
                  <div
                    className={
                      msg.node?.type === "form"
                        ? styles.scenarioFormMessageContentWrapper
                        : styles.scenarioMessageContentWrapper
                    }
                  >
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
                            src={interpolateMessage(
                              msg.node.data.url,
                              activeScenario?.slots
                            )}
                            width={msg.node.data.width || "100%"}
                            height={msg.node.data.height || "250"}
                            style={{ border: "none", borderRadius: "18px" }}
                            title="chatbot-iframe"
                          ></iframe>
                        </div>
                      ) : msg.node?.type === "link" ? (
                        <div>
                          <span>Opening link in a new tab: </span>
                          {/*
                          <a
                             // --- 👇 [수정] Link URL 및 표시 텍스트 보간 처리 ---
                            href={interpolateMessage(msg.node.data.content, activeScenario?.slots)}
                             // --- 👆 [수정] ---
                            target="_blank"
                            rel="noopener noreferrer"
                          > 
                          */}
                          {/* // --- 👇 [수정] hyh - Link slot 클릭 시 새 창이 아닌 현재 창 링크 변경 --- */}
                          <a
                            href="#"
                            target="_self"
                            rel="noopener noreferrer"
                            onClick={(e) => {
                              e.preventDefault();
                              connectParentLink(
                                interpolateMessage(
                                  msg.node.data.content,
                                  activeScenario?.slots
                                )
                              );
                            }}
                          >
                            {/* // --- 👆 [수정] --- */}
                            {/* --- 👇 [수정] Link URL 및 표시 텍스트 보간 처리 --- */}
                            {interpolateMessage(
                              msg.node.data.display || msg.node.data.content,
                              activeScenario?.slots
                            )}
                            {/* --- 👆 [수정] --- */}
                          </a>
                        </div>
                      ) : (
                        <p>
                          {interpolateMessage(
                            msg.text || msg.node?.data.content,
                            activeScenario?.slots
                          )}
                        </p>
                      )}
                      {msg.node?.type === "branch" && msg.node.data.replies && (
                        <div className={styles.scenarioList}>
                          {msg.node.data.replies.map((reply) => {
                            const selectedOption = msg.selectedOption;
                            const isSelected = selectedOption === reply.display;
                            const isDimmed = selectedOption && !isSelected;
                            const interpolatedDisplayText = interpolateMessage(
                              reply.display,
                              activeScenario?.slots
                            );

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
                                    interpolatedDisplayText
                                  );
                                  handleScenarioResponse({
                                    scenarioSessionId: scenarioSessionId,
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
              <div className={`${styles.message} ${styles.botMessage}`}>
                <div className={styles.scenarioMessageContentWrapper}>
                  <LogoIcon />
                  <div className={styles.messageContent}>
                    <img
                      src="/images/Loading.gif"
                      alt={t("loading")}
                      style={{ width: "40px", height: "30px" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
