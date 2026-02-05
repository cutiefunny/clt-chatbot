// app/store/index.js
import { create } from "zustand";
import {
  auth,
  onAuthStateChanged,
} from "../lib/firebase";
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

// 메인 스토어 생성
export const useChatStore = create((set, get) => ({
  // Firebase 인스턴스
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

  // --- 👇 [제거] 복합 액션들을 각 슬라이스로 이동 ---
  // handleNotificationNavigation: (notificationSlice.js로 이동)
  // setUserAndLoadData: (authSlice.js로 이동)
  // clearUserAndData: (authSlice.js로 이동)
  // handleScenarioItemClick: (conversationSlice.js로 이동)
  // --- 👆 [제거] ---

  // 스토어 전체 초기화 및 구독 관리 (최상위 로직 유지)
  initAuth: () => {
    // 초기 설정 로드
    get().loadScenarioCategories?.(); // scenarioSlice (또는 별도 configSlice)
    get().loadGeneralConfig?.(); // uiSlice (또는 별도 configSlice)
    // --- 👇 [수정] 누락된 시나리오 목록 로드 호출 추가 ---
    get().loadAvailableScenarios?.(); 
    // --- 👆 [수정] ---

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
        // --- 👇 [수정] authSlice의 액션 호출 ---
        get().setUserAndLoadData(user); // 실제 사용자 로그인 시 데이터 로드
      } else {
        get().clearUserAndData(); // 로그아웃 시 데이터 클리어
        // --- 👆 [수정] ---
      }
    });
  },

  unsubscribeAll: () => {
    // 모든 슬라이스의 구독 해제 및 폴링 중지 함수 호출
    get().unsubscribeConversations?.(); // conversationSlice
    get().unsubscribeMessages?.(); // chatSlice
    get().unsubscribeAllScenarioListeners?.(); // scenarioSlice
    get().stopDevMemosPolling?.(); // devBoardSlice (폴링 중지)
    get().unsubscribeNotifications?.(); // notificationSlice
    get().unsubscribeUnreadStatus?.(); // notificationSlice
    get().unsubscribeUnreadScenarioNotifications?.(); // notificationSlice
    get().unsubscribeFavorites?.(); // favoritesSlice

    // 각 슬라이스의 해제 함수 상태 초기화
    set({
      unsubscribeConversations: null, // conversationSlice
      unsubscribeMessages: null, // chatSlice
      devMemosInterval: null, // devBoardSlice
      unsubscribeNotifications: null, // notificationSlice
      unsubscribeUnreadStatus: null, // notificationSlice
      unsubscribeUnreadScenarioNotifications: null, // notificationSlice
      unsubscribeFavorites: null, // favoritesSlice
    });
  },
}));

// 초기화 로직 호출 (애플리케이션 시작 시 한 번 실행)
useChatStore.getState().initAuth();