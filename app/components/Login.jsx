'use client';

import { useChatStore } from '../store/chatStore';
import { useTranslations } from '../hooks/useTranslations';
import styles from './Login.module.css';

export default function Login() {
  const { login } = useChatStore();
  const { t } = useTranslations();

  return (
    <div className={styles.loginContainer}>
      <h2>{t('welcome')}</h2>
      <p>{t('loginPrompt')}</p>
      <button onClick={login} className={styles.loginButton}>
        {t('signInWithGoogle')}
      </button>
    </div>
  );
}