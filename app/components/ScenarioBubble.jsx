// app/components/ScenarioBubble.jsx
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

// FormRenderer 컴포넌트 (변경 있음)
const FormRenderer = ({
  node,
  onFormSubmit,
  disabled,
  language,
  slots,
  onGridRowClick,
}) => {
  const [formData, setFormData] = useState({});
  // --- 👇 [수정] dateInputRef 제거 ---
  // const dateInputRef = useRef(null);
  // --- 👆 [수정] ---
  const { t } = useTranslations();

  // --- 👇 [수정] useEffect를 사용하여 defaultValue보다 slots의 기존 값을 우선하여 formData 초기화 ---
  useEffect(() => {
    const initialFormData = {};
    if (node.data && Array.isArray(node.data.elements)) {
      node.data.elements.forEach((el) => {
        if (el.name) {
          let initialValue;

          // 1. Check for existing value in global slots (user's previous input)
          if (slots[el.name] !== undefined && slots[el.name] !== null) {
            initialValue = slots[el.name];
          }
          // 2. Else, check for a default value on the node
          else if (
            el.defaultValue !== undefined &&
            el.defaultValue !== null
          ) {
            initialValue = interpolateMessage(String(el.defaultValue), slots);
          }

          // Handle type-specific conversions (like checkbox)
          if (el.type === "checkbox") {
            if (typeof initialValue === "string") {
              initialValue = initialValue
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean); // Filter out empty strings
            } else if (!Array.isArray(initialValue)) {
              initialValue = []; // Default to empty array if not already an array
            }
          }

          // Set the value in initialFormData if it's defined
          if (initialValue !== undefined) {
            initialFormData[el.name] = initialValue;
          }
        }
      });
    }
    setFormData(initialFormData);
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

  // --- 👇 [수정] handleDateInputClick 핸들러 수정 ---
  const handleDateInputClick = (e) => {
    e.stopPropagation();
    try {
      e.currentTarget.showPicker();
    } catch (error) {
      console.error("Failed to show date picker:", error);
    }
  };
  // --- 👆 [수정] ---

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
                      // --- 👇 [수정] value를 formData에서만 읽도록 변경 ---
                      value={formData[el.name] ?? ""}
                      // --- 👆 [수정] ---
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
                      // --- 👇 [수정] value를 formData에서만 읽도록 변경 ---
                      value={formData[el.name] ?? ""}
                      // --- 👆 [수정] ---
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
                        // --- 👇 [수정] value를 formData에서만 읽도록 변경 ---
                        value={formData[el.name] ?? ""}
                        // --- 👆 [수정] ---
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
                // --- 👇 [수정] 스키마 v1.2 (displayKeys as object array) 대응 ---
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
                  // 1. displayKeys가 객체 배열인지 확인, 아니면 이전 방식(문자열 배열) 또는 Object.keys로 폴백
                  const useObjectKeys =
                    el.displayKeys &&
                    el.displayKeys.length > 0 &&
                    typeof el.displayKeys[0] === "object" &&
                    el.displayKeys[0] !== null &&
                    el.displayKeys[0].hasOwnProperty("key");
                  
                  const originalDisplayConfigs = useObjectKeys
                    ? el.displayKeys // 스키마 v1.2: [{ key: 'id', label: 'ID' }, ...]
                    : (el.displayKeys && el.displayKeys.length > 0
                        ? el.displayKeys // 스키마 v1.0 호환: ['id', 'name']
                        : Object.keys(gridDataFromSlot[0] || {})
                      ).map(k => ({ key: k, label: k })); // v1.0 또는 Object.keys를 v1.2 형식으로 변환

                  // 2. hideNullColumns 필터링 (key 기준)
                  const filteredDisplayConfigs = el.hideNullColumns
                    ? originalDisplayConfigs.filter((col) => // col은 {key, label}
                        gridDataFromSlot.some(
                          (obj) =>
                            obj[col.key] !== null &&
                            obj[col.key] !== undefined &&
                            obj[col.key] !== ""
                        )
                      )
                    : originalDisplayConfigs;
                  
                  if (filteredDisplayConfigs.length === 0)
                    return (
                      <div>
                        {el.hideNullColumns
                          ? "All columns hidden."
                          : "No data columns found."}
                      </div>
                    );

                  // 3. columnWidths 계산 (key와 label 사용)
                  const columnWidths = filteredDisplayConfigs.reduce((acc, col) => {
                    const headerLength = interpolateMessage(col.label, slots).length; // col.label 사용
                    const maxLength = gridDataFromSlot.reduce(
                      (max, obj) =>
                        Math.max(
                          max,
                          String(interpolateMessage(obj[col.key] || "", slots)) // col.key 사용
                            .length
                        ),
                      0
                    );
                    acc[col.key] = Math.max(
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
                            {/* 4. Thead 렌더링 (col.label 사용) */}
                            {filteredDisplayConfigs.map((col) => (
                              <th
                                key={col.key} // key는 col.key
                                style={{
                                  minWidth: `${columnWidths[col.key]}ch`,
                                  textAlign: "left",
                                  padding: "10px 12px",
                                }}
                              >
                                {interpolateMessage(col.label, slots)} {/* label은 col.label */}
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
                              {/* 5. Tbody 렌더링 (col.key 사용) */}
                              {filteredDisplayConfigs.map((col) => (
                                <td
                                  key={col.key} // key는 col.key
                                  style={{
                                    minWidth: `${columnWidths[col.key]}ch`,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {interpolateMessage(
                                    dataObject[col.key] || "", // data 접근은 col.key
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
                // --- 👆 [수정 끝] ---
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
      {/* --- 👇 [수정] 엑셀 업로드 버튼 제거 --- */}
      <div className={styles.formHeader}>
        <h3>{interpolateMessage(node.data.title || "Form", slots)}</h3>
      </div>
      {/* --- 👆 [수정] --- */}
      <div className={styles.formContainerSeparator} />

      {renderFormElements()}
      
      {/* --- 👇 [수정] 엑셀 업로드 버튼을 formActionArea로 이동 --- */}
      {!hasSlotBoundGrid && !disabled && (
        <div className={styles.formActionArea}>
          {node.data.enableExcelUpload && (
            <button
              type="button"
              className={styles.excelUploadButton}
              onClick={(e) => {
                e.stopPropagation();
                // TODO: Implement Excel upload logic
                console.log("Excel Upload clicked for node:", node.id);
              }}
              disabled={disabled}
            >
              Excel Upload
            </button>
          )}
          <button
            type="submit"
            className={styles.formSubmitButton}
            onClick={(e) => e.stopPropagation()}
          >
            {t("submit")}
          </button>
        </div>
      )}
      {/* --- 👆 [수정] --- */}
    </form>
  );
};

// ScenarioStatusBadge 컴포넌트 (변경 없음 - 전체 코드 포함)
const ScenarioStatusBadge = ({ status, t, isSelected }) => {
// ... (기존 코드)
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
// ... (기존 코드)
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
              {t("scenarioTitle")(
                interpolateMessage(
                  scenarioId || "Scenario",
                  activeScenario?.slots
                )
              )}
            </span>
          </div>
          <div className={styles.headerButtons}>
            <div style={{ rotate: "270deg" }}>
              <ChevronDownIcon />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}