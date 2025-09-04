'use client';

import { useState, useEffect, useRef } from 'react';
import { useChatStore } from '../store/chatStore';
import styles from './Chat.module.css';

// '+' 아이콘 SVG 컴포넌트
const AttachIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" stroke="#555" strokeWidth="1.5"/>
        <path d="M12 8V16" stroke="#555" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M8 12H16" stroke="#555" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
);

// 드래그 스크롤을 위한 커스텀 훅
const useDraggableScroll = () => {
    const ref = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);

    const onMouseDown = (e) => {
        setIsDragging(true);
        if (ref.current) {
            setStartX(e.pageX - ref.current.offsetLeft);
            setScrollLeft(ref.current.scrollLeft);
        }
    };
    const onMouseLeave = () => setIsDragging(false);
    const onMouseUp = () => setIsDragging(false);
    const onMouseMove = (e) => {
        if (!isDragging || !ref.current) return;
        e.preventDefault();
        const x = e.pageX - ref.current.offsetLeft;
        const walk = (x - startX) * 2;
        ref.current.scrollLeft = scrollLeft - walk;
    };
    return { ref, isDragging, onMouseDown, onMouseLeave, onMouseUp, onMouseMove };
};


export default function Chat() {
  const { messages, isLoading, handleResponse, createNewConversation, startScenario } = useChatStore();
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  
  const historyRef = useRef(null);
  const inputRef = useRef(null);
  const quickRepliesSlider = useDraggableScroll();

  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
    
    const lastMessage = messages[messages.length - 1];
    if (!isLoading && !lastMessage?.node) {
        inputRef.current?.focus();
    }
  }, [messages, isLoading]);
  
  const handleScenarioButtonClick = (scenarioId) => {
      startScenario(scenarioId);
  }

  const handleCopy = (text, id) => {
    // 텍스트가 있는 경우에만 복사 로직 실행
    if (!text || text.trim() === '') return;
    
    navigator.clipboard.writeText(text).then(() => {
        setCopiedMessageId(id);
        setTimeout(() => setCopiedMessageId(null), 1500); // 1.5초 후 '복사됨!' 메시지 숨김
    });
  };

  const currentBotMessage = messages[messages.length - 1];
  const currentBotMessageNode = currentBotMessage?.node;

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
            {/* --- 👇 [수정된 부분] --- */}
            <div 
              className={`${styles.message} ${msg.sender === 'bot' ? styles.botMessage : styles.userMessage}`}
              onClick={() => msg.sender === 'bot' && handleCopy(msg.text || msg.node?.data.content, msg.id)}
            >
              {copiedMessageId === msg.id && <div className={styles.copyFeedback}>Copied!</div>}
            {/* --- 👆 [여기까지 수정] --- */}
              <p>{msg.text || msg.node?.data.content}</p>
              {msg.sender === 'bot' && msg.scenarios && (
                <div className={styles.scenarioList}>
                  {msg.scenarios.map(name => (
                    <button key={name} className={styles.optionButton} onClick={() => handleScenarioButtonClick(name)}>
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
            <div className={styles.messageRow}>
                <img src="/images/avatar-loading.png" alt="Avatar" className={styles.avatar} />
                <div className={`${styles.message} ${styles.botMessage}`}><img src="/images/Loading.gif" alt="Loading..." style={{ width: '40px', height: '30px' }} /></div>
            </div>
        )}
      </div>

      <div className={styles.inputSection}>
        {(currentBotMessageNode?.data?.replies) && (
             <div className={styles.buttonRow}>
                <div 
                    ref={quickRepliesSlider.ref}
                    className={`${styles.quickRepliesContainer} ${quickRepliesSlider.isDragging ? styles.dragging : ''}`}
                    onMouseDown={quickRepliesSlider.onMouseDown}
                    onMouseLeave={quickRepliesSlider.onMouseLeave}
                    onMouseUp={quickRepliesSlider.onMouseUp}
                    onMouseMove={quickRepliesSlider.onMouseMove}
                >
                    {currentBotMessageNode?.data?.replies?.map(reply => (
                    <button key={reply.value} className={styles.optionButton} onClick={() => handleResponse({ sourceHandle: reply.value, text: reply.display })} disabled={isLoading}>
                        {reply.display}
                    </button>
                    ))}
                </div>
            </div>
        )}
        
        <form className={styles.inputForm} onSubmit={(e) => {
            e.preventDefault();
            const input = e.target.elements.userInput.value;
            if (!input.trim() || isLoading) return;
            handleResponse({ text: input });
            e.target.reset();
        }}>
            <button type="button" className={styles.attachButton}>
                <AttachIcon />
            </button>
            <input 
              ref={inputRef} 
              name="userInput" 
              className={styles.textInput} 
              placeholder="Ask about this Booking Master Page" 
              autoComplete="off" 
              disabled={isLoading} 
            />
        </form>
      </div>
    </div>
  );
}