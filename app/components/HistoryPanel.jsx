'use client';
import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../store';
import { useTranslations } from '../hooks/useTranslations';
import styles from './HistoryPanel.module.css';
import ProfileModal from './ProfileModal';
import SearchModal from './SearchModal';
import DevBoardModal from './DevBoardModal';
import NotificationModal from './NotificationModal';
import ManualModal from './ManualModal'; // --- [추가]
import ConversationItem from './ConversationItem';
import MenuIcon from './icons/MenuIcon'; 
import BellIcon from './icons/BellIcon';
import SearchIcon from './icons/SearchIcon';
import EditIcon from './icons/EditIcon';
import ManualIcon from './icons/ManualIcon'; // --- [추가]

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
    isManualModalOpen, // --- [추가]
    openManualModal, // --- [추가]
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
            {/* --- 👇 [추가된 부분] --- */}
            <button className={styles.iconButton} onClick={openManualModal}>
                <ManualIcon />
            </button>
            {/* --- 👆 [여기까지] --- */}
          </div>
        </div>
      </div>
      
      {isProfileModalOpen && <ProfileModal />}
      {isSearchModalOpen && <SearchModal />}
      {isDevBoardModalOpen && <DevBoardModal />}
      {isNotificationModalOpen && <NotificationModal />}
      {isManualModalOpen && <ManualModal />} {/* --- [추가] --- */}
    </>
  );
}