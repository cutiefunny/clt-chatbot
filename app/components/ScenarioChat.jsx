// app/components/ScenarioChat.jsx
"use client";

// --- 👇 [수정] useRef, useCallback 임포트 및 xlsx 라이브러리 임포트 ---
import { useEffect, useRef, useState, useCallback } from "react";
import * as XLSX from "xlsx"; // 엑셀 파싱 라이브러리
// --- 👆 [수정] ---
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
// --- 👇 [수정] MarkdownRenderer 임포트 추가 ---
import MarkdownRenderer from "./MarkdownRenderer";
// --- 👆 [수정] ---
import {
  openLinkThroughParent,
  postToParent,
  PARENT_ORIGIN,
  SCENARIO_PANEL_WIDTH,
  delayParentAnimationIfNeeded,
} from "../lib/parentMessaging";

// --- 👇 [추가] 엑셀 날짜 변환 헬퍼 ---
// 엑셀 시리얼 날짜를 YYYY-MM-DD 형식으로 변환
function convertExcelDate(serial) {
  if (typeof serial !== "number" || serial <= 0) {
    return null;
  }
  try {
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);

    const year = date_info.getUTCFullYear();
    const month = String(date_info.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date_info.getUTCDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  } catch (e) {
    console.error("Failed to convert excel date serial:", serial, e);
    return null;
  }
}
// --- 👆 [추가] ---

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
  // --- 👇 [추가] 파일 입력을 위한 ref ---
  const fileInputRef = useRef(null);
  // --- 👆 [추가] ---

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
          else if (el.defaultValue !== undefined && el.defaultValue !== null) {
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

  // --- 👇 [추가] 엑셀 업로드 버튼 클릭 핸들러 ---
  const handleExcelUploadClick = (e) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  };
  // --- 👆 [추가] ---

  // --- 👇 [추가] 엑셀 파일 파싱 및 폼 데이터 적용 핸들러 ---
  const handleFileChange = (e) => {
    e.stopPropagation();
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target.result;
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // 엑셀 데이터를 JSON 객체 배열로 변환 (헤더가 1행에 있다고 가정)
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 0 });

        if (!jsonData || jsonData.length === 0) {
          alert("Excel file is empty or has no data rows.");
          return;
        }

        // 1. 폼 요소의 'label'을 'name'에 매핑하는 맵 생성
        const labelToNameMap = new Map();
        node.data.elements?.forEach((el) => {
          if (el.label && el.name) {
            // 슬롯 보간을 거친 최종 라벨로 매핑
            const interpolatedLabel = interpolateMessage(el.label, slots);
            labelToNameMap.set(interpolatedLabel.toLowerCase().trim(), el);
          }
        });

        // 2. 엑셀의 첫 번째 데이터 행(row) 가져오기
        const firstRow = jsonData[0];
        const newData = {};

        // 3. 엑셀 헤더(key)를 폼 라벨과 비교하여 데이터 매핑
        for (const excelHeader in firstRow) {
          if (Object.hasOwnProperty.call(firstRow, excelHeader)) {
            const formElement = labelToNameMap.get(
              excelHeader.toLowerCase().trim()
            );

            if (formElement) {
              const formName = formElement.name;
              let excelValue = firstRow[excelHeader];

              // 4. 날짜 타입 처리 (엑셀 시리얼 -> YYYY-MM-DD)
              if (
                formElement.type === "date" &&
                typeof excelValue === "number"
              ) {
                const formattedDate = convertExcelDate(excelValue);
                if (formattedDate) {
                  newData[formName] = formattedDate;
                } else {
                  newData[formName] = String(excelValue); // 변환 실패 시 문자열로
                }
              } else {
                // 기타 타입 (문자열로 저장)
                newData[formName] = String(excelValue ?? "");
              }
            }
          }
        }

        // 4. 폼 데이터 상태 업데이트
        if (Object.keys(newData).length > 0) {
          setFormData((prev) => ({ ...prev, ...newData }));
          alert("Excel data loaded successfully.");
        } else {
          alert("No matching columns found between Excel and the form.");
        }
      } catch (error) {
        console.error("Error parsing Excel file:", error);
        alert("Failed to read or parse the Excel file.");
      } finally {
        // 파일 input 초기화 (동일한 파일 다시 선택 가능하도록)
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };
  // --- 👆 [추가] ---

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
                      ).map((k) => ({ key: k, label: k })); // v1.0 또는 Object.keys를 v1.2 형식으로 변환

                  // 2. hideNullColumns 필터링 (key 기준)
                  const filteredDisplayConfigs = el.hideNullColumns
                    ? originalDisplayConfigs.filter(
                        (
                          col // col은 {key, label}
                        ) =>
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
                  const columnWidths = filteredDisplayConfigs.reduce(
                    (acc, col) => {
                      const headerLength = interpolateMessage(
                        col.label,
                        slots
                      ).length; // col.label 사용
                      const maxLength = gridDataFromSlot.reduce(
                        (max, obj) =>
                          Math.max(
                            max,
                            String(
                              interpolateMessage(obj[col.key] || "", slots)
                            ).length // col.key 사용
                          ),
                        0
                      );
                      acc[col.key] = Math.max(
                        5,
                        Math.max(headerLength, maxLength) + 2
                      );
                      return acc;
                    },
                    {}
                  );

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
                                {interpolateMessage(col.label, slots)}{" "}
                                {/* label은 col.label */}
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
      {/* --- 👇 [추가] 숨겨진 파일 input --- */}
      <input
        type="file"
        ref={fileInputRef}
        className={styles.formFileInput}
        accept=".xlsx, .xls, .csv"
        onChange={handleFileChange}
        onClick={(e) => e.stopPropagation()} // 버블링 방지
      />
      {/* --- 👆 [추가] --- */}

      <div className={styles.formHeader}>
        <LogoIcon className={styles.avatar} />
        <h3>{interpolateMessage(node.data.title || "Form", slots)}</h3>
      </div>
      <div className={styles.formContainerSeparator} />

      {/* --- 👇 [수정] 그룹화된 요소 렌더링 --- */}
      {renderFormElements()}
      {/* --- 👆 [수정] --- */}

      {/* --- 👇 [수정] 엑셀 업로드 버튼을 formActionArea로 이동 --- */}
      {!hasSlotBoundGrid && !disabled && (
        <div className={styles.formActionArea}>
          {node.data.enableExcelUpload && (
            <button
              type="button"
              className={styles.excelUploadButton}
              // --- 👇 [수정] onClick 핸들러 변경 ---
              onClick={handleExcelUploadClick}
              // --- 👆 [수정] ---
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

// --- 👇 [수정] ScenarioStatusBadge 컴포넌트 정의 추가 ---
const ScenarioStatusBadge = ({ status, t, isSelected }) => {
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
// --- 👆 [수정] ---

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
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;
    const scrollableDistance =
      scrollContainer.scrollHeight -
      scrollContainer.clientHeight -
      scrollContainer.scrollTop;
    wasAtBottomRef.current = scrollableDistance <= 5;
  }, []);

  useEffect(() => {
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

  // --- 👇 [추가] 메시지 그룹핑 로직 ---
  const groupedMessages = [];
  let currentChain = [];

  scenarioMessages.forEach((msg) => {
    // set-slot 노드는 렌더링에서 제외
    if (msg.node?.type === "set-slot") {
      return;
    }

    const isChained = msg.node?.data?.chainNext === true;
    const isUserMsg = msg.sender === "user";

    if (isUserMsg) {
      // 1. 사용자 메시지
      // A. 진행 중이던 봇 체인을 먼저 푸시
      if (currentChain.length > 0) {
        groupedMessages.push(currentChain);
        currentChain = [];
      }
      // B. 사용자 메시지를 단일 항목으로 푸시
      groupedMessages.push(msg);
    } else {
      // 2. 봇 메시지
      // A. 현재 체인에 봇 메시지 추가
      currentChain.push(msg);
      // B. 이 메시지가 체인을 종료시키면 (chainNext: false or undefined)
      if (!isChained) {
        groupedMessages.push(currentChain);
        currentChain = [];
      }
    }
  });
  // 루프 종료 후 남은 체인이 있으면 푸시
  if (currentChain.length > 0) {
    groupedMessages.push(currentChain);
  }
  // --- 👆 [추가] ---

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
            onClick={async (e) => {
              e.stopPropagation();
              console.log(
                `[Call Window Method] callChatbotResize(width: -${SCENARIO_PANEL_WIDTH}) to ${PARENT_ORIGIN} with Close Scenario Chat`
              );
              postToParent("callChatbotResize", {
                width: -SCENARIO_PANEL_WIDTH,
              });
              await delayParentAnimationIfNeeded();
              await setActivePanel("main"); // 메인 패널로 전환 (포커스 이동 포함)
            }}
          >
            <CloseIcon />
          </button>
          {/* 종료 버튼 (기존 코드 유지) */}
        </div>
      </div>

      {/* --- 👇 [수정] groupedMessages를 map으로 순회 --- */}
      <div className={styles.history} ref={historyRef}>
        {groupedMessages.map((group, index) => {
          // group이 배열(체인)이 아닌 경우 (사용자 메시지)
          if (!Array.isArray(group)) {
            const msg = group; // msg는 사용자 메시지 객체
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
                        msg.text, // 사용자 메시지는 text만 있음
                        activeScenario.slots
                      )}
                    />
                  </div>
                </div>
              </div>
            );
          }

          // group이 배열인 경우 (봇 체인)
          const chain = group;
          return (
            <div
              key={chain[0].id || `${activeScenarioSessionId}-chain-${index}`}
              className={`${styles.messageRow}`} // 봇 메시지 row
            >
              <div
                className={`GlassEffect ${styles.message} ${
                  styles.botMessage
                } ${
                  // 체인 중 하나라도 grid/form/iframe이 있으면 넓은 스타일 적용
                  chain.some(
                    (msg) =>
                      msg.node?.type === "form" ||
                      msg.node?.data?.elements?.some(
                        (el) => el.type === "grid"
                      ) ||
                      msg.node?.type === "iframe"
                  )
                    ? styles.gridMessage
                    : ""
                }`}
              >
                <div
                  className={
                    // 폼 렌더러가 포함된 경우
                    chain.some((msg) => msg.node?.type === "form")
                      ? styles.scenarioFormMessageContentWrapper
                      : styles.scenarioMessageContentWrapper
                  }
                >
                  {/* 아바타는 한 번만 표시 */}
                  {chain.some((msg) => msg.node?.type !== "form") && (
                    <LogoIcon className={styles.avatar} />
                  )}

                  <div className={styles.messageContent}>
                    {/* --- 👇 [수정] 체인 내부의 각 메시지를 순회하며 렌더링 --- */}
                    {chain.map((msg) => (
                      <div
                        key={msg.id}
                        className={styles.chainedMessageItem} // 스타일 추가
                      >
                        {/* --- (기존 봇 메시지 렌더링 로직 복사) --- */}
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
                        {/* --- (기존 봇 메시지 렌더링 로직 끝) --- */}
                      </div>
                    ))}
                    {/* --- 👆 [수정] --- */}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {/* --- 👆 [수정] --- */}

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
