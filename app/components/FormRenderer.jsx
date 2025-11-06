// app/components/FormRenderer.jsx
"use client";

import { useCallback, useRef, useEffect, useState } from "react";
// --- 👇 [수정] XLSX 라이브러리와 헬퍼 함수를 excelUtils에서 임포트 ---
import { XLSX, convertExcelDate } from "../lib/excelUtils";
// --- 👆 [수정] ---
import { useTranslations } from "../hooks/useTranslations";
import styles from "./Chat.module.css";
import { validateInput, interpolateMessage } from "../lib/chatbotEngine";
import ArrowDropDownIcon from "./icons/ArrowDropDownIcon";
import LogoIcon from "./icons/LogoIcon";

// --- 👇 [제거] 엑셀 날짜 변환 헬퍼 (excelUtils.js로 이동) ---
// function convertExcelDate(serial) { ... }
// --- 👆 [제거] ---

// --- FormRenderer 컴포넌트 (로직 동일) ---
const FormRenderer = ({
  node,
  onFormSubmit,
  disabled,
  language,
  slots,
  onGridRowClick,
}) => {
  const [formData, setFormData] = useState({});
  const { t } = useTranslations();
  const fileInputRef = useRef(null);

  // --- 👇 [수정] useEffect 의존성 배열에서 'slots' 제거 ---
  useEffect(() => {
    const initialFormData = {};
    if (node.data && Array.isArray(node.data.elements)) {
      node.data.elements.forEach((el) => {
        if (el.name) {
          let initialValue;
          // 1. 슬롯 값 우선 적용 (컴포넌트 첫 마운트 시)
          if (slots[el.name] !== undefined && slots[el.name] !== null) {
            initialValue = slots[el.name];
            // 2. defaultValue는 input/date 타입을 제외하고 적용
          } else if (
            el.defaultValue !== undefined &&
            el.defaultValue !== null &&
            el.type !== "input" && // input 제외
            el.type !== "date" // date 제외
          ) {
            initialValue = interpolateMessage(String(el.defaultValue), slots);
          }

          // 3. 체크박스는 별도 defaultValue 로직 (더블클릭 대상이 아님)
          if (el.type === "checkbox") {
            // 슬롯이나 위 else if에서 값이 할당되지 않았을 경우
            if (
              initialValue === undefined &&
              el.defaultValue !== undefined &&
              el.defaultValue !== null
            ) {
              initialValue = interpolateMessage(String(el.defaultValue), slots);
            }

            // (기존 체크박스 배열 변환 로직)
            if (typeof initialValue === "string") {
              initialValue = initialValue
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            } else if (!Array.isArray(initialValue)) {
              initialValue = [];
            }
          }

          // 4. 최종 값 할당
          if (initialValue !== undefined) {
            initialFormData[el.name] = initialValue;
          }
        }
      });
    }
    setFormData(initialFormData);
    // 의존성 배열에서 'slots'를 제거하여,
    // 폼 제출 후 'slots' prop이 변경되어도 이 effect가 다시 실행되지 않도록 함.
    // 이렇게 하면 사용자가 입력한 'formData' 상태가 보존됨.
  }, [node.data.elements]);
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
    // --- 👇 [수정] 제출 시점에 formData와 slots를 병합 ---
    // (이렇게 하면 defaultValue 등이 최종 제출 데이터에 포함됨)
    const finalFormData = { ...formData };

    // 유효성 검사 전, 현재 formData에 없는 값들을 slots에서 가져오기
    // (disabled=true일 때 재진입 방지용으로도 사용됨)
    if (disabled) return;

    for (const element of node.data.elements) {
      // 1. formData에 있는 값 (사용자 입력)
      let valueToValidate = finalFormData[element.name];

      // 2. formData에 없으면 slots에서 가져오기 (초기값)
      if (valueToValidate === undefined) {
        valueToValidate = slots[element.name];
      }
      
      // 3. 그래도 없으면 defaultValue (더블클릭 용)
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
      
      // 4. 최종적으로 undefined/null이면 빈 문자열로 유효성 검사
      valueToValidate = valueToValidate ?? "";

      // 5. 유효성 검사 (input/date 타입만)
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
      
      // 6. 유효성 검사를 통과한 값을 최종 제출 데이터에 할당
      // (defaultValue 등이 formData에 반영되도록)
      if (finalFormData[element.name] === undefined && valueToValidate !== "") {
         finalFormData[element.name] = valueToValidate;
      }
    }
    
    // 7. 최종 제출 데이터 정리 (elements에 정의된 name만)
    const finalSubmissionData = {};
    node.data.elements.forEach((el) => {
      if (el.name && finalFormData[el.name] !== undefined) {
        finalSubmissionData[el.name] = finalFormData[el.name];
      }
    });
    
    // 8. 폼 제출
    onFormSubmit(finalSubmissionData);
    // --- 👆 [수정] ---
  };

  const handleDateInputClick = (e) => {
    e.stopPropagation();
    try {
      e.currentTarget.showPicker();
    } catch (error) {
      console.error("Failed to show date picker:", error);
    }
  };

  // --- 👇 [추가] 더블클릭 핸들러 ---
  const handleInputDoubleClick = (e, el) => {
    e.stopPropagation();
    if (disabled) return; // 비활성화 상태면 무시

    // defaultValue가 있는지 확인
    if (el.defaultValue !== undefined && el.defaultValue !== null) {
      // defaultValue를 현재 슬롯 기준으로 보간
      const interpolatedValue = interpolateMessage(String(el.defaultValue), slots);
      // handleInputChange를 호출하여 formData 상태 업데이트
      handleInputChange(el.name, interpolatedValue);
    }
  };
  // --- 👆 [추가] ---

  const handleExcelUploadClick = (e) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    e.stopPropagation();
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target.result;
        // --- 👇 [수정] 임포트한 XLSX 객체 사용 ---
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 0 });
        // --- 👆 [수정] ---

        if (!jsonData || jsonData.length === 0) {
          alert("Excel file is empty or has no data rows.");
          return;
        }
        const labelToNameMap = new Map();
        node.data.elements?.forEach((el) => {
          if (el.label && el.name) {
            const interpolatedLabel = interpolateMessage(el.label, slots);
            labelToNameMap.set(interpolatedLabel.toLowerCase().trim(), el);
          }
        });
        const firstRow = jsonData[0];
        const newData = {};
        for (const excelHeader in firstRow) {
          if (Object.hasOwnProperty.call(firstRow, excelHeader)) {
            const formElement = labelToNameMap.get(
              excelHeader.toLowerCase().trim()
            );
            if (formElement) {
              const formName = formElement.name;
              let excelValue = firstRow[excelHeader];
              if (
                formElement.type === "date" &&
                typeof excelValue === "number"
              ) {
                // --- 👇 [수정] 임포트한 convertExcelDate 함수 사용 ---
                const formattedDate = convertExcelDate(excelValue);
                // --- 👆 [수정] ---
                if (formattedDate) {
                  newData[formName] = formattedDate;
                } else {
                  newData[formName] = String(excelValue);
                }
              } else {
                newData[formName] = String(excelValue ?? "");
              }
            }
          }
        }
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
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };
    reader.readAsArrayBuffer(file);
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

  const renderFormElements = () => {
    const renderedElements = [];
    let i = 0;
    const elements = node.data.elements || [];
    const isSimpleInput = (el) =>
      el &&
      (el.type === "input" || el.type === "date" || el.type === "dropbox");
    while (i < elements.length) {
      const currentEl = elements[i];
      if (isSimpleInput(currentEl)) {
        const group = [];
        while (i < elements.length && isSimpleInput(elements[i])) {
          group.push(elements[i]);
          i++;
        }
        renderedElements.push(
          <div key={`group-${i}`} className={styles.formInputGroup}>
            {group.map((el) => {
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
              
              // --- 👇 [수정] value 로직 변경 ---
              // 1. formData에 값이 있으면 (사용자 입력/더블클릭/엑셀) 그것을 사용
              // 2. formData에 없고, disabled 상태이면(제출 후), slots에서 값을 가져옴
              // 3. 둘 다 아니면(초기 상태) 빈 문자열
              let currentValue = formData[el.name];
              if (currentValue === undefined && disabled && slots[el.name] !== undefined) {
                  currentValue = slots[el.name];
              }
              // --- 👆 [수정] ---
              
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
                      // --- 👇 [수정] value={formData[el.name] ?? ""}
                      value={currentValue ?? ""}
                      // --- 👆 [수정] ---
                      onChange={(e) =>
                        handleInputChange(el.name, e.target.value)
                      }
                      disabled={disabled}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => handleInputDoubleClick(e, el)}
                    />
                  )}
                  {el.type === "date" && (
                    <input
                      className={styles.formInput}
                      type="date"
                      // --- 👇 [수정] value={formData[el.name] ?? ""}
                      value={currentValue ?? ""}
                      // --- 👆 [수정] ---
                      onChange={(e) =>
                        handleInputChange(el.name, e.target.value)
                      }
                      onClick={handleDateInputClick}
                      disabled={disabled}
                      {...dateProps}
                      onDoubleClick={(e) => handleInputDoubleClick(e, el)}
                    />
                  )}
                  {el.type === "dropbox" && (
                    <div className={styles.selectWrapper}>
                      <select
                        className={styles.formInput}
                        // --- 👇 [수정] value={formData[el.name] ?? ""}
                        value={currentValue ?? ""}
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
      } else {
        const el = currentEl;
        renderedElements.push(
          <div key={el.id} className={styles.formElement}>
            {el.type === "grid"
              ? (() => {
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
                    const useObjectKeys =
                      el.displayKeys &&
                      el.displayKeys.length > 0 &&
                      typeof el.displayKeys[0] === "object" &&
                      el.displayKeys[0] !== null &&
                      el.displayKeys[0].hasOwnProperty("key");
                    const originalDisplayConfigs = useObjectKeys
                      ? el.displayKeys
                      : (el.displayKeys && el.displayKeys.length > 0
                          ? el.displayKeys
                          : Object.keys(gridDataFromSlot[0] || {})
                        ).map((k) => ({ key: k, label: k }));
                    const filteredDisplayConfigs = el.hideNullColumns
                      ? originalDisplayConfigs.filter((col) =>
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
                    const columnWidths = filteredDisplayConfigs.reduce(
                      (acc, col) => {
                        const headerLength = interpolateMessage(
                          col.label,
                          slots
                        ).length;
                        const maxLength = gridDataFromSlot.reduce(
                          (max, obj) =>
                            Math.max(
                              max,
                              String(
                                interpolateMessage(obj[col.key] || "", slots)
                              ).length
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
                              {filteredDisplayConfigs.map((col) => (
                                <th
                                  key={col.key}
                                  style={{
                                    minWidth: `${columnWidths[col.key]}ch`,
                                    textAlign: "left",
                                    padding: "10px 12px",
                                  }}
                                >
                                  {interpolateMessage(col.label, slots)}{" "}
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
                                {filteredDisplayConfigs.map((col) => (
                                  <td
                                    key={col.key}
                                    style={{
                                      minWidth: `${columnWidths[col.key]}ch`,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {interpolateMessage(
                                      dataObject[col.key] || "",
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
              : (
                <>
                  <label className={styles.formLabel}>
                    {interpolateMessage(el.label, slots)}
                  </label>
                  {el.type === "checkbox" &&
                    (el.options || []).map((opt) => {
                      // --- 👇 [수정] 체크박스 value 로직 ---
                      let currentChecked = (formData[el.name] || []).includes(opt);
                      if (!formData[el.name] && disabled && Array.isArray(slots[el.name])) {
                        currentChecked = slots[el.name].includes(opt);
                      }
                      // --- 👆 [수정] ---
                      return (
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
                            // --- [수정] ---
                            checked={currentChecked}
                            // --- [수정] ---
                            onChange={(e) =>
                              handleMultiInputChange(
                                el.name,
                                opt,
                                e.target.checked
                              )
                            }
                            disabled={disabled}
                          />
                          <label htmlFor={`${el.id}-${opt}`}>
                            {interpolateMessage(opt, slots)}
                          </label>
                        </div>
                      );
                    })}
                </>
              )}
          </div>
        );
        i++;
      }
    }
    return renderedElements;
  };

  return (
    <form onSubmit={handleSubmit} className={styles.formContainer}>
      <input
        type="file"
        ref={fileInputRef}
        className={styles.formFileInput}
        accept=".xlsx, .xls, .csv"
        onChange={handleFileChange}
        onClick={(e) => e.stopPropagation()}
      />

      <div className={styles.formHeader}>
        <LogoIcon className={styles.avatar} />
        <h3>{interpolateMessage(node.data.title || "Form", slots)}</h3>
      </div>
      <div className={styles.formContainerSeparator} />

      {renderFormElements()}

      {!hasSlotBoundGrid && !disabled && (
        <div className={styles.formActionArea}>
          {node.data.enableExcelUpload && (
            <button
              type="button"
              className={styles.excelUploadButton}
              onClick={handleExcelUploadClick}
              disabled={disabled}
            >
              Excel Upload
            </button>
          )}
          <button
            type="submit"
            className={styles.formSubmitButton}
            onClick={(e) => e.stopPropagation()}
            disabled={disabled} // --- [추가] disabled 속성
          >
            {t("submit")}
          </button>
        </div>
      )}
    </form>
  );
};

export default FormRenderer;