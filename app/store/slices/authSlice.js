// app/store/slices/authSlice.js

export const createAuthSlice = (set, get) => ({
  user: null,
  isInitializing: true, // 초기 로딩 상태

  // 초기화: 로컬 스토리지 확인
  initializeAuth: () => {
    if (typeof window !== "undefined") {
      const storedUserId = localStorage.getItem("userId");
      if (storedUserId) {
        // 저장된 ID가 있으면 자동 로그인 처리
        get().login(storedUserId, false); // false = don't reload page
      } else {
        set({ isInitializing: false });
      }
    } else {
      set({ isInitializing: false });
    }
  },

  // 로그인 (ID 직접 입력)
  login: async (userId) => {
    if (!userId || !userId.trim()) {
      console.error("User ID cannot be empty.");
      return;
    }

    const trimmedId = userId.trim();
    
    // 로컬 스토리지에 저장 (API 호출 시 사용)
    if (typeof window !== "undefined") {
      localStorage.setItem("userId", trimmedId);
    }

    const mockUser = {
      uid: trimmedId,
      displayName: `User (${trimmedId.substring(0, 6)}...)`,
      email: `${trimmedId}@local.dev`,
      photoURL: "/images/avatar.png",
      isTestUser: true,
    };

    // 사용자 데이터 로드 로직 호출
    await get().setUserAndLoadData(mockUser);
  },

  // 로그아웃
  logout: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("userId");
    }
    get().clearUserAndData();
  },

  // 사용자 데이터 설정 및 초기 데이터 로드
  setUserAndLoadData: async (user) => {
    set({ user, isInitializing: true });

    // Firebase 마이그레이션 로직 제거됨

    // 개인 설정 로드 (로컬 스토리지 기반으로 단순화)
    let fontSize = "default",
      language = "ko",
      useFastApi = true;

    if (typeof window !== "undefined") {
        fontSize = localStorage.getItem("fontSize") || "default";
        language = localStorage.getItem("language") || "ko";
    }

    // 설정 적용
    set({
        theme: "light",
        fontSize,
        language,
        contentTruncateLimit: 10,
        hideCompletedScenarios: false,
        hideDelayInHours: 0,
        fontSizeDefault: "16px",
        isDevMode: false,
        sendTextShortcutImmediately: false,
        useFastApi: true, // 항상 FastAPI 사용
    });
    
    get().resetMessages?.(language);

    // 기타 로드 함수 호출
    get().loadDevMemos();
    // get().loadFavorites(user.uid); // 필요시 복구

    // 스플래시 스크린용 짧은 지연
    await new Promise(resolve => setTimeout(resolve, 500));

    set({ isInitializing: false });
  },

  // 데이터 초기화
  clearUserAndData: () => {
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
      currentConversationId: null,
      expandedConversationId: null,
      scenariosForConversation: {},
      favorites: [],
      devMemos: [],
      hasUnreadNotifications: false,
      unreadScenarioSessions: new Set(),
      unreadConversations: new Set(),
      scenarioStates: {},
      isSearching: false,
      searchResults: [],
      isLoading: false,
      slots: {},
      extractedSlots: {},
      llmRawResponse: null,
      selectedOptions: {},
      lastVisibleMessage: null,
      hasMoreMessages: true,
      activePanel: "main",
      isInitializing: false,
    });
    
    get().resetMessages?.(language);
  },
});