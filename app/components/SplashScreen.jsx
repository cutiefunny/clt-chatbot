// app/components/SplashScreen.jsx
import { useEffect, useState } from 'react';
import styles from './SplashScreen.module.css';

export default function SplashScreen({ onAnimationEnd }) {
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    // 이 컴포넌트의 총 생명주기는 2초입니다.
    // 1. 1초 후에 아웃트로 애니메이션(페이드 아웃)을 시작합니다.
    const fadeOutTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, 1000); // 1초 (인트로 애니메이션 시간)

    // 2. 총 2초 후에 onAnimationEnd 콜백을 호출하여 부모에게 종료를 알립니다.
    const endTimer = setTimeout(() => {
      if (onAnimationEnd) {
        onAnimationEnd(); // 부모 컴포넌트(page.js)에 알림
      }
    }, 2000); // 1초 (인트로) + 1초 (아웃트로) = 총 2초

    // 컴포넌트가 언마운트될 때 타이머를 정리합니다.
    return () => {
      clearTimeout(fadeOutTimer);
      clearTimeout(endTimer);
    };
  }, [onAnimationEnd]); // onAnimationEnd prop에 의존

  return (
    <div className={`${styles.splashContainer} ${isFadingOut ? styles.fadeOutContainer : ''}`}>
      <img 
        src="/images/chatLogo.png" 
        alt="Chatbot Logo" 
        className={`${styles.splashLogo} ${isFadingOut ? styles.flyAwayLogo : ''}`} 
      />
    </div>
  );
}