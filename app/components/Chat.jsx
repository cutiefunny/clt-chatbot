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
  // Zustand store에서 상태와 액션을 가져옵니다.
  const { messages, isLoading, handleResponse, restart, startScenario } = useChatStore();
  
  const historyRef = useRef(null);
  const inputRef = useRef(null);
  const quickRepliesSlider = useDraggableScroll();

  useEffect(() => {
    // 대화창 스크롤을 맨 아래로 이동
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
    
    // 포커스 관리 로직
    const lastMessage = messages[messages.length - 1];
    if (!isLoading && !lastMessage?.node) {
        inputRef.current?.focus();
    }
  }, [messages, isLoading]);
  
  const handleScenarioButtonClick = (scenarioId) => {
      // 시나리오 시작 액션 호출
      startScenario(scenarioId);
  }

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
          <button className={styles.headerRestartButton} onClick={restart}>
            Restart
          </button>
        </div>
      </div>
      
      <div className={styles.history} ref={historyRef}>
        {messages.map((msg) => (
          <div key={msg.id} className={`${styles.messageRow} ${msg.sender === 'user' ? styles.userRow : ''}`}>
            {msg.sender === 'bot' && <img src="/images/avatar.png" alt="Avatar" className={styles.avatar} />}
            <div className={`${styles.message} ${msg.sender === 'bot' ? styles.botMessage : styles.userMessage}`}>
              <p>{msg.text || msg.node?.data.content}</p>
              {/* 시나리오 목록 버튼 렌더링 */}
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
        {/* 빠른 응답 버튼(Quick Replies) 렌더링 */}
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
        
        {/* 하단 입력 폼 */}
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