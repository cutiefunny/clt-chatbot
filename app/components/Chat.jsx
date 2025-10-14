'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useChatStore } from '../store';
import { useTranslations } from '../hooks/useTranslations';
import styles from './Chat.module.css';
import FavoritePanel from './FavoritePanel';
import ScenarioBubble from './ScenarioBubble';

export default function Chat() {
  const messages = useChatStore((state) => state.messages);
  const isLoading = useChatStore((state) => state.isLoading);
  const openScenarioPanel = useChatStore((state) => state.openScenarioPanel);
  const loadMoreMessages = useChatStore((state) => state.loadMoreMessages);
  const hasMoreMessages = useChatStore((state) => state.hasMoreMessages);
  const theme = useChatStore((state) => state.theme);
  const setTheme = useChatStore((state) => state.setTheme);
  const fontSize = useChatStore((state) => state.fontSize);
  const setFontSize = useChatStore((state) => state.setFontSize);
  const scrollToMessageId = useChatStore((state) => state.scrollToMessageId);
  const setScrollToMessageId = useChatStore((state) => state.setScrollToMessageId);
  const activePanel = useChatStore((state) => state.activePanel);
  const setActivePanel = useChatStore((state) => state.setActivePanel);
  
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const historyRef = useRef(null);
  const { t } = useTranslations();

  const handleContainerClick = () => {
    if (activePanel !== 'main') {
      setActivePanel('main');
    }
  };

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

    const scrollToBottom = () => {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    };

    const observer = new MutationObserver((mutations) => {
        // activePanel이 'main'일 때만 자동 스크롤 실행
        if (activePanel === 'main') {
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && !isFetchingMore) {
                    scrollToBottom();
                }
            }
        }
    });

    observer.observe(scrollContainer, { childList: true, subtree: true });
    scrollContainer.addEventListener('scroll', handleScroll);
    
    if (!isFetchingMore && activePanel === 'main') {
        scrollToBottom();
    }

    return () => {
      observer.disconnect();
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [messages, handleScroll, isFetchingMore, activePanel]); // 의존성 배열에 activePanel 추가
  
  useEffect(() => {
    if (scrollToMessageId && historyRef.current) {
      const element = historyRef.current.querySelector(`[data-message-id="${scrollToMessageId}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add(styles.highlightedMessage);
        setTimeout(() => {
          element.classList.remove(styles.highlightedMessage);
        }, 800);
        setScrollToMessageId(null);
      }
    }
  }, [scrollToMessageId, messages, setScrollToMessageId]);
  
  const handleCopy = (text, id) => {
    if (!text || text.trim() === '') return;
    
    navigator.clipboard.writeText(text).then(() => {
        setCopiedMessageId(id);
        setTimeout(() => setCopiedMessageId(null), 1500);
    });
  };

  const hasMessages = messages.some(m => m.id !== 'initial');

  return (
    <div className={styles.chatContainer} onClick={handleContainerClick}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <img src="/images/icon.png" alt="Chatbot Icon" className={styles.headerIcon} />
          <div className={styles.headerTextContainer}>
            <span className={styles.headerTitle}>AI ChatBot</span>
            <span className={styles.headerSubtitle}>Hybrid Assistant</span>
          </div>
        </div>
        <div className={styles.headerButtons}>
            <div className={styles.settingControl}>
                <span className={styles.settingLabel}>Large text</span>
                <label className={styles.switch}>
                    <input
                        type="checkbox"
                        checked={fontSize === 'default'}
                        onChange={() => setFontSize(fontSize === 'default' ? 'small' : 'default')}
                    />
                    <span className={styles.slider}></span>
                </label>
            </div>

            <div className={styles.separator}></div>

            <div className={styles.themeControl}>
                <button
                    className={`${styles.themeButton} ${theme === 'light' ? styles.active : ''}`}
                    onClick={() => setTheme('light')}
                >
                    {theme === 'light' && '✓ '}Light
                </button>
                <button
                    className={`${styles.themeButton} ${theme === 'dark' ? styles.active : ''}`}
                    onClick={() => setTheme('dark')}
                >
                    {theme === 'dark' && '✓ '}Dark
                </button>
            </div>
        </div>
      </div>
      
      <div className={styles.history} ref={historyRef}>
        {!hasMessages ? (
          <FavoritePanel />
        ) : (
          <>
            {isFetchingMore && (
                <div className={styles.messageRow}>
                    <img src="/images/avatar-loading.png" alt="Avatar" className={styles.avatar} />
                    <div className={`${styles.message} ${styles.botMessage}`}><img src="/images/Loading.gif" alt={t('loading')} style={{ width: '40px', height: '30px' }} /></div>
                </div>
            )}
            {messages.map((msg) => {
              if (msg.id === 'initial') return null;

              if (msg.type === 'scenario_bubble') {
                return <ScenarioBubble key={msg.id} scenarioSessionId={msg.scenarioSessionId} />;
              }
              
              const isMainChatDimmed = activePanel === 'scenario';

              return (
                <div 
                    key={msg.id} 
                    className={`${styles.messageRow} ${msg.sender === 'user' ? styles.userRow : ''} ${isMainChatDimmed ? styles.dimmedMessage : ''}`}
                    data-message-id={msg.id}
                >
                  {msg.sender === 'bot' && <img src="/images/avatar.png" alt="Avatar" className={styles.avatar} />}
                  <div 
                    className={`${styles.message} ${msg.sender === 'bot' ? styles.botMessage : styles.userMessage}`}
                    onClick={() => msg.sender === 'bot' && handleCopy(msg.text || msg.node?.data.content, msg.id)}
                  >
                    {copiedMessageId === msg.id && <div className={styles.copyFeedback}>{t('copied')}</div>}
                    
                    {msg.text && <p>{msg.text}</p>}

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
              );
            })}
            {isLoading && (
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