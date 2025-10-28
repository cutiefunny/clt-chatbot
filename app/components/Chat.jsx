"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useChatStore } from "../store";
import { useTranslations } from "../hooks/useTranslations";
import styles from "./Chat.module.css";
import FavoritePanel from "./FavoritePanel";
// --- 👇 [삭제] ScenarioBubble 임포트 제거 ---
// import ScenarioBubble from "./ScenarioBubble";
import CheckCircle from "./icons/CheckCircle";
import MoonIcon from "./icons/MoonIcon";
import LogoIcon from "./icons/LogoIcon";
import CopyIcon from "./icons/CopyIcon";

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

const MessageWithButtons = ({ text, messageId }) => {
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

  if (!text) return null;

  // --- 👇 [수정] "Loop back to Supervisor" 포함 여부 확인 ---
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
  // --- 👆 [여기까지] ---

  // JSON 메시지 처리 로직 (이전 로직 유지)
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

  // 버튼 파싱 및 렌더링 로직 (이전 로직 유지)
  const regex = /\[BUTTON:(.+?)\]/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  // text가 문자열일 때만 정규식 실행
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

    if (lastIndex < text.length) {
      parts.push({ type: "text", content: text.substring(lastIndex) });
    }
  } else {
    // text가 문자열이 아니면 그대로 parts에 넣음 (예: 객체인데 파싱 실패한 경우)
    parts.push({ type: "text", content: text });
  }

  if (parts.length === 0) {
    // parts가 비어있고 text가 문자열이면 text 반환, 아니면 빈 Fragment
    return typeof text === "string" ? <>{text}</> : <></>;
  }

  return (
    <div>
      {parts.map((part, index) => {
        if (part.type === "text") {
          // content가 객체일 수 있으므로 문자열로 변환 시도
          const contentString =
            typeof part.content === "string"
              ? part.content
              : JSON.stringify(part.content);
          return <span key={index}>{contentString}</span>;
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
                onClick={() => handleShortcutClick(shortcutItem, messageId)}
                disabled={!!selectedOption}
              >
                {buttonText}
              </button>
            );
          }
          // 찾지 못한 버튼은 텍스트로 표시 (또는 다른 처리)
          return <span key={index}>{`[BUTTON:${part.content}]`}</span>;
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
  const containerRef = useRef(null);
  const wasAtBottomRef = useRef(true);
  const { t } = useTranslations();

  const updateWasAtBottom = useCallback(() => {
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;
    const scrollableDistance =
      scrollContainer.scrollHeight -
      scrollContainer.clientHeight -
      scrollContainer.scrollTop;
    wasAtBottomRef.current = scrollableDistance <= 100; // 스크롤 하단 감지 여유 추가
  }, []);

  const handleScroll = useCallback(async () => {
    if (
      historyRef.current?.scrollTop === 0 &&
      hasMoreMessages &&
      !isFetchingMore
    ) {
      setIsFetchingMore(true);
      const initialHeight = historyRef.current.scrollHeight; // 로드 전 높이 저장
      await loadMoreMessages();
       // 로드 후 높이 변화 감지 및 스크롤 위치 조정
      if (historyRef.current) {
        const newHeight = historyRef.current.scrollHeight;
        historyRef.current.scrollTop = newHeight - initialHeight; // 이전 위치 유지
      }
      setIsFetchingMore(false);
    }
  }, [hasMoreMessages, isFetchingMore, loadMoreMessages]);

  useEffect(() => {
    if (forceScrollToBottom && historyRef.current) {
      const scrollContainer = historyRef.current;
      // 비동기 렌더링 후 스크롤 보장
      setTimeout(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        setForceScrollToBottom(false);
        wasAtBottomRef.current = true;
      }, 0);
    }
  }, [forceScrollToBottom, setForceScrollToBottom]);

  useEffect(() => {
    if (scrollAmount && historyRef.current) {
      historyRef.current.scrollBy({
        top: scrollAmount,
        behavior: "smooth", // 부드러운 스크롤
      });
      updateWasAtBottom(); // 스크롤 후 하단 위치 재확인
      resetScroll(); // 스크롤 양 초기화
    }
  }, [scrollAmount, resetScroll, updateWasAtBottom]);

  // 스크롤 이벤트 리스너 등록 및 해제
  useEffect(() => {
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;
    const handleScrollEvent = () => {
      updateWasAtBottom(); // 스크롤 시 하단 위치 업데이트
      handleScroll(); // 스크롤 맨 위 도달 시 추가 로드
    };

    updateWasAtBottom(); // 초기 하단 위치 확인
    scrollContainer.addEventListener("scroll", handleScrollEvent);
    return () => {
      scrollContainer.removeEventListener("scroll", handleScrollEvent);
    };
  }, [handleScroll, updateWasAtBottom]);

  // 새 메시지 추가 시 자동 스크롤
   useEffect(() => {
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;

    // 마지막 메시지 또는 wasAtBottomRef 상태에 따라 자동 스크롤 결정
    const lastMessage = messages[messages.length - 1];
    const shouldAutoScroll = lastMessage?.sender === 'user' || wasAtBottomRef.current;

    if (!shouldAutoScroll) return; // 사용자가 위로 스크롤한 상태면 자동 스크롤 안 함

    // 다음 렌더링 프레임에서 스크롤 실행
    requestAnimationFrame(() => {
        if (scrollContainer) { // 컴포넌트 언마운트 대비
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
            wasAtBottomRef.current = true; // 스크롤 후 하단 상태 업데이트
        }
    });
  }, [messages]); // messages 배열이 변경될 때마다 실행

  // 특정 메시지로 스크롤 (검색 결과 등)
  useEffect(() => {
    if (scrollToMessageId && historyRef.current) {
      const element = historyRef.current.querySelector(
        `[data-message-id="${scrollToMessageId}"]`
      );
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        // 하이라이트 효과 (선택 사항)
        element.classList.add(styles.highlightedMessage);
        setTimeout(() => {
          element.classList.remove(styles.highlightedMessage);
        }, 800);
        setScrollToMessageId(null); // 스크롤 후 상태 초기화
      }
    }
  }, [scrollToMessageId, messages, setScrollToMessageId]); // messages 변경 시에도 재시도

  // Chat 영역 외부 스크롤 시 Chat 내부 스크롤 제어
  useEffect(() => {
    const container = containerRef.current;
    const scrollTarget = historyRef.current;
    if (!container || !scrollTarget) return;

    const handleWheelOutsideHistory = (event) => {
      if (event.defaultPrevented) return; // 이미 처리된 이벤트 무시
      // 이벤트 발생 지점이 history 내부에 있는지 확인
      const withinHistory = event.target.closest(`.${styles.history}`);
      if (withinHistory) return; // history 내부 스크롤은 기본 동작 따름

      // history 외부 스크롤이면 history 내부 스크롤 실행
      scrollTarget.scrollBy({
        top: event.deltaY,
        left: event.deltaX,
        behavior: "auto", // 즉시 스크롤
      });
      updateWasAtBottom(); // 스크롤 후 하단 위치 재확인
      event.preventDefault(); // 기본 페이지 스크롤 방지
    };

    // wheel 이벤트 리스너 추가 (passive: false로 preventDefault 가능하도록)
    container.addEventListener("wheel", handleWheelOutsideHistory, {
      passive: false,
    });
    return () => {
      container.removeEventListener("wheel", handleWheelOutsideHistory);
    };
  }, [updateWasAtBottom]);

  const handleCopy = (text, id) => {
    // 텍스트 유효성 검사 및 복사 로직 (기존과 동일)
    let textToCopy = text;
    if (typeof text === 'object' && text !== null) {
      try {
        textToCopy = JSON.stringify(text, null, 2);
      } catch (e) {
        console.error("Failed to stringify object for copying:", e);
        return; // 복사 실패
      }
    }

    // 빈 텍스트 복사 방지
    if (!textToCopy || (typeof textToCopy === 'string' && textToCopy.trim() === '')) return;

    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedMessageId(id); // 복사 성공 피드백 상태 설정
      setTimeout(() => setCopiedMessageId(null), 1500); // 1.5초 후 피드백 제거
    });
  };

  const hasMessages = messages.some((m) => m.id !== "initial");

  return (
    <div className={styles.chatContainer} ref={containerRef}>
      <div className={styles.header}>
        <div className={styles.headerButtons}>
          {/* 테마, 폰트 크기 설정 버튼들 (기존 코드 유지) */}
          <div className={styles.settingControl} style={{ display: 'none' }}>
             <span className={styles.settingLabel}>Large text</span>
             <label className={styles.switch}>
               <input type="checkbox" checked={fontSize === "default"} onChange={() => setFontSize(fontSize === "default" ? "small" : "default")} />
               <span className={styles.slider}></span>
             </label>
           </div>
           <div className={styles.separator} style={{ display: 'none' }}></div>
           <div style={{ display: 'none' }}>
             <button className={styles.themeToggleButton} onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
               <MoonIcon />
             </button>
           </div>
        </div>
      </div>

      <div
        className={`${styles.history} ${
          // 시나리오 패널 활성화 시 메인 채팅 흐리게 처리
          activePanel === "scenario" && dimUnfocusedPanels ? styles.mainChatDimmed : ""
        }`}
        ref={historyRef}
      >
        {!hasMessages ? (
          <FavoritePanel /> // 메시지 없으면 즐겨찾기 패널 표시
        ) : (
          <>
            {/* 이전 메시지 로딩 중 인디케이터 */}
            {isFetchingMore && (
              <div className={styles.messageRow}>
                <div className={`${styles.message} ${styles.botMessage}`}>
                  <div className={styles.messageContentWrapper}>
                    <LogoIcon />
                    <div className={styles.messageContent}>
                      <img
                        src="/images/Loading.gif"
                        alt={t("loading")}
                        style={{ width: "40px", height: "30px" }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* 메시지 목록 렌더링 */}
            {messages.map((msg) => {
              if (msg.id === "initial") return null; // 초기 메시지 제외

              // --- 👇 [수정] scenario_bubble 타입 렌더링 제거 ---
              if (msg.type === "scenario_bubble") {
                 return null; // 시나리오 버블은 Chat.jsx에서 렌더링하지 않음
              }
              // --- 👆 [수정] ---

              const selectedOption = selectedOptions[msg.id];

              return (
                <div
                  key={msg.id}
                  className={`${styles.messageRow} ${
                    msg.sender === "user" ? styles.userRow : ""
                  }`}
                  data-message-id={msg.id} // 스크롤 대상 식별자
                >
                  <div
                    className={`GlassEffect ${styles.message} ${
                      msg.sender === "bot" ? styles.botMessage : styles.userMessage
                    } `}
                  >
                    {/* 복사 성공 피드백 */}
                    {copiedMessageId === msg.id && (
                      <div className={styles.copyFeedback}>{t("copied")}</div>
                    )}

                    {/* 메시지 내용 */}
                    <div className={styles.messageContentWrapper}>
                      {msg.sender === "bot" && <LogoIcon />}
                      <div className={styles.messageContent}>
                        {msg.text !== undefined && msg.text !== null && (
                          <MessageWithButtons text={msg.text} messageId={msg.id} />
                        )}
                        {/* 시나리오 목록 버튼 (MessageWithButtons 내부 또는 별도 컴포넌트에서 처리됨) */}
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
                                  disabled={!!selectedOption} // 이미 선택된 경우 비활성화
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

                    {/* 봇 메시지 액션 (복사 등) */}
                    {msg.sender === "bot" && msg.text && ( // 텍스트가 있을 때만 복사 버튼 표시
                      <div className={styles.messageActionArea}>
                        <button
                          className={styles.actionButton}
                          onClick={() => handleCopy(msg.text, msg.id)}
                        >
                          <CopyIcon />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {/* 봇 응답 로딩 인디케이터 */}
            {isLoading && !messages.some(m => m.isStreaming) && ( // 스트리밍 중 아닐 때만 표시
              <div className={styles.messageRow}>
                <div className={`${styles.message} ${styles.botMessage}`}>
                  <div className={styles.messageContentWrapper}>
                    <LogoIcon />
                    <div className={styles.messageContent}>
                      <img
                        src="/images/Loading.gif"
                        alt={t("loading")}
                        style={{ width: "40px", height: "30px" }}
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