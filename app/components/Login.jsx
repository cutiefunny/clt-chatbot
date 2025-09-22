"use client";

import { useChatStore } from "../store";
import { useTranslations } from "../hooks/useTranslations";
import styles from "./Login.module.css";

export default function Login() {
  const { login } = useChatStore();
  const { t } = useTranslations();

  return (
    <div className={styles.loginContainer}>
      <h2 className={styles.welcomeText}>Welcome to</h2>
      <h2>NX AI Chatbot</h2>
      <div className={styles.inputContainer}>
        <input type="text" placeholder="ID" />
        <input type="password" placeholder="Password" />
        <button className={styles.loginButton}>{t("Sign In")}</button>
      </div>
      <button onClick={login} className={styles.loginButton}>
        {t("signInWithGoogle")}
      </button>
    </div>
  );
}
