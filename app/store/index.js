import { create } from 'zustand';
import { db, auth, onAuthStateChanged, doc, getDoc, collection, getDocs, writeBatch } from '../lib/firebase'; // Firestore import 추가
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
  
  // --- 👇 [수정된 부분] ---
  handleScenarioItemClick: (conversationId, scenario) => {
    // 1. 현재 대화와 클릭된 시나리오의 대화가 다를 경우에만 대화를 새로 로드합니다.
    if (get().currentConversationId !== conversationId) {
      get().loadConversation(conversationId);
    }
    
    // 2. 스크롤 및 하이라이트할 메시지(시나리오)의 고유 ID를 스토어에 저장합니다.
    get().setScrollToMessageId(scenario.sessionId);

    // 3. 우측 시나리오 패널을 열고, 활성화할 시나리오를 지정합니다. 메인 패널은 그대로 유지합니다.
    set({
      isScenarioPanelOpen: true,
      activeScenarioSessionId: scenario.sessionId,
      activePanel: 'main'
    });

    // 4. 해당 시나리오 세션의 실시간 업데이트를 구독합니다.
    if (!get().scenarioStates[scenario.sessionId]) {
      get().subscribeToScenarioSession(scenario.sessionId);
    }
  },
  // --- 👆 [여기까지] ---

  initAuth: () => {
    get().loadScenarioCategories();
    onAuthStateChanged(get().auth, async (user) => {
      if (user) {
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
      } else {
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
          activeScenarioId: null,
          isScenarioPanelOpen: false,
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
    get().unsubscribeFavorites?.();
    set({ 
        unsubscribeConversations: null, 
        unsubscribeMessages: null, 
        unsubscribeDevMemos: null,
        unsubscribeNotifications: null,
        unsubscribeFavorites: null,
    });
  },
}));

useChatStore.getState().initAuth();