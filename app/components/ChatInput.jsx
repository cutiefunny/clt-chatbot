// app/components/ChatInput.jsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../store";
import { useTranslations } from "../hooks/useTranslations";
import styles from "./ChatInput.module.css";
import PaperclipIcon from "./icons/PaperclipIcon";

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

export default function ChatInput() {
  const isLoading = useChatStore((state) => state.isLoading);
  const handleResponse = useChatStore((state) => state.handleResponse);
  const activePanel = useChatStore((state) => state.activePanel);
  const scenarioCategories = useChatStore((state) => state.scenarioCategories);
  const handleShortcutClick = useChatStore(
    (state) => state.handleShortcutClick
  );
  const shortcutMenuOpen = useChatStore((state) => state.shortcutMenuOpen);
  const setShortcutMenuOpen = useChatStore(
    (state) => state.setShortcutMenuOpen
  );
  const mainInputPlaceholder = useChatStore(
    (state) => state.mainInputPlaceholder
  );
  const mainInputValue = useChatStore((state) => state.mainInputValue);
  const setMainInputValue = useChatStore((state) => state.setMainInputValue);
  const focusRequest = useChatStore((state) => state.focusRequest);

  const inputRef = useRef(null);
  const { t } = useTranslations();
  const menuRef = useRef(null);

  const isInputDisabled = isLoading;

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
    if (inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [focusRequest, isLoading]);

  const submitMessage = async () => {
    const input = mainInputValue.trim();
    if (!input || isLoading) return;

    setMainInputValue("");
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    await handleResponse({ text: input });
    if (inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
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

  const handleItemClick = (item) => {
    handleShortcutClick(item);
    setShortcutMenuOpen(null);
  };

  return (
    <div className={styles.inputArea}>
      <div className={styles.quickActionsContainer} ref={menuRef}>
        {scenarioCategories.map((category) => (
          <div key={category.id || category.name} className={styles.categoryWrapper}>
            <button
              className={`${styles.categoryButton} ${shortcutMenuOpen === category.name ? styles.active : ""
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
        className={`${styles.inputForm} ${activePanel === "scenario" ? styles.deactive : ""
          }`}
        onSubmit={handleSubmit}
      >
        <div className={styles.inputWrapper}>
          <button type="button" className={styles.attachButton}>
            <PaperclipIcon />
          </button>
          <textarea
            ref={inputRef}
            name="userInput"
            rows="1"
            className={styles.textInput}
            placeholder={mainInputPlaceholder || t("askAboutService")}
            autoComplete="off"
            autoFocus
            value={mainInputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
          />
        </div>
        <button
          type="submit"
          className={styles.sendButton}
          disabled={isInputDisabled}
          style={{ display: 'none' }}
        >
          Send
        </button>
      </form>
    </div>
  );
}