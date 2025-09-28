"use client";
import { useState, useRef, useEffect } from "react";
import { useTranslations } from "../hooks/useTranslations";
import styles from "./HistoryPanel.module.css";

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
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M17 3C17.5304 3 18.0391 3.21071 18.4142 3.58579C18.7893 3.96086 19 4.46957 19 5V6L8 17H4V13L15 2H17Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M14 3L18 7"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const TrashIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M3 6H5H21"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default function ConversationItem({
  convo,
  isActive,
  onClick,
  onDelete,
  onUpdateTitle,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(convo.title);
  const inputRef = useRef(null);
  const { t } = useTranslations();

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

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

  return (
    <div
      className={`${styles.conversationItem} ${isActive ? styles.active : ""}`}
      onClick={() => !isEditing && onClick(convo.id)}
    >
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
        <span className={styles.convoTitle}>{convo.title || t("newChat")}</span>
      )}
      <div className={styles.buttonGroup}>
        {isEditing ? (
          <button
            className={styles.actionButton}
            onClick={(e) => {
              e.stopPropagation();
              handleUpdate();
            }}
          >
            <CheckIcon />
          </button>
        ) : (
          <>
            <button
              className={styles.actionButton}
              onClic
              k={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
            >
              <PencilIcon />
            </button>
            <button
              className={styles.actionButton}
              onClick={(e) => onDelete(e, convo.id)}
            >
              <TrashIcon />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
