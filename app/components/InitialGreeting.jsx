// app/components/InitialGreeting.jsx
import styles from "./InitialGreeting.module.css";
import LogoIcon from "./icons/LogoIcon-big";
import { useTranslations } from "../hooks/useTranslations"; // 다국어 지원

export default function InitialGreeting() {
  const { t } = useTranslations();

  return (
    <div className={styles.container}>
      <img src="/images/avatar.png" alt="Chat Logo" className={styles.logo} />
      <h2 className={styles.title}>{t("initialGreetingTitle")}</h2>
      <p className={styles.subtitle}>{t("initialGreetingSubtitle")}</p>
    </div>
  );
}