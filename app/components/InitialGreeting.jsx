// app/components/InitialGreeting.jsx
import styles from "./InitialGreeting.module.css";
import LogoIcon from "./icons/LogoIcon"; // 로고 아이콘 컴포넌트 (기존 경로 사용)
import { useTranslations } from "../hooks/useTranslations"; // 다국어 지원

export default function InitialGreeting() {
  const { t } = useTranslations();

  return (
    <div className={styles.container}>
      <LogoIcon className={styles.logo} /> {/* 로고 아이콘 */}
      <h2 className={styles.title}>{t("initialGreetingTitle")}</h2> {/* "How can I help you?" */}
      <p className={styles.subtitle}>{t("initialGreetingSubtitle")}</p> {/* "Talk to me naturally. For example, Give Feedback." */}
    </div>
  );
}