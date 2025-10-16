"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useChatStore } from "../store";
import { useTranslations } from "../hooks/useTranslations";
import styles from "./Chat.module.css";
import FavoritePanel from "./FavoritePanel";
import ScenarioBubble from "./ScenarioBubble";
import MoonIcon from "./icons/MoonIcon";
import CopyIcon from "./icons/CopyIcon";
import LikeIcon from "./icons/LikeIcon";
import LogoIcon from "./icons/LogoIcon";

const MessageWithButtons = ({ text, messageId }) => {
  const {
    handleShortcutClick,
    scenarioCategories,
    selectedOptions,
  } = useChatStore();
  const selectedOption = selectedOptions[messageId];

  const findShortcutByTitle = useCallback(
    (title) => {
      if (!scenarioCategories) return null;
      for (const category of scenarioCategories) {
        for (const subCategory of category.subCategories) {
          const item = subCategory.items.find((i) => i.title === title);
          if (item) return item;
        }
      }
      return null;
    },
    [scenarioCategories]
  );

  if (!text) return null;

  const regex = /\[BUTTON:(.+?)\]/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        content: text.substring(lastIndex, match.index),
      });
    }
    parts.push({ type: "button", content: match[1] });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", content: text.substring(lastIndex) });
  }

  if (parts.length === 0) {
    return <p>{text}</p>;
  }

  return (
    <div>
      {parts.map((part, index) => {
        if (part.type === "text") {
          return <span key={index}>{part.content}</span>;
        } else if (part.type === "button") {
          const buttonText = part.content;
          const shortcutItem = findShortcutByTitle(buttonText);
          const isSelected = selectedOption === buttonText;
          const isDimmed = selectedOption && !isSelected;

          if (shortcutItem) {
            return (
              <button
                key={index}
                className={`${styles.optionButton} ${
                  isSelected ? styles.selected : ""
                } ${isDimmed ? styles.dimmed : ""}`}
                style={{ margin: "4px 4px 4px 0", display: "block" }}
                onClick={() => handleShortcutClick(shortcutItem, messageId)} // --- 👈 [수정] async/await 제거
                disabled={!!selectedOption}
              >
                {buttonText}
              </button>
            );
          }
          return `[BUTTON:${part.content}]`;
        }
        return null;
      })}
    </div>
  );
};

export default function Chat() {
  const {
    messages,
    isLoading,
    openScenarioPanel,
    loadMoreMessages,
    hasMoreMessages,
    theme,
    setTheme,
    fontSize,
    setFontSize,
    scrollToMessageId,
    setScrollToMessageId,
    activePanel,
    forceScrollToBottom,
    setForceScrollToBottom,
    scrollAmount,
    resetScroll,
    selectedOptions,
    setSelectedOption,
    dimUnfocusedPanels,
  } = useChatStore();
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const historyRef = useRef(null);
  const { t } = useTranslations();

  const handleScroll = useCallback(async () => {
    if (
      historyRef.current?.scrollTop === 0 &&
      hasMoreMessages &&
      !isFetchingMore
    ) {
      setIsFetchingMore(true);
      await loadMoreMessages();
      setIsFetchingMore(false);
    }
  }, [hasMoreMessages, isFetchingMore, loadMoreMessages]);

  useEffect(() => {
    if (forceScrollToBottom && historyRef.current) {
      const scrollContainer = historyRef.current;
      setTimeout(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        setForceScrollToBottom(false);
      }, 0);
    }
  }, [forceScrollToBottom, setForceScrollToBottom]);

  useEffect(() => {
    if (scrollAmount && historyRef.current) {
      historyRef.current.scrollBy({
        top: scrollAmount,
        behavior: "smooth",
      });
      resetScroll();
    }
  }, [scrollAmount, resetScroll]);

  useEffect(() => {
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;

    const handleScrollEvent = () => handleScroll();

    const lastMessage = messages[messages.length - 1];
    const isUserMessage = lastMessage?.sender === "user";

    const isScrolledNearBottom =
      scrollContainer.scrollHeight -
        scrollContainer.clientHeight -
        scrollContainer.scrollTop <
      100;

    if (isUserMessage || isScrolledNearBottom) {
      setTimeout(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }, 0);
    }

    scrollContainer.addEventListener("scroll", handleScrollEvent);
    return () => {
      scrollContainer.removeEventListener("scroll", handleScrollEvent);
    };
  }, [messages, handleScroll]);

  useEffect(() => {
    if (scrollToMessageId && historyRef.current) {
      const element = historyRef.current.querySelector(
        `[data-message-id="${scrollToMessageId}"]`
      );
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.classList.add(styles.highlightedMessage);
        setTimeout(() => {
          element.classList.remove(styles.highlightedMessage);
        }, 800);
        setScrollToMessageId(null);
      }
    }
  }, [scrollToMessageId, messages, setScrollToMessageId]);

  const handleCopy = (text, id) => {
    if (!text || text.trim() === "") return;

    navigator.clipboard.writeText(text).then(() => {
      setCopiedMessageId(id);
      setTimeout(() => setCopiedMessageId(null), 1500);
    });
  };

  const hasMessages = messages.some((m) => m.id !== "initial");

  return (
    <div className={styles.chatContainer}>
      <div className={styles.header}>
        <div className={styles.headerContent}></div>
        <div className={styles.headerButtons}>
          <div className={styles.settingControl}>
            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={fontSize === "default"}
                onChange={() =>
                  setFontSize(fontSize === "default" ? "small" : "default")
                }
              />
              <span className={styles.slider}></span>
            </label>
            <span className={styles.settingLabel}>Large text</span>
          </div>

          <div>
            <button
              className={styles.themeToggleButton}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              <MoonIcon />
            </button>
          </div>
        </div>
      </div>

      <div
        className={`${styles.history} ${
          activePanel === "scenario" && dimUnfocusedPanels ? styles.mainChatDimmed : ""
        }`}
        ref={historyRef}
      >
        {!hasMessages ? (
          <FavoritePanel />
        ) : (
          <>
            {isFetchingMore && (
              <div className={styles.messageRow}>
                <img
                  src="/images/avatar-loading.png"
                  alt="Avatar"
                  className={styles.avatar}
                />
                <div className={`${styles.message} ${styles.botMessage}`}>
                  <img
                    src="/images/Loading.gif"
                    alt={t("loading")}
                    style={{ width: "40px", height: "30px" }}
                  />
                </div>
              </div>
            )}
            {messages.map((msg) => {
              if (msg.id === "initial") return null;

              if (msg.type === "scenario_bubble") {
                return (
                  <div key={msg.id} data-message-id={msg.scenarioSessionId}>
                    <ScenarioBubble
                      scenarioSessionId={msg.scenarioSessionId}
                    />
                  </div>
                );
              }

              const selectedOption = selectedOptions[msg.id];

              return (
                <div
                  key={msg.id}
                  className={`${styles.messageRow} ${
                    msg.sender === "user" ? styles.userRow : ""
                  }`}
                  data-message-id={msg.id}
                >
                  <div
                    className={`GlassEffect ${styles.message} ${
                      msg.sender === "bot"
                        ? styles.botMessage
                        : styles.userMessage
                    }`}
                  >
                    {copiedMessageId === msg.id && (
                      <div className={styles.copyFeedback}>{t("copied")}</div>
                    )}
                    <div className={styles.messageContentWrapper}>
                      {msg.sender === "bot" && <LogoIcon />}
                      <div className={styles.messageContent}>
                        {msg.text && (
                          <MessageWithButtons text={msg.text} messageId={msg.id} />
                        )}
                        {msg.sender === "bot" && msg.scenarios && (
                          <div className={styles.scenarioList}>
                            {msg.scenarios.map((name) => { // --- 👈 [수정] async 제거
                              const isSelected = selectedOption === name;
                              const isDimmed = selectedOption && !isSelected;
                              return (
                                <button
                                  key={name}
                                  className={`${styles.optionButton} ${
                                    isSelected ? styles.selected : ""
                                  } ${isDimmed ? styles.dimmed : ""}`}
                                  onClick={(e) => { // --- 👈 [수정] async/await 제거
                                    e.stopPropagation();
                                    setSelectedOption(msg.id, name);
                                    openScenarioPanel(name);
                                  }}
                                  disabled={!!selectedOption}
                                >
                                  {name}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    {msg.sender === "bot" && (
                      <div className={styles.messageActionArea}>
                        <button
                          className={styles.actionButton}
                          onClick={() =>
                            handleCopy(
                              msg.text || msg.node?.data.content,
                              msg.id
                            )
                          }
                        >
                          <CopyIcon />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {isLoading && (
              <div className={styles.messageRow}>
                <img
                  src="/images/avatar-loading.png"
                  alt="Avatar"
                  className={styles.avatar}
                />
                <div className={`${styles.message} ${styles.botMessage}`}>
                  <img
                    src="/images/Loading.gif"
                    alt={t("loading")}
                    style={{ width: "40px", height: "30px" }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}