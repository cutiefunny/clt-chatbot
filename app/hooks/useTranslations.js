'use client';

import { useChatStore } from '../store/chatStore';
import { locales } from '../lib/locales';

export const useTranslations = () => {
  const { language } = useChatStore();

  const t = (key) => {
    return locales[language][key] || key;
  };

  return { t, language };
};