import styles from './intro.module.css';

export default function Intro() {
  return (
    <div className={styles.animationContainer}>
       <div className={styles.iconContainer}>
            <div className={styles.iconbg}><img src="/images/Symbol.png" /></div>
            <div className={styles.iconcon}><img src="/images/Symbol_icon.png" /></div>
       </div>
       
        <div className={styles.textBox}>
            <h1>How can I help you?</h1>
            <p>Talk to me naturally. For example, Give Feedback.</p>
        </div>
    </div>
  );
}