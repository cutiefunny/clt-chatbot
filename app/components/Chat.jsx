"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useChatStore } from "../store";
import { useTranslations } from "../hooks/useTranslations";
import styles from "./Chat.module.css";
import FavoritePanel from "./FavoritePanel";
import MoonIcon from "./icons/MoonIcon";
import LogoIcon from "./icons/LogoIcon";
import CopyIcon from "./icons/CopyIcon";
import LikeIcon from "./icons/LikeIcon";

const ScenarioStatusMessage = ({ msg }) => {
  const { scenarioStates, openScenarioPanel } = useChatStore();
  const { t } = useTranslations();
  const scenario = scenarioStates[msg.scenarioSessionId];

  // --- 👇 [수정된 부분] ---
  const getStatusInfo = (status) => {
    switch (status) {
      case "active":
        return { text: t("statusActive"), className: styles.statusActive };
      case "completed":
        return {
          text: t("statusCompleted"),
          className: styles.statusCompleted,
        };
      case "failed":
        return { text: t("statusFailed"), className: styles.statusFailed };
      case "generating":
        return {
          text: t("statusGenerating"),
          className: styles.statusGenerating,
        };
      default:
        return { text: t("loading"), className: "" };
    }
  };
  // --- 👆 [여기까지] ---

  const statusInfo = getStatusInfo(scenario?.status);

  return (
    <div className={styles.scenarioStatusMessage}>
      <p>{msg.text}</p>
      <div className={styles.statusContainer}>
        <span>{t("scenarioStatus")}</span>
        <span className={`${styles.statusBadge} ${statusInfo.className}`}>
          {statusInfo.text}
        </span>
      </div>
      <button
        className={styles.optionButton}
        onClick={(e) => {
          e.stopPropagation();
          openScenarioPanel(msg.scenarioId, msg.scenarioSessionId);
        }}
      >
        {t("scenarioResume")(msg.scenarioId)}
      </button>
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
  } = useChatStore();
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const historyRef = useRef(null);
  const { t } = useTranslations();

  // --- 👇 [로그 추가] ---
  console.log("[Chat.jsx] Rendering with messages:", messages);

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
                    data-message-id={msg.scenarioSessionId || msg.id}
                  >
                    <div
                      className={`GlassEffect ${
                        msg.sender === "bot" && "active"
                      } ${styles.message} ${
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
                          {msg.type === "scenario_start_notice" ? (
                            <ScenarioStatusMessage msg={msg} />
                          ) : msg.type === "scenario_resume_prompt" ? (
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
                      </div>

                      {msg.sender === "bot" && (
                        <div className={styles.messageActionArea}>
                          <button
                            className={styles.actionButton}
                            onClick={() => handleCopy(msg.text, msg.id)}
                            aria-label="Copy"
                          >
                            <CopyIcon />
                          </button>
                          <button
                            className={styles.actionButton}
                            aria-label="Like"
                          >
                            <LikeIcon />
                          </button>
                          <button
                            className={styles.actionButton}
                            aria-label="Dislike"
                            style={{ transform: "rotate(180deg)" }}
                          >
                            <LikeIcon />
                          </button>
                        </div>
                      )}
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
