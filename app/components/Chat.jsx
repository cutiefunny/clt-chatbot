'use client';

import { useState, useEffect, useRef } from 'react';
import { useChatStore } from '../store/chatStore';
import styles from './Chat.module.css';


export default function Chat() {
  const { messages, isLoading, createNewConversation } = useChatStore();
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  
  const historyRef = useRef(null);

  useEffect(() => {
    // 대화창 스크롤을 맨 아래로 이동
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [messages]);
  
  const handleCopy = (text, id) => {
    if (!text || text.trim() === '') return;
    
    navigator.clipboard.writeText(text).then(() => {
        setCopiedMessageId(id);
        setTimeout(() => setCopiedMessageId(null), 1500);
    });
  };

  return (
    <div className={styles.chatContainer}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <img src="/images/icon.png" alt="Chatbot Icon" className={styles.headerIcon} />
          <div className={styles.headerTextContainer}>
            <span className={styles.headerTitle}>AI ChatBot</span>
            <span className={styles.headerSubtitle}>Hybrid Assistant</span>
          </div>
        </div>
        <div className={styles.headerButtons}>
          <button className={styles.headerRestartButton} onClick={createNewConversation}>
            New Chat
          </button>
        </div>
      </div>
      
      <div className={styles.history} ref={historyRef}>
        {messages.map((msg) => (
          <div key={msg.id} className={`${styles.messageRow} ${msg.sender === 'user' ? styles.userRow : ''}`}>
            {msg.sender === 'bot' && <img src="/images/avatar.png" alt="Avatar" className={styles.avatar} />}
            <div 
              className={`${styles.message} ${msg.sender === 'bot' ? styles.botMessage : styles.userMessage}`}
              onClick={() => msg.sender === 'bot' && handleCopy(msg.text || msg.node?.data.content, msg.id)}
            >
              {copiedMessageId === msg.id && <div className={styles.copyFeedback}>Copied!</div>}
              <p>{msg.text || msg.node?.data.content}</p>
              {msg.sender === 'bot' && msg.scenarios && (
                <div className={styles.scenarioList}>
                  {msg.scenarios.map(name => (
                    <button key={name} className={styles.optionButton} onClick={() => alert('Scenario button clicked!')}>
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length-1]?.sender === 'user' && (
            <div className={styles.messageRow}>
                <img src="/images/avatar-loading.png" alt="Avatar" className={styles.avatar} />
                <div className={`${styles.message} ${styles.botMessage}`}><img src="/images/Loading.gif" alt="Loading..." style={{ width: '40px', height: '30px' }} /></div>
            </div>
        )}
      </div>
    </div>
  );
}