'use client';

import { useChatStore } from '../store/chatStore';
import styles from './HistoryPanel.module.css';

// 휴지통 아이콘 SVG
const TrashIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 6H5H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

// --- 👇 [추가] 메뉴(햄버거) 아이콘 ---
const MenuIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 6H20M4 12H20M4 18H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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
    isHistoryPanelOpen, // --- 👈 [추가] 상태 가져오기
    toggleHistoryPanel  // --- 👈 [추가] 액션 가져오기
  } = useChatStore();

  if (!user) return null;

  const handleDelete = (e, convoId) => {
    e.stopPropagation();
    if (window.confirm("정말로 이 대화를 삭제하시겠습니까?")) {
        deleteConversation(convoId);
    }
  }

  return (
    // --- 👇 [수정] 상태에 따라 클래스 동적 할당 ---
    <div className={`${styles.historyPanel} ${isHistoryPanelOpen ? styles.open : styles.closed}`}>
      <div className={styles.topSection}>
        <button className={styles.toggleButton} onClick={toggleHistoryPanel}>
            <MenuIcon />
        </button>
      </div>
    {/* --- 👆 [여기까지] --- */}

      <div className={styles.header}>
        <button className={styles.newChatButton} onClick={createNewConversation}>
          + New Chat
        </button>
      </div>
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
  );
}