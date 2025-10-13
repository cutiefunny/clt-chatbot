import { doc, setDoc, getDoc } from 'firebase/firestore'; // getDoc 추가
import { locales } from '../../lib/locales';

const getInitialMessages = (lang = 'ko') => {
  return [{ id: 'initial', sender: 'bot', text: locales[lang].initialBotMessage }];
};

export const createUISlice = (set, get) => ({
  // State
  theme: 'light',
  fontSize: 'default',
  language: 'ko',
  maxFavorites: 10, // 기본값 설정
  isProfileModalOpen: false,
  isSearchModalOpen: false,
  isScenarioModalOpen: false,
  isDevBoardModalOpen: false,
  isNotificationModalOpen: false,
  isManualModalOpen: false,
  isHistoryPanelOpen: false,
  confirmModal: {
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    onConfirm: () => {},
    confirmVariant: 'default',
  },
  activePanel: 'main', 
  focusRequest: 0,
  shortcutMenuOpen: null,
  ephemeralToast: {
    visible: false,
    message: '',
    type: 'info',
  },
  scrollToMessageId: null, 

  // Actions
  loadGeneralConfig: async () => {
    try {
      const configRef = doc(get().db, 'config', 'general');
      const docSnap = await getDoc(configRef);
      if (docSnap.exists()) {
        const config = docSnap.data();
        if (typeof config.maxFavorites === 'number') {
          set({ maxFavorites: config.maxFavorites });
        }
      }
    } catch (error) {
      console.error("Error loading general config from Firestore:", error);
    }
  },

  saveGeneralConfig: async (settings) => {
    try {
      const configRef = doc(get().db, 'config', 'general');
      await setDoc(configRef, settings, { merge: true });
      // 성공 시 상태 업데이트
      if (typeof settings.maxFavorites === 'number') {
        set({ maxFavorites: settings.maxFavorites });
      }
      return true;
    } catch (error) {
      console.error("Error saving general config to Firestore:", error);
      return false;
    }
  },

  setScrollToMessageId: (id) => set({ scrollToMessageId: id }), 

  setShortcutMenuOpen: (menuName) => set({ shortcutMenuOpen: menuName }),

  showEphemeralToast: (message, type = 'info') => {
    set({ ephemeralToast: { visible: true, message, type } });
    setTimeout(() => {
      set(state => ({ ephemeralToast: { ...state.ephemeralToast, visible: false } }));
    }, 3000);
  },
  hideEphemeralToast: () => {
     set(state => ({ ephemeralToast: { ...state.ephemeralToast, visible: false } }));
  },
  
  setTheme: async (newTheme) => {
    if (get().theme === newTheme) return;
    set({ theme: newTheme });
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', newTheme);
    }
    const user = get().user;
    if (user) {
      try {
        const userSettingsRef = doc(get().db, 'settings', user.uid);
        await setDoc(userSettingsRef, { theme: newTheme }, { merge: true });
      } catch (error) {
        console.error("Error saving theme to Firestore:", error);
      }
    }
  },
  
  toggleTheme: async () => {
    const newTheme = get().theme === 'light' ? 'dark' : 'light';
    await get().setTheme(newTheme);
  },

  setFontSize: async (size) => {
    set({ fontSize: size });
    if (typeof window !== 'undefined') {
      localStorage.setItem('fontSize', size);
    }
    const user = get().user;
    if (user) {
      try {
        const userSettingsRef = doc(get().db, 'settings', user.uid);
        await setDoc(userSettingsRef, { fontSize: size }, { merge: true });
      } catch (error) {
        console.error("Error saving font size to Firestore:", error);
      }
    }
  },

  setLanguage: async (lang) => {
    set({ language: lang });
    if (typeof window !== 'undefined') {
      localStorage.setItem('language', lang);
    }
    const user = get().user;
    if (user) {
      try {
        const userSettingsRef = doc(get().db, 'settings', user.uid);
        await setDoc(userSettingsRef, { language: lang }, { merge: true });
      } catch (error) {
        console.error("Error saving language to Firestore:", error);
      }
    }
    const { currentConversationId, messages } = get();
    if (!currentConversationId || messages.length <= 1) {
      set({ messages: getInitialMessages(lang) });
    }
  },

  openProfileModal: () => set({ isProfileModalOpen: true }),
  closeProfileModal: () => set({ isProfileModalOpen: false }),
  openSearchModal: () => set({ isSearchModalOpen: true, searchResults: [], isSearching: false }),
  closeSearchModal: () => set({ isSearchModalOpen: false }),
  openScenarioModal: () => set({ isScenarioModalOpen: true }),
  closeScenarioModal: () => set({ isScenarioModalOpen: false }),
  openDevBoardModal: () => set({ isDevBoardModalOpen: true }),
  closeDevBoardModal: () => set({ isDevBoardModalOpen: false }),
  openNotificationModal: () => set({ isNotificationModalOpen: true }),
  closeNotificationModal: () => set({ isNotificationModalOpen: false }),
  openManualModal: () => set({ isManualModalOpen: true }),
  closeManualModal: () => set({ isManualModalOpen: false }),

  openConfirmModal: (config) => set((state) => ({
    confirmModal: { ...state.confirmModal, isOpen: true, ...config },
  })),
  closeConfirmModal: () => set((state) => ({
    confirmModal: { ...state.confirmModal, isOpen: false },
  })),

  toggleHistoryPanel: () => set(state => ({ isHistoryPanelOpen: !state.isHistoryPanelOpen })),
  
  setActivePanel: (panel, sessionId = null) => {
      if (panel === 'scenario') {
          set({ activePanel: panel, activeScenarioSessionId: sessionId });
      } else {
          set({ activePanel: 'main', activeScenarioSessionId: null });
      }
      get().focusChatInput();
  },

  focusChatInput: () => set(state => ({ focusRequest: state.focusRequest + 1 })),
});