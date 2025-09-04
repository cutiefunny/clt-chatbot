'use client';

import { useEffect, useRef } from 'react';
import { useChatStore } from '../store/chatStore';
import styles from './Chat.module.css'; // 기존 스타일 재사용

export default function ScenarioChat() {
  const { 
    scenarioPanel,
    scenarioMessages,
    isScenarioLoading,
    handleScenarioResponse,
    closeScenario,
    currentScenarioNodeId,
  } = useChatStore();

  const historyRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
    if (!isScenarioLoading) {
      inputRef.current?.focus();
    }
  }, [scenarioMessages, isScenarioLoading]);

  if (!scenarioPanel.isOpen) {
    return null;
  }

  const currentBotMessage = scenarioMessages[scenarioMessages.length - 1];
  const currentBotMessageNode = currentBotMessage?.node;

  return (
    <div className={styles.chatContainer} style={{ borderLeft: '1px solid #e0e0e0' }}>
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
        {scenarioMessages.map((msg) => (
          <div key={msg.id} className={`${styles.messageRow} ${msg.sender === 'user' ? styles.userRow : ''}`}>
             {msg.sender === 'bot' && <img src="/images/avatar.png" alt="Avatar" className={styles.avatar} />}
             <div className={`${styles.message} ${msg.sender === 'bot' ? styles.botMessage : styles.userMessage}`}>
               <p>{msg.text || msg.node?.data.content}</p>
             </div>
          </div>
        ))}
        {isScenarioLoading && <div className={styles.messageRow}><p>...</p></div>}
      </div>

      <div className={styles.inputSection}>
        {currentBotMessageNode?.data?.replies?.map(reply => (
          <button
            key={reply.value}
            className={styles.optionButton}
            onClick={() => handleScenarioResponse({ 
                scenarioId: scenarioPanel.scenarioId,
                currentNodeId: currentScenarioNodeId,
                sourceHandle: reply.value,
                userInput: reply.display
            })}
          >
            {reply.display}
          </button>
        ))}
        
        {currentBotMessageNode?.type === 'slotfilling' && (
             <form className={styles.inputForm} onSubmit={(e) => {
                e.preventDefault();
                const input = e.target.elements.userInput.value;
                if (!input.trim()) return;
                handleScenarioResponse({
                    scenarioId: scenarioPanel.scenarioId,
                    currentNodeId: currentScenarioNodeId,
                    userInput: input,
                });
                e.target.reset();
             }}>
                 <input ref={inputRef} name="userInput" className={styles.textInput} />
             </form>
        )}
      </div>
    </div>
  );
}