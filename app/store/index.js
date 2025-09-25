import { create } from 'zustand';
import { db, auth, onAuthStateChanged, doc, getDoc } from '../lib/firebase';
import { locales } from '../lib/locales';

import { createAuthSlice } from './slices/authSlice';
import { createUISlice } from './slices/uiSlice';
import { createChatSlice } from './slices/chatSlice';
import { createScenarioSlice } from './slices/scenarioSlice';
import { createDevBoardSlice } from './slices/devBoardSlice';
import { createNotificationSlice } from './slices/notificationSlice';

const getInitialMessages = (lang = 'ko') => {
  return [{ id: 'initial', sender: 'bot', text: locales[lang].initialBotMessage }];
};

export const useChatStore = create((set, get) => ({
  // Firebase instances
  db,
  auth,

  // Slices
  ...createAuthSlice(set, get),
  ...createUISlice(set, get),
  ...createChatSlice(set, get),
  ...createScenarioSlice(set, get),
  ...createDevBoardSlice(set, get),
  ...createNotificationSlice(set, get),

  // Actions that cross multiple slices
  initAuth: () => {
    get().loadScenarioCategories(); // --- [수정] 함수명 변경
    onAuthStateChanged(get().auth, async (user) => {
      if (user) {
        set({ user });
        try {
          const userSettingsRef = doc(get().db, 'settings', user.uid);
          const docSnap = await getDoc(userSettingsRef);
          const settings = docSnap.exists() ? docSnap.data() : {};
          
          const theme = settings.theme || localStorage.getItem('theme') || 'light';
          const fontSize = settings.fontSize || localStorage.getItem('fontSize') || 'default';
          const language = settings.language || localStorage.getItem('language') || 'ko';
          
          set({ theme, fontSize, language, messages: getInitialMessages(language) });
        } catch (error) {
          console.error("Error loading settings from Firestore:", error);
          const theme = localStorage.getItem('theme') || 'light';
          const fontSize = localStorage.getItem('fontSize') || 'default';
          const language = localStorage.getItem('language') || 'ko';
          set({ theme, fontSize, language, messages: getInitialMessages(language) });
        }
        
        get().unsubscribeAll();
        get().loadConversations(user.uid);
        get().loadDevMemos();
        get().loadNotifications(user.uid);
      } else {
        get().unsubscribeAll();
        const currentCategories = get().scenarioCategories; // --- [수정]
        
        let theme = 'light';
        let fontSize = 'default';
        let language = 'ko';
        if (typeof window !== 'undefined') {
           theme = localStorage.getItem('theme') || 'light';
           fontSize = localStorage.getItem('fontSize') || 'default';
           language = localStorage.getItem('language') || 'ko';
        }
        
        set({
          user: null,
          messages: getInitialMessages(language),
          conversations: [],
          currentConversationId: null,
          scenarioStates: {},
          activeScenarioId: null,
          isScenarioPanelOpen: false,
          scenarioCategories: currentCategories, // --- [수정]
          theme,
          fontSize,
          language,
        });
      }
    });
  },

  unsubscribeAll: () => {
    get().unsubscribeConversations?.();
    get().unsubscribeMessages?.();
    get().unsubscribeDevMemos?.();
    get().unsubscribeNotifications?.();
    set({ 
        unsubscribeConversations: null, 
        unsubscribeMessages: null, 
        unsubscribeDevMemos: null,
        unsubscribeNotifications: null 
    });
  },
}));

// Initialize authentication listener when the store is created
useChatStore.getState().initAuth();