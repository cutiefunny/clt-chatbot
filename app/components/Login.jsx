// app/components/Login.jsx
'use client';

import { useState } from 'react';
import { useChatStore } from '../store';
import { useTranslations } from '../hooks/useTranslations';
import styles from './Login.module.css';

export default function Login() {
  const login = useChatStore((state) => state.login); 
  const { t } = useTranslations();
  const [userId, setUserId] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    // 입력된 ID의 앞뒤 공백만 제거하고 그대로 사용
    const trimmedId = userId.trim();
    if (trimmedId) {
      login(trimmedId);
    }
  };

  return (
    <div className={styles.loginContainer}>
      <h2 className={styles.title}>{t('welcome') || 'Welcome'}</h2>
      <p className={styles.prompt}>
        {t('loginPrompt') || 'Please enter your Test ID to continue.'}
      </p>
      
      <div className={styles.loginOptions}>
        <form onSubmit={handleLogin} className={styles.testIdForm}>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Test ID (e.g. musclecat)"
            className={styles.testIdInput}
          />
          
          <button 
            type="submit" 
            className={styles.testIdButton} 
            disabled={!userId.trim()}
            style={{ marginTop: '10px' }}
          >
            {t('signInWithTestId') || "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}