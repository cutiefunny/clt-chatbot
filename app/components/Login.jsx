'use client';

import { useState } from 'react';
import { useChatStore } from '../store';
import { useTranslations } from '../hooks/useTranslations';
import styles from './Login.module.css';

export default function Login() {
  const loginWithGoogle = useChatStore((state) => state.loginWithGoogle);
  const loginWithTestId = useChatStore((state) => state.loginWithTestId);
  const { t } = useTranslations();
  const [testId, setTestId] = useState('');

  const handleTestLogin = (e) => {
    e.preventDefault();
    loginWithTestId(testId);
  };

  return (
    <div className={styles.loginContainer}>
      <h2 className={styles.title}>{t('welcome')}</h2>
      <p className={styles.prompt}>{t('loginPrompt')}</p>
      
      <div className={styles.loginOptions}>
        <button onClick={loginWithGoogle} className={styles.googleButton}>
          {t('signInWithGoogle')}
        </button>
        
        <div className={styles.divider}>
            <span>{t('loginMethodToggle')}</span>
        </div>
        
        <form onSubmit={handleTestLogin} className={styles.testIdForm}>
          <input
            type="text"
            value={testId}
            onChange={(e) => setTestId(e.target.value)}
            placeholder={t('testIdPlaceholder')}
            className={styles.testIdInput}
          />
          <button type="submit" className={styles.testIdButton} disabled={!testId.trim()}>
            {t('signInWithTestId')}
          </button>
        </form>
      </div>
    </div>
  );
}