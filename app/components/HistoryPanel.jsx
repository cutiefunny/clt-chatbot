'use client';

import { useChatStore } from '../store/chatStore';
import styles from './HistoryPanel.module.css';

// 아이콘 SVG 정의 (TrashIcon, MenuIcon, EditIcon)
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

export default function HistoryPanel() {
  const { 
    user, 
    logout, 
    conversations, 
    loadConversation, 
    createNewConversation,
    currentConversationId,
    deleteConversation,
    isHistoryPanelOpen,
    toggleHistoryPanel
  } = useChatStore();

  if (!user) return null;

  const handleDelete = (e, convoId) => {
    e.stopPropagation();
    if (window.confirm("정말로 이 대화를 삭제하시겠습니까?")) {
        deleteConversation(convoId);
    }
  }

  return (
    <div className={`${styles.historyPanel} ${isHistoryPanelOpen ? styles.open : styles.closed}`}>
      {/* --- 👇 [수정된 부분] --- */}
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
            <div 
              key={convo.id} 
              className={`${styles.conversationItem} ${convo.id === currentConversationId ? styles.active : ''}`}
              onClick={() => loadConversation(convo.id)}
            >
              <span className={styles.convoTitle}>{convo.title || 'New Chat'}</span>
              <button className={styles.deleteButton} onClick={(e) => handleDelete(e, convo.id)}>
                  <TrashIcon />
              </button>
            </div>
          ))}
        </div>
        <div className={styles.footer}>
          <img src={user.photoURL} alt={user.displayName} className={styles.userAvatar} />
          <span className={styles.userName}>{user.displayName}</span>
          <button onClick={logout} className={styles.logoutButton}>Logout</button>
        </div>
      </div>
      {/* --- 👆 [여기까지] --- */}
    </div>
  );
}