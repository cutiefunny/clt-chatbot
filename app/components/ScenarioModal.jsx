'use client';

import { useChatStore } from '../store';
import { useTranslations } from '../hooks/useTranslations';
import styles from './ScenarioModal.module.css';
import Modal from './Modal'; // Modal import

export default function ScenarioModal() {
    const scenarioTriggers = useChatStore((state) => state.scenarioTriggers);
    const closeScenarioModal = useChatStore((state) => state.closeScenarioModal);
    const openScenarioPanel = useChatStore((state) => state.openScenarioPanel);
    const handleResponse = useChatStore((state) => state.handleResponse);
    const { t } = useTranslations();

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
        <Modal title={t('startScenario')} onClose={closeScenarioModal} contentStyle={{ maxWidth: '400px' }}>
            <div className={styles.scenarioGrid}>
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
        </Modal>
    );
}