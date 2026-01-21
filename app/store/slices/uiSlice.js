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
  theme: "light",
  fontSize: "default", 
  language: "ko",
  maxFavorites: 10,
  hideCompletedScenarios: false,
  hideDelayInHours: 0,
  contentTruncateLimit: 10, 
  fontSizeDefault: "16px",
  isDevMode: false,
  sendTextShortcutImmediately: false,
  useFastApi: false,
  // --- 👇 [추가] 로컬 API 사용 여부 상태 (기본값 false) ---
  useLocalFastApiUrl: false, 
  // --- 👆 [추가] ---
  dimUnfocusedPanels: true,
  enableFavorites: true, 
  showHistoryOnGreeting: false, 
  mainInputPlaceholder: "", 
  headerTitle: "AI Chatbot", 
  enableMainChatMarkdown: true, 
  mainInputValue: "", 
  showScenarioBubbles: true, 
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
  isInitializing: false,

  // Actions
  setIsInitializing: (value) => set({ isInitializing: value }),
  setMainInputValue: (value) => set({ mainInputValue: value }),

  // ... (loadGeneralConfig, saveGeneralConfig 등 기존 코드 유지) ...

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
          headerTitle: config.headerTitle || "AI Chatbot",
          enableMainChatMarkdown:
            typeof config.enableMainChatMarkdown === "boolean"
              ? config.enableMainChatMarkdown
              : true,
          showScenarioBubbles:
            typeof config.showScenarioBubbles === "boolean"
              ? config.showScenarioBubbles
              : true,
          llmProvider: config.llmProvider || "gemini",
          flowiseApiUrl: config.flowiseApiUrl || "",
        });
      }
      
      // --- 👇 [추가] 초기화 시 LocalStorage에서 로컬 API 설정 읽어오기 ---
      if (typeof window !== 'undefined') {
        const storedLocalApi = localStorage.getItem('useLocalFastApiUrl') === 'true';
        set({ useLocalFastApiUrl: storedLocalApi });
      }
      // --- 👆 [추가] ---

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

    const previousSettings = {};
    Object.keys(settings).forEach((key) => {
      if (get()[key] !== undefined) {
        previousSettings[key] = get()[key];
      }
    });

    try {
      set(settings); 

      const userSettingsRef = doc(db, "settings", user.uid);
      await setDoc(userSettingsRef, settings, { merge: true }); 
      return true;
    } catch (error) {
      console.error("Error saving personal settings:", error);
      const errorMsg =
        locales[language]?.errorUnexpected || "Failed to save settings.";
      showEphemeralToast(errorMsg, "error");

      console.log("Rolling back settings due to error...", previousSettings);
      set(previousSettings);
      
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

  // --- 👇 [추가] 로컬 API URL 토글 액션 ---
  toggleLocalFastApiUrl: () => {
    set((state) => {
      const newValue = !state.useLocalFastApiUrl;
      if (typeof window !== 'undefined') {
        localStorage.setItem('useLocalFastApiUrl', newValue);
      }
      return { useLocalFastApiUrl: newValue };
    });
  },
  // --- 👆 [추가] ---

  setLocalFastApiUrl: (value) => {
    set({ useLocalFastApiUrl: value });
    if (typeof window !== 'undefined') {
      localStorage.setItem('useLocalFastApiUrl', value);
    }
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

  // ... (나머지 모달 관련 액션들은 기존 코드 유지) ...
  openProfileModal: () => set({ isProfileModalOpen: true }),
  closeProfileModal: () => set({ isProfileModalOpen: false }),
  openSearchModal: () => set({ isSearchModalOpen: true, searchResults: [], isSearching: false }),
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
    postToParent("callChatbotResize", { width });
    await delayParentAnimationIfNeeded();
    set({ isHistoryPanelOpen: willBeOpen });
  },

  openHistoryPanel: async () => {
    if (get().isHistoryPanelOpen) return;
    const width = 264;
    postToParent("callChatbotResize", { width });
    await delayParentAnimationIfNeeded();
    set({ isHistoryPanelOpen: true });
  },

  closeHistoryPanel: async () => {
    if (!get().isHistoryPanelOpen) return;
    const width = -264;
    postToParent("callChatbotResize", { width });
    await delayParentAnimationIfNeeded();
    set({ isHistoryPanelOpen: false });
  },

  toggleScenarioPanelExpanded: async () => {
    if (get().activePanel !== "scenario") return;
    const wasExpanded = get().isScenarioPanelExpanded;
    const willBeExpanded = !wasExpanded;
    const widthDelta = willBeExpanded ? 280 : -280;
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
  
  clearUserAndData: () => {
    set({
      theme: "light",
      fontSize: "default",
      language: "ko",
      maxFavorites: 10,
      hideCompletedScenarios: false,
      hideDelayInHours: 0,
      contentTruncateLimit: 10,
      fontSizeDefault: "16px",
      isDevMode: false,
      sendTextShortcutImmediately: false,
      useFastApi: false,
      // --- 👇 [추가] 초기화 ---
      useLocalFastApiUrl: false, 
      // --- 👆 [추가] ---
      dimUnfocusedPanels: true,
      enableFavorites: true,
      showHistoryOnGreeting: false,
      mainInputPlaceholder: "",
      headerTitle: "AI Chatbot", 
      enableMainChatMarkdown: true,
      showScenarioBubbles: true,
      mainInputValue: "",
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
      isInitializing: false,
    });
  },
});