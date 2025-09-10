'use client';

import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../store';
import { useTranslations } from '../hooks/useTranslations';
import styles from './Chat.module.css'; 

const FormRenderer = ({ node, onFormSubmit }) => {
    const [formData, setFormData] = useState({});
    const dateInputRef = useRef(null);
    const { t } = useTranslations();

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

    const handleDateInputClick = () => {
        try {
            dateInputRef.current?.showPicker();
        } catch (error) {
            console.error("Failed to show date picker:", error);
        }
    };

    return (
        <form onSubmit={handleSubmit} className={styles.formContainer}>
            <h3>{node.data.title}</h3>
            {node.data.elements?.map(el => (
                <div key={el.id} className={styles.formElement}>
                    <label className={styles.formLabel}>{el.label}</label>
                    {el.type === 'input' && <input className={styles.formInput} type="text" placeholder={el.placeholder} value={formData[el.name] || ''} onChange={e => handleInputChange(el.name, e.target.value)} />}
                    
                    {el.type === 'date' && (
                        <input 
                            ref={dateInputRef}
                            className={styles.formInput} 
                            type="date" 
                            value={formData[el.name] || ''} 
                            onChange={e => handleInputChange(el.name, e.target.value)}
                            onClick={handleDateInputClick}
                        />
                    )}

                    {el.type === 'dropbox' && (
                        <select value={formData[el.name] || ''} onChange={e => handleInputChange(el.name, e.target.value)}>
                            <option value="" disabled>{t('select')}</option>
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
            <button type="submit" className={styles.formSubmitButton}>{t('submit')}</button>
        </form>
    );
};

export default function ScenarioChat() {
  const { 
    isScenarioPanelOpen,
    activeScenarioId,
    scenarioStates,
    handleScenarioResponse,
    setScenarioPanelOpen,
    endScenario,
  } = useChatStore();
  const { t } = useTranslations();

  const activeScenario = activeScenarioId ? scenarioStates[activeScenarioId] : null;
  const scenarioMessages = activeScenario?.messages || [];
  const isScenarioLoading = activeScenario?.isLoading || false;
  const currentScenarioNodeId = activeScenario?.state?.currentNodeId;
  
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
  }, [scenarioMessages]);

  if (!isScenarioPanelOpen || !activeScenario) {
    return null;
  }
  
  const handleFormSubmit = (formData) => {
      handleScenarioResponse({
          scenarioId: activeScenarioId,
          currentNodeId: currentScenarioNodeId,
          formData: formData,
      });
  };

  return (
    <div className={styles.chatContainer} style={{ height: '100%' }}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <span className={styles.headerTitle}>{t('scenarioTitle')(activeScenarioId)}</span>
        </div>
        <div className={styles.headerButtons}>
           <button className={styles.headerRestartButton} onClick={(e) => { e.stopPropagation(); setScenarioPanelOpen(false); }}>
            {t('hide')}
          </button>
          <button className={`${styles.headerRestartButton} ${styles.dangerButton}`} onClick={(e) => { e.stopPropagation(); endScenario(activeScenarioId); }}>
            {t('end')}
          </button>
        </div>
      </div>
      
      <div className={styles.history} ref={historyRef}>
        {scenarioMessages.map((msg, index) => (
          <div key={`${msg.id}-${index}`} className={`${styles.messageRow} ${msg.sender === 'user' ? styles.userRow : ''}`}>
             {msg.sender === 'bot' && <img src="/images/avatar.png" alt="Avatar" className={styles.avatar} />}
             <div className={`${styles.message} ${msg.sender === 'bot' ? styles.botMessage : styles.userMessage}`}>
               {msg.node?.type === 'form' ? (
                 <FormRenderer node={msg.node} onFormSubmit={handleFormSubmit} />
               ) : (
                 <p>{msg.text || msg.node?.data.content}</p>
               )}
               {msg.node?.type === 'branch' && msg.node.data.replies && (
                 <div className={styles.scenarioList}>
                     {msg.node.data.replies.map(reply => (
                         <button 
                           key={reply.value} 
                           className={styles.optionButton} 
                           onClick={() => handleScenarioResponse({
                               scenarioId: activeScenarioId,
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
             </div>
          </div>
        ))}
        {isScenarioLoading && <div className={styles.messageRow}><p>{t('loading')}...</p></div>}
      </div>
    </div>
  );
}