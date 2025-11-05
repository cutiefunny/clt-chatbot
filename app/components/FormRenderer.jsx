// app/components/FormRenderer.jsx
"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import * as XLSX from "xlsx"; // 엑셀 파싱 라이브러리
import { useTranslations } from "../hooks/useTranslations";
import styles from "./Chat.module.css"; // ScenarioChat.jsx가 사용하던 CSS
import { validateInput, interpolateMessage } from "../lib/chatbotEngine";
import ArrowDropDownIcon from "./icons/ArrowDropDownIcon";
import LogoIcon from "./icons/LogoIcon"; // ScenarioChat.jsx의 FormRenderer가 사용

// --- 엑셀 날짜 변환 헬퍼 ---
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

// --- FormRenderer 컴포넌트 ---
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
      }
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
    }
    const finalSubmissionData = {};
    node.data.elements.forEach((el) => {
      if (el.name && finalFormData[el.name] !== undefined) {
        finalSubmissionData[el.name] = finalFormData[el.name];
      }
    });

    onFormSubmit(finalSubmissionData); // 최종 데이터 제출
  };

  const handleDateInputClick = (e) => {
    e.stopPropagation();
    try {
      e.currentTarget.showPicker();
    } catch (error) {
      console.error("Failed to show date picker:", error);
    }
  };

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
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 0 });

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
                const formattedDate = convertExcelDate(excelValue);
                if (formattedDate) {
                  newData[formName] = formattedDate;
                } else {
                  newData[formName] = String(excelValue); // 변환 실패 시 문자열로
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
                      value={formData[el.name] ?? ""}
                      onChange={(e) =>
                        handleInputChange(el.name, e.target.value)
                      }
                      disabled={disabled}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  {el.type === "date" && (
                    <input
                      className={styles.formInput}
                      type="date"
                      value={formData[el.name] ?? ""}
                      onChange={(e) =>
                        handleInputChange(el.name, e.target.value)
                      }
                      onClick={handleDateInputClick}
                      disabled={disabled}
                      {...dateProps}
                    />
                  )}
                  {el.type === "dropbox" && (
                    <div className={styles.selectWrapper}>
                      <select
                        className={styles.formInput}
                        value={formData[el.name] ?? ""}
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
      else {
        const el = currentEl;
        renderedElements.push(
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
          >
            {t("submit")}
          </button>
        </div>
      )}
    </form>
  );
};

export default FormRenderer;