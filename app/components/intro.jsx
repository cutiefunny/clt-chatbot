import styles from './intro.module.css';
import { useTranslations } from '../hooks/useTranslations';

export default function Intro() {
  const { t } = useTranslations();

  return (
    <div className={styles.animationContainer}>
      <div className={styles.logoContainer}>
        <img src="/images/avatar.png" alt="Bot Avatar" className={styles.logo} />
      </div>

      <div className={styles.textBox}>
        <h1>{t("initialGreetingTitle")}</h1>
        <p>{t("initialGreetingSubtitle")}</p>
      </div>
    </div>
  );
}