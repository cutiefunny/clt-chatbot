"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useChatStore } from "../store";
import { useTranslations } from "../hooks/useTranslations";
import styles from "./Chat.module.css";
import FavoritePanel from "./FavoritePanel";
import MoonIcon from "./icons/MoonIcon";
import LogoIcon from "./icons/LogoIcon";

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

    if (messages.length > 1) {
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
  }, [messages, handleScroll, isFetchingMore]);

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
        {messages.length <= 1 ? (
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
            {messages.map(
              (msg) =>
                msg.id !== "initial" && (
                  <div
                    key={msg.id}
                    className={`${styles.messageRow} ${
                      msg.sender === "user" ? styles.userRow : ""
                    }`}
                  >
                    <div
                      className={`${styles.message} ${
                        msg.sender === "bot"
                          ? styles.botMessage
                          : styles.userMessage
                      }`}
                    >
                      <div className={styles.messageContent}>
                        {msg.sender === "bot" && <LogoIcon />}
                        {copiedMessageId === msg.id && (
                          <div className={styles.copyFeedback}>
                            {t("copied")}
                          </div>
                        )}

                        {msg.type === "scenario_resume_prompt" ? (
                          <button
                            className={styles.optionButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              openScenarioPanel(
                                msg.scenarioId,
                                msg.scenarioSessionId
                              );
                            }}
                          >
                            {t("scenarioResume")(msg.scenarioId)}
                          </button>
                        ) : msg.type === "scenario_end_notice" ? (
                          <button
                            className={styles.optionButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              openScenarioPanel(
                                msg.scenarioId,
                                msg.scenarioSessionId
                              );
                            }}
                          >
                            {msg.text}
                          </button>
                        ) : (
                          <p>{msg.text || msg.node?.data.content}</p>
                        )}

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
                      <div className={styles.messageActionArea}>123123</div>
                    </div>
                  </div>
                )
            )}
            {messages[messages.length - 1]?.sender === "user" && (
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
