// app/components/ChatInput.jsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../store";
import { useTranslations } from "../hooks/useTranslations";
import styles from "./ChatInput.module.css";
import StarIcon from "./icons/StarIcon";

const ChevronDownIcon = ({ size = 16, style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={style}
  >
    <path
      d="M6 9L12 15L18 9"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const useDraggableScroll = () => {
  const ref = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const onMouseDown = (e) => {
    setIsDragging(true);
    if (ref.current) {
      setStartX(e.pageX - ref.current.offsetLeft);
      setScrollLeft(ref.current.scrollLeft);
    }
  };
  const onMouseLeave = () => setIsDragging(false);
  const onMouseUp = () => setIsDragging(false);
  const onMouseMove = (e) => {
    if (!isDragging || !ref.current) return;
    e.preventDefault();
    const x = e.pageX - ref.current.offsetLeft;
    const walk = (x - startX) * 2;
    ref.current.scrollLeft = scrollLeft - walk;
  };
  return { ref, isDragging, onMouseDown, onMouseLeave, onMouseUp, onMouseMove };
};

export default function ChatInput() {
  const isLoading = useChatStore((state) => state.isLoading);
  const handleResponse = useChatStore((state) => state.handleResponse);
  const activePanel = useChatStore((state) => state.activePanel);
  const activeScenarioSessionId = useChatStore(
    (state) => state.activeScenarioSessionId
  );
  const scenarioStates = useChatStore((state) => state.scenarioStates);
  const handleScenarioResponse = useChatStore(
    (state) => state.handleScenarioResponse
  );
  const focusRequest = useChatStore((state) => state.focusRequest);
  const scenarioCategories = useChatStore((state) => state.scenarioCategories);
  const handleShortcutClick = useChatStore(
    (state) => state.handleShortcutClick
  );
  const shortcutMenuOpen = useChatStore((state) => state.shortcutMenuOpen);
  const setShortcutMenuOpen = useChatStore(
    (state) => state.setShortcutMenuOpen
  );
  const isScenarioPanelExpanded = useChatStore(
    (state) => state.isScenarioPanelExpanded
  );
  const openHistoryPanel = useChatStore((state) => state.openHistoryPanel);
  const mainInputPlaceholder = useChatStore(
    (state) => state.mainInputPlaceholder
  );
  const mainInputValue = useChatStore((state) => state.mainInputValue);
  const setMainInputValue = useChatStore((state) => state.setMainInputValue);
  
  const inputRef = useRef(null); // <textarea>를 참조

  const { t } = useTranslations();
  const quickRepliesSlider = useDraggableScroll();
  const menuRef = useRef(null);

  const activeScenario = activeScenarioSessionId
    ? scenarioStates[activeScenarioSessionId]
    : null;
  const isInputDisabled = isLoading;
  const currentScenarioNodeId = activeScenario?.state?.currentNodeId;

  const activeCategoryData =
    shortcutMenuOpen &&
    scenarioCategories.find((cat) => cat.name === shortcutMenuOpen);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShortcutMenuOpen(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [setShortcutMenuOpen]);

  useEffect(() => {
    if (!isInputDisabled) {
      inputRef.current?.focus();
    }
  }, [isInputDisabled, focusRequest, activePanel]);

  // --- 👇 [수정] 메시지 전송 로직 분리 및 순서 변경 ---
  const submitMessage = async () => {
    const input = mainInputValue.trim();
    if (!input || isLoading) return;

    // 1. 입력창 내용 및 높이 즉시 초기화 (UX 개선)
    setMainInputValue("");
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    // 2. 응답 처리 요청 (입력창 비운 후 실행)
    await handleResponse({ text: input });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    submitMessage();
  };

  const handleKeyDown = (e) => {
    // Shift + Enter가 아니면서 Enter 키만 눌렀을 때 전송
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
    // Shift + Enter는 기본 동작(줄바꿈)을 허용
  };

  const handleInputChange = (e) => {
    setMainInputValue(e.target.value);
    
    // Auto-resize logic
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'; // Reset height to recalculate
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`; // Set to scroll height
    }
  };
  // --- 👆 [수정] ---
  const handleItemClick = (item) => {
    handleShortcutClick(item);
    setShortcutMenuOpen(null);
  };

  return (
    <div className={styles.inputArea}>
      <div className={styles.quickActionsContainer} ref={menuRef}>
        {/* 1. 카테고리 버튼들 렌더링 */}
        {scenarioCategories.map((category) => (
          <div key={category.id || category.name} className={styles.categoryWrapper}>
            <button
              className={`GlassEffect ${styles.categoryButton} ${
                shortcutMenuOpen === category.name ? styles.active : ""
              }`}
              onClick={() => {
                const nextMenu =
                  shortcutMenuOpen === category.name ? null : category.name;
                setShortcutMenuOpen(nextMenu);
              }}
            >
              {category.name}{" "}
              <ChevronDownIcon
                style={{
                  transform:
                    shortcutMenuOpen === category.name
                      ? "rotate(180deg)"
                      : "rotate(0deg)",
                }}
              />
            </button>
          </div>
        ))}

        {/* 3. 활성화된 드롭다운 메뉴 (루프 밖에 단 하나만 렌더링) */}
        {activeCategoryData && (
          <div className={`GlassEffect ${styles.dropdownMenu}`}>
            {activeCategoryData.subCategories.map((subCategory) => (
              <div
                key={subCategory.title}
                className={styles.subCategorySection}
              >
                <h4 className={styles.subCategoryTitle}>
                  {subCategory.title}
                </h4>
                {subCategory.items.map((item) => {
                  return (
                    <div key={item.title} className={styles.dropdownItem}>
                      <div
                        className={styles.itemContentWrapper}
                        onClick={() => handleItemClick(item)}
                        role="button"
                        tabIndex="0"
                        onKeyDown={(e) =>
                          (e.key === "Enter" || e.key === " ") &&
                          handleItemClick(item)
                        }
                      >
                        <div className={styles.itemContent}>
                          <span className={styles.itemTitle}>
                            {item.title}
                          </span>
                          <span className={styles.itemDescription}>
                            {item.description}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      <form
        className={`${styles.inputForm} ${
          activePanel === "scenario" ? styles.deactive : ""
        }`}
        onSubmit={handleSubmit}
      >
        <textarea
          ref={inputRef}
          name="userInput"
          rows="1"
          className={styles.textInput}
          placeholder={mainInputPlaceholder || t("askAboutService")}
          autoComplete="off"
          disabled={isInputDisabled}
          value={mainInputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
        />
        <button
          type="submit"
          className={styles.sendButton}
          disabled={isInputDisabled}
        >
          Send
        </button>
      </form>
    </div>
  );
}