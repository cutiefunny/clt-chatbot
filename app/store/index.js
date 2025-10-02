import { create } from 'zustand';
import { db, auth, onAuthStateChanged, doc, getDoc, collection, getDocs, writeBatch, serverTimestamp, addDoc } from '../lib/firebase';
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
  db,
  auth,

  ...createAuthSlice(set, get),
  ...createUISlice(set, get),
  ...createChatSlice(set, get),
  ...createScenarioSlice(set, get),
  ...createDevBoardSlice(set, get),
  ...createNotificationSlice(set, get),
  
  setUserAndLoadData: async (user) => {
    set({ user });

    try {
        console.log("Checking for conversation migration...");
        const conversationsRef = collection(get().db, "chats", user.uid, "conversations");
        const snapshot = await getDocs(conversationsRef);
        const batch = writeBatch(get().db);
        let updatesNeeded = 0;
        snapshot.forEach(doc => {
            if (doc.data().pinned === undefined) {
                batch.update(doc.ref, { pinned: false });
                updatesNeeded++;
            }
        });
        if (updatesNeeded > 0) {
            await batch.commit();
            console.log(`Migration complete: ${updatesNeeded} conversations updated.`);
        } else {
            console.log("No conversation migration needed.");
        }
    } catch (error) {
        console.error("Conversation migration failed:", error);
    }

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
    get().loadFavorites(user.uid);
  },

  clearUserAndData: () => {
    get().unsubscribeAll();
        
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
      activeScenarioSessionId: null,
      activeScenarioSessions: [],
      theme,
      fontSize,
      language,
    });
  },

  initAuth: () => {
    get().loadScenarioCategories();
    onAuthStateChanged(get().auth, async (user) => {
      if (user) {
        get().setUserAndLoadData(user);
      } else {
        get().clearUserAndData();
      }
    });
  },

  handleScenarioItemClick: (conversationId, scenario) => {
    if (get().currentConversationId !== conversationId) {
      get().loadConversation(conversationId);
    }
    
    get().setScrollToMessageId(scenario.sessionId);
    
    get().setActivePanel('scenario', scenario.sessionId);

    if (!get().scenarioStates[scenario.sessionId]) {
      get().subscribeToScenarioSession(scenario.sessionId);
    }
  },

  unsubscribeAll: () => {
    get().unsubscribeConversations?.();
    get().unsubscribeAllMessagesAndScenarios();
    get().unsubscribeDevMemos?.();
    get().unsubscribeNotifications?.();
    get().unsubscribeFavorites?.();

    set({ 
        unsubscribeConversations: null, 
        unsubscribeDevMemos: null,
        unsubscribeNotifications: null,
        unsubscribeFavorites: null,
    });
  },
}));

useChatStore.getState().initAuth();
