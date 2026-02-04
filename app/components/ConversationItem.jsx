// app/components/ConversationItem.jsx
"use client";
import { useState, useRef, useEffect } from "react";
import { useTranslations } from "../hooks/useTranslations";
import styles from "./HistoryPanel.module.css";
import KebabMenuIcon from "./icons/KebabMenuIcon";
import PinIcon from "./icons/PinIcon";
import CloseIcon from "./icons/CloseIcon";
import { useChatStore } from "../store";
import ScenarioStatusBadge from "./ScenarioStatusBadge";

const DoneBadgeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 1.5C4.41015 1.5 1.5 4.41015 1.5 8C1.5 11.5899 4.41015 14.5 8 14.5C11.5899 14.5 14.5 11.5899 14.5 8C14.5 4.41015 11.5899 1.5 8 1.5ZM6.8 11L4 8.2L4.9 7.3L6.8 9.2L11.1 4.9L12 5.8L6.8 11Z" fill="currentColor" />
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function ConversationItem({
  convo = {}, // 기본값 빈 객체 설정
  isActive = false,
  onClick = () => {}, 
  onDelete = () => {},
  onUpdateTitle = () => {},
  onPin = () => {},
  isExpanded = false,
  scenarios = [],
  onToggleExpand = () => {},
  onScenarioClick = () => {},
  unreadScenarioSessions = new Set(),
  hasUnreadScenarios = false,
  isPending = false,
  hasCompletedResponse = false,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // convo가 유효하지 않을 때를 대비해 초기 상태 보호
  const [title, setTitle] = useState(convo?.title || ""); 
  const inputRef = useRef(null);
  const menuRef = useRef(null);
  const { t } = useTranslations();
  const { hideCompletedScenarios, hideDelayInHours, activeScenarioSessionId } = useChatStore();

  // 👈 데이터가 존재하지 않으면 렌더링하지 않음 (TypeError 방지 핵심)
  if (!convo || !convo.id) return null;

  // 데이터 로드 지연 시 제목 동기화
  useEffect(() => {
    if (convo?.title !== undefined) {
      setTitle(convo.title);
    }
  }, [convo?.title]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleUpdate = () => {
    const trimmedTitle = title.trim();
    if (trimmedTitle && trimmedTitle !== convo.title) {
      onUpdateTitle?.(convo.id, trimmedTitle);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleUpdate();
    else if (e.key === "Escape") {
      setTitle(convo.title || "");
      setIsEditing(false);
    }
  };

  const handleRename = (e) => {
    e.stopPropagation();
    setTitle(convo.title || "");
    setIsEditing(true);
    setIsMenuOpen(false);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete?.(e, convo.id);
    setIsMenuOpen(false);
  };

  const handlePin = (e) => {
    e.stopPropagation();
    // 👈 is_pinned(FastAPI)와 pinned(Legacy) 모두 지원
    onPin?.(convo.id, !(convo.is_pinned || convo.pinned));
    setIsMenuOpen(false);
  };

  // 시나리오 필터링 로직 방어 강화
  const filteredScenarios = scenarios
    ? scenarios.filter((s) => {
        if (hideCompletedScenarios && s.status === "completed") {
          // Firestore Timestamp 대응 혹은 일반 Date 객체 생성
          const completedTime = s.updatedAt?.toDate ? s.updatedAt.toDate() : new Date(s.updatedAt);
          if (isNaN(completedTime.getTime())) return true;

          const now = new Date();
          const hoursPassed = (now - completedTime) / (1000 * 60 * 60);
          return hoursPassed < hideDelayInHours;
        }
        return true;
      })
    : [];

  return (
    <div className={styles.conversationItemWrapper}>
      <div
        className={`${styles.conversationItem} ${isExpanded ? styles.active : ""} ${isActive ? styles.selected : ""}`}
        onClick={() => {
          if (isEditing) return;
          if (typeof onClick === "function") onClick(convo.id);
          onToggleExpand?.(convo.id);
        }}
      >
        <div className={styles.convoMain}>
          {isPending && !isEditing && (
            <span className={styles.loadingIndicator}>
              <img src="/images/Loading.gif" alt="Loading..." width="16" height="16" style={{ display: "block" }} />
            </span>
          )}

          {!isPending && hasCompletedResponse && !isEditing && (
            <span className={styles.doneIndicator}><DoneBadgeIcon /></span>
          )}

          {hasUnreadScenarios && !isEditing && <div className={styles.unreadDot}></div>}
          
          {(convo.is_pinned || convo.pinned) && !isEditing && (
            <span className={styles.pinIndicator}><PinIcon /></span>
          )}

          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleUpdate}
              onKeyDown={handleKeyDown}
              className={styles.titleInput}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className={styles.convoTitle}>
              {convo.title || t("newChat") || "New Chat"}
            </span>
          )}
        </div>

        {isEditing ? (
          <div className={styles.editConfirmButton}>
            <button className={styles.actionButton} onClick={(e) => { e.stopPropagation(); setIsEditing(false); }}><CloseIcon /></button>
            <button className={`${styles.actionButton} ${styles.confirm}`} onClick={(e) => { e.stopPropagation(); handleUpdate(); }}><CheckIcon /></button>
          </div>
        ) : (
          <div className={styles.menuContainer} ref={menuRef}>
            <button className={styles.menuButton} onClick={(e) => { e.stopPropagation(); setIsMenuOpen(!isMenuOpen); }} data-open={isMenuOpen}>
              <KebabMenuIcon />
            </button>
            {isMenuOpen && (
              <div className={styles.dropdownMenu}>
                <button onClick={handlePin}>{(convo.is_pinned || convo.pinned) ? t("unpin") : t("pin")}</button>
                <button onClick={handleRename}>{t("rename")}</button>
                <button onClick={handleDelete}>{t("delete")}</button>
              </div>
            )}
          </div>
        )}
      </div>
      {isExpanded && filteredScenarios && (
        <div className={styles.scenarioSubList}>
          {filteredScenarios.length > 0 ? (
            filteredScenarios.map((scenario) => {
              const isSelected = scenario.sessionId === activeScenarioSessionId;
              return (
                <div key={scenario.sessionId} className={`${styles.scenarioItem} ${isSelected ? styles.selected : ""}`} onClick={() => onScenarioClick?.(convo.id, scenario)}>
                  {unreadScenarioSessions?.has?.(scenario.sessionId) && <div className={styles.unreadDot}></div>}
                  <span className={styles.scenarioTitle}>{scenario.scenarioId}</span>
                  <ScenarioStatusBadge status={scenario.status} t={t} isSelected={isSelected} />
                </div>
              );
            })
          ) : (
            <div className={styles.noScenarios}>{t("noScenariosFound")}</div>
          )}
        </div>
      )}
    </div>
  );
}