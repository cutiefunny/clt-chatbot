'use client';

import { useEffect } from 'react';
import { useChatStore } from '../store';

export default function ThemeApplier({ children }) {
  const theme = useChatStore((state) => state.theme);
  const fontSize = useChatStore((state) => state.fontSize); // --- 👈 [추가]

  useEffect(() => {
    if (theme === 'dark') {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  }, [theme]);
  
  // --- 👇 [추가된 부분] ---
  useEffect(() => {
    document.body.classList.remove('font-small');
    if (fontSize === 'small') {
      document.body.classList.add('font-small');
    }
  }, [fontSize]);
  // --- 👆 [여기까지] ---

  return <>{children}</>;
}