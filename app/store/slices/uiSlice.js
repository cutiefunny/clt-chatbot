// app/store/slices/uiSlice.js
import { doc, setDoc, getDoc } from "firebase/firestore";
import { locales } from "../../lib/locales";

const PARENT_ORIGIN = "http://172.20.130.91:9110/";

const getInitialMessages = (lang = "ko") => {
  return [
    { id: "initial", sender: "bot", text: locales[lang].initialBotMessage },
  ];
};

export const createUISlice = (set, get) => ({
  // State
  theme: "light",
  fontSize: "default", // 'default' or 'small'
  language: "ko",
  maxFavorites: 10,
  hideCompletedScenarios: false,
  hideDelayInHours: 0,
  fontSizeDefault: "16px", // 기본값
  fontSizeSmall: "14px", // 기본값
  isDevMode: false,
  dimUnfocusedPanels: true,
  llmProvider: "gemini",
  flowiseApiUrl: "",
  isProfileModalOpen: false,
  isSearchModalOpen: false,
  isScenarioModalOpen: false,
  isDevBoardModalOpen: false,
  isNotificationModalOpen: false,
  isManualModalOpen: false,
  isHistoryPanelOpen: false,
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
  // --- 👇 [수정된 부분 시작] ---
  lastFocusedScenarioSessionId: null, // 마지막 포커스된 시나리오 ID 추가
  // --- 👆 [수정된 부분 끝] ---
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
  // --- 👇 [삭제] selectedRow 제거 ---
  // selectedRow: null,

  // Actions
  // --- 👇 [삭제] setSelectedRow 제거 ---
  // setSelectedRow: (rowData) => set({ selectedRow: rowData }),

  // --- 기존 코드 생략 ---
  loadGeneralConfig: async () => {
    try {
      const configRef = doc(get().db, "config", "general");
      const docSnap = await getDoc(configRef);
      if (docSnap.exists()) {
        const config = docSnap.data();
        set({
          maxFavorites:
            typeof config.maxFavorites === "number" ? config.maxFavorites : 10,
          hideCompletedScenarios:
            typeof config.hideCompletedScenarios === "boolean"
              ? config.hideCompletedScenarios
              : false,
          hideDelayInHours:
            typeof config.hideDelayInHours === "number"
              ? config.hideDelayInHours
              : 0,
          fontSizeDefault: config.fontSizeDefault || "16px",
          fontSizeSmall: config.fontSizeSmall || "14px",
          isDevMode:
            typeof config.isDevMode === "boolean" ? config.isDevMode : false,
          dimUnfocusedPanels:
            typeof config.dimUnfocusedPanels === "boolean"
              ? config.dimUnfocusedPanels
              : true,
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
    if (get().theme === newTheme) return;
    set({ theme: newTheme });
    if (typeof window !== "undefined") {
      localStorage.setItem("theme", newTheme);
    }
    const user = get().user;
    if (user) {
      try {
        const userSettingsRef = doc(get().db, "settings", user.uid);
        await setDoc(userSettingsRef, { theme: newTheme }, { merge: true });
      } catch (error) {
        console.error("Error saving theme to Firestore:", error);
      }
    }
  },

  toggleTheme: async () => {
    const newTheme = get().theme === "light" ? "dark" : "light";
    await get().setTheme(newTheme);
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
      console.log("calling history panel close");
      window.parent.postMessage(
        {
          action: "callChatbotResize",
          payload: {
            width: -264,
          },
        },
        PARENT_ORIGIN
      );
    } else {
      console.log("calling history panel open");
      window.parent.postMessage(
        {
          action: "callChatbotResize",
          payload: {
            width: 264,
          },
        },
        PARENT_ORIGIN
      );
    }
  },

  // --- 👇 [수정된 부분 시작]: setActivePanel 수정 ---
  setActivePanel: (panel, sessionId = null) => {
    if (panel === "scenario") {
      // 시나리오 패널 활성화 시, active 및 lastFocused 모두 업데이트
      set({
        activePanel: panel,
        activeScenarioSessionId: sessionId,
        lastFocusedScenarioSessionId: sessionId,
      });
    } else {
      // 메인 패널 활성화 시, active만 업데이트하고 lastFocused는 유지
      set({ activePanel: "main", activeScenarioSessionId: null });
    }
    get().focusChatInput();
  },
  // --- 👆 [수정된 부분 끝] ---

  focusChatInput: () =>
    set((state) => ({ focusRequest: state.focusRequest + 1 })),
});
