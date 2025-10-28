"use client";

// --- 👇 [수정] useEffect, useRef, useState와 함께 useCallback 임포트 ---
import { useEffect, useRef, useState, useCallback } from "react";
// --- 👆 [수정] ---
import { useChatStore } from "../store"; // useChatStore 임포트 확인
import { useTranslations } from "../hooks/useTranslations";
// --- 👇 [수정] Chat.module.css 또는 별도의 ScenarioChat.module.css 사용 ---
import styles from "./Chat.module.css"; // Chat.module.css 재활용
// --- 👆 [수정] ---
import { validateInput, interpolateMessage } from "../lib/chatbotEngine";
// --- 👇 [추가] 필요한 아이콘 임포트 ---
import LogoIcon from "./icons/LogoIcon";
import ArrowDropDownIcon from "./icons/ArrowDropDownIcon"; // FormRenderer용
import CheckCircle from "./icons/CheckCircle"; // Branch 버튼용
import OpenInNewIcon from "./icons/OpenInNew"; // Link 버튼용
import ChevronDownIcon from "./icons/ChevronDownIcon"; // 헤더 축소/확장용 (선택 사항)
// --- 👆 [추가] ---

// FormRenderer 컴포넌트 (기존 코드 유지)
const FormRenderer = ({ node, onFormSubmit, disabled, language, slots, onGridRowClick }) => {
  const [formData, setFormData] = useState({});
  const dateInputRef = useRef(null);
  const { t } = useTranslations();

  // useEffect를 사용하여 defaultValue로 formData 초기화
  useEffect(() => {
    const initialFormData = {};
    if (node.data && Array.isArray(node.data.elements)) {
      node.data.elements.forEach((el) => {
        // --- 👇 [수정] defaultValue 처리 강화 (모든 타입 고려, 보간 적용) ---
        if (el.name && el.defaultValue !== undefined && el.defaultValue !== null) {
          let initialValue = interpolateMessage(String(el.defaultValue), slots);
           // 타입 변환 시도 (선택 사항)
          if (el.type === 'checkbox' && typeof initialValue === 'string') {
              initialValue = initialValue.split(',').map(s => s.trim());
          }
          initialFormData[el.name] = initialValue;
        }
        // --- 👆 [수정] ---
      });
    }
    setFormData(initialFormData);
  }, [node.data.elements, slots]); // slots 추가

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
      // --- 👇 [수정] 제출 시 검증할 값 가져오기 (formData 우선, 없으면 보간된 defaultValue) ---
      let valueToValidate = formData[element.name];
      if (valueToValidate === undefined && element.defaultValue !== undefined && element.defaultValue !== null) {
        valueToValidate = interpolateMessage(String(element.defaultValue), slots);
        // Do not automatically add interpolated default values to submission data
        // Only use them for validation if no user input exists
        // finalFormData[element.name] = valueToValidate; // 제출 데이터에는 추가하지 않음 (사용자 입력이 없으면 슬롯에 안 남김)
      }
       // If still undefined (no user input, no default), treat as empty string for validation
      valueToValidate = valueToValidate ?? "";
      // --- 👆 [수정] ---


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
     node.data.elements.forEach(el => {
         if (el.name && finalFormData[el.name] !== undefined) {
             finalSubmissionData[el.name] = finalFormData[el.name];
         }
     });

    onFormSubmit(finalSubmissionData); // 최종 데이터 제출
  };


  const handleDateInputClick = () => {
    try {
      dateInputRef.current?.showPicker();
    } catch (error) {
      console.error("Failed to show date picker:", error);
    }
  };

  // 슬롯 데이터를 사용하는 그리드 요소가 있는지 확인
  const hasSlotBoundGrid = node.data.elements?.some(
    (el) =>
      el.type === "grid" &&
      el.optionsSlot &&
      Array.isArray(slots[el.optionsSlot]) &&
      slots[el.optionsSlot].length > 0 &&
      typeof slots[el.optionsSlot][0] === "object" && // 객체 배열인지 확인
      slots[el.optionsSlot][0] !== null
  );

  return (
    <form onSubmit={handleSubmit} className={styles.formContainer}>
      {/* 폼 제목 (보간 처리) */}
      <h3>{interpolateMessage(node.data.title || 'Form', slots)}</h3>
      <div className={styles.formContainerSeparator} />

      {/* 폼 요소 렌더링 */}
      {node.data.elements?.map((el) => {
        // 날짜 입력 제한 설정
        const dateProps = {};
        if (el.type === "date" && el.validation) {
          if (el.validation.type === "today after") {
            dateProps.min = new Date().toISOString().split("T")[0];
          } else if (el.validation.type === "today before") {
            dateProps.max = new Date().toISOString().split("T")[0];
          } else if (el.validation.type === "custom") {
            if (el.validation.startDate) dateProps.min = el.validation.startDate;
            if (el.validation.endDate) dateProps.max = el.validation.endDate;
          }
        }

        // 드롭다운 옵션 처리
        let dropboxOptions = [];
        if (el.type === "dropbox") {
          if (el.optionsSlot && Array.isArray(slots[el.optionsSlot])) {
            // 슬롯 데이터가 문자열 배열이 아닐 경우 처리 추가
            dropboxOptions = slots[el.optionsSlot].map(opt =>
              typeof opt === 'object' && opt !== null ? JSON.stringify(opt) : String(opt)
            );
          } else if (Array.isArray(el.options)) {
            dropboxOptions = el.options;
          }
        }

        // 각 폼 요소 렌더링
        return (
          <div key={el.id} className={styles.formElement}>
            {/* 그리드 타입 렌더링 */}
            {el.type === "grid" ? (
              (() => {
                const gridDataFromSlot = el.optionsSlot ? slots[el.optionsSlot] : null;
                const hasSlotData = Array.isArray(gridDataFromSlot) && gridDataFromSlot.length > 0;

                // 슬롯 데이터가 객체 배열인 경우 (동적 컬럼)
                if (hasSlotData && typeof gridDataFromSlot[0] === 'object' && gridDataFromSlot[0] !== null && !Array.isArray(gridDataFromSlot[0])) {
                  const originalDisplayKeys = (el.displayKeys && el.displayKeys.length > 0) ? el.displayKeys : Object.keys(gridDataFromSlot[0] || {});
                  // Null 컬럼 숨김 처리
                  const filteredKeys = el.hideNullColumns
                    ? originalDisplayKeys.filter(key => gridDataFromSlot.some(obj => obj[key] !== null && obj[key] !== undefined && obj[key] !== ''))
                    : originalDisplayKeys;

                  // 표시할 키가 없을 경우 처리
                  if (filteredKeys.length === 0) {
                    return <div>{el.hideNullColumns ? "All columns hidden." : "No data columns found."}</div>;
                  }

                  // 컬럼 너비 계산 (개선된 로직)
                  const columnWidths = filteredKeys.reduce((acc, key) => {
                      const headerLength = interpolateMessage(key, slots).length; // 헤더도 보간
                      const maxLength = gridDataFromSlot.reduce((max, obj) => {
                          const valueStr = String(interpolateMessage(obj[key] || '', slots));
                          return Math.max(max, valueStr.length);
                      }, 0);
                      acc[key] = Math.max(5, Math.max(headerLength, maxLength) + 2); // 최소 5ch, 여유 2ch
                      return acc;
                  }, {});


                  return (
                    <div style={{ overflowX: 'auto', width: '100%' }}>
                      <table className={styles.formGridTable} style={{ tableLayout: 'auto' }}>
                        <thead>
                          <tr>
                            {filteredKeys.map(key => (
                              <th key={key} style={{ minWidth: `${columnWidths[key]}ch`, textAlign: 'left', padding: '10px 12px' }}>
                                {interpolateMessage(key, slots)} {/* 헤더 보간 */}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {gridDataFromSlot.map((dataObject, index) => (
                            <tr key={`${el.id}-${index}`} onClick={() => !disabled && onGridRowClick(el, dataObject)} style={{ cursor: disabled ? 'default' : 'pointer' }}>
                              {filteredKeys.map(key => (
                                <td key={key} style={{ minWidth: `${columnWidths[key]}ch`, whiteSpace: 'nowrap' }}>
                                  {interpolateMessage(dataObject[key] || '', slots)} {/* 셀 내용 보간 */}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                }
                // 슬롯 데이터가 2차원 배열이거나, 정적 데이터인 경우
                else {
                  const dataArray = hasSlotData ? gridDataFromSlot : (el.data || []);
                  const rows = hasSlotData ? dataArray.length : (el.rows || 0);
                  const columns = hasSlotData ? (dataArray[0]?.length || 0) : (el.columns || 0);

                  if (rows === 0 || columns === 0) return <div>Grid data is empty.</div>;

                  return (
                    <table className={styles.formGridTable}>
                      <tbody>
                        {[...Array(rows)].map((_, r) => (
                          <tr key={r}>
                            {[...Array(columns)].map((_, c) => {
                              const cellValue = hasSlotData
                                ? (dataArray[r] ? dataArray[r][c] : '') // 슬롯 데이터 (2D 배열)
                                : (dataArray[r * columns + c] || ''); // 정적 데이터 (1D 배열)
                              return (
                                <td key={c}>
                                  {interpolateMessage(cellValue || '', slots)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                }
              })() // 즉시 실행 함수 종료
            ) : ( // 그리드 타입이 아닌 경우
              <>
                {/* 라벨 (보간 처리) */}
                <label className={styles.formLabel}>
                  {interpolateMessage(el.label, slots)}
                </label>

                {/* Input */}
                {el.type === "input" && (
                  <input
                    className={styles.formInput}
                    type="text"
                    placeholder={interpolateMessage(el.placeholder || '', slots)}
                     // value는 formData 우선, 없으면 보간된 defaultValue 사용
                    value={formData[el.name] ?? interpolateMessage(String(el.defaultValue ?? ''), slots)}
                    onChange={(e) => handleInputChange(el.name, e.target.value)}
                    disabled={disabled}
                    onClick={(e) => e.stopPropagation()} // 버블 클릭 방지
                  />
                )}

                {/* Date */}
                {el.type === "date" && (
                  <input
                    ref={dateInputRef}
                    className={styles.formInput}
                    type="date"
                    // value는 formData 우선, 없으면 빈 문자열
                    value={formData[el.name] || ""}
                    onChange={(e) => handleInputChange(el.name, e.target.value)}
                    onClick={(e) => { e.stopPropagation(); handleDateInputClick(); }} // 버블 클릭 방지
                    disabled={disabled}
                    {...dateProps}
                  />
                )}

                {/* Dropbox */}
                {el.type === "dropbox" && (
                  <div className={styles.selectWrapper}>
                    <select
                      className={styles.formInput} // 스타일 일관성
                      // value는 formData 우선, 없으면 빈 문자열
                      value={formData[el.name] || ""}
                      onChange={(e) => handleInputChange(el.name, e.target.value)}
                      disabled={disabled}
                      onClick={(e) => e.stopPropagation()} // 버블 클릭 방지
                    >
                      <option value="" disabled>{t("select")}</option>
                      {dropboxOptions.map((opt, idx) => (
                        <option key={`${opt}-${idx}`} value={opt}> {/* 고유 키 수정 */}
                          {interpolateMessage(opt, slots)} {/* 옵션 보간 */}
                        </option>
                      ))}
                    </select>
                     <ArrowDropDownIcon style={{ color: "var(--Gray-07, #5E7599)" }} />
                  </div>
                )}

                {/* Checkbox */}
                {el.type === "checkbox" && (el.options || []).map((opt) => (
                  <div key={opt} onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      id={`${el.id}-${opt}`}
                      value={opt}
                      // checked 상태는 formData의 배열에 포함되어 있는지 여부로 결정
                      checked={(formData[el.name] || []).includes(opt)}
                      onChange={(e) => handleMultiInputChange(el.name, opt, e.target.checked)}
                      disabled={disabled}
                    />
                    <label htmlFor={`${el.id}-${opt}`}>
                      {interpolateMessage(opt, slots)} {/* 라벨 보간 */}
                    </label>
                  </div>
                ))}
              </>
            )}
          </div>
        );
      })}

      {/* 제출 버튼 (슬롯 바인딩된 그리드가 아닐 때만 표시) */}
      {!hasSlotBoundGrid && !disabled && (
        <button type="submit" className={styles.formSubmitButton} onClick={(e) => e.stopPropagation()}>
          {t("submit")}
        </button>
      )}
    </form>
  );
};


// ScenarioChat 컴포넌트
export default function ScenarioChat() {
  const {
    activeScenarioSessionId,
    scenarioStates,
    handleScenarioResponse,
    endScenario,
    setActivePanel, // 패널 닫기 위해 필요
    setScenarioSelectedOption, // Branch 선택 업데이트용
  } = useChatStore();
  const { t, language } = useTranslations();

  const activeScenario = activeScenarioSessionId ? scenarioStates[activeScenarioSessionId] : null;
  const isCompleted = activeScenario?.status === "completed" || activeScenario?.status === "failed" || activeScenario?.status === "canceled";
  const scenarioMessages = activeScenario?.messages || [];
  const isScenarioLoading = activeScenario?.isLoading || false; // 로딩 상태 사용
  const currentScenarioNodeId = activeScenario?.state?.currentNodeId;
  const scenarioId = activeScenario?.scenarioId;

  const historyRef = useRef(null);
  const wasAtBottomRef = useRef(true); // 스크롤 관련 상태

  // 스크롤 맨 아래 여부 확인 함수
  const updateWasAtBottom = useCallback(() => {
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;
    // 스크롤 가능한 전체 높이와 현재 스크롤 위치 + 보이는 높이 비교
    const scrollableDistance = scrollContainer.scrollHeight - scrollContainer.clientHeight - scrollContainer.scrollTop;
    wasAtBottomRef.current = scrollableDistance <= 5; // 약간의 여유 허용
  }, []); // 의존성 없음

  // 스크롤 이벤트 리스너 설정
   useEffect(() => {
     const scrollContainer = historyRef.current;
     if (!scrollContainer) return;
     const handleScrollEvent = () => { updateWasAtBottom(); };
     updateWasAtBottom(); // 초기 상태 설정
     scrollContainer.addEventListener("scroll", handleScrollEvent);
     return () => { scrollContainer.removeEventListener("scroll", handleScrollEvent); };
   }, [updateWasAtBottom]); // updateWasAtBottom이 변경될 때만 리스너 재설정

  // 새 메시지 추가 시 자동 스크롤
   useEffect(() => {
     const scrollContainer = historyRef.current;
     if (!scrollContainer) return;
     const scrollToBottomIfNeeded = () => {
       // 스크롤이 맨 아래에 있거나 거의 맨 아래에 있을 때만 자동 스크롤
       if (wasAtBottomRef.current) {
           requestAnimationFrame(() => { // 다음 프레임에서 실행하여 정확한 높이 계산
              if(scrollContainer) { // 컴포넌트 언마운트 대비
                  scrollContainer.scrollTop = scrollContainer.scrollHeight;
              }
           });
       }
     };
     // MutationObserver를 사용하여 DOM 변경 감지 후 스크롤
     const observer = new MutationObserver(scrollToBottomIfNeeded);
     observer.observe(scrollContainer, { childList: true, subtree: true });
     // 메시지 목록 변경 시 즉시 스크롤 (옵저버가 처리하기 전에도)
     scrollToBottomIfNeeded();
     return () => observer.disconnect();
   }, [scenarioMessages, isScenarioLoading]); // 로딩 상태 변경 시에도 스크롤 확인


  // activeScenario가 없으면 로딩 표시 또는 null 반환
  if (!activeScenario) {
     return (
        <div className={styles.scenarioChatContainer}> {/* 스타일 적용 */}
          <div className={styles.header}> {/* 헤더 기본 구조 */}
            <div className={styles.headerContent}>
              <span className={styles.headerTitle}>Loading Scenario...</span>
            </div>
          </div>
          <div className={`${styles.history} ${styles.loadingState}`}> {/* 로딩 상태 스타일 */}
             <p>{t('loading')}</p> {/* 번역된 로딩 텍스트 */}
          </div>
        </div>
     );
  }

  // 폼 제출 핸들러
  const handleFormSubmit = (formData) => {
    handleScenarioResponse({
      scenarioSessionId: activeScenarioSessionId,
      currentNodeId: currentScenarioNodeId,
      formData: formData,
      userInput: null, // 폼 제출 시 userInput은 null
      sourceHandle: null, // 폼 제출은 특정 핸들과 연결되지 않음
    });
  };

  // 그리드 행 클릭 핸들러
  const handleGridRowSelected = (gridElement, selectedRowData) => {
     const targetSlot = gridElement.selectSlot || "selectedRow";
     const updatedSlots = { ...activeScenario.slots, [targetSlot]: selectedRowData };

     handleScenarioResponse({
       scenarioSessionId: activeScenarioSessionId,
       currentNodeId: currentScenarioNodeId, // 현재 form 노드 ID
       sourceHandle: null, // 그리드 클릭은 특정 핸들과 연결되지 않음
       userInput: null, // 사용자 직접 입력 아님
       formData: updatedSlots, // 업데이트된 슬롯 전달 (selectSlot 포함)
     });
   };

  // --- 👇 [추가] hyh - link slot 새창이 아닌 현재창 링크 변경 함수 ---
  const PARENT_ORIGIN = process.env.NEXT_PUBLIC_PARENT_ORIGIN || "http://localhost:3000"; // 환경 변수 또는 기본값
  const connectParentLink = (url) => {
    try {
      if (!window.parent || window.parent === window) {
         console.warn("Not running inside an iframe or parent window is inaccessible.");
         window.open(url, '_blank', 'noopener,noreferrer'); // Fallback: 새 탭에서 열기
         return;
       }
      const msg = { action: "callScreenOpen", payload: { url: url } };
      window.parent.postMessage(msg, PARENT_ORIGIN);
      console.log(`Sent message to parent (${PARENT_ORIGIN}):`, msg);
    } catch (err) {
      console.error("Failed to send message to parent window:", err);
       window.open(url, '_blank', 'noopener,noreferrer'); // Fallback: 새 탭에서 열기
    }
  };
  // --- 👆 [추가] ---


  return (
    <div className={styles.scenarioChatContainer}> {/* ScenarioChat 최상위 컨테이너 */}
      <div className={styles.header}>
        <div className={styles.headerContent}>
          {/* 시나리오 제목 (보간 처리) */}
          <span className={styles.headerTitle}>
             {t("scenarioTitle")(interpolateMessage(scenarioId, activeScenario.slots))}
          </span>
        </div>
        <div className={styles.headerButtons}>
          {/* 패널 닫기(숨기기) 버튼 */}
          <button
            className={styles.headerRestartButton}
            onClick={(e) => { e.stopPropagation(); setActivePanel("main"); }}
          >
            {t("hide")}
          </button>
          {/* 시나리오 종료 버튼 (진행 중일 때만) */}
          {!isCompleted && (
            <button
              className={`${styles.headerRestartButton} ${styles.dangerButton}`}
              onClick={(e) => { e.stopPropagation(); endScenario(activeScenarioSessionId, 'canceled'); }}
            >
              {t("end")}
            </button>
          )}
        </div>
      </div>

      {/* 시나리오 메시지 기록 */}
      <div className={styles.history} ref={historyRef}>
        {scenarioMessages
          .filter(msg => msg.node?.type !== 'set-slot') // set-slot 노드는 표시 안 함
          .map((msg, index) => (
            <div
              // --- 👇 [수정] 키 생성 방식 개선 ---
              key={msg.id || `${activeScenarioSessionId}-msg-${index}`}
              // --- 👆 [수정] ---
              className={`${styles.messageRow} ${msg.sender === "user" ? styles.userRow : ""}`}
            >
              {/* 아바타 (봇 메시지) */}
              {msg.sender === "bot" && !msg.node?.type?.includes('form') && (
                 <LogoIcon className={styles.avatar} />
              )}

              {/* 메시지 버블 */}
              <div
                className={`GlassEffect ${styles.message} ${
                  msg.sender === "bot" ? styles.botMessage : styles.userMessage
                } ${ msg.node?.data?.elements?.some(el => el.type === 'grid') ? styles.gridMessage : '' }`}
              >
                {/* 메시지 내용 래퍼 */}
                <div className={ msg.node?.type === 'form' ? styles.scenarioFormMessageContentWrapper : styles.scenarioMessageContentWrapper }>
                    <div className={styles.messageContent}>
                       {/* 폼 렌더링 */}
                       {msg.node?.type === "form" ? (
                        <FormRenderer
                          node={msg.node}
                          onFormSubmit={handleFormSubmit}
                          disabled={isCompleted}
                          language={language}
                          slots={activeScenario.slots}
                          onGridRowClick={handleGridRowSelected}
                        />
                      /* iFrame 렌더링 */
                      ) : msg.node?.type === "iframe" ? (
                        <div className={styles.iframeContainer}>
                          <iframe
                            src={interpolateMessage(msg.node.data.url, activeScenario.slots)}
                            width={msg.node.data.width || "100%"}
                            height={msg.node.data.height || "250"}
                            style={{ border: "none", borderRadius: "8px" }}
                            title="chatbot-iframe"
                          ></iframe>
                        </div>
                      /* 링크 렌더링 */
                      ) : msg.node?.type === "link" ? (
                        <div>
                          {/* <span>Opening link: </span> */} {/* 문구 제거 또는 수정 */}
                           <a
                              href="#" // 실제 링크 대신 # 사용
                              onClick={(e) => {
                                 e.preventDefault(); // 기본 동작 방지
                                 connectParentLink(interpolateMessage(msg.node.data.content, activeScenario.slots));
                               }}
                              target="_self" // _self로 변경 (필수는 아님)
                              rel="noopener noreferrer"
                              className={styles.linkNode} // 링크 스타일 적용 클래스 추가
                            >
                            {interpolateMessage(msg.node.data.display || msg.node.data.content, activeScenario.slots)}
                             <OpenInNewIcon style={{ marginLeft: '4px', verticalAlign: 'middle', width: '16px', height: '16px' }} /> {/* 아이콘 추가 */}
                          </a>
                        </div>
                      /* 일반 텍스트 메시지 */
                      ) : (
                        <p>{interpolateMessage(msg.text || msg.node?.data?.content, activeScenario.slots)}</p>
                      )}

                      {/* Branch 버튼 렌더링 */}
                      {msg.node?.type === 'branch' && msg.node.data.replies && (
                        <div className={styles.scenarioList}>
                            {msg.node.data.replies.map(reply => {
                                const selectedOption = msg.selectedOption; // 메시지 자체에 저장된 선택 값
                                const interpolatedDisplayText = interpolateMessage(reply.display, activeScenario?.slots);
                                const isSelected = selectedOption === interpolatedDisplayText;
                                const isDimmed = selectedOption && !isSelected;

                                return (
                                <button
                                    key={reply.value}
                                    className={`${styles.optionButton} ${isSelected ? styles.selected : ''} ${isDimmed ? styles.dimmed : ''}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (selectedOption || isCompleted) return; // 이미 선택했거나 완료 시 무시
                                        // 선택 상태 로컬 + Firestore 업데이트
                                        // setScenarioSelectedOption은 Zustore 액션, get() 필요 없음
                                        setScenarioSelectedOption(activeScenarioSessionId, msg.node.id, interpolatedDisplayText);
                                        // 시나리오 진행
                                        handleScenarioResponse({
                                            scenarioSessionId: activeScenarioSessionId,
                                            currentNodeId: msg.node.id,
                                            sourceHandle: reply.value,
                                            userInput: interpolatedDisplayText // 선택한 텍스트도 전달
                                        });
                                    }}
                                    disabled={isCompleted || !!selectedOption} // 완료 또는 이미 선택 시 비활성화
                                >
                                    <span className={styles.optionButtonText}>{interpolatedDisplayText}</span>
                                    {/* Link 포함 여부에 따른 아이콘 분기 */}
                                     {interpolatedDisplayText.toLowerCase().includes("link") ? (
                                        <OpenInNewIcon style={{ color: 'currentColor' }} />
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

        {/* 로딩 인디케이터 */}
        {isScenarioLoading && (
           <div className={styles.messageRow}>
             <LogoIcon className={styles.avatar} />
             <div className={`${styles.message} ${styles.botMessage}`}>
               <div className={styles.scenarioMessageContentWrapper}>
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
  );
}