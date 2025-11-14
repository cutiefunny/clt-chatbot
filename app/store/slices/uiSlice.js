// app/store/slices/uiSlice.js
import { doc, setDoc, getDoc } from "firebase/firestore";
import { locales } from "../../lib/locales";
import {
  postToParent,
  PARENT_ORIGIN,
  SCENARIO_PANEL_WIDTH,
  delayParentAnimationIfNeeded,
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
  contentTruncateLimit: 10, // 봇 답변 줄임 줄 수 (기본값 10)
  fontSizeDefault: "16px", // 기본값
  isDevMode: false,
  dimUnfocusedPanels: true,
  enableFavorites: true, // 즐겨찾기 기능 활성화 여부 (기본값 true)
  showHistoryOnGreeting: false, // <-- [추가] 초기 화면 히스토리 표시 여부
  mainInputPlaceholder: "", // 메인 입력창 플레이스홀더
  enableMainChatMarkdown: true, // 메인 챗 마크다운 활성화 여부
  // --- 👇 [추가] ---
  mainInputValue: "", // 메인 입력창의 제어되는 값
  // --- 👆 [추가] ---
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
  isInitializing: false, // <-- 기본값 false

  // Actions
  setIsInitializing: (value) => set({ isInitializing: value }), // <-- [추가]
  // --- 👇 [추가] ---
  setMainInputValue: (value) => set({ mainInputValue: value }),
  // --- 👆 [추가] ---

  loadGeneralConfig: async () => {
    try {
      const configRef = doc(get().db, "config", "general");
      const docSnap = await getDoc(configRef);
      if (docSnap.exists()) {
        const config = docSnap.data();
        set({
          maxFavorites:
            typeof config.maxFavorites === "number" ? config.maxFavorites : 10,
          dimUnfocusedPanels:
            typeof config.dimUnfocusedPanels === "boolean"
              ? config.dimUnfocusedPanels
              : true,
          enableFavorites:
            typeof config.enableFavorites === "boolean"
              ? config.enableFavorites
              : true,
          showHistoryOnGreeting:
            typeof config.showHistoryOnGreeting === "boolean"
              ? config.showHistoryOnGreeting
              : false,
          mainInputPlaceholder: config.mainInputPlaceholder || "",
          enableMainChatMarkdown:
            typeof config.enableMainChatMarkdown === "boolean"
              ? config.enableMainChatMarkdown
              : true, // 기본값 true
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

  toggleHistoryPanel: async () => {
    const isCurrentlyOpen = get().isHistoryPanelOpen;
    const willBeOpen = !isCurrentlyOpen;
    const width = willBeOpen ? 264 : -264;
    console.log(
      `[Call Window Method] callChatbotResize(width: ${width}) to ${PARENT_ORIGIN} with ${
        willBeOpen ? "Open" : "Close"
      } History Panel`
    );
    postToParent("callChatbotResize", { width });
    await delayParentAnimationIfNeeded();
    set({ isHistoryPanelOpen: willBeOpen });
  },

  openHistoryPanel: async () => {
    if (get().isHistoryPanelOpen) return;
    const width = 264;
    console.log(
      `[Call Window Method] callChatbotResize(width: ${width}) to ${PARENT_ORIGIN} with Open History Panel`
    );
    postToParent("callChatbotResize", { width });
    await delayParentAnimationIfNeeded();
    set({ isHistoryPanelOpen: true });
  },

  closeHistoryPanel: async () => {
    if (!get().isHistoryPanelOpen) return;
    const width = -264;
    console.log(
      `[Call Window Method] callChatbotResize(width: ${width}) to ${PARENT_ORIGIN} with Close History Panel`
    );
    postToParent("callChatbotResize", { width });
    await delayParentAnimationIfNeeded();
    set({ isHistoryPanelOpen: false });
  },

  toggleScenarioPanelExpanded: async () => {
    if (get().activePanel !== "scenario") return;
    const wasExpanded = get().isScenarioPanelExpanded;
    const willBeExpanded = !wasExpanded;
    const widthDelta = willBeExpanded ? 280 : -280;
    console.log(
      `[Call Window Method] callChatbotResize(width: ${widthDelta}) to ${PARENT_ORIGIN} with Toggle Scenario Panel Expanded`
    );
    postToParent("callChatbotResize", { width: widthDelta });
    await delayParentAnimationIfNeeded();
    set({ isScenarioPanelExpanded: willBeExpanded });
  },

  resetScenarioPanelExpansion: () => set({ isScenarioPanelExpanded: false }),

  setActivePanel: async (panel, sessionId = null) => {
    const previousActivePanel = get().activePanel;
    const wasScenarioPanelActive = previousActivePanel === "scenario";
    const wasExpanded = get().isScenarioPanelExpanded;
    if (panel === "scenario") {
      if (!wasScenarioPanelActive) {
        console.log(
          `[Call Window Method] callChatbotResize(width: ${SCENARIO_PANEL_WIDTH}) to ${PARENT_ORIGIN} with Activate Scenario Panel`
        );
        postToParent("callChatbotResize", { width: SCENARIO_PANEL_WIDTH });
        await delayParentAnimationIfNeeded();
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