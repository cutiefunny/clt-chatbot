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
  // --- ▼ 수정 ▼ ---
  const enableFavorites = useChatStore((state) => state.enableFavorites);
  // --- ▲ 수정 ▲ ---

  const { t } = useTranslations();
  const inputRef = useRef(null);
  const quickRepliesSlider = useDraggableScroll();
  const menuRef = useRef(null);

  const activeScenario = activeScenarioSessionId
    ? scenarioStates[activeScenarioSessionId]
    : null;
  const isInputDisabled = isLoading;
  const currentScenarioNodeId = activeScenario?.state?.currentNodeId;

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

  // --- 👇 [수정된 부분 시작] ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    const input = e.target.elements.userInput.value;
    if (!input.trim() || isLoading) return;

    // activePanel 조건 제거하고 항상 메인 응답 함수(handleResponse) 호출
    await handleResponse({ text: input });

    e.target.reset();
  };
  // --- 👆 [수정된 부분 끝] ---

  const handleItemClick = (item) => {
    handleShortcutClick(item);
    setShortcutMenuOpen(null);
  };

  return (
    <div className={styles.inputArea}>
      <div className={styles.quickActionsContainer} ref={menuRef}>
        {scenarioCategories.map((category) => (
          <div key={category.name} className={styles.categoryWrapper}>
            <button
              className={`GlassEffect ${styles.categoryButton} ${
                shortcutMenuOpen === category.name ? styles.active : ""
              }`}
              onClick={() =>
                setShortcutMenuOpen(
                  shortcutMenuOpen === category.name ? null : category.name
                )
              }
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
            {shortcutMenuOpen === category.name && (
              <div className={`GlassEffect ${styles.dropdownMenu}`}>
                {category.subCategories.map((subCategory) => (
                  <div
                    key={subCategory.title}
                    className={styles.subCategorySection}
                  >
                    <h4 className={styles.subCategoryTitle}>
                      {subCategory.title}
                    </h4>
                    {subCategory.items.map((item) => {
                      const isFavorited = favorites.some(
                        (fav) =>
                          fav.action.type === item.action.type &&
                          fav.action.value === item.action.value
                      );
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
                            {/* --- ▼ 수정 ▼ --- */}
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
                            {/* --- ▲ 수정 ▲ --- */}
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
        ))}
      </div>

      <form
        className={`${styles.inputForm} ${
          activePanel === "scenario" ? styles.deactive : ""
        }`}
        onSubmit={handleSubmit}
      >
        <input
          ref={inputRef}
          name="userInput"
          className={styles.textInput}
          placeholder={
            activePanel === "scenario"
              ? t("enterResponse")
              : t("askAboutService")
          }
          autoComplete="off"
          disabled={isInputDisabled}
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