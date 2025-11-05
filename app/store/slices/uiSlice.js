// app/store/slices/uiSlice.js
import { doc, setDoc, getDoc } from "firebase/firestore";
import { locales } from "../../lib/locales";
import {
  postToParent,
  PARENT_ORIGIN,
  SCENARIO_PANEL_WIDTH,
} from "../../lib/parentMessaging";

const getInitialMessages = (lang = "ko") => {
  return [
    { id: "initial", sender: "bot", text: locales[lang].initialBotMessage },
  ];
};

export const createUISlice = (set, get) => ({
  // State
  // --- theme 초기값을 'light'로 고정 ---
  theme: "light",
  fontSize: "default", // 'default' or 'small'
  language: "ko",
  maxFavorites: 10,
  hideCompletedScenarios: false,
  hideDelayInHours: 0,
  // --- 👇 [수정] 주석 및 기본값 변경 (200 -> 10) ---
  contentTruncateLimit: 10, // 봇 답변 줄임 줄 수 (기본값 10)
  // --- 👆 [수정] ---
  fontSizeDefault: "16px", // 기본값
  // fontSizeSmall: "14px", // [제거]
  isDevMode: false,
  dimUnfocusedPanels: true, // [참고] 이제 이 값은 config/general에서 다시 로드됩니다.
  llmProvider: "gemini",
  flowiseApiUrl: "",
  isProfileModalOpen: false,
  isSearchModalOpen: false,
  isScenarioModalOpen: false,
  isDevBoardModalOpen: false,
  isNotificationModalOpen: false,
  isManualModalOpen: false,
  isHistoryPanelOpen: false,
  isScenarioPanelExpanded: false,
  confirmModal: {
    isOpen: false,
    title: "",
    message: "",
    confirmText: "Confirm",
    cancelText: "Cancel",
    onConfirm: () => {},
    confirmVariant: "default",
  },
  activePanel: "main",
  lastFocusedScenarioSessionId: null,
  focusRequest: 0,
  shortcutMenuOpen: null,
  ephemeralToast: {
    visible: false,
    message: "",
    type: "info",
  },
  scrollToMessageId: null,
  forceScrollToBottom: false,
  scrollAmount: 0,

  // Actions
  loadGeneralConfig: async () => {
    try {
      const configRef = doc(get().db, "config", "general");
      const docSnap = await getDoc(configRef);
      if (docSnap.exists()) {
        const config = docSnap.data();
        set({
          maxFavorites:
            typeof config.maxFavorites === "number" ? config.maxFavorites : 10,
          // --- 👇 [수정] dimUnfocusedPanels 로드 로직 추가 ---
          dimUnfocusedPanels:
            typeof config.dimUnfocusedPanels === "boolean"
              ? config.dimUnfocusedPanels
              : true, // 기본값 true
          // --- 👆 [수정] ---
          llmProvider: config.llmProvider || "gemini",
          flowiseApiUrl: config.flowiseApiUrl || "",
        });
      }
    } catch (error) {
      console.error("Error loading general config from Firestore:", error);
    }
  },

  saveGeneralConfig: async (settings) => {
    try {
      const configRef = doc(get().db, "config", "general");
      await setDoc(configRef, settings, { merge: true });
      set(settings);
      return true;
    } catch (error) {
      console.error("Error saving general config to Firestore:", error);
      return false;
    }
  },

  // --- 👇 [추가] 개인 설정 저장 액션 ---
  savePersonalSettings: async (settings) => {
    const { user, db, showEphemeralToast, language } = get();
    if (!user) return false;
    try {
      const userSettingsRef = doc(db, "settings", user.uid);
      await setDoc(userSettingsRef, settings, { merge: true });
      set(settings); // 로컬 스토어 상태 즉시 업데이트
      return true;
    } catch (error) {
      console.error("Error saving personal settings:", error);
      const errorMsg =
        locales[language]?.errorUnexpected || "Failed to save settings.";
      showEphemeralToast(errorMsg, "error");
      return false;
    }
  },
  // --- 👆 [추가] ---

  setScrollToMessageId: (id) => set({ scrollToMessageId: id }),
  setForceScrollToBottom: (value) => set({ forceScrollToBottom: value }),

  scrollBy: (amount) => set({ scrollAmount: amount }),
  resetScroll: () => set({ scrollAmount: 0 }),

  setShortcutMenuOpen: (menuName) => set({ shortcutMenuOpen: menuName }),

  showEphemeralToast: (message, type = "info") => {
    set({ ephemeralToast: { visible: true, message, type } });
    setTimeout(() => {
      set((state) => ({
        ephemeralToast: { ...state.ephemeralToast, visible: false },
      }));
    }, 3000);
  },
  hideEphemeralToast: () => {
    set((state) => ({
      ephemeralToast: { ...state.ephemeralToast, visible: false },
    }));
  },

  setTheme: async (newTheme) => {
    set({ theme: "light" });
    if (typeof window !== "undefined") {
      localStorage.setItem("theme", "light");
    }
  },

  toggleTheme: async () => {
    console.log("Theme toggling is disabled.");
  },

  setFontSize: async (size) => {
    set({ fontSize: size });
    if (typeof window !== "undefined") {
      localStorage.setItem("fontSize", size);
    }
    const user = get().user;
    if (user) {
      try {
        const userSettingsRef = doc(get().db, "settings", user.uid);
        await setDoc(userSettingsRef, { fontSize: size }, { merge: true });
      } catch (error) {
        console.error("Error saving font size to Firestore:", error);
      }
    }
  },

  setLanguage: async (lang) => {
    set({ language: lang });
    if (typeof window !== "undefined") {
      localStorage.setItem("language", lang);
    }
    const user = get().user;
    if (user) {
      try {
        const userSettingsRef = doc(get().db, "settings", user.uid);
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
  openSearchModal: () =>
    set({ isSearchModalOpen: true, searchResults: [], isSearching: false }),
  closeSearchModal: () => set({ isSearchModalOpen: false }),
  openScenarioModal: () => set({ isScenarioModalOpen: true }),
  closeScenarioModal: () => set({ isScenarioModalOpen: false }),
  openDevBoardModal: () => set({ isDevBoardModalOpen: true }),
  closeDevBoardModal: () => set({ isDevBoardModalOpen: false }),
  openNotificationModal: () => set({ isNotificationModalOpen: true }),
  closeNotificationModal: () => set({ isNotificationModalOpen: false }),
  openManualModal: () => set({ isManualModalOpen: true }),
  closeManualModal: () => set({ isManualModalOpen: false }),

  openConfirmModal: (config) =>
    set((state) => ({
      confirmModal: { ...state.confirmModal, isOpen: true, ...config },
    })),
  closeConfirmModal: () =>
    set((state) => ({
      confirmModal: { ...state.confirmModal, isOpen: false },
    })),

  toggleHistoryPanel: () => {
    set((state) => ({ isHistoryPanelOpen: !state.isHistoryPanelOpen }));
    const { isHistoryPanelOpen } = get();

    if (isHistoryPanelOpen) {
      console.log(
        `[Call Window Method] callChatbotResize(width: 264) to ${PARENT_ORIGIN} with Open History Panel`
      );
      postToParent("callChatbotResize", { width: 264 });
    } else {
      console.log(
        `[Call Window Method] callChatbotResize(width: -264) to ${PARENT_ORIGIN} with Close History Panel`
      );
      postToParent("callChatbotResize", { width: -264 });
    }
  },

  toggleScenarioPanelExpanded: () => {
    if (get().activePanel !== "scenario") return;
    const wasExpanded = get().isScenarioPanelExpanded;
    const widthDelta = wasExpanded ? -280 : 280;
    console.log(
      `[Call Window Method] callChatbotResize(width: ${widthDelta}) to ${PARENT_ORIGIN} with Toggle Scenario Panel Expanded`
    );
    postToParent("callChatbotResize", { width: widthDelta });
    set({ isScenarioPanelExpanded: !wasExpanded });
  },

  resetScenarioPanelExpansion: () => set({ isScenarioPanelExpanded: false }),

  setActivePanel: (panel, sessionId = null) => {
    const previousActivePanel = get().activePanel;
    const wasScenarioPanelActive = previousActivePanel === "scenario";
    const wasExpanded = get().isScenarioPanelExpanded;
    if (panel === "scenario") {
      if (!wasScenarioPanelActive) {
        console.log(
          `[Call Window Method] callChatbotResize(width: ${SCENARIO_PANEL_WIDTH}) to ${PARENT_ORIGIN} with Activate Scenario Panel`
        );
        postToParent("callChatbotResize", { width: SCENARIO_PANEL_WIDTH });
      }
      set({
        activePanel: panel,
        activeScenarioSessionId: sessionId,
        lastFocusedScenarioSessionId: sessionId,
        isScenarioPanelExpanded: wasScenarioPanelActive ? wasExpanded : false,
      });
    } else {
      set({
        activePanel: "main",
        activeScenarioSessionId: null,
        isScenarioPanelExpanded: false,
      });
    }
    get().focusChatInput();
  },

  focusChatInput: () =>
    set((state) => ({ focusRequest: state.focusRequest + 1 })),
});
