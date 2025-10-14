'use client';

import { useChatStore } from '../store';
import { locales } from '../lib/locales';

export const useTranslations = () => {
  const language = useChatStore((state) => state.language);

  const t = (key) => {
    const translation = locales[language]?.[key] || key;
    return typeof translation === 'function' ? (...args) => translation(...args) : translation;
  };

  return { t, language };
};