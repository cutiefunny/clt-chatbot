'use client';
import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../store/chatStore';
import styles from './HistoryPanel.module.css';
import SettingsModal from './SettingsModal';
import LogoutModal from './LogoutModal'; // --- 👈 [추가]

const SettingsIcon = () => (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(-1.5, -2)">
            <path d="M19.14 12.94C19.064 12.448 18.908 11.972 18.68 11.53L20.96 9.68C21.04 9.6 21.08 9.5 21.08 9.4C21.08 9.3 21.04 9.2 20.96 9.12L19.24 7.76C19.16 7.68 19.06 7.64 18.96 7.64C18.86 7.64 18.76 7.68 18.68 7.76L16.47 9.61C16.035 9.387 15.567 9.234 15.08 9.15L14.78 6.6C14.76 6.5 14.68 6.42 14.58 6.42H12.42C12.32 6.42 12.24 6.5 12.22 6.6L11.92 9.15C11.433 9.234 10.965 9.387 10.53 9.61L8.32 7.76C8.24 7.68 8.14 7.64 8.04 7.64C7.94 7.64 7.84 7.68 7.76 7.76L6.04 9.12C5.96 9.2 5.92 9.3 5.92 9.4C5.92 9.5 5.96 9.6 6.04 9.68L8.32 11.53C8.092 11.972 7.936 12.448 7.86 12.94L5.32 13.24C5.22 13.26 5.14 13.34 5.14 13.44V15.56C5.14 15.66 5.22 15.74 5.32 15.76L7.86 16.06C7.936 16.552 8.092 17.028 8.32 17.47L6.04 19.32C5.96 19.4 5.92 19.5 5.92 19.6C5.92 19.7 5.96 19.8 6.04 19.88L7.76 21.24C7.84 21.32 7.94 21.36 8.04 21.36C8.14 21.36 8.24 21.32 8.32 21.24L10.53 19.39C10.965 19.613 11.433 19.766 11.92 19.85L12.22 22.4C12.24 22.5 12.32 22.58 12.42 22.58H14.58C14.68 22.58 14.76 22.5 14.78 22.4L15.08 19.85C15.567 19.766 16.035 19.613 16.47 19.39L18.68 21.24C18.76 21.32 18.86 21.36 18.96 21.36C19.06 21.36 19.16 21.32 19.24 21.24L20.96 19.88C21.04 19.8 21.08 19.7 21.08 19.6C21.08 19.5 21.04 19.4 20.96 19.32L18.68 17.47C18.908 17.028 19.064 16.552 19.14 16.06L21.68 15.76C21.78 15.74 21.86 15.66 21.86 15.56V13.44C21.86 13.34 21.78 13.26 21.68 13.24L19.14 12.94ZM13.5 16.5C12.12 16.5 11 15.38 11 14C11 12.62 12.12 11.5 13.5 11.5C14.88 11.5 16 12.62 16 14C16 15.38 14.88 16.5 13.5 16.5Z" fill="currentColor"/>
        </g>
    </svg>
);
const CheckIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);
const PencilIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M17 3C17.5304 3 18.0391 3.21071 18.4142 3.58579C18.7893 3.96086 19 4.46957 19 5V6L8 17H4V13L15 2H17Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 3L18 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);
const TrashIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 6H5H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);
const MenuIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 6H20M4 12H20M4 18H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const EditIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M18.5 2.5C18.8978 2.10218 19.4374 1.87868 20 1.87868C20.5626 1.87868 21.1022 2.10218 21.5 2.5C21.8978 2.89782 22.1213 3.43739 22.1213 4C22.1213 4.56261 21.8978 5.10218 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const ConversationItem = ({ convo, isActive, onClick, onDelete, onUpdateTitle }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [title, setTitle] = useState(convo.title);
    const inputRef = useRef(null);

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
        if (e.key === 'Enter') {
            handleUpdate();
        } else if (e.key === 'Escape') {
            setTitle(convo.title);
            setIsEditing(false);
        }
    };

    return (
        <div 
            className={`${styles.conversationItem} ${isActive ? styles.active : ''}`}
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
                <span className={styles.convoTitle}>{convo.title || 'New Chat'}</span>
            )}
            <div className={styles.buttonGroup}>
                {isEditing ? (
                    <button className={styles.actionButton} onClick={(e) => { e.stopPropagation(); handleUpdate(); }}>
                        <CheckIcon />
                    </button>
                ) : (
                    <>
                        <button className={styles.actionButton} onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}>
                            <PencilIcon />
                        </button>
                        <button className={styles.actionButton} onClick={(e) => onDelete(e, convo.id)}>
                            <TrashIcon />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default function HistoryPanel() {
  const { 
    user, 
    logout, 
    conversations, 
    loadConversation, 
    createNewConversation,
    currentConversationId,
    deleteConversation,
    updateConversationTitle,
    isHistoryPanelOpen,
    toggleHistoryPanel,
    isSettingsModalOpen,
    openSettingsModal,
    closeSettingsModal
  } = useChatStore();
  
  // --- 👇 [수정] 상태 변수명 변경 ---
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  if (!user) return null;

  const handleDelete = (e, convoId) => {
    e.stopPropagation();
    if (window.confirm("정말로 이 대화를 삭제하시겠습니까?")) {
        deleteConversation(convoId);
    }
  };
  
  const handleLogoutConfirm = () => {
      logout();
      setIsLogoutModalOpen(false);
  };

  return (
    <>
      <div className={`${styles.historyPanel} ${isHistoryPanelOpen ? styles.open : styles.closed}`}>
        <div className={styles.header}>
          <button className={styles.toggleButton} onClick={toggleHistoryPanel}>
              <MenuIcon />
          </button>
          <button className={styles.newChatButton} onClick={createNewConversation}>
              <EditIcon />
              <span className={styles.newChatText}>New Chat</span>
          </button>
        </div>
        
        <div className={styles.panelContent}>
          <div className={styles.conversationList}>
            {conversations.map((convo) => (
              <ConversationItem
                  key={convo.id}
                  convo={convo}
                  isActive={convo.id === currentConversationId}
                  onClick={loadConversation}
                  onDelete={handleDelete}
                  onUpdateTitle={updateConversationTitle}
              />
            ))}
          </div>
          <div className={styles.footer}>
            <button onClick={openSettingsModal} className={styles.settingsButton}>
                <SettingsIcon />
            </button>
            <div className={styles.avatarWrapper}>
                <img
                    src={user.photoURL}
                    alt="User Avatar"
                    className={styles.userAvatar}
                    onClick={() => setIsLogoutModalOpen(true)}
                />
            </div>
          </div>
        </div>
      </div>
      
      {isSettingsModalOpen && <SettingsModal onClose={closeSettingsModal} />}
      {/* --- 👇 [추가] 로그아웃 모달 렌더링 --- */}
      {isLogoutModalOpen && <LogoutModal onClose={() => setIsLogoutModalOpen(false)} onConfirm={handleLogoutConfirm} />}
    </>
  );
}