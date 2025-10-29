"use client";

// --- 👇 useEffect, useRef, useState 제거, interpolateMessage 추가 ---
import { useCallback, useRef, useEffect, useState } from "react";
// --- 👆 ---
import { useChatStore } from "../store";
import { useTranslations } from "../hooks/useTranslations";
import styles from "./Chat.module.css";
// --- 👇 [수정] interpolateMessage 임포트 추가 ---
import { validateInput, interpolateMessage } from "../lib/chatbotEngine";
// --- 👆 [수정] ---
import LogoIcon from "./icons/LogoIcon";
import ArrowDropDownIcon from "./icons/ArrowDropDownIcon";
import CheckCircle from "./icons/CheckCircle";
import OpenInNewIcon from "./icons/OpenInNew";
import ChevronDownIcon from "./icons/ChevronDownIcon";

// FormRenderer 컴포넌트 (변경 없음 - 전체 코드 포함)
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
      return { ...prev, [name]: newValues.length > 0 ? newValues : [] };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const finalFormData = { ...formData };
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
      }
      valueToValidate = valueToValidate ?? "";
      if (element.type === "input" || element.type === "date") {
        const { isValid, message } = validateInput(
          valueToValidate,
          element.validation,
          language
        );
        if (!isValid) {
          alert(message);
          return;
        }
      }
    }
    const finalSubmissionData = {};
    node.data.elements.forEach((el) => {
      if (el.name && finalFormData[el.name] !== undefined) {
        finalSubmissionData[el.name] = finalFormData[el.name];
      }
    });
    onFormSubmit(finalSubmissionData);
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
      <h3>{interpolateMessage(node.data.title || "Form", slots)}</h3>
      <div className={styles.formContainerSeparator} />
      {node.data.elements?.map((el) => {
        const dateProps = {};
        if (el.type === "date" && el.validation) {
          if (el.validation.type === "today after")
            dateProps.min = new Date().toISOString().split("T")[0];
          else if (el.validation.type === "today before")
            dateProps.max = new Date().toISOString().split("T")[0];
          else if (el.validation.type === "custom") {
            if (el.validation.startDate)
              dateProps.min = el.validation.startDate;
            if (el.validation.endDate) dateProps.max = el.validation.endDate;
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

// ScenarioStatusBadge 컴포넌트 (변경 없음 - 전체 코드 포함)
const ScenarioStatusBadge = ({ status, t, isSelected }) => {
  // if (isSelected) {
  //   return (
  //     <span className={`${styles.scenarioBadge} ${styles.selected}`}>
  //       {t("statusSelected")}
  //     </span>
  //   );
  // }
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

// connectParentLink 함수 (변경 없음 - 전체 코드 포함)
const PARENT_ORIGIN =
  process.env.NEXT_PUBLIC_PARENT_ORIGIN || "http://localhost:3000";
const connectParentLink = (url) => {
  try {
    if (!window.parent || window.parent === window) {
      console.warn(
        "Not running inside an iframe or parent window is inaccessible."
      );
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    const msg = { action: "callScreenOpen", payload: { url: url } };
    window.parent.postMessage(msg, PARENT_ORIGIN);
    console.log(`Sent message to parent (${PARENT_ORIGIN}):`, msg);
  } catch (err) {
    console.error("Failed to send message to parent window:", err);
    window.open(url, "_blank", "noopener,noreferrer");
  }
};

// ScenarioBubble 컴포넌트 본체
export default function ScenarioBubble({ scenarioSessionId }) {
  const {
    scenarioStates,
    endScenario,
    setActivePanel,
    activePanel,
    activeScenarioSessionId: focusedSessionId,
    dimUnfocusedPanels,
  } = useChatStore();
  const { t } = useTranslations(); // language 제거

  const activeScenario = scenarioSessionId
    ? scenarioStates[scenarioSessionId]
    : null;
  const isCompleted =
    activeScenario?.status === "completed" ||
    activeScenario?.status === "failed" ||
    activeScenario?.status === "canceled";
  const scenarioId = activeScenario?.scenarioId;
  const isFocused =
    activePanel === "scenario" && focusedSessionId === scenarioSessionId;

  if (!activeScenario) {
    return null;
  }

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
      if (!isSelectableRow) {
        e.stopPropagation();
      }
      return;
    }

    console.log("call postMessage to parent window");
    const msg = { action: "callChatbotResize", payload: { width: 784 } };
    window.parent.postMessage(msg, PARENT_ORIGIN);

    e.stopPropagation();
    setActivePanel("scenario", scenarioSessionId);
  };

  return (
    <div
      data-message-id={scenarioSessionId}
      className={`${styles.messageRow} ${styles.userRow}`}
      onClick={handleBubbleClick}
      style={{ cursor: "pointer" }}
    >
      <div
        className={`GlassEffect ${styles.scenarioBubbleContainer} ${
          styles.collapsed
        } ${
          // 항상 collapsed
          !isFocused && dimUnfocusedPanels ? styles.dimmed : ""
        } ${isFocused ? styles.focusedBubble : ""}`}
      >
        <div className={styles.header} style={{ cursor: "pointer" }}>
          <div className={styles.headerContent}>
            <ScenarioStatusBadge
              status={activeScenario?.status}
              t={t}
              isSelected={isFocused}
            />

            <span className={styles.scenarioHeaderTitle}>
              {/* --- 👇 [수정] interpolateMessage 함수 사용 --- */}
              {t("scenarioTitle")(
                interpolateMessage(
                  scenarioId || "Scenario",
                  activeScenario?.slots
                )
              )}
              {/* --- 👆 [수정] --- */}
            </span>
          </div>
          <div className={styles.headerButtons}>
            <div style={{ rotate: "270deg" }}>
              <ChevronDownIcon />
            </div>
            {/* {!isCompleted && (
              <button
                className={`${styles.headerRestartButton}`}
                onClick={(e) => {
                  e.stopPropagation();
                  endScenario(scenarioSessionId, "canceled");
                }}
              >
                {t("cancel")}
              </button>
            )} */}
          </div>
        </div>
      </div>
    </div>
  );
}
