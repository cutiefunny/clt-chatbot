'use client';

import { useChatStore } from '../store/chatStore';
import styles from './Login.module.css';

export default function Login() {
  const { login } = useChatStore();

  return (
    <div className={styles.loginContainer}>
      <h2>Welcome</h2>
      <p>Please log in to continue</p>
      <button onClick={login} className={styles.loginButton}>
        Sign in with Google
      </button>
    </div>
  );
}