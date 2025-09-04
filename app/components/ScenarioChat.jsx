'use client';

import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../store/chatStore';
import styles from './Chat.module.css'; 

// --- 👇 [컴포넌트 분리 및 추가] ---
const FormRenderer = ({ node, onFormSubmit }) => {
    const [formData, setFormData] = useState({});

    const handleInputChange = (name, value) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleMultiInputChange = (name, value, checked) => {
        setFormData(prev => {
            const existing = prev[name] || [];
            const newValues = checked ? [...existing, value] : existing.filter(v => v !== value);
            return { ...prev, [name]: newValues };
        });
    };
    
    const handleSubmit = (e) => {
        e.preventDefault();
        onFormSubmit(formData);
    };

    return (
        <form onSubmit={handleSubmit} className={styles.formContainer}>
            <h3>{node.data.title}</h3>
            {node.data.elements?.map(el => (
                <div key={el.id} className={styles.formElement}>
                    <label>{el.label}</label>
                    {el.type === 'input' && <input type="text" placeholder={el.placeholder} value={formData[el.name] || ''} onChange={e => handleInputChange(el.name, e.target.value)} />}
                    {el.type === 'date' && <input type="date" value={formData[el.name] || ''} onChange={e => handleInputChange(el.name, e.target.value)} />}
                    {el.type === 'dropbox' && (
                        <select value={formData[el.name] || ''} onChange={e => handleInputChange(el.name, e.target.value)}>
                            <option value="" disabled>선택...</option>
                            {el.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    )}
                    {el.type === 'checkbox' && el.options?.map(opt => (
                        <div key={opt}>
                            <input type="checkbox" id={`${el.id}-${opt}`} value={opt} onChange={e => handleMultiInputChange(el.name, opt, e.target.checked)} />
                            <label htmlFor={`${el.id}-${opt}`}>{opt}</label>
                        </div>
                    ))}
                </div>
            ))}
            <button type="submit" className={styles.formSubmitButton}>제출</button>
        </form>
    );
};


export default function ScenarioChat() {
  const { 
    scenarioPanel,
    scenarioMessages,
    isScenarioLoading,
    closeScenario,
    handleScenarioResponse, // --- 👈 [추가]
    currentScenarioNodeId, // --- 👈 [추가]
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
  
  const handleFormSubmit = (formData) => {
      handleScenarioResponse({
          scenarioId: scenarioPanel.scenarioId,
          currentNodeId: currentScenarioNodeId,
          formData: formData, // 폼 데이터 전달
      });
  };

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
               {/* --- 👇 [콘텐츠 렌더링 로직 수정] --- */}
               {msg.node?.type === 'form' 
                 ? <FormRenderer node={msg.node} onFormSubmit={handleFormSubmit} />
                 : <p>{msg.text || msg.node?.data.content}</p>
               }
               {msg.node?.type === 'branch' && msg.node.data.replies && (
                  <div className={styles.scenarioList}>
                      {msg.node.data.replies.map(reply => (
                          <button 
                            key={reply.value} 
                            className={styles.optionButton} 
                            onClick={() => handleScenarioResponse({
                                scenarioId: scenarioPanel.scenarioId,
                                currentNodeId: msg.node.id,
                                sourceHandle: reply.value,
                                display: reply.display
                            })}
                          >
                              {reply.display}
                          </button>
                      ))}
                  </div>
               )}
               {/* --- 👆 [여기까지 수정] --- */}
             </div>
          </div>
        ))}
        {isScenarioLoading && <div className={styles.messageRow}><p>...</p></div>}
      </div>
    </div>
  );
}