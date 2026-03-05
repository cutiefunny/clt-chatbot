// app/components/Chat.jsx
"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useChatStore } from "../store";
import { useTranslations } from "../hooks/useTranslations";
import { useAutoScroll } from "../hooks/useAutoScroll";
import styles from "./Chat.module.css";
import MoonIcon from "./icons/MoonIcon";
import LogoIcon from "./icons/LogoIcon";
import ChatMessageItem from "./chat/ChatMessageItem";

export default function Chat() {
  const messages = useChatStore((state) => state.messages);
  const isLoading = useChatStore((state) => state.isLoading);
  const openScenarioPanel = useChatStore((state) => state.openScenarioPanel);
  const loadMoreMessages = useChatStore((state) => state.loadMoreMessages);
  const hasMoreMessages = useChatStore((state) => state.hasMoreMessages);
  const theme = useChatStore((state) => state.theme);
  const setTheme = useChatStore((state) => state.setTheme);
  const fontSize = useChatStore((state) => state.fontSize);
  const setFontSize = useChatStore((state) => state.setFontSize);
  const scrollToMessageId = useChatStore((state) => state.scrollToMessageId);
  const setScrollToMessageId = useChatStore((state) => state.setScrollToMessageId);
  const activePanel = useChatStore((state) => state.activePanel);
  const focusChatInput = useChatStore((state) => state.focusChatInput);
  const forceScrollToBottom = useChatStore((state) => state.forceScrollToBottom);
  const setForceScrollToBottom = useChatStore((state) => state.setForceScrollToBottom);
  const scrollAmount = useChatStore((state) => state.scrollAmount);
  const resetScroll = useChatStore((state) => state.resetScroll);
  const selectedOptions = useChatStore((state) => state.selectedOptions);
  const setSelectedOption = useChatStore((state) => state.setSelectedOption);
  const dimUnfocusedPanels = useChatStore((state) => state.dimUnfocusedPanels);
  // const setMessageFeedback = useChatStore((state) => state.setMessageFeedback);
  const showScenarioBubbles = useChatStore((state) => state.showScenarioBubbles);

  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  // const [animatedButton, setAnimatedButton] = useState(null);
  const containerRef = useRef(null);
  const { t } = useTranslations();

  // [리팩토링] 커스텀 스크롤 훅 사용 (기존 historyRef, wasAtBottomRef 대체)
  const { scrollRef, scrollToBottom, enableSmoothScroll } = useAutoScroll(messages, isLoading);

  const handleHistoryClick = () => {
    if (activePanel === "scenario") {
      focusChatInput();
    }
  };

  // [리팩토링] '이전 메시지 불러오기' 전용 스크롤 핸들러
  const handleFetchMoreScroll = useCallback(async () => {
    if (
      scrollRef.current?.scrollTop === 0 &&
      hasMoreMessages &&
      !isFetchingMore
    ) {
      setIsFetchingMore(true);
      const initialHeight = scrollRef.current.scrollHeight;
      await loadMoreMessages();
      // 메시지 로드 후 스크롤 위치 복원
      if (scrollRef.current) {
        const newHeight = scrollRef.current.scrollHeight;
        scrollRef.current.scrollTop = newHeight - initialHeight;
      }
      setIsFetchingMore(false);
    }
  }, [hasMoreMessages, isFetchingMore, loadMoreMessages, scrollRef]);

  // [리팩토링] Fetch More 핸들러 연결
  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    scrollContainer.addEventListener('scroll', handleFetchMoreScroll);
    return () => {
      scrollContainer.removeEventListener('scroll', handleFetchMoreScroll);
    };
  }, [handleFetchMoreScroll, scrollRef]);


  // [리팩토링] Force Scroll to Bottom 처리 (Store 상태 연동)
  useEffect(() => {
    if (forceScrollToBottom) {
      enableSmoothScroll();
      scrollToBottom("smooth");
      setForceScrollToBottom(false);
    }
  }, [forceScrollToBottom, setForceScrollToBottom, scrollToBottom, enableSmoothScroll]);

  // [리팩토링] Store의 scrollAmount 처리 (수동 스크롤 조정)
  useEffect(() => {
    if (scrollAmount && scrollRef.current) {
      scrollRef.current.scrollBy({ top: scrollAmount, behavior: "smooth" });
      resetScroll();
    }
  }, [scrollAmount, resetScroll, scrollRef]);

  // [리팩토링] 특정 메시지로 스크롤 (검색 결과 등)
  useEffect(() => {
    if (scrollToMessageId && scrollRef.current) {
      const element = scrollRef.current.querySelector(
        `[data-message-id="${scrollToMessageId}"]`
      );
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.classList.add(styles.highlightedMessage);
        setTimeout(() => {
          element.classList.remove(styles.highlightedMessage);
        }, 800);
        setScrollToMessageId(null);
      } else {
        console.warn(
          `Element with data-message-id="${scrollToMessageId}" not found in main chat.`
        );
        setScrollToMessageId(null);
      }
    }
  }, [scrollToMessageId, messages, setScrollToMessageId, scrollRef]);

  // 채팅 영역 외부 스크롤 시 채팅 내용 스크롤 (마우스 휠)
  useEffect(() => {
    const container = containerRef.current;
    const scrollTarget = scrollRef.current; // historyRef 대신 scrollRef 사용
    if (!container || !scrollTarget) return;

    const handleWheelOutsideHistory = (event) => {
      if (event.defaultPrevented) return;
      const withinHistory = event.target.closest(`.${styles.history}`);
      if (withinHistory) return;

      scrollTarget.scrollBy({
        top: event.deltaY,
        left: event.deltaX,
        behavior: "auto",
      });
      // 훅 내부에서 scroll 이벤트를 감지하여 updateWasAtBottom을 수행하므로 별도 호출 불필요
      event.preventDefault();
    };

    container.addEventListener("wheel", handleWheelOutsideHistory, {
      passive: false,
    });
    return () => {
      container.removeEventListener("wheel", handleWheelOutsideHistory);
    };
  }, [scrollRef]);


  const handleCopy = (text, id) => {
    let textToCopy = text;
    if (typeof text === "object" && text !== null) {
      try {
        textToCopy = JSON.stringify(text, null, 2);
      } catch (e) {
        console.error("Failed to stringify object for copying:", e);
        return;
      }
    }
    if (
      !textToCopy ||
      (typeof textToCopy === "string" && textToCopy.trim() === "")
    )
      return;

    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedMessageId(id);
      setTimeout(() => setCopiedMessageId(null), 1500);
    });
  };

  // const handleFeedbackClick = (messageId, type) => {
  //   setAnimatedButton({ messageId, type });
  //   setMessageFeedback(messageId, type);
  //   setTimeout(() => {
  //     setAnimatedButton(null);
  //   }, 300);
  // };

  const hasMessages = messages.some((m) => m.id !== "initial");

  return (
    <div className={styles.chatContainer} ref={containerRef}>
      <div className={styles.header}>
        <div className={styles.headerButtons}>
          <div className={styles.settingControl} style={{ display: "none" }}>
            <span className={styles.settingLabel}>Large text</span>
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
          </div>
          <div className={styles.separator} style={{ display: "none" }}></div>
          <div style={{ display: "none" }}>
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
        className={`${styles.history} ${activePanel === "scenario" && dimUnfocusedPanels
            ? styles.mainChatDimmed
            : ""
          }`} ref={scrollRef} // [리팩토링] 훅에서 반환된 ref 연결
        onClick={handleHistoryClick}
      >
        {!hasMessages ? null : (
          <>
            {isFetchingMore && (
              <div className={styles.messageRow}>
                <div className={`${styles.message} ${styles.botMessage} `}>
                  <div className={styles.messageContentWrapper}>
                    <LogoIcon />
                    <div className={styles.messageContent}>
                      <img
                        src="/images/Loading.gif"
                        alt={"loading"}
                        style={{ width: "60px", height: "45px" }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
            {messages.map((msg, index) => {
              if (msg.id === "initial") return null;

              const isStreaming =
                index === messages.length - 1 &&
                msg.sender === "bot" &&
                msg.isStreaming === true;

              return (
                <ChatMessageItem
                  key={msg.id || msg.scenarioSessionId || index}
                  msg={msg}
                  isStreaming={isStreaming}
                  copiedMessageId={copiedMessageId}
                  handleCopy={handleCopy}
                />
              );
            })}
            {isLoading && !messages[messages.length - 1]?.isStreaming && (
              <div className={styles.messageRow}>
                <div className={`${styles.message} ${styles.botMessage}`}>
                  <div className={styles.messageContentWrapper}>
                    <LogoIcon />
                    <div className={styles.messageContent}>
                      <img
                        src="/images/Loading.gif"
                        alt={"loading"}
                        style={{ width: "60px", height: "45px" }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}