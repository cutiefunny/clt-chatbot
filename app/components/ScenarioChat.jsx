"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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
// ChevronDownIcon은 버블에서만 사용하므로 여기서는 필요 없을 수 있음
// import ChevronDownIcon from "./icons/ChevronDownIcon";

// FormRenderer 컴포넌트
const FormRenderer = ({
  node,
  onFormSubmit,
  disabled,
  language,
  slots,
  onGridRowClick,
}) => {
  const [formData, setFormData] = useState({});
  // --- 👇 [수정] 단일 ref 대신, 클릭 이벤트에서 직접 처리하도록 변경 ---
  // const dateInputRef = useRef(null);
  // --- 👆 [수정] ---
  const { t } = useTranslations();

  // useEffect를 사용하여 defaultValue로 formData 초기화
  useEffect(() => {
    const initialFormData = {};
    if (node.data && Array.isArray(node.data.elements)) {
      node.data.elements.forEach((el) => {
        if (
          el.name &&
          el.defaultValue !== undefined &&
          el.defaultValue !== null
        ) {
          let initialValue = interpolateMessage(String(el.defaultValue), slots);
          if (el.type === "checkbox" && typeof initialValue === "string") {
            initialValue = initialValue.split(",").map((s) => s.trim());
          }
          initialFormData[el.name] = initialValue;
        }
      });
    }
    setFormData(initialFormData);
  }, [node.data.elements, slots]);

  const handleInputChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleMultiInputChange = (name, value, checked) => {
    setFormData((prev) => {
      const existing = prev[name] || [];
      const newValues = checked
        ? [...existing, value]
        : existing.filter((v) => v !== value);
      // Ensure the value is always an array for checkboxes
      return { ...prev, [name]: newValues.length > 0 ? newValues : [] };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const finalFormData = { ...formData }; // 현재 formData 복사

    for (const element of node.data.elements) {
      let valueToValidate = formData[element.name];
      if (
        valueToValidate === undefined &&
        element.defaultValue !== undefined &&
        element.defaultValue !== null
      ) {
        valueToValidate = interpolateMessage(
          String(element.defaultValue),
          slots
        );
        // Do not automatically add interpolated default values to submission data
        // Only use them for validation if no user input exists
        // finalFormData[element.name] = valueToValidate; // 제출 데이터에는 추가하지 않음 (사용자 입력이 없으면 슬롯에 안 남김)
      }
      // If still undefined (no user input, no default), treat as empty string for validation
      valueToValidate = valueToValidate ?? "";

      if (element.type === "input" || element.type === "date") {
        const { isValid, message } = validateInput(
          valueToValidate, // 검증할 값 사용
          element.validation,
          language
        );
        if (!isValid) {
          alert(message); // 간단한 알림 사용
          return;
        }
      }
      // Add validation for other types if needed (e.g., required dropbox/checkbox)
    }
    // Include only the fields that were actually interacted with or had a default value used in validation
    const finalSubmissionData = {};
    node.data.elements.forEach((el) => {
      if (el.name && finalFormData[el.name] !== undefined) {
        finalSubmissionData[el.name] = finalFormData[el.name];
      }
    });

    onFormSubmit(finalSubmissionData); // 최종 데이터 제출
  };

  // --- 👇 [수정] ref를 사용하지 않고 이벤트 타겟으로 피커 표시 ---
  const handleDateInputClick = (e) => {
    e.stopPropagation();
    try {
      e.currentTarget.showPicker();
    } catch (error) {
      console.error("Failed to show date picker:", error);
    }
  };
  // --- 👆 [수정] ---

  // 슬롯 데이터를 사용하는 그리드 요소가 있는지 확인
  const hasSlotBoundGrid = node.data.elements?.some(
    (el) =>
      el.type === "grid" &&
      el.optionsSlot &&
      Array.isArray(slots[el.optionsSlot]) &&
      slots[el.optionsSlot].length > 0 &&
      typeof slots[el.optionsSlot][0] === "object" &&
      slots[el.optionsSlot][0] !== null
  );

  // --- 👇 [수정] 폼 요소 렌더링 로직 (그룹화 추가) ---
  const renderFormElements = () => {
    const renderedElements = [];
    let i = 0;
    const elements = node.data.elements || [];

    // 'input', 'date', 'dropbox' 타입인지 확인하는 헬퍼 함수
    const isSimpleInput = (el) =>
      el &&
      (el.type === "input" || el.type === "date" || el.type === "dropbox");

    while (i < elements.length) {
      const currentEl = elements[i];

      // 1. 단순 입력 필드 그룹 처리
      if (isSimpleInput(currentEl)) {
        const group = [];
        // 연속되는 단순 입력 필드를 그룹에 추가
        while (i < elements.length && isSimpleInput(elements[i])) {
          group.push(elements[i]);
          i++;
        }

        // 그룹을 .formInputGroup 래퍼로 감싸서 렌더링
        renderedElements.push(
          <div key={`group-${i}`} className={styles.formInputGroup}>
            {group.map((el) => {
              // --- (기존 input, date, dropbox 렌더링 로직 복사) ---
              const dateProps = {};
              if (el.type === "date" && el.validation) {
                if (el.validation.type === "today after")
                  dateProps.min = new Date().toISOString().split("T")[0];
                else if (el.validation.type === "today before")
                  dateProps.max = new Date().toISOString().split("T")[0];
                else if (el.validation.type === "custom") {
                  if (el.validation.startDate)
                    dateProps.min = el.validation.startDate;
                  if (el.validation.endDate)
                    dateProps.max = el.validation.endDate;
                }
              }

              let dropboxOptions = [];
              if (el.type === "dropbox") {
                if (el.optionsSlot && Array.isArray(slots[el.optionsSlot])) {
                  dropboxOptions = slots[el.optionsSlot].map((opt) =>
                    typeof opt === "object" && opt !== null
                      ? JSON.stringify(opt)
                      : String(opt)
                  );
                } else if (Array.isArray(el.options)) {
                  dropboxOptions = el.options;
                }
              }
              // --- (여기까지 렌더링 로직 복사) ---

              return (
                <div key={el.id} className={styles.formElement}>
                  <label className={styles.formLabel}>
                    {interpolateMessage(el.label, slots)}
                  </label>
                  {el.type === "input" && (
                    <input
                      className={styles.formInput}
                      type="text"
                      placeholder={interpolateMessage(
                        el.placeholder || "",
                        slots
                      )}
                      value={
                        formData[el.name] ??
                        interpolateMessage(String(el.defaultValue ?? ""), slots)
                      }
                      onChange={(e) =>
                        handleInputChange(el.name, e.target.value)
                      }
                      disabled={disabled}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  {el.type === "date" && (
                    <input
                      // ref={dateInputRef} // ref 제거
                      className={styles.formInput}
                      type="date"
                      value={formData[el.name] || ""}
                      onChange={(e) =>
                        handleInputChange(el.name, e.target.value)
                      }
                      onClick={handleDateInputClick} // 수정된 핸들러 사용
                      disabled={disabled}
                      {...dateProps}
                    />
                  )}
                  {el.type === "dropbox" && (
                    <div className={styles.selectWrapper}>
                      <select
                        className={styles.formInput}
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
                        {dropboxOptions.map((opt, idx) => (
                          <option key={`${opt}-${idx}`} value={opt}>
                            {interpolateMessage(opt, slots)}
                          </option>
                        ))}
                      </select>
                      <ArrowDropDownIcon
                        style={{ color: "var(--Gray-07, #5E7599)" }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      }
      // 2. 단순 입력 필드가 아닌 (grid, checkbox 등) 요소 처리
      else {
        const el = currentEl;
        renderedElements.push(
          <div key={el.id} className={styles.formElement}>
            {el.type === "grid" ? (
              (() => {
                // ... (기존 grid 렌더링 로직) ...
                const gridDataFromSlot = el.optionsSlot
                  ? slots[el.optionsSlot]
                  : null;
                const hasSlotData =
                  Array.isArray(gridDataFromSlot) &&
                  gridDataFromSlot.length > 0;

                if (
                  hasSlotData &&
                  typeof gridDataFromSlot[0] === "object" &&
                  gridDataFromSlot[0] !== null &&
                  !Array.isArray(gridDataFromSlot[0])
                ) {
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
                  if (filteredKeys.length === 0)
                    return (
                      <div>
                        {el.hideNullColumns
                          ? "All columns hidden."
                          : "No data columns found."}
                      </div>
                    );
                  const columnWidths = filteredKeys.reduce((acc, key) => {
                    const headerLength = interpolateMessage(key, slots).length;
                    const maxLength = gridDataFromSlot.reduce(
                      (max, obj) =>
                        Math.max(
                          max,
                          String(interpolateMessage(obj[key] || "", slots))
                            .length
                        ),
                      0
                    );
                    acc[key] = Math.max(
                      5,
                      Math.max(headerLength, maxLength) + 2
                    );
                    return acc;
                  }, {});
                  return (
                    <div style={{ overflowX: "auto", width: "100%" }}>
                      <table
                        className={styles.formGridTable}
                        style={{ tableLayout: "auto" }}
                      >
                        <thead>
                          <tr>
                            {filteredKeys.map((key) => (
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
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {gridDataFromSlot.map((dataObject, index) => (
                            <tr
                              key={`${el.id}-${index}`}
                              onClick={() =>
                                !disabled && onGridRowClick(el, dataObject)
                              }
                              style={{
                                cursor: disabled ? "default" : "pointer",
                              }}
                            >
                              {filteredKeys.map((key) => (
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
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                } else {
                  const dataArray = hasSlotData
                    ? gridDataFromSlot
                    : el.data || [];
                  const rows = hasSlotData ? dataArray.length : el.rows || 0;
                  const columns = hasSlotData
                    ? dataArray[0]?.length || 0
                    : el.columns || 0;
                  if (rows === 0 || columns === 0)
                    return <div>Grid data is empty.</div>;
                  return (
                    <table className={styles.formGridTable}>
                      <tbody>
                        {[...Array(rows)].map((_, r) => (
                          <tr key={r}>
                            {[...Array(columns)].map((_, c) => (
                              <td key={c}>
                                {interpolateMessage(
                                  hasSlotData
                                    ? dataArray[r]?.[c] || ""
                                    : dataArray[r * columns + c] || "",
                                  slots
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                }
              })()
            ) : (
              <>
                <label className={styles.formLabel}>
                  {interpolateMessage(el.label, slots)}
                </label>
                {el.type === "checkbox" &&
                  (el.options || []).map((opt) => (
                    <div
                      key={opt}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <input
                        type="checkbox"
                        id={`${el.id}-${opt}`}
                        value={opt}
                        checked={(formData[el.name] || []).includes(opt)}
                        onChange={(e) =>
                          handleMultiInputChange(el.name, opt, e.target.checked)
                        }
                        disabled={disabled}
                      />
                      <label htmlFor={`${el.id}-${opt}`}>
                        {interpolateMessage(opt, slots)}
                      </label>
                    </div>
                  ))}
                {/* (기타 다른 타입 'input', 'date', 'dropbox'는 위에서 처리됨) */}
              </>
            )}
          </div>
        );
        i++; // 다음 요소로 이동
      }
    }
    return renderedElements;
  };
  // --- 👆 [수정] ---

  return (
    <form onSubmit={handleSubmit} className={styles.formContainer}>
      <h3>{interpolateMessage(node.data.title || "Form", slots)}</h3>
      <div className={styles.formContainerSeparator} />

      {/* --- 👇 [수정] 그룹화된 요소 렌더링 --- */}
      {renderFormElements()}
      {/* --- 👆 [수정] --- */}

      {!hasSlotBoundGrid && !disabled && (
        <div className={styles.formActionArea}>
          <button
            type="submit"
            className={styles.formSubmitButton}
            onClick={(e) => e.stopPropagation()}
          >
            {t("submit")}
          </button>
        </div>
      )}
    </form>
  );
};

// ScenarioStatusBadge 컴포넌트 (기존 코드 유지)
const ScenarioStatusBadge = ({ status, t, isSelected }) => {
  // ... (기존 코드)
  if (isSelected) {
    return (
      <span className={`${styles.scenarioBadge} ${styles.selected}`}>
        {t("statusSelected")}
      </span>
    );
  }
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

// connectParentLink 함수 (기존 코드 유지)
const PARENT_ORIGIN =
  process.env.NEXT_PUBLIC_PARENT_ORIGIN || "http://localhost:3000";
const connectParentLink = (url) => {
  // ... (기존 코드)
  try {
    if (!window.parent || window.parent === window) {
      console.warn(
        "Not running inside an iframe or parent window is inaccessible."
      );
      window.open(url, "_blank", "noopener,noreferrer"); // Fallback: 새 탭에서 열기
      return;
    }
    const msg = { action: "callScreenOpen", payload: { url: url } };
    window.parent.postMessage(msg, PARENT_ORIGIN);
    console.log(`Sent message to parent (${PARENT_ORIGIN}):`, msg);
  } catch (err) {
    console.error("Failed to send message to parent window:", err);
    window.open(url, "_blank", "noopener,noreferrer"); // Fallback: 새 탭에서 열기
  }
};

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
    // ... (기존 코드)
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;
    const scrollableDistance =
      scrollContainer.scrollHeight -
      scrollContainer.clientHeight -
      scrollContainer.scrollTop;
    wasAtBottomRef.current = scrollableDistance <= 5;
  }, []);

  useEffect(() => {
    // ... (기존 코드)
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
    // ... (기존 코드)
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

  return (
    <div className={styles.scenarioChatContainer}>
      <div className={styles.scenarioHeader}>
        <div className={styles.headerContent}>
          <ScenarioStatusBadge status={activeScenario?.status} t={t} />
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

          {/* "숨기기" 버튼 (기존 코드 유지) */}
          <button
            className={styles.headerCloseButton}
            onClick={(e) => {
              e.stopPropagation();
              const widthToSend = isScenarioPanelExpanded ? -1064 : -784;
              setActivePanel("main"); // 메인 패널로 전환 (포커스 이동 포함)
              console.log("call postMessage to parent window");
              const msg = {
                action: "callChatbotResize",
                payload: { width: widthToSend },
              };
              window.parent.postMessage(msg, PARENT_ORIGIN);
            }}
          >
            <CloseIcon />
          </button>
          {/* 종료 버튼 (기존 코드 유지) */}
        </div>
      </div>

      {/* 시나리오 메시지 기록 (기존 코드 유지) */}
      <div className={styles.history} ref={historyRef}>
        {scenarioMessages
          .filter((msg) => msg.node?.type !== "set-slot")
          .map((msg, index) => (
            <div
              key={msg.id || `${activeScenarioSessionId}-msg-${index}`}
              className={`${styles.messageRow} ${
                msg.sender === "user" ? styles.userRow : ""
              }`}
            >
              <div
                className={`GlassEffect ${styles.message} ${
                  msg.sender === "bot" ? styles.botMessage : styles.userMessage
                } ${
                  // --- 👇 [수정] 폼(form)일 경우에도 .gridMessage 클래스(width 90%) 적용 ---
                  msg.node?.type === "form" ||
                  msg.node?.data?.elements?.some((el) => el.type === "grid") ||
                  msg.node?.type === "iframe"
                    ? styles.gridMessage
                    : ""
                  // --- 👆 [수정] ---
                }`}
              >
                <div
                  className={
                    msg.node?.type === "form"
                      ? styles.scenarioFormMessageContentWrapper
                      : styles.scenarioMessageContentWrapper
                  }
                >
                  {msg.sender === "bot" &&
                    !msg.node?.type?.includes("form") && (
                      <LogoIcon className={styles.avatar} />
                    )}

                  <div className={styles.messageContent}>
                    {msg.node?.type === "form" ? (
                      <FormRenderer
                        node={msg.node}
                        onFormSubmit={handleFormSubmit}
                        disabled={isCompleted}
                        language={language}
                        slots={activeScenario.slots}
                        onGridRowClick={handleGridRowSelected}
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
                            connectParentLink(
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
                      <p>
                        {interpolateMessage(
                          msg.text || msg.node?.data?.content,
                          activeScenario.slots
                        )}
                      </p>
                    )}
                    {msg.node?.type === "branch" && msg.node.data.replies && (
                      <div className={styles.scenarioList}>
                        {msg.node.data.replies.map((reply) => {
                          const selectedOption = msg.selectedOption;
                          const interpolatedDisplayText = interpolateMessage(
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
                                  scenarioSessionId: activeScenarioSessionId,
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
                </div>
              </div>
            </div>
          ))}
        {/* 로딩 인디케이터 (기존 코드 유지) */}
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
