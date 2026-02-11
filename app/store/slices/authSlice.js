// app/store/slices/authSlice.js
import {
  collection,
  getDocs,
  writeBatch,
} from "../../lib/firebase";
import { locales } from "../../lib/locales";

export const createAuthSlice = (set, get) => ({
  user: null,

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
    
    // --- 👇 [추가] localStorage에 저장 ---
    if (typeof window !== "undefined") {
      localStorage.setItem("testUser", JSON.stringify(mockUser));
      console.log(`[AuthSlice] Test user saved to localStorage: ${userId}`);
    }
    // --- 👆 [추가] ---
    
    get().setUserAndLoadData(mockUser);
  },

  logout: async () => {
    try {
      // --- 👇 [추가] localStorage에서 제거 ---
      if (typeof window !== "undefined") {
        localStorage.removeItem("testUser");
        console.log("[AuthSlice] Test user removed from localStorage");
      }
      // --- 👆 [추가] ---
      
      // 테스트 유저만 사용 - 항상 clearUserAndData 실행
      get().clearUserAndData();
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
      sendTextShortcutImmediately = false,
      useFastApi = false; // [추가] 기본값 설정

    try {
      // localStorage에서 사용자 설정 로드
      const userSettings = JSON.parse(localStorage.getItem("userSettings") || "{}");

      fontSize = userSettings.fontSize || localStorage.getItem("fontSize") || fontSize;
      language = userSettings.language || localStorage.getItem("language") || language;
      contentTruncateLimit =
        typeof userSettings.contentTruncateLimit === "number"
          ? userSettings.contentTruncateLimit
          : contentTruncateLimit;
      hideCompletedScenarios =
        typeof userSettings.hideCompletedScenarios === "boolean"
          ? userSettings.hideCompletedScenarios
          : hideCompletedScenarios;
      hideDelayInHours =
        typeof userSettings.hideDelayInHours === "number"
          ? userSettings.hideDelayInHours
          : hideDelayInHours;
      fontSizeDefault = userSettings.fontSizeDefault || fontSizeDefault;
      isDevMode =
        typeof userSettings.isDevMode === "boolean" ? userSettings.isDevMode : isDevMode;
      
      sendTextShortcutImmediately =
        typeof userSettings.sendTextShortcutImmediately === "boolean"
          ? userSettings.sendTextShortcutImmediately
          : sendTextShortcutImmediately;
      
      // --- 👇 [추가] useFastApi 로드 ---
      useFastApi =
        typeof userSettings.useFastApi === "boolean"
          ? userSettings.useFastApi
          : useFastApi;
      // --- 👆 [추가] ---

    } catch (error) {
      console.error("Error loading settings from localStorage:", error);
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
        sendTextShortcutImmediately,
        // --- 👇 [추가] 상태 적용 ---
        useFastApi,
        // --- 👆 [추가] ---
      });
      get().resetMessages?.(language);
    }
    // 3. 리스너 구독 시작 (No Await)
    get().unsubscribeAll();
    get().loadConversations(user.uid);
    get().subscribeToUnreadStatus(user.uid);
    get().subscribeToUnreadScenarioNotifications(user.uid);

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
      sendTextShortcutImmediately: false,
      // --- 👇 [추가] 초기화 ---
      useFastApi: false, 
      // --- 👆 [추가] ---
      conversations: [],
      currentConversationId: null,
      expandedConversationId: null,
      scenariosForConversation: {},
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
      isScenarioModalOpen: false,
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