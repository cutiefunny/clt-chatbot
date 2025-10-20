// app/store/index.js
import { create } from "zustand";
import {
  db,
  auth,
  onAuthStateChanged,
  doc,
  getDoc,
  collection,
  getDocs,
  writeBatch,
  serverTimestamp,
  addDoc,
} from "../lib/firebase";
import { locales } from "../lib/locales";

import { createAuthSlice } from "./slices/authSlice";
import { createUISlice } from "./slices/uiSlice";
import { createChatSlice } from "./slices/chatSlice";
import { createScenarioSlice } from "./slices/scenarioSlice";
import { createDevBoardSlice } from "./slices/devBoardSlice";
import { createNotificationSlice } from "./slices/notificationSlice";

const getInitialMessages = (lang = "ko") => {
  return [
    { id: "initial", sender: "bot", text: locales[lang].initialBotMessage },
  ];
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

  handleNotificationNavigation: async (notification) => {
    get().closeNotificationModal();
    get().markNotificationAsRead(notification.id);

    if (notification.conversationId && notification.scenarioSessionId) {
      if (get().currentConversationId !== notification.conversationId) {
        await get().loadConversation(notification.conversationId);
      }

      setTimeout(() => {
        get().setScrollToMessageId(notification.scenarioSessionId);
      }, 300);
    }
  },

  setUserAndLoadData: async (user) => {
    set({ user });

    try {
      console.log("Checking for conversation migration...");
      const conversationsRef = collection(
        get().db,
        "chats",
        user.uid,
        "conversations"
      );
      const snapshot = await getDocs(conversationsRef);
      const batch = writeBatch(get().db);
      let updatesNeeded = 0;
      snapshot.forEach((doc) => {
        if (doc.data().pinned === undefined) {
          batch.update(doc.ref, { pinned: false });
          updatesNeeded++;
        }
      });
      if (updatesNeeded > 0) {
        await batch.commit();
        console.log(
          `Migration complete: ${updatesNeeded} conversations updated.`
        );
      } else {
        console.log("No conversation migration needed.");
      }
    } catch (error) {
      console.error("Conversation migration failed:", error);
    }

    try {
      const userSettingsRef = doc(get().db, "settings", user.uid);
      const docSnap = await getDoc(userSettingsRef);
      const settings = docSnap.exists() ? docSnap.data() : {};

      const theme = settings.theme || localStorage.getItem("theme") || "light";
      const fontSize =
        settings.fontSize || localStorage.getItem("fontSize") || "default";
      const language =
        settings.language || localStorage.getItem("language") || "ko";

      set({
        theme,
        fontSize,
        language,
        messages: getInitialMessages(language),
      });
    } catch (error) {
      console.error("Error loading settings from Firestore:", error);
      const theme = localStorage.getItem("theme") || "light";
      const fontSize = localStorage.getItem("fontSize") || "default";
      const language = localStorage.getItem("language") || "ko";
      set({
        theme,
        fontSize,
        language,
        messages: getInitialMessages(language),
      });
    }

    get().unsubscribeAll();
    get().loadConversations(user.uid);
    get().loadDevMemos();
    get().subscribeToUnreadStatus(user.uid);
    get().subscribeToUnreadScenarioNotifications(user.uid);
    get().loadFavorites(user.uid);
  },

  clearUserAndData: () => {
    get().unsubscribeAll();

    let theme = "light";
    let fontSize = "default";
    let language = "ko";
    if (typeof window !== "undefined") {
      theme = localStorage.getItem("theme") || "light";
      fontSize = localStorage.getItem("fontSize") || "default";
      language = localStorage.getItem("language") || "ko";
    }

    set({
      user: null,
      messages: getInitialMessages(language),
      conversations: [],
      currentConversationId: null,
      scenarioStates: {},
      activeScenarioSessionId: null,
      activeScenarioSessions: [],
      hasUnreadNotifications: false,
      unreadScenarioSessions: new Set(),
      unreadConversations: new Set(),
      theme,
      fontSize,
      language,
    });
  },

  initAuth: () => {
    get().loadScenarioCategories();
    get().loadGeneralConfig();

    // --- 👇 [수정된 부분] ---
    // URL 쿼리 파라미터 확인 및 자동 테스트 로그인
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const testId = urlParams.get("id");
      if (testId) {
        console.log(`Attempting auto login with test ID: ${testId}`);
        // Zustand 스토어가 완전히 초기화된 후 실행되도록 setTimeout 사용
        setTimeout(() => {
          // Firebase Auth 상태 확인 전에 테스트 로그인을 시도
          if (!get().user) { // 이미 로그인된 사용자가 없는 경우에만 실행
            get().loginWithTestId(testId);
          } else {
            console.log("User already logged in, skipping auto test login.");
          }
        }, 0);
        // 자동 로그인 후 URL에서 id 파라미터 제거 (선택 사항)
        // urlParams.delete('id');
        // window.history.replaceState({}, document.title, `${window.location.pathname}?${urlParams.toString()}`);
      }
    }
    // --- 👆 [여기까지] ---

    onAuthStateChanged(get().auth, async (user) => {
      // --- 👇 [수정된 부분] ---
      // 이미 테스트 사용자로 로그인되어 있으면 Firebase Auth 상태 변경 무시
      if (get().user?.isTestUser) {
        console.log("Already logged in as test user, ignoring Firebase Auth state change.");
        return;
      }
      // --- 👆 [여기까지] ---

      if (user) {
        get().setUserAndLoadData(user);
      } else {
        // --- 👇 [수정된 부분] ---
        // 로그아웃 시에도 URL 파라미터 체크 로직을 다시 타지 않도록 clearUserAndData만 호출
        get().clearUserAndData();
        // --- 👆 [여기까지] ---
      }
    });
  },

  handleScenarioItemClick: (conversationId, scenario) => {
    if (get().currentConversationId !== conversationId) {
      get().loadConversation(conversationId);
    }

    get().setScrollToMessageId(scenario.sessionId);

    if (scenario.status === "completed" || scenario.status === "failed") {
      get().setActivePanel("main");
    } else {
      get().setActivePanel("scenario", scenario.sessionId);
    }

    if (!get().scenarioStates[scenario.sessionId]) {
      get().subscribeToScenarioSession(scenario.sessionId);
    }
  },

  unsubscribeAll: () => {
    get().unsubscribeConversations?.();
    get().unsubscribeAllMessagesAndScenarios();
    get().unsubscribeDevMemos?.();
    get().unsubscribeNotifications?.();
    get().unsubscribeUnreadStatus?.();
    get().unsubscribeUnreadScenarioNotifications?.();
    get().unsubscribeFavorites?.();

    set({
      unsubscribeConversations: null,
      unsubscribeDevMemos: null,
      unsubscribeNotifications: null,
      unsubscribeUnreadStatus: null,
      unsubscribeUnreadScenarioNotifications: null,
      unsubscribeFavorites: null,
    });
  },
}));

// 초기화 로직은 스토어 생성 후 바로 호출
useChatStore.getState().initAuth();