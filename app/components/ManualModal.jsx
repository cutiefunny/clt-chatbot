'use client';

import { useState } from 'react';
import { useChatStore } from '../store';
import { useTranslations } from '../hooks/useTranslations';
import styles from './ManualModal.module.css';
import Modal from './Modal';

export default function ManualModal() {
    const closeManualModal = useChatStore((state) => state.closeManualModal);
    const { t, language } = useTranslations();
    const [manualLang, setManualLang] = useState(language);

    const manualContent = (lang) => {
        const content = t('manualContent');
        return content[lang] || content['en'];
    };

    return (
        <Modal title={t('manualTitle')} onClose={closeManualModal} contentStyle={{ maxWidth: '600px', height: '70vh' }}>
            <div className={styles.manualContainer}>
                <div className={styles.toolbar}>
                    <div className={styles.languageSelector}>
                        <button 
                            className={`${styles.langButton} ${manualLang === 'en' ? styles.active : ''}`}
                            onClick={() => setManualLang('en')}
                        >
                            English
                        </button>
                        <button 
                            className={`${styles.langButton} ${manualLang === 'ko' ? styles.active : ''}`}
                            onClick={() => setManualLang('ko')}
                        >
                            한국어
                        </button>
                    </div>
                </div>
                <div className={styles.manualContent} dangerouslySetInnerHTML={{ __html: manualContent(manualLang) }} />
            </div>
        </Modal>
    );
}