"use client";
import { useState, useRef, useEffect } from "react";
import { useTranslations } from "../hooks/useTranslations";
import styles from "./HistoryPanel.module.css";
import KebabMenuIcon from "./icons/KebabMenuIcon";
import PinIcon from "./icons/PinIcon";
import ArrowDropDownIcon from "./icons/ArrowDropDownIcon";
import PinOutlinedIcon from "./icons/PinOutlinedIcon";
import CloseIcon from "./icons/CloseIcon";
import { useChatStore } from "../store";

const CheckIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M20 6L9 17L4 12"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PencilIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
  >
    <path
      d="M11.7167 7.51667L12.4833 8.28333L4.93333 15.8333H4.16667V15.0667L11.7167 7.51667ZM14.7167 2.5C14.5083 2.5 14.2917 2.58333 14.1333 2.74167L12.6083 4.26667L15.7333 7.39167L17.2583 5.86667C17.5833 5.54167 17.5833 5.01667 17.2583 4.69167L15.3083 2.74167C15.1417 2.575 14.9333 2.5 14.7167 2.5ZM11.7167 5.15833L2.5 14.375V17.5H5.625L14.8417 8.28333L11.7167 5.15833Z"
      fill="currentColor"
    />
  </svg>
);

const TrashIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
  >
    <path
      d="M13.3346 7.5V15.8333H6.66797V7.5H13.3346ZM12.0846 2.5H7.91797L7.08464 3.33333H4.16797V5H15.8346V3.33333H12.918L12.0846 2.5ZM15.0013 5.83333H5.0013V15.8333C5.0013 16.75 5.7513 17.5 6.66797 17.5H13.3346C14.2513 17.5 15.0013 16.75 15.0013 15.8333V5.83333Z"
      fill="currentColor"
    />
  </svg>
);

// --- 👇 [수정된 부분] ---
const ScenarioStatusBadge = ({ status, t }) => {
  if (!status) return null;

  let text;
  let statusClass;

  switch (status) {
    case "completed":
      text = t("statusCompleted");
      statusClass = "done";
      break;
    case "active":
      text = t("statusActive");
      statusClass = "incomplete";
      break;
    case "failed":
      text = t("statusFailed");
      statusClass = "failed";
      break;
    case "generating":
      text = t("statusGenerating");
      statusClass = "generating";
      break;
    case "canceled":
      text = t("statusCanceled");
      statusClass = "canceled";
      break;
    default:
      return null;
  }

  return (
    <span className={`${styles.scenarioBadge} ${styles[statusClass]}`}>
      {text}
    </span>
  );
};
// --- 👆 [여기까지] ---

export default function ConversationItem({
  convo,
  isActive,
  onClick,
  onDelete,
  onUpdateTitle,
  onPin,
  isExpanded,
  scenarios,
  onToggleExpand,
  onScenarioClick,
  unreadScenarioSessions,
  hasUnreadScenarios,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [title, setTitle] = useState(convo.title);
  const inputRef = useRef(null);
  const menuRef = useRef(null);
  const { t } = useTranslations();
  const { hideCompletedScenarios, hideDelayInHours } = useChatStore();

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
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleUpdate = () => {
    if (title.trim() && title.trim() !== convo.title) {
      onUpdateTitle(convo.id, title.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleUpdate();
    } else if (e.key === "Escape") {
      setTitle(convo.title);
      setIsEditing(false);
    }
  };

  const handleRename = (e) => {
    e.stopPropagation();
    setTitle(convo.title);
    setIsEditing(true);
    setIsMenuOpen(false);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete(e, convo.id);
    setIsMenuOpen(false);
  };

  const handlePin = (e) => {
    e.stopPropagation();
    onPin(convo.id, !convo.pinned);
    setIsMenuOpen(false);
  };

  const filteredScenarios = scenarios
    ? scenarios.filter((s) => {
        if (hideCompletedScenarios && s.status === "completed") {
          const completedTime = s.updatedAt?.toDate();
          if (!completedTime) return false;

          const now = new Date();
          const hoursPassed = (now - completedTime) / (1000 * 60 * 60);

          return hoursPassed < hideDelayInHours;
        }
        return true;
      })
    : null;

  return (
    <div className={styles.conversationItemWrapper}>
      <div
        className={`${styles.conversationItem} ${
          isActive ? styles.active : ""
        }`}
        onClick={() => {
          if (isEditing) return;
          onClick(convo.id);
          onToggleExpand?.(convo.id);
        }}
      >
        <div className={styles.convoMain}>
          {hasUnreadScenarios && !isEditing && (
            <div className={styles.unreadDot} style={{position: 'relative', left: 0, top: 0}}></div>
          )}
          {convo.pinned && !isEditing && (
            <span className={styles.pinIndicator}>
              <PinIcon />
            </span>
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
              {convo.title || t("newChat")}
            </span>
          )}
        </div>

        {isEditing ? (
          <div className={styles.editConfirmButton}>
            <button
              className={styles.actionButton}
              style={{ opacity: 1 }}
              onClick={(e) => {
                e.stopPropagation();
                handleUpdate();
              }}
            >
              <CheckIcon />
            </button>
            <button
              className={styles.actionButton}
              style={{ opacity: 1 }}
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(false);
              }}
            >
              <CloseIcon />
            </button>
          </div>
        ) : (
          <div className={styles.menuContainer} ref={menuRef}>
            <button
              className={styles.menuButton}
              onClick={(e) => {
                e.stopPropagation();
                setIsMenuOpen(!isMenuOpen);
              }}
              data-open={isMenuOpen}
            >
              <KebabMenuIcon />
            </button>
            {isMenuOpen && (
              <div className={styles.dropdownMenu}>
                <button onClick={handlePin}>
                  {convo.pinned ? t("unpin") : t("pin")}
                </button>
                <button onClick={handleRename}>{t("rename")}</button>
                <button onClick={handleDelete}>{t("delete")}</button>
              </div>
            )}
          </div>
        )}
      </div>
      {isExpanded && (
        <div className={styles.scenarioSubList}>
          {filteredScenarios ? (
            filteredScenarios.length > 0 ? (
              filteredScenarios.map((scenario) => {
                const hasUnread = unreadScenarioSessions?.has(
                  scenario.sessionId
                );
                return (
                  <div
                    key={scenario.sessionId}
                    className={styles.scenarioItem}
                    onClick={() => onScenarioClick(convo.id, scenario)}
                  >
                    {hasUnread && <div className={styles.unreadDot}></div>}
                    <span className={styles.scenarioTitle}>
                      {scenario.scenarioId}
                    </span>
                    <ScenarioStatusBadge status={scenario.status} t={t} />
                  </div>
                );
              })
            ) : (
              <div className={styles.noScenarios}>{t("noScenariosFound")}</div>
            )
          ) : (
            <div className={styles.noScenarios}>{t("loadingScenarios")}</div>
          )}
        </div>
      )}
    </div>
  );
}