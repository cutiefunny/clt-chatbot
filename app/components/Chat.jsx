'use client';

import { useState, useEffect, useRef } from 'react';
import { useChatStore } from '../store/chatStore';
import styles from './Chat.module.css';

export default function Chat() {
  const { messages, isLoading, createNewConversation, openScenarioPanel } = useChatStore();
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const historyRef = useRef(null);

  useEffect(() => {
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;

    const scrollToBottom = () => {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    };

    scrollToBottom();

    const observer = new MutationObserver(scrollToBottom);

    observer.observe(scrollContainer, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
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
              {/* --- 👇 [수정된 부분] --- */}
              <p>{msg.text || msg.node?.data.content}</p>
              {/* --- 👆 [여기까지] --- */}
              {msg.sender === 'bot' && msg.scenarios && (
                <div className={styles.scenarioList}>
                  {msg.scenarios.map(name => (
                    <button key={name} className={styles.optionButton} onClick={() => openScenarioPanel(name)}>
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