"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useChatStore } from "../store";
import { useTranslations } from "../hooks/useTranslations";
import styles from "./Chat.module.css";
import FavoritePanel from "./FavoritePanel";
import ScenarioBubble from "./ScenarioBubble";
import MoonIcon from "./icons/MoonIcon";

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
    isScenarioPanelOpen,
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
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;

    if (messages.length > 1 || isScenarioPanelOpen) {
      const scrollToBottom = () => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      };
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "childList" && !isFetchingMore) {
            scrollToBottom();
          }
        }
      });
      observer.observe(scrollContainer, { childList: true, subtree: true });
      scrollContainer.addEventListener("scroll", handleScroll);

      if (!isFetchingMore) {
        scrollToBottom();
      }

      return () => {
        observer.disconnect();
        scrollContainer.removeEventListener("scroll", handleScroll);
      };
    }
  }, [messages, handleScroll, isFetchingMore, isScenarioPanelOpen]);

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

  return (
    <div className={styles.chatContainer}>
      <div className={styles.header}>
        <div className={styles.headerContent}></div>
        <div className={styles.headerButtons}>
          {/* --- 👇 [수정된 부분] --- */}
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

      <div className={styles.history} ref={historyRef}>
        {messages.length <= 1 && !isScenarioPanelOpen ? (
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
            {messages
              .filter((msg) => msg.id !== "initial")
              .map((msg) => (
                <div
                  key={msg.id}
                  className={`${styles.messageRow} ${
                    msg.sender === "user" ? styles.userRow : ""
                  }`}
                  data-message-id={msg.scenarioSessionId || msg.id}
                >
                  {msg.sender === "bot" && (
                    <img
                      src="/images/avatar.png"
                      alt="Avatar"
                      className={styles.avatar}
                    />
                  )}
                  <div
                    className={`${styles.message} ${
                      msg.sender === "bot"
                        ? styles.botMessage
                        : styles.userMessage
                    }`}
                    onClick={() =>
                      msg.sender === "bot" &&
                      handleCopy(msg.text || msg.node?.data.content, msg.id)
                    }
                  >
                    {copiedMessageId === msg.id && (
                      <div className={styles.copyFeedback}>{t("copied")}</div>
                    )}

                    <p>{msg.text || msg.node?.data.content}</p>

                    {msg.sender === "bot" && msg.scenarios && (
                      <div className={styles.scenarioList}>
                        {msg.scenarios.map((name) => (
                          <button
                            key={name}
                            className={styles.optionButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              openScenarioPanel(name);
                            }}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            {isLoading && !isScenarioPanelOpen && (
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
        {isScenarioPanelOpen && <ScenarioBubble />}
      </div>
    </div>
  );
}
