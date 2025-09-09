'use client';
import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../store/chatStore';
import styles from './HistoryPanel.module.css';
import ProfileModal from './ProfileModal';
import SearchModal from './SearchModal';
import DevBoardModal from './DevBoardModal';
import NotificationModal from './NotificationModal';

const BellIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const SearchIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M11 19C15.4183 19 19 15.4183 19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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
    conversations, 
    loadConversation, 
    createNewConversation,
    currentConversationId,
    deleteConversation,
    updateConversationTitle,
    isHistoryPanelOpen,
    toggleHistoryPanel,
    isSearchModalOpen,
    openSearchModal,
    isProfileModalOpen,
    openProfileModal, 
    isDevBoardModalOpen,
    isNotificationModalOpen,
    openNotificationModal,
  } = useChatStore();
  
  if (!user) return null;

  const handleDelete = (e, convoId) => {
    e.stopPropagation();
    if (window.confirm("정말로 이 대화를 삭제하시겠습니까?")) {
        deleteConversation(convoId);
    }
  };

  return (
    <>
      <div className={`${styles.historyPanel} ${isHistoryPanelOpen ? styles.open : styles.closed}`}>
        <div className={styles.header}>
            <div className={styles.headerTopRow}>
                <button className={styles.toggleButton} onClick={toggleHistoryPanel}>
                    <MenuIcon />
                </button>
                <div className={styles.headerIconGroup}>
                    <button className={styles.iconButton} onClick={openNotificationModal}>
                        <BellIcon />
                    </button>
                    <button className={styles.iconButton} onClick={openSearchModal}>
                        <SearchIcon />
                    </button>
                </div>
            </div>
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
            <div className={styles.avatarWrapper} onClick={openProfileModal}>
                <img
                    src={user.photoURL}
                    alt="User Avatar"
                    className={styles.userAvatar}
                />
            </div>
          </div>
        </div>
      </div>
      
      {isProfileModalOpen && <ProfileModal />}
      {isSearchModalOpen && <SearchModal />}
      {isDevBoardModalOpen && <DevBoardModal />}
      {isNotificationModalOpen && <NotificationModal />}
    </>
  );
}