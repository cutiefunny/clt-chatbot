'use client';

import { useEffect } from 'react';
import { useChatStore } from '../store/chatStore';

export default function ThemeApplier({ children }) {
  const theme = useChatStore((state) => state.theme);

  useEffect(() => {
    // theme 상태에 따라 body에 'dark' 클래스를 추가하거나 제거합니다.
    // 다른 클래스는 전혀 건드리지 않습니다.
    if (theme === 'dark') {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  }, [theme]); // theme이 변경될 때만 이 효과를 실행합니다.

  return <>{children}</>;
}