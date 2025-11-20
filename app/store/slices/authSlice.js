// app/store/slices/authSlice.js
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  doc,
  getDoc,
  collection,
  getDocs,
  writeBatch,
} from "../../lib/firebase";
import { locales } from "../../lib/locales";

export const createAuthSlice = (set, get) => ({
  user: null,

  loginWithGoogle: async () => {
    try {
      await signInWithPopup(get().auth, new GoogleAuthProvider());
    } catch (error) {
      console.error("Login with Google failed:", error);
    }
  },

  loginWithTestId: (userId) => {
    if (!userId || !userId.trim()) {
      console.error("Test User ID cannot be empty.");
      return;
    }
    const mockUser = {
      uid: userId.trim(),
      displayName: `Test User (${userId.trim()})`,
      email: `${userId.trim()}@test.com`,
      photoURL: "/images/avatar.png",
      isTestUser: true,
    };
    get().setUserAndLoadData(mockUser);
  },

  logout: async () => {
    try {
      if (get().user?.isTestUser) {
        get().clearUserAndData();
      } else {
        await signOut(get().auth);
      }
    } catch (error) {
      console.error("Logout failed:", error);
    }
  },

  setUserAndLoadData: async (user) => {
    set({ user, isInitializing: true });

    // 1. 데이터 마이그레이션 (Await)
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
        console.log(`Migration complete: ${updatesNeeded} conversations updated.`);
      } else {
        console.log("No conversation migration needed.");
      }
    } catch (error) {
      console.error("Conversation migration failed:", error);
    }

    // 2. 개인 설정 로드 (Await)
    let fontSize = "default",
      language = "ko",
      contentTruncateLimit = 10,
      hideCompletedScenarios = false,
      hideDelayInHours = 0,
      fontSizeDefault = "16px",
      isDevMode = false,
      sendTextShortcutImmediately = false; // [추가] 변수 선언

    try {
      const userSettingsRef = doc(get().db, "settings", user.uid);
      const docSnap = await getDoc(userSettingsRef);
      const settings = docSnap.exists() ? docSnap.data() : {};

      fontSize = settings.fontSize || localStorage.getItem("fontSize") || fontSize;
      language = settings.language || localStorage.getItem("language") || language;
      contentTruncateLimit =
        typeof settings.contentTruncateLimit === "number"
          ? settings.contentTruncateLimit
          : contentTruncateLimit;
      hideCompletedScenarios =
        typeof settings.hideCompletedScenarios === "boolean"
          ? settings.hideCompletedScenarios
          : hideCompletedScenarios;
      hideDelayInHours =
        typeof settings.hideDelayInHours === "number"
          ? settings.hideDelayInHours
          : hideDelayInHours;
      fontSizeDefault = settings.fontSizeDefault || fontSizeDefault;
      isDevMode =
        typeof settings.isDevMode === "boolean" ? settings.isDevMode : isDevMode;
      
      // --- 👇 [추가] 설정 로드 ---
      sendTextShortcutImmediately =
        typeof settings.sendTextShortcutImmediately === "boolean"
          ? settings.sendTextShortcutImmediately
          : sendTextShortcutImmediately;
      // --- 👆 [추가] ---

    } catch (error) {
      console.error("Error loading settings from Firestore:", error);
      fontSize = localStorage.getItem("fontSize") || fontSize;
      language = localStorage.getItem("language") || language;
    } finally {
      set({
        theme: "light",
        fontSize,
        language,
        contentTruncateLimit,
        hideCompletedScenarios,
        hideDelayInHours,
        fontSizeDefault,
        isDevMode,
        // --- 👇 [추가] 상태 설정 ---
        sendTextShortcutImmediately,
        // --- 👆 [추가] ---
      });
      get().resetMessages?.(language);
    }

    // 3. 리스너 구독 시작 (No Await)
    get().unsubscribeAll();
    get().loadConversations(user.uid);
    get().loadDevMemos();
    get().subscribeToUnreadStatus(user.uid);
    get().subscribeToUnreadScenarioNotifications(user.uid);
    get().loadFavorites(user.uid);

    // 2초 타이머 (Await)
    console.log("Starting 2-second splash screen timer...");
    await new Promise(resolve => setTimeout(resolve, 3000));
    console.log("Timer finished. Hiding splash screen.");

    // 4. 초기화 완료
    set({ isInitializing: false });
  },

  clearUserAndData: () => {
    get().unsubscribeAll();

    let fontSize = "default",
      language = "ko";
    if (typeof window !== "undefined") {
      fontSize = localStorage.getItem("fontSize") || "default";
      language = localStorage.getItem("language") || "ko";
    }

    set({
      user: null,
      theme: "light",
      fontSize,
      language,
      contentTruncateLimit: 10,
      hideCompletedScenarios: false,
      hideDelayInHours: 0,
      fontSizeDefault: "16px",
      isDevMode: false,
      // --- 👇 [추가] 초기화 시 기본값으로 리셋 ---
      sendTextShortcutImmediately: false,
      // --- 👆 [추가] ---
      conversations: [],
      currentConversationId: null,
      expandedConversationId: null,
      scenariosForConversation: {},
      favorites: [],
      devMemos: [],
      toastHistory: [],
      hasUnreadNotifications: false,
      unreadScenarioSessions: new Set(),
      unreadConversations: new Set(),
      scenarioStates: {},
      activeScenarioSessionId: null,
      activeScenarioSessions: [],
      lastFocusedScenarioSessionId: null,
      isSearching: false,
      searchResults: [],
      isLoading: false,
      slots: {},
      extractedSlots: {},
      llmRawResponse: null,
      selectedOptions: {},
      lastVisibleMessage: null,
      hasMoreMessages: true,
      isProfileModalOpen: false,
      isSearchModalOpen: false,
      isScenarioModalOpen: false,
      isDevBoardModalOpen: false,
      isNotificationModalOpen: false,
      isManualModalOpen: false,
      confirmModal: {
        isOpen: false,
        title: "",
        message: "",
        confirmText: "Confirm",
        cancelText: "Cancel",
        onConfirm: () => {},
        confirmVariant: "default",
      },
      isInitializing: false, 
      activePanel: "main",
    });
    get().resetMessages?.(language);
  },
});