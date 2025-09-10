'use client';
import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../store';
import { useTranslations } from '../hooks/useTranslations';
import styles from './HistoryPanel.module.css';
import ProfileModal from './ProfileModal';
import SearchModal from './SearchModal';
import DevBoardModal from './DevBoardModal';
import NotificationModal from './NotificationModal';
import ConversationItem from './ConversationItem';

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
    hasUnreadNotifications,
  } = useChatStore();
  const { t } = useTranslations();
  
  if (!user) return null;

  const handleDelete = (e, convoId) => {
    e.stopPropagation();
    if (window.confirm(t('deleteConvoConfirm'))) {
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
                    <button 
                        className={`${styles.iconButton} ${hasUnreadNotifications ? styles.unread : ''}`} 
                        onClick={openNotificationModal}
                    >
                        <BellIcon />
                    </button>
                    <button className={styles.iconButton} onClick={openSearchModal}>
                        <SearchIcon />
                    </button>
                </div>
            </div>
            <button className={styles.newChatButton} onClick={createNewConversation}>
                <EditIcon />
                <span className={styles.newChatText}>{t('newChat')}</span>
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