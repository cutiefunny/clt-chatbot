// app/components/Chat.jsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useChatStore } from "../store";
import { useTranslations } from "../hooks/useTranslations";
import styles from "./Chat.module.css";
import FavoritePanel from "./FavoritePanel";
import ScenarioBubble from "./ScenarioBubble";
import CheckCircle from "./icons/CheckCircle";
import MoonIcon from "./icons/MoonIcon";
import LogoIcon from "./icons/LogoIcon";
import CopyIcon from "./icons/CopyIcon";
import MarkdownRenderer from "./MarkdownRenderer"; // --- 👈 [추가] ---

// JSON 파싱 및 렌더링을 위한 헬퍼 함수
const tryParseJson = (text) => {
  try {
    if (
      typeof text === "string" &&
      text.startsWith("{") &&
      text.endsWith("}")
    ) {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    }
  } catch (e) {
    // JSON 파싱 실패 시 무시
  }
  return null;
};

// isStreaming prop 추가
const MessageWithButtons = ({ text, messageId, isStreaming }) => {
  const { handleShortcutClick, scenarioCategories, selectedOptions } =
    useChatStore();
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

  // 텍스트가 null/undefined일 경우 렌더링 방지
  if (text === null || text === undefined) return null;

  // "Loop back to Supervisor" 포함 여부 확인
  const showLoadingGifForLoopback =
    typeof text === "string" && text.includes("Loop back to Supervisor");
  if (showLoadingGifForLoopback) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
        }}
      >
        <span>init flow..</span>
        <img
          src="/images/Loading.gif"
          alt="Loading..."
          style={{ width: "60px", height: "45px", marginTop: "8px" }}
        />
      </div>
    );
  }

  // JSON 메시지 처리 로직
  const jsonContent = tryParseJson(text);
  if (jsonContent && jsonContent.next && jsonContent.instructions) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
        }}
      >
        <span>{jsonContent.instructions}</span>
        <img
          src="/images/Loading.gif"
          alt="Loading..."
          style={{ width: "60px", height: "45px", marginTop: "8px" }}
        />
      </div>
    );
  }

  // 버튼 파싱 및 렌더링 로직
  const regex = /\[BUTTON:(.+?)\]/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  if (typeof text === "string") {
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
    // 남은 텍스트 추가 (빈 문자열일 수도 있음)
    parts.push({ type: "text", content: text.substring(lastIndex) });
  } else {
    // 텍스트가 문자열이 아닌 경우 (예: 오류 객체 등), 문자열로 변환하여 표시
    try {
      parts.push({ type: "text", content: JSON.stringify(text) });
    } catch (e) {
      parts.push({ type: "text", content: String(text) });
    }
  }

  return (
    <div>
      {parts.map((part, index) => {
        if (part.type === "text") {
          // 텍스트 내용이 비어있지 않을 때만 렌더링
          // --- 👇 [수정] span 대신 MarkdownRenderer 사용 ---
          return part.content ? (
            <MarkdownRenderer key={index} content={part.content} />
          ) : null;
          // --- 👆 [수정] ---
        } else if (part.type === "button") {
          // 버튼 렌더링 로직
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
                onClick={() => handleShortcutClick(shortcutItem, messageId)}
                disabled={!!selectedOption}
              >
                {buttonText}
              </button>
            );
          }
          // 찾을 수 없는 버튼은 텍스트로 표시
          return <span key={index}>{`[BUTTON:${part.content}]`}</span>;
        }
        return null;
      })}
      {/* isStreaming이 true일 때 로딩 GIF 추가 */}
      {isStreaming && (
        <img
          src="/images/Loading.gif"
          alt="Loading..."
          style={{
            width: "60px",
            height: "45px",
            marginLeft: "8px",
            verticalAlign: "middle",
          }}
        />
      )}
    </div>
  );
};

export default function Chat() {
  const {
    messages,
    isLoading, // isLoading은 전체 로딩 상태, isStreaming은 개별 메시지 스트리밍 상태
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
    // --- 👇 [수정] setActivePanel 대신 focusChatInput 가져오기 ---
    focusChatInput,
    // --- 👆 [수정] ---
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
  const containerRef = useRef(null);
  const wasAtBottomRef = useRef(true);
  const { t } = useTranslations();

  // --- 👇 [수정] 시나리오 패널 닫기 핸들러 -> 포커스 핸들러로 변경 ---
  const handleHistoryClick = () => {
    if (activePanel === "scenario") {
      // setActivePanel("main"); // 패널을 닫는 대신
      focusChatInput(); // 포커스만 이동
    }
  };
  // --- 👆 [수정] ---

  // 스크롤 관련 함수 및 useEffect들
  const updateWasAtBottom = useCallback(() => {
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;
    const scrollableDistance =
      scrollContainer.scrollHeight -
      scrollContainer.clientHeight -
      scrollContainer.scrollTop;
    wasAtBottomRef.current = scrollableDistance <= 100; // 스크롤 감지 여유 추가
  }, []);

  const handleScroll = useCallback(async () => {
    if (
      historyRef.current?.scrollTop === 0 &&
      hasMoreMessages &&
      !isFetchingMore
    ) {
      setIsFetchingMore(true);
      const initialHeight = historyRef.current.scrollHeight;
      await loadMoreMessages();
      // 메시지 로드 후 스크롤 위치 복원
      if (historyRef.current) {
        const newHeight = historyRef.current.scrollHeight;
        historyRef.current.scrollTop = newHeight - initialHeight;
      }
      setIsFetchingMore(false);
    }
  }, [hasMoreMessages, isFetchingMore, loadMoreMessages]);

  useEffect(() => {
    if (forceScrollToBottom && historyRef.current) {
      const scrollContainer = historyRef.current;
      setTimeout(() => {
        // DOM 업데이트 후 스크롤 실행 보장
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        setForceScrollToBottom(false);
        wasAtBottomRef.current = true; // 강제 스크롤 후엔 맨 아래에 있는 것으로 간주
      }, 0);
    }
  }, [forceScrollToBottom, setForceScrollToBottom]);

  useEffect(() => {
    if (scrollAmount && historyRef.current) {
      historyRef.current.scrollBy({ top: scrollAmount, behavior: "smooth" });
      updateWasAtBottom(); // 스크롤 후 위치 업데이트
      resetScroll();
    }
  }, [scrollAmount, resetScroll, updateWasAtBottom]);

  useEffect(() => {
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;
    const handleScrollEvent = () => {
      updateWasAtBottom(); // 스크롤 시 항상 위치 업데이트
      handleScroll(); // 이전 메시지 로드 체크
    };
    updateWasAtBottom(); // 초기 상태 설정
    scrollContainer.addEventListener("scroll", handleScrollEvent);
    return () => {
      scrollContainer.removeEventListener("scroll", handleScrollEvent);
    };
  }, [handleScroll, updateWasAtBottom]);

  useEffect(() => {
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;
    const lastMessage = messages[messages.length - 1];
    // 사용자가 입력했거나, 맨 아래에 있었을 경우 자동 스크롤
    const shouldAutoScroll =
      lastMessage?.sender === "user" || wasAtBottomRef.current;
    if (!shouldAutoScroll) return;

    // requestAnimationFrame 사용하여 다음 렌더링 프레임에서 스크롤 실행
    requestAnimationFrame(() => {
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        wasAtBottomRef.current = true; // 자동 스크롤 후엔 맨 아래에 있는 것으로 간주
      }
    });
  }, [messages]); // messages 배열이 변경될 때마다 실행

  useEffect(() => {
    if (scrollToMessageId && historyRef.current) {
      const element = historyRef.current.querySelector(
        `[data-message-id="${scrollToMessageId}"]`
      );
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        // 하이라이트 효과
        element.classList.add(styles.highlightedMessage);
        setTimeout(() => {
          element.classList.remove(styles.highlightedMessage);
        }, 800); // 애니메이션 시간과 일치
        setScrollToMessageId(null); // 처리 후 초기화
      } else {
        console.warn(
          `Element with data-message-id="${scrollToMessageId}" not found in main chat.`
        );
        setScrollToMessageId(null); // 못 찾았어도 초기화
      }
    }
  }, [scrollToMessageId, messages, setScrollToMessageId]); // messages도 의존성에 추가

  // 채팅 영역 외부 스크롤 시 채팅 내용 스크롤 (마우스 휠)
  useEffect(() => {
    const container = containerRef.current;
    const scrollTarget = historyRef.current;
    if (!container || !scrollTarget) return;

    const handleWheelOutsideHistory = (event) => {
      // 이벤트가 이미 처리되었거나 history 내부에서 발생했으면 무시
      if (event.defaultPrevented) return;
      const withinHistory = event.target.closest(`.${styles.history}`);
      if (withinHistory) return;

      // history 영역 스크롤
      scrollTarget.scrollBy({
        top: event.deltaY,
        left: event.deltaX,
        behavior: "auto",
      });
      updateWasAtBottom(); // 스크롤 후 위치 업데이트
      event.preventDefault(); // 기본 스크롤 동작 방지
    };

    container.addEventListener("wheel", handleWheelOutsideHistory, {
      passive: false,
    });
    return () => {
      container.removeEventListener("wheel", handleWheelOutsideHistory);
    };
  }, [updateWasAtBottom]); // 의존성 배열 업데이트

  // 텍스트 복사 핸들러
  const handleCopy = (text, id) => {
    let textToCopy = text;
    // 객체면 JSON 문자열로 변환 시도
    if (typeof text === "object" && text !== null) {
      try {
        textToCopy = JSON.stringify(text, null, 2);
      } catch (e) {
        console.error("Failed to stringify object for copying:", e);
        return;
      }
    }
    // 복사할 텍스트 없으면 중단
    if (
      !textToCopy ||
      (typeof textToCopy === "string" && textToCopy.trim() === "")
    )
      return;

    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedMessageId(id);
      setTimeout(() => setCopiedMessageId(null), 1500); // 1.5초 후 피드백 숨김
    });
  };

  // 초기 메시지 제외 실제 메시지가 있는지 확인
  const hasMessages = messages.some((m) => m.id !== "initial");

  return (
    <div className={styles.chatContainer} ref={containerRef}>
      <div className={styles.header}>
        <div className={styles.headerButtons}>
          {/* 테마 및 폰트 크기 버튼 (현재 숨김 처리됨) */}
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
        className={`${styles.history} ${
          activePanel === "scenario" && dimUnfocusedPanels
            ? styles.mainChatDimmed
            : ""
        }`}
        ref={historyRef}
        onClick={handleHistoryClick} // --- 👈 [수정] ---
      >
        {!hasMessages ? (
          <FavoritePanel /> // 메시지 없으면 즐겨찾기 패널 표시
        ) : (
          <>
            {/* 이전 메시지 로딩 인디케이터 */}
            {isFetchingMore && (
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
            {/* 메시지 목록 렌더링 */}
            {messages.map((msg, index) => {
              // index 추가
              if (msg.id === "initial") return null; // 초기 메시지 건너뛰기

              // 시나리오 버블 메시지 처리
              if (msg.type === "scenario_bubble") {
                return (
                  <ScenarioBubble
                    key={msg.id || msg.scenarioSessionId}
                    scenarioSessionId={msg.scenarioSessionId}
                  />
                );
              } else {
                // 일반 메시지 렌더링
                const selectedOption = selectedOptions[msg.id];
                // 마지막 메시지이고, 봇 메시지이며, 스트리밍 중인지 확인
                const isStreaming =
                  index === messages.length - 1 &&
                  msg.sender === "bot" &&
                  msg.isStreaming === true;
                const isBotMessage = msg.sender === "bot";
                const hasRichContent =
                  isBotMessage &&
                  ((Array.isArray(msg.scenarios) && msg.scenarios.length > 0) ||
                    msg.hasRichContent === true ||
                    msg.contentLayout === "rich" ||
                    msg.containsRichContent === true ||
                    msg.type === "rich_content" ||
                    (Array.isArray(msg.contentBlocks) &&
                      msg.contentBlocks.length > 0) ||
                    (Array.isArray(msg.attachments) &&
                      msg.attachments.length > 0));
                const richContentMinWidthRaw =
                  msg.minWidth ??
                  msg.contentMinWidth ??
                  msg.richContentMinWidth;
                const shouldApplyMinWidth =
                  richContentMinWidthRaw !== null &&
                  richContentMinWidthRaw !== undefined &&
                  richContentMinWidthRaw !== "";
                const resolvedMinWidth = shouldApplyMinWidth
                  ? typeof richContentMinWidthRaw === "number"
                    ? `${richContentMinWidthRaw}px`
                    : richContentMinWidthRaw
                  : undefined;
                const messageClassName = [
                  "GlassEffect",
                  styles.message,
                  isBotMessage ? styles.botMessage : styles.userMessage,
                  isBotMessage && hasRichContent
                    ? styles.botMessageRichContent
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                const messageInlineStyle =
                  isBotMessage &&
                  hasRichContent &&
                  shouldApplyMinWidth &&
                  resolvedMinWidth
                    ? { minWidth: resolvedMinWidth }
                    : undefined;
                return (
                  <div
                    key={msg.id}
                    className={`${styles.messageRow} ${
                      msg.sender === "user" ? styles.userRow : ""
                    }`}
                    data-message-id={msg.id} // 스크롤 타겟을 위한 ID
                  >
                    <div
                      className={messageClassName}
                      style={messageInlineStyle}
                    >
                      {/* 복사 완료 피드백 */}
                      {copiedMessageId === msg.id && (
                        <div className={styles.copyFeedback}>{t("copied")}</div>
                      )}
                      <div className={styles.messageContentWrapper}>
                        {msg.sender === "bot" && <LogoIcon />}
                        <div className={styles.messageContent}>
                          {/* 텍스트 및 버튼 렌더링 (isStreaming 전달) */}
                          <MessageWithButtons
                            text={msg.text}
                            messageId={msg.id}
                            isStreaming={isStreaming}
                          />
                          {/* 시나리오 목록 버튼 (봇 메시지이고 scenarios 있을 때) */}
                          {msg.sender === "bot" && msg.scenarios && (
                            <div className={styles.scenarioList}>
                              {msg.scenarios.map((name) => {
                                const isSelected = selectedOption === name;
                                const isDimmed = selectedOption && !isSelected;
                                return (
                                  <button
                                    key={name}
                                    className={`${styles.optionButton} ${
                                      isSelected ? styles.selected : ""
                                    } ${isDimmed ? styles.dimmed : ""}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedOption(msg.id, name); // 선택 상태 업데이트
                                      openScenarioPanel(name); // 시나리오 패널 열기
                                    }}
                                    disabled={!!selectedOption} // 이미 선택했으면 비활성화
                                  >
                                    <span className={styles.optionButtonText}>
                                      {name}
                                    </span>
                                    <CheckCircle />
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                      {/* 복사 버튼 (봇 메시지이고, 텍스트가 있고, 스트리밍 중 아닐 때) */}
                      {msg.sender === "bot" && msg.text && !isStreaming && (
                        <div className={styles.messageActionArea}>
                          <button
                            className={styles.actionButton}
                            onClick={() => handleCopy(msg.text, msg.id)}
                          >
                            <CopyIcon />
                          </button>
                          {/* 좋아요/싫어요 버튼 등 추가 가능 */}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }
            })}
            {/* 전체 로딩 인디케이터 (마지막 메시지가 스트리밍 중이 아닐 때만 표시) */}
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