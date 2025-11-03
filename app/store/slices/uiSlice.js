// app/store/slices/uiSlice.js
import { doc, setDoc, getDoc } from "firebase/firestore";
import { locales } from "../../lib/locales";

const PARENT_ORIGIN = process.env.NEXT_PUBLIC_PARENT_ORIGIN || "http://localhost:3000"; // NEXT_PUBLIC_PARENT_ORIGIN 환경 변수 사용

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
  contentTruncateLimit: 200, // --- 👈 [추가] 봇 답변 줄임 글자 수 (기본값 200) ---
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
          hideCompletedScenarios:
            typeof config.hideCompletedScenarios === "boolean"
              ? config.hideCompletedScenarios
              : false,
          hideDelayInHours:
            typeof config.hideDelayInHours === "number"
              ? config.hideDelayInHours
              : 0,
          contentTruncateLimit:
            typeof config.contentTruncateLimit === "number"
              ? config.contentTruncateLimit
              : 200,
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

  // --- 👇 [수정] setTheme: 항상 'light'로 설정하고 저장 로직 제거 ---
  setTheme: async (newTheme) => {
    // newTheme 인자를 무시하고 항상 'light'로 설정
    set({ theme: "light" });
    if (typeof window !== "undefined") {
      // 로컬 스토리지에서도 'light'로 강제
      localStorage.setItem("theme", "light");
    }
    // Firestore 저장 로직 제거
  },

  // --- 👇 [수정] toggleTheme: 기능 비활성화 (호출해도 아무것도 안 함) ---
  toggleTheme: async () => {
    // 테마 토글 기능을 비활성화
    console.log("Theme toggling is disabled.");
    // set({ theme: "light" }); // 필요 시 강제로 light로 설정
  },
  // --- 👆 [수정] ---

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

  toggleScenarioPanelExpanded: () => {
    if (get().activePanel !== "scenario") return;
    const wasExpanded = get().isScenarioPanelExpanded;
    const widthDelta = wasExpanded ? -280 : 280;
    window.parent.postMessage(
      {
        action: "callChatbotResize",
        payload: {
          width: widthDelta,
        },
      },
      PARENT_ORIGIN
    );
    set({ isScenarioPanelExpanded: !wasExpanded });
  },

  resetScenarioPanelExpansion: () => set({ isScenarioPanelExpanded: false }),

  setActivePanel: (panel, sessionId = null) => {
    const wasScenarioPanelActive = get().activePanel === "scenario";
    const wasExpanded = get().isScenarioPanelExpanded;
    if (panel === "scenario") {
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