'use client';

import { useEffect } from 'react';
import { useChatStore } from '../store';

export default function ThemeApplier({ children }) {
  // --- 👇 [수정] theme 상태는 더 이상 사용하지 않음 ---
  // const theme = useChatStore((state) => state.theme);
  const fontSize = useChatStore((state) => state.fontSize);
  const fontSizeDefault = useChatStore((state) => state.fontSizeDefault);
  const fontSizeSmall = useChatStore((state) => state.fontSizeSmall);

  useEffect(() => {
    // 항상 light 모드를 적용하기 위해 dark 클래스 제거
    document.body.classList.remove('dark');
  }, []); // 컴포넌트 마운트 시 한 번만 실행
  // --- 👆 [수정] ---

  useEffect(() => {
    document.body.classList.remove('font-small');
    if (fontSize === 'small') {
      document.body.classList.add('font-small');
    }
  }, [fontSize]);

  useEffect(() => {
    document.body.style.setProperty('--font-size-default', fontSizeDefault);
    document.body.style.setProperty('--font-size-small', fontSizeSmall);
  }, [fontSizeDefault, fontSizeSmall]);

  return <>{children}</>;
}