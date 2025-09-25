'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useChatStore } from '../store';
import { useTranslations } from '../hooks/useTranslations';
import styles from './Chat.module.css';
import FavoritePanel from './FavoritePanel'; // --- [추가]

export default function Chat() {
  const { messages, isLoading, openScenarioPanel, loadMoreMessages, hasMoreMessages } = useChatStore();
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const historyRef = useRef(null);
  const { t } = useTranslations();

  const handleScroll = useCallback(async () => {
    if (historyRef.current?.scrollTop === 0 && hasMoreMessages && !isFetchingMore) {
        setIsFetchingMore(true);
        await loadMoreMessages();
        setIsFetchingMore(false);
    }
  }, [hasMoreMessages, isFetchingMore, loadMoreMessages]);

  useEffect(() => {
    const scrollContainer = historyRef.current;
    if (!scrollContainer) return;

    // --- 👇 [수정] messages.length > 1 조건 추가 ---
    if (messages.length > 1) {
        const scrollToBottom = () => {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        };
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && !isFetchingMore) {
                    scrollToBottom();
                }
            }
        });
        observer.observe(scrollContainer, { childList: true, subtree: true });
        scrollContainer.addEventListener('scroll', handleScroll);
        
        if (!isFetchingMore) {
            scrollToBottom();
        }

        return () => {
          observer.disconnect();
          scrollContainer.removeEventListener('scroll', handleScroll);
        };
    }
  }, [messages, handleScroll, isFetchingMore]);
  
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
      
      {/* --- 👇 [수정] 대화 내용이 없을 때 FavoritePanel을 렌더링 --- */}
      <div className={styles.history} ref={historyRef}>
        {messages.length <= 1 ? (
          <FavoritePanel />
        ) : (
          <>
            {isFetchingMore && (
                <div className={styles.messageRow}>
                    <img src="/images/avatar-loading.png" alt="Avatar" className={styles.avatar} />
                    <div className={`${styles.message} ${styles.botMessage}`}><img src="/images/Loading.gif" alt={t('loading')} style={{ width: '40px', height: '30px' }} /></div>
                </div>
            )}
            {messages.map((msg) => (
              msg.id !== 'initial' && ( // 초기 메시지는 렌더링하지 않음
                <div key={msg.id} className={`${styles.messageRow} ${msg.sender === 'user' ? styles.userRow : ''}`}>
                  {msg.sender === 'bot' && <img src="/images/avatar.png" alt="Avatar" className={styles.avatar} />}
                  <div 
                    className={`${styles.message} ${msg.sender === 'bot' ? styles.botMessage : styles.userMessage}`}
                    onClick={() => msg.sender === 'bot' && handleCopy(msg.text || msg.node?.data.content, msg.id)}
                  >
                    {copiedMessageId === msg.id && <div className={styles.copyFeedback}>{t('copied')}</div>}
                    
                    {msg.type === 'scenario_resume_prompt' ? (
                      <button className={styles.optionButton} onClick={(e) => { e.stopPropagation(); openScenarioPanel(msg.scenarioId, msg.scenarioSessionId); }}>
                        {t('scenarioResume')(msg.scenarioId)}
                      </button>
                    ) : msg.type === 'scenario_end_notice' ? (
                      <button className={styles.optionButton} onClick={(e) => { e.stopPropagation(); openScenarioPanel(msg.scenarioId, msg.scenarioSessionId); }}>
                        {msg.text}
                      </button>
                    ) : (
                      <p>{msg.text || msg.node?.data.content}</p>
                    )}

                    {msg.sender === 'bot' && msg.scenarios && (
                      <div className={styles.scenarioList}>
                        {msg.scenarios.map(name => (
                          <button key={name} className={styles.optionButton} onClick={(e) => { e.stopPropagation(); openScenarioPanel(name); }}>
                            {name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            ))}
            {messages[messages.length-1]?.sender === 'user' && (
                <div className={styles.messageRow}>
                    <img src="/images/avatar-loading.png" alt="Avatar" className={styles.avatar} />
                    <div className={`${styles.message} ${styles.botMessage}`}><img src="/images/Loading.gif" alt={t('loading')} style={{ width: '40px', height: '30px' }} /></div>
                </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}