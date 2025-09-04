'use client';

import { useState, useEffect, useRef } from 'react';
import { useChatStore } from '../store/chatStore';
import styles from './Chat.module.css';

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
  const { messages, isLoading, handleResponse, restart } = useChatStore();
  const messagesEndRef = useRef(null);
  const quickRepliesSlider = useDraggableScroll();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleScenarioButtonClick = (scenarioId) => {
      handleResponse({ text: `시나리오 "${scenarioId}" 시작` });
  }

  const currentBotMessage = messages[messages.length - 1];
  const currentBotMessageNode = currentBotMessage?.node;
  const currentBotMessageScenarios = currentBotMessage?.scenarios;

  return (
    <div className={styles.chatContainer}>
      {/* 헤더 */}
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
      
      {/* 메시지 목록 */}
      <div className={styles.history} ref={messagesEndRef}>
        {messages.map((msg) => (
          <div key={msg.id} className={`${styles.messageRow} ${msg.sender === 'user' ? styles.userRow : ''}`}>
            {msg.sender === 'bot' && <img src="/images/avatar.png" alt="Avatar" className={styles.avatar} />}
            <div className={`${styles.message} ${msg.sender === 'bot' ? styles.botMessage : styles.userMessage}`}>
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

      {/* 하단 입력 영역 */}
      <div className={styles.options}>
        {(currentBotMessageNode?.data?.replies || currentBotMessageScenarios) && (
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
        <div className={styles.textInputRow}>
            <form style={{width: "100%", display: "flex"}} onSubmit={(e) => {
                e.preventDefault();
                const input = e.target.elements.userInput.value;
                if (!input.trim() || isLoading) return;
                handleResponse({ text: input });
                e.target.reset();
            }}>
                <input name="userInput" className={styles.textInput} placeholder="메시지를 입력하세요..." autoComplete="off" disabled={isLoading} />
                {/* <button type="submit" className={styles.sendButton} disabled={isLoading}>전송</button> */}
            </form>
        </div>
      </div>
    </div>
  );
}