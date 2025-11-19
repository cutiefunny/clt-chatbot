// app/components/FormRenderer.jsx
"use client";

import { useCallback, useRef, useEffect, useState } from "react";
// --- 👇 [수정] XLSX 라이브러리와 헬퍼 함수를 excelUtils에서 임포트 ---
import { XLSX, convertExcelDate } from "../lib/excelUtils";
// --- 👆 [수정] ---
import { useTranslations } from "../hooks/useTranslations";
import styles from "./Chat.module.css";
// --- 👇 [수정] getDeepValue 임포트 추가 ---
import { validateInput, interpolateMessage, getDeepValue } from "../lib/chatbotEngine";
// --- 👆 [수정] ---
import ArrowDropDownIcon from "./icons/ArrowDropDownIcon";
import LogoIcon from "./icons/LogoIcon";

// --- FormRenderer 컴포넌트 ---
const FormRenderer = ({
  node,
  onFormSubmit,
  disabled,
  language,
  slots,
  // --- 👇 [수정] props 변경 ---
  setScenarioSlots, 
  activeScenarioSessionId,
  onFormElementApiCall,
  onGridRowClick, // (Fallback용 onGridRowClick은 유지)
  // --- 👆 [수정] ---
}) => {
  const [formData, setFormData] = useState({});
  const { t } = useTranslations();
  const fileInputRef = useRef(null);

  // useEffect (폼 데이터 초기화 로직)
  useEffect(() => {
    const initialFormData = {};
    if (node.data && Array.isArray(node.data.elements)) {
      node.data.elements.forEach((el) => {
        if (el.name) {
          let initialValue;
          // 1. 슬롯 값 우선 적용
          if (slots[el.name] !== undefined && slots[el.name] !== null) {
            initialValue = slots[el.name];
          // 2. [수정] input/date/search 타입 제외하고 defaultValue 적용
          } else if (
            el.defaultValue !== undefined &&
            el.defaultValue !== null &&
            el.type !== "input" && 
            el.type !== "date" &&
            el.type !== "search" // 💡 search 타입 추가
          ) {
            initialValue = interpolateMessage(String(el.defaultValue), slots);
          }

          // 3. 체크박스는 별도 defaultValue 로직
          if (el.type === "checkbox") {
            if (
              initialValue === undefined &&
              el.defaultValue !== undefined &&
              el.defaultValue !== null
            ) {
              initialValue = interpolateMessage(String(el.defaultValue), slots);
            }
            if (typeof initialValue === "string") {
              initialValue = initialValue
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            } else if (!Array.isArray(initialValue)) {
              initialValue = [];
            }
          }
          
          // 4. [추가] input/date/search 타입의 초기값 설정 (슬롯 값 X, defaultValue O)
          if (
            (el.type === "input" || el.type === "date" || el.type === "search") &&
            initialValue === undefined && // 슬롯 값이 없을 때만
            el.defaultValue !== undefined &&
            el.defaultValue !== null
          ) {
            initialValue = interpolateMessage(String(el.defaultValue), slots);
          }
          // --- 👆 [추가] ---


          // 5. 최종 값 할당
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
      return { ...prev, [name]: newValues.length > 0 ? newValues : [] };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const finalFormData = { ...formData };
    for (const element of node.data.elements) {
      // 💡 [수정] 'search' 타입도 유효성 검사 대상에 포함
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
      if (element.type === "input" || element.type === "date" || element.type === "search") {
      // --- 👆 [수정] ---
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

  const handleDateInputClick = (e) => {
    e.stopPropagation();
    try {
      e.currentTarget.showPicker();
    } catch (error) {
      console.error("Failed to show date picker:", error);
    }
  };

  const handleInputDoubleClick = (e, el) => {
    e.stopPropagation();
    if (disabled) return; 

    if (el.defaultValue !== undefined && el.defaultValue !== null) {
      const interpolatedValue = interpolateMessage(String(el.defaultValue), slots);
      handleInputChange(el.name, interpolatedValue);
    }
  };

  const handleExcelUploadClick = (e) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    // (Excel 파싱 로직 - 기존과 동일)
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
  
  // --- 👇 [수정] 그리드 클릭 핸들러 (inputFillKey 반영 및 search element 매칭 수정, 다음 노드 진행 방지) ---
  const handleGridRowClick = (gridElement, rowData) => {
    if (disabled) return;

    // [추가] optionsSlot에서 루트 키 추출 (dot notation 지원 반영)
    const rootOptionsSlotKey = gridElement.optionsSlot 
        ? gridElement.optionsSlot.split('.')[0] 
        : null;

    // 1. 이 그리드와 연결된 'search' 엘리먼트 찾기 (rootOptionsSlotKey 사용)
    const searchElement = node.data.elements.find(
      (e) => e.type === "search" && e.resultSlot === rootOptionsSlotKey
    );
    
    // 2. setScenarioSlots 함수가 있고 연결된 search가 있는 경우 (핵심 로직)
    if (searchElement && searchElement.name && setScenarioSlots && activeScenarioSessionId) {
      
      const gridKeys = (gridElement.displayKeys && gridElement.displayKeys.length > 0) 
        ? gridElement.displayKeys.map(k => k.key) 
        : Object.keys(rowData);
          
      const firstColumnKey = gridKeys[0];

      // 3. inputFillKey 처리: null이면 채우지 않고, undefined/missing이면 firstColumnKey로 대체
      const fillKey = searchElement.inputFillKey === null
          ? null 
          : (searchElement.inputFillKey || firstColumnKey); 

      const newSlotsUpdate = {
          [gridElement.optionsSlot]: [],   // 💡 그리드 슬롯 숨기기: 그리드를 숨기기 위해 빈 배열로 업데이트
          selectedRow: rowData             // 💡 selectedRow 슬롯 저장
      };

      if (fillKey) {
          // 추출한 값을 search input 슬롯에 저장
          const valueToFill = rowData[fillKey] || '';
          newSlotsUpdate[searchElement.name] = valueToFill; // 💡 검색창 슬롯 업데이트
      }

      // 4. setScenarioSlots를 호출하여 슬롯을 업데이트 (이것은 상태 변경만 유발하고 다음 노드로 진행하지 않음)
      setScenarioSlots(activeScenarioSessionId, {
        ...slots,
        ...newSlotsUpdate
      });

      // 5. [추가] 다음 노드 진행 방지 (onFormSubmit 호출을 건너뜀)
      //    (별도의 "Row selected" 메시지 생성도 방지됨)
      console.log(`Grid row selected (linked to search). Updating slots but preventing node progression.`);
      
      // 6. 로컬 폼 상태 업데이트 (UI에 즉시 반영)
      if (fillKey) {
          setFormData((prev) => ({ ...prev, [searchElement.name]: rowData[fillKey] || '' }));
      }

      return; // 여기서 함수 종료

    } else {
      // 5. (Fallback 로직: 연결된 search가 없거나 setScenarioSlots가 없는 경우)
      if (onGridRowClick) { 
        onGridRowClick(gridElement, rowData);
      } else {
        // Fallback 시에는 다음 노드로 진행 (기존 Form 제출 로직)
        const finalSubmissionData = { ...formData, selectedRow: rowData };
        onFormSubmit(finalSubmissionData); // <-- 다음 노드로 진행
      }
    }
  };
  // --- 👆 [수정] 그리드 클릭 핸들러 (inputFillKey 반영 및 search element 매칭 수정, 다음 노드 진행 방지) ---

  const hasSlotBoundGrid = node.data.elements?.some(
    (el) => {
        if (el.type !== "grid" || !el.optionsSlot) return false;
        // --- 👇 [수정] getDeepValue를 사용하여 깊은 경로의 배열 데이터 확인 ---
        const gridData = getDeepValue(slots, el.optionsSlot);
        const hasData = Array.isArray(gridData) && gridData.length > 0;
        const isObjectArray = hasData && typeof gridData[0] === "object" && gridData[0] !== null;
        return isObjectArray;
        // --- 👆 [수정] ---
    }
  );

  const renderFormElements = () => {
    const renderedElements = [];
    let i = 0;
    const elements = node.data.elements || [];
    // 💡 [수정] 'search'도 simple input 그룹에 포함
    const isSimpleInput = (el) =>
      el &&
      (el.type === "input" || el.type === "date" || el.type === "dropbox" || el.type === "search");
      
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
                // (날짜 props 로직 - 동일)
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
                // (드롭박스 옵션 로직 - 동일)
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
                      onDoubleClick={(e) => handleInputDoubleClick(e, el)} 
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
                      onDoubleClick={(e) => handleInputDoubleClick(e, el)} 
                    />
                  )}
                  {/* --- 👇 [추가] 'search' 엘리먼트 렌더링 --- */}
                  {el.type === "search" && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        className={styles.formInput}
                        type="text"
                        placeholder={interpolateMessage(el.placeholder || "", slots)}
                        value={formData[el.name] ?? ""} 
                        onChange={(e) => handleInputChange(el.name, e.target.value)} 
                        disabled={disabled}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => handleInputDoubleClick(e, el)}
                        style={{ flexGrow: 1 }}
                      />
                      <button 
                        type="button" // 💡 [중요] form submit 방지
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onFormElementApiCall) {
                            // 💡 로컬 formData 전달
                            onFormElementApiCall(el, formData); 
                          } else {
                            console.warn("onFormElementApiCall prop is missing.");
                          }
                        }}
                        disabled={disabled}
                        className={styles.formSubmitButton} // 돋보기 버튼 스타일
                        style={{ padding: '8px 12px', margin: 0, flexShrink: 0, lineHeight: 1 }}
                      >
                        🔍
                      </button>
                    </div>
                  )}
                  {/* --- 👆 [추가] --- */}
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
      } else {
        const el = currentEl;
        renderedElements.push(
          <div key={el.id} className={styles.formElement}>
            {/* --- 👇 [수정] Grid 렌더링 로직 (tableLayout: fixed + % width) --- */}
            {el.type === "grid"
              ? (() => {
                  // --- 👇 [수정] getDeepValue를 사용하여 깊은 경로의 배열 데이터 확인 ---
                  const gridDataFromSlot = el.optionsSlot
                    ? getDeepValue(slots, el.optionsSlot) // <-- 수정: getDeepValue 사용
                    : null;
                  // --- 👆 [수정] ---
                  const hasSlotData =
                    Array.isArray(gridDataFromSlot) &&
                    gridDataFromSlot.length > 0;

                  // 1. 슬롯 데이터가 있으면 (검색 후) -> 동적 그리드 렌더링
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
                    
                    // --- 💡 [제거] 컬럼 너비 계산 로직 ---
                    // const columnWidths = ...
                    // const totalWidth = ...
                    // --- 💡 [제거 완료] ---

                    return (
                      <div style={{ overflowX: "auto", width: "100%" }}>
                        <table
                          className={styles.formGridTable}
                          // --- 💡 [수정] tableLayout: "fixed", width: "100%" ---
                          style={{ tableLayout: "fixed", width: "100%" }}
                        >
                          <thead>
                            <tr>
                              {filteredDisplayConfigs.map((col) => (
                                <th
                                  key={col.key}
                                  // --- 💡 [수정] 동적 width: '%' 제거 ---
                                  style={{
                                    // width: `${(columnWidths[col.key] / totalWidth) * 100}%`, // <-- REMOVED
                                    textAlign: "left",
                                    padding: "10px 12px",
                                    whiteSpace: "nowrap", 
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
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
                                  !disabled && handleGridRowClick(el, dataObject)
                                }
                                style={{
                                  cursor: disabled ? "default" : "pointer",
                                }}
                              >
                                {filteredDisplayConfigs.map((col) => (
                                  <td
                                    key={col.key}
                                    // --- 💡 [수정] maxWidth: "0px"가 없는지 재확인 ---
                                    style={{
                                      whiteSpace: "nowrap",
                                      overflow: "hidden", 
                                      textOverflow: "ellipsis",
                                      // maxWidth: "0px", // (제거된 상태 유지)
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
                  } else if (hasSlotData) {
                      // (문자열 배열 데이터 렌더링 - 기존과 동일)
                      const dataArray = gridDataFromSlot;
                      const rows = dataArray.length;
                      const columns = dataArray[0]?.length || 0;
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
                                      dataArray[r]?.[c] || "",
                                      slots
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      );
                  } else if (el.optionsSlot) {
                      // 2. 슬롯이 설정되었지만 데이터가 없음 (검색 전/클릭 후) -> 그리드 숨김
                      return null;
                  } else {
                    // 3. 슬롯이 설정되지 않음 (정적 그리드) -> 정적 렌더링 (기존과 동일)
                    const dataArray = el.data || [];
                    const rows = el.rows || 0;
                    const columns = el.columns || 0;
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
                                    dataArray[r * columns + c] || "",
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
              // --- 💡 [수정 완료] ---
              : (
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