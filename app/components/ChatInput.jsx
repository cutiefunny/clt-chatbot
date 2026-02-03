// app/components/ChatInput.jsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../store";
import { useTranslations } from "../hooks/useTranslations";
// 👇 [추가] 대화 생성 훅 임포트
import { useCreateConversation } from "../hooks/useQueries"; 
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
  
  // 👇 [추가] 현재 대화 ID와 로드 함수 가져오기
  const currentConversationId = useChatStore((state) => state.currentConversationId);
  const loadConversation = useChatStore((state) => state.loadConversation);

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
  const favorites = useChatStore((state) => state.favorites);
  const toggleFavorite = useChatStore((state) => state.toggleFavorite);
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
  const enableFavorites = useChatStore((state) => state.enableFavorites);
  const mainInputValue = useChatStore((state) => state.mainInputValue);
  const setMainInputValue = useChatStore((state) => state.setMainInputValue);
  
  const inputRef = useRef(null); 

  const { t } = useTranslations();
  // 👇 [추가] 대화 생성 뮤테이션
  const createMutation = useCreateConversation(); 

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

  // --- 👇 [수정] 메시지 전송 로직 (대화방 자동 생성 추가) ---
  const submitMessage = async () => {
    const input = mainInputValue.trim();
    if (!input || isLoading) return;

    // 1. 입력창 내용 및 높이 즉시 초기화
    setMainInputValue("");
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    // 2. 대화방이 없으면 자동으로 생성
    if (!currentConversationId) {
      try {
        const newConvo = await createMutation.mutateAsync("New Chat");
        if (newConvo && newConvo.id) {
          // 생성된 대화방 로드 (ID를 스토어에 설정)
          await loadConversation(newConvo.id);
        }
      } catch (error) {
        console.error("Failed to create conversation automatically:", error);
        return; // 생성 실패 시 중단
      }
    }

    // 3. 응답 처리 요청 (이제 ID가 있으므로 안전함)
    await handleResponse({ text: input });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    submitMessage();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
  };

  const handleInputChange = (e) => {
    setMainInputValue(e.target.value);
    
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'; 
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`; 
    }
  };
  // --- 👆 [수정 완료] ---

  const handleItemClick = (item) => {
    handleShortcutClick(item);
    setShortcutMenuOpen(null);
  };

  return (
    <div className={styles.inputArea}>
      <div className={styles.quickActionsContainer} ref={menuRef}>
        {/* 1. 카테고리 버튼들 렌더링 - key 값에 index 추가하여 고유성 보장 */}
        {scenarioCategories.map((category, idx) => (
          <div key={`cat-${category.name}-${idx}`} className={styles.categoryWrapper}>
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

        {/* 3. 활성화된 드롭다운 메뉴 */}
        {activeCategoryData && (
          <div className={`GlassEffect ${styles.dropdownMenu}`}>
            {activeCategoryData.subCategories.map((subCategory, sIdx) => (
              <div
                key={`sub-${subCategory.title}-${sIdx}`}
                className={styles.subCategorySection}
              >
                <h4 className={styles.subCategoryTitle}>
                  {subCategory.title}
                </h4>
                {subCategory.items.map((item, iIdx) => {
                  const isFavorited = favorites.some(
                    (fav) =>
                      fav.action.type === item.action.type &&
                      fav.action.value === item.action.value
                  );
                  return (
                    <div key={`item-${item.title}-${iIdx}`} className={styles.dropdownItem}>
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
                        {enableFavorites && (
                          <button
                            className={`${styles.favoriteButton} ${
                              isFavorited ? styles.favorited : ""
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(item);
                            }}
                          >
                            <StarIcon size={18} filled={isFavorited} />
                          </button>
                        )}
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