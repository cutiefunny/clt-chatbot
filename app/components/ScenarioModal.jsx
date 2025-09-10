'use client';

import { useChatStore } from '../store/chatStore';
import { useTranslations } from '../hooks/useTranslations';
import styles from './ScenarioModal.module.css';

const CloseIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

export default function ScenarioModal() {
    const { 
        scenarioTriggers, 
        closeScenarioModal,
        openScenarioPanel,
        handleResponse 
    } = useChatStore();
    const { t } = useTranslations();

    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            closeScenarioModal();
        }
    };

    const handleScenarioClick = (trigger) => {
        const scenarioId = scenarioTriggers[trigger];
        
        if (scenarioId === 'GET_SCENARIO_LIST') {
            handleResponse({ text: trigger });
        } else {
            openScenarioPanel(scenarioId);
        }
        closeScenarioModal();
    };

    return (
        <div className={styles.modalOverlay} onClick={handleOverlayClick}>
            <div className={styles.modalContent}>
                <div className={styles.modalHeader}>
                    <h2>{t('startScenario')}</h2>
                    <button onClick={closeScenarioModal} className={styles.closeButton}>
                        <CloseIcon />
                    </button>
                </div>
                <div className={styles.modalBody}>
                    {Object.keys(scenarioTriggers).map((trigger) => (
                        <button 
                            key={trigger} 
                            className={styles.scenarioButton}
                            onClick={() => handleScenarioClick(trigger)}
                        >
                            {trigger}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}