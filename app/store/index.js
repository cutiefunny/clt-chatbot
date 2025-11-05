// app/store/index.js
import { create } from "zustand";
import {
  db,
  auth,
  onAuthStateChanged,
  doc,
  getDoc,
  collection, // 하위 슬라이스에서 사용될 수 있으므로 유지
  getDocs, // 하위 슬라이스에서 사용될 수 있으므로 유지
  writeBatch, // 하위 슬라이스에서 사용될 수 있으므로 유지
  serverTimestamp, // 하위 슬라이스에서 사용될 수 있으므로 유지
  addDoc, // 하위 슬라이스에서 사용될 수 있으므로 유지
  updateDoc, // 추가
  deleteDoc, // 추가
  limit,     // 추가
  startAfter,// 추가
  query,     // 추가
  orderBy,   // 추가
  where,     // 추가
  onSnapshot,// 추가
  setDoc,    // 추가
} from "../lib/firebase"; // 필요한 firebase 함수 임포트 유지
import { locales } from "../lib/locales";

// 슬라이스 임포트
import { createAuthSlice } from "./slices/authSlice";
import { createUISlice } from "./slices/uiSlice";
import { createChatSlice } from "./slices/chatSlice";
import { createScenarioSlice } from "./slices/scenarioSlice";
import { createDevBoardSlice } from "./slices/devBoardSlice";
import { createNotificationSlice } from "./slices/notificationSlice";
import { createFavoritesSlice } from "./slices/favoritesSlice";
import { createConversationSlice } from "./slices/conversationSlice";
import { createSearchSlice } from "./slices/searchSlice";

// 초기 메시지 함수 (chatSlice 또는 유틸리티로 이동 고려)
const getInitialMessages = (lang = "ko") => {
    const initialText = locales[lang]?.initialBotMessage || locales['en']?.initialBotMessage || "Hello! How can I help you?";
    // chatSlice에서 초기 메시지를 관리하므로 여기서는 빈 배열 반환 또는 chatSlice 호출
    // return [{ id: "initial", sender: "bot", text: initialText }];
    // chatSlice의 초기 상태를 직접 참조하기 어려우므로, chatSlice 내부에서 관리하도록 위임
    return []; // chatSlice에서 처리하도록 비움
};

// 메인 스토어 생성
export const useChatStore = create((set, get) => ({
  // Firebase 인스턴스
  db,
  auth,

  // 각 슬라이스 결합
  ...createAuthSlice(set, get),
  ...createUISlice(set, get),
  ...createChatSlice(set, get),
  ...createScenarioSlice(set, get),
  ...createDevBoardSlice(set, get),
  ...createNotificationSlice(set, get),
  ...createFavoritesSlice(set, get),
  ...createConversationSlice(set, get),
  ...createSearchSlice(set, get),

  // 여러 슬라이스에 걸쳐 동작하는 액션들
  handleNotificationNavigation: async (notification) => {
    // 알림 클릭 시 대화 로드 및 스크롤 처리
    get().closeNotificationModal(); // uiSlice
    get().markNotificationAsRead(notification.id); // notificationSlice

    if (notification.conversationId) { // 대화 ID가 있는 경우
      if (get().currentConversationId !== notification.conversationId) { // conversationSlice 상태 참조
        await get().loadConversation(notification.conversationId); // conversationSlice 액션 호출
      }
      // 시나리오 세션 ID가 있으면 해당 메시지로 스크롤
       // --- 👇 [수정] 스크롤 대상 ID를 scenarioSessionId로 변경 ---
      if (notification.scenarioSessionId) {
        // 약간의 지연 후 스크롤 시도 (대화 로딩 완료 시간 확보)
        setTimeout(() => { get().setScrollToMessageId(notification.scenarioSessionId); }, 300); // uiSlice 액션 호출
      }
       // --- 👆 [수정] ---
    }
  },

  setUserAndLoadData: async (user) => {
    // 사용자 정보 설정 (authSlice)
    set({ user });

    // 대화 마이그레이션 (임시 유지, 추후 conversationSlice 이동 고려)
    try {
      console.log("Checking for conversation migration...");
      const conversationsRef = collection( get().db, "chats", user.uid, "conversations" );
      const snapshot = await getDocs(conversationsRef);
      const batch = writeBatch(get().db);
      let updatesNeeded = 0;
      snapshot.forEach((doc) => { if (doc.data().pinned === undefined) { batch.update(doc.ref, { pinned: false }); updatesNeeded++; } });
      if (updatesNeeded > 0) { await batch.commit(); console.log(`Migration complete: ${updatesNeeded} conversations updated.`); }
      else { console.log("No conversation migration needed."); }
    } catch (error) { console.error("Conversation migration failed:", error); }

    // --- 👇 [수정] fontSizeSmall 제거 ---
    let fontSize = 'default', 
        language = 'ko',
        contentTruncateLimit = 10, // 기본값
        hideCompletedScenarios = false, // 기본값
        hideDelayInHours = 0, // 기본값
        fontSizeDefault = '16px', // 기본값
        // fontSizeSmall = '14px', // [제거]
        isDevMode = false; 

    try {
      const userSettingsRef = doc(get().db, "settings", user.uid);
      const docSnap = await getDoc(userSettingsRef);
      const settings = docSnap.exists() ? docSnap.data() : {};
      
      fontSize = settings.fontSize || localStorage.getItem("fontSize") || fontSize;
      language = settings.language || localStorage.getItem("language") || language;

      // [수정] 개인 설정 항목 불러오기
      contentTruncateLimit = typeof settings.contentTruncateLimit === "number" 
        ? settings.contentTruncateLimit : contentTruncateLimit;
      hideCompletedScenarios = typeof settings.hideCompletedScenarios === "boolean" 
        ? settings.hideCompletedScenarios : hideCompletedScenarios;
      hideDelayInHours = typeof settings.hideDelayInHours === "number"
        ? settings.hideDelayInHours : hideDelayInHours;
      fontSizeDefault = settings.fontSizeDefault || fontSizeDefault;
      // fontSizeSmall = settings.fontSizeSmall || fontSizeSmall; // [제거]
      isDevMode = typeof settings.isDevMode === "boolean" 
        ? settings.isDevMode : isDevMode;

    } catch (error) {
      console.error("Error loading settings from Firestore:", error);
      fontSize = localStorage.getItem("fontSize") || fontSize;
      language = localStorage.getItem("language") || language;
      // localStorage에서 개인 설정 항목들도 불러올 수 있으나, 우선 Firestore 기준으로 처리
    } finally {
        // [수정] set에 fontSizeSmall 제거
        set({ 
          theme: 'light', fontSize, language,
          contentTruncateLimit, hideCompletedScenarios, hideDelayInHours,
          fontSizeDefault, isDevMode 
        });
        // chatSlice의 메시지 상태 초기화 (언어 적용)
        get().resetMessages?.(language); // chatSlice 액션 호출
    }
    // --- 👆 [수정] ---

    // 데이터 로드 및 구독 시작
    get().unsubscribeAll(); // 모든 이전 구독 해제
    get().loadConversations(user.uid); // conversationSlice
    get().loadDevMemos(); // devBoardSlice
    get().subscribeToUnreadStatus(user.uid); // notificationSlice
    get().subscribeToUnreadScenarioNotifications(user.uid); // notificationSlice
    get().loadFavorites(user.uid); // favoritesSlice
  },

  // --- 👇 [수정] clearUserAndData 에서 fontSizeSmall 제거 ---
  clearUserAndData: () => {
    // 모든 구독 해제
    get().unsubscribeAll();

    // 기본 설정값 로드
    let fontSize = "default", language = "ko"; // theme 제거
    if (typeof window !== "undefined") {
      // theme 로드 로직 제거
      fontSize = localStorage.getItem("fontSize") || "default";
      language = localStorage.getItem("language") || "ko";
    }

    // 모든 슬라이스 상태 초기화 (각 슬라이스의 초기 상태 값 사용 권장)
    set({
      user: null, // authSlice
      theme: 'light', // uiSlice - 'light' 고정
      fontSize, language, // uiSlice
      // [수정] 개인 설정 항목 기본값으로 초기화
      contentTruncateLimit: 10,
      hideCompletedScenarios: false,
      hideDelayInHours: 0,
      fontSizeDefault: "16px",
      // fontSizeSmall: "14px", // [제거]
      isDevMode: false, 
      // messages: getInitialMessages(language), // chatSlice 초기화는 resetMessages에서 처리
      conversations: [], currentConversationId: null, expandedConversationId: null, scenariosForConversation: {}, // conversationSlice 초기화
      favorites: [], // favoritesSlice 초기화
      devMemos: [], // devBoardSlice 초기화
      toastHistory: [], hasUnreadNotifications: false, unreadScenarioSessions: new Set(), unreadConversations: new Set(), // notificationSlice 초기화
      scenarioStates: {}, activeScenarioSessionId: null, activeScenarioSessions: [], lastFocusedScenarioSessionId: null, // scenarioSlice 초기화
      isSearching: false, searchResults: [], // searchSlice 초기화
      // 기타 상태 초기화
      isLoading: false, // chatSlice 또는 uiSlice
      slots: {}, extractedSlots: {}, llmRawResponse: null, selectedOptions: {}, // chatSlice
      lastVisibleMessage: null, hasMoreMessages: true, // chatSlice
      // 모달 상태 등 UI 관련 상태 초기화는 uiSlice의 초기 상태값 활용
      isProfileModalOpen: false, isSearchModalOpen: false, isScenarioModalOpen: false, isDevBoardModalOpen: false, isNotificationModalOpen: false, isManualModalOpen: false, // uiSlice
      confirmModal: { isOpen: false, title: "", message: "", confirmText: "Confirm", cancelText: "Cancel", onConfirm: () => {}, confirmVariant: "default" }, // uiSlice 초기화 보강
      activePanel: 'main', // uiSlice
    });
    // chatSlice의 초기 메시지를 명시적으로 설정
    get().resetMessages?.(language);
  },
  // --- 👆 [수정] ---

  initAuth: () => {
    // 초기 설정 로드
    get().loadScenarioCategories?.(); // scenarioSlice (또는 별도 configSlice)
    get().loadGeneralConfig?.(); // uiSlice (또는 별도 configSlice)

    // URL 파라미터 테스트 로그인
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const testId = urlParams.get("id");
      if (testId) {
        console.log(`Attempting auto login with test ID: ${testId}`);
        setTimeout(() => {
          if (!get().user) {
            get().loginWithTestId?.(testId); // authSlice
          }
        }, 0);
      }
    }

    // Firebase Auth 상태 변경 리스너
    onAuthStateChanged(get().auth, async (user) => {
      if (get().user?.isTestUser) return; // 테스트 유저면 무시 (authSlice 상태 참조)
      if (user) {
        get().setUserAndLoadData(user); // 실제 사용자 로그인 시 데이터 로드
      } else {
        get().clearUserAndData(); // 로그아웃 시 데이터 클리어
      }
    });
  },

  handleScenarioItemClick: (conversationId, scenario) => {
    // 시나리오 아이템 클릭 시 대화 로드, 스크롤, 패널 활성화 처리
    if (get().currentConversationId !== conversationId) { // conversationSlice 상태 참조
      get().loadConversation(conversationId); // conversationSlice 액션 호출
    }
     // --- 👇 [수정] 스크롤 대상 ID를 scenarioSessionId로 변경 ---
    get().setScrollToMessageId(scenario.sessionId); // uiSlice 액션 호출
     // --- 👆 [수정] ---

    // 시나리오 상태에 따라 패널 활성화 결정
    if (["completed", "failed", "canceled"].includes(scenario.status)) {
      get().setActivePanel("main"); // uiSlice 액션 호출
      // scenarioSlice 상태 업데이트 (activeId는 null이지만 lastFocused는 유지)
      set({ activeScenarioSessionId: null, lastFocusedScenarioSessionId: scenario.sessionId });
    } else {
      get().setActivePanel("scenario", scenario.sessionId); // uiSlice (내부에서 scenarioSlice 상태도 업데이트)
    }
    // 필요 시 시나리오 구독 시작 (scenarioSlice)
    if (!get().scenarioStates[scenario.sessionId]) { // scenarioSlice 상태 참조
      get().subscribeToScenarioSession?.(scenario.sessionId); // scenarioSlice 액션 호출
    }
  },

  unsubscribeAll: () => {
    // 모든 슬라이스의 구독 해제 함수 호출
    get().unsubscribeConversations?.(); // conversationSlice
    get().unsubscribeMessages?.(); // chatSlice
    // --- 👇 [수정] scenarioSlice의 모든 리스너 해제 함수 호출 ---
    get().unsubscribeAllScenarioListeners?.(); // scenarioSlice에 해당 함수 구현 필요
    // --- 👆 [수정] ---
    get().unsubscribeDevMemos?.(); // devBoardSlice
    get().unsubscribeNotifications?.(); // notificationSlice
    get().unsubscribeUnreadStatus?.(); // notificationSlice
    get().unsubscribeUnreadScenarioNotifications?.(); // notificationSlice
    get().unsubscribeFavorites?.(); // favoritesSlice

    // 각 슬라이스의 해제 함수 상태 초기화
    set({
      unsubscribeConversations: null, // conversationSlice
      unsubscribeMessages: null, // chatSlice
      // unsubscribeScenariosMap는 scenarioSlice에서 관리/초기화
      unsubscribeDevMemos: null, // devBoardSlice
      unsubscribeNotifications: null, // notificationSlice
      unsubscribeUnreadStatus: null, // notificationSlice
      unsubscribeUnreadScenarioNotifications: null, // notificationSlice
      unsubscribeFavorites: null, // favoritesSlice
      // 검색 관련 리스너는 없으므로 초기화 불필요
    });
  },
}));

// 초기화 로직 호출 (애플리케이션 시작 시 한 번 실행)
useChatStore.getState().initAuth();