'use client';

import { useEffect, useRef } from 'react';
import { useChatStore } from '../store/chatStore';
import styles from './Chat.module.css'; 

export default function ScenarioChat() {
  const { 
    scenarioPanel,
    scenarioMessages,
    isScenarioLoading,
    closeScenario,
  } = useChatStore();

  const historyRef = useRef(null);

  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [scenarioMessages]);

  if (!scenarioPanel.isOpen) {
    return null;
  }

  return (
    <div className={styles.chatContainer} style={{ height: '100%' }}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <span className={styles.headerTitle}>시나리오: {scenarioPanel.scenarioId}</span>
        </div>
        <div className={styles.headerButtons}>
          <button className={styles.headerRestartButton} onClick={closeScenario}>
            닫기
          </button>
        </div>
      </div>
      
      <div className={styles.history} ref={historyRef}>
        {scenarioMessages.map((msg, index) => (
          <div key={`${msg.id}-${index}`} className={`${styles.messageRow} ${msg.sender === 'user' ? styles.userRow : ''}`}>
             {msg.sender === 'bot' && <img src="/images/avatar.png" alt="Avatar" className={styles.avatar} />}
             <div className={`${styles.message} ${msg.sender === 'bot' ? styles.botMessage : styles.userMessage}`}>
               <p>{msg.text || msg.node?.data.content}</p>
             </div>
          </div>
        ))}
        {isScenarioLoading && <div className={styles.messageRow}><p>...</p></div>}
      </div>
    </div>
  );
}