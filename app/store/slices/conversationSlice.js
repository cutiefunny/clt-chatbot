// app/store/slices/conversationSlice.js
import { locales } from "../../lib/locales";
import { getErrorKey } from "../../lib/errorHandler";

const FASTAPI_BASE_URL = "http://202.20.84.65:8083/api/v1"; // FastAPI 주소

export const createConversationSlice = (set, get) => ({
  // State
  conversations: [],
  currentConversationId: null,
  unsubscribeConversations: null,
  scenariosForConversation: {},
  expandedConversationId: null,

  // Actions
  loadConversations: async (userId) => {
    get().unsubscribeConversations?.(); // 기존 리스너 해제
    set({ unsubscribeConversations: null });

    try {
      const params = new URLSearchParams({
        usr_id: userId,
        ten_id: "1000",
        stg_id: "DEV",
        sec_ofc_id: "000025"
      });
      const response = await fetch(`${FASTAPI_BASE_URL}/conversations?${params}`);
      if (!response.ok) throw new Error("Failed to fetch conversations");
      const conversations = await response.json();
      set({ conversations });
    } catch (error) {
      console.error("FastAPI loadConversations error:", error);
      const { language, showEphemeralToast } = get();
      const errorKey = getErrorKey(error);
      const message =
        locales[language]?.[errorKey] ||
        locales["en"]?.errorUnexpected ||
        "Failed to load conversations.";
      showEphemeralToast(message, "error");
    }
  },

  loadConversation: async (conversationId) => {
    const { user, language, useFastApi, showEphemeralToast } = get();
    if (
      !user ||
      get().currentConversationId === conversationId ||
      typeof conversationId !== "string" ||
      !conversationId
    ) {
      console.warn(
        `loadConversation called with invalid params: user=${!!user}, currentId=${
          get().currentConversationId
        }, targetId=${conversationId}`
      );
      return;
    }

    set((state) => {
        if (state.completedResponses.has(conversationId)) {
            const newCompletedSet = new Set(state.completedResponses);
            newCompletedSet.delete(conversationId);
            return { completedResponses: newCompletedSet };
        }
        return {};
    });

    set({
      currentConversationId: conversationId,
      expandedConversationId: null,
    });

    get().unsubscribeAllMessagesAndScenarios?.(); 
    get().resetMessages?.(language); // 메시지 초기화
    get().setIsLoading?.(true);
    
    try {
      await get().loadInitialMessages(conversationId);
    } catch (error) {
      console.error(`Error loading conversation ${conversationId}:`, error);
      const errorKey = getErrorKey(error);
      const message =
        locales[language]?.[errorKey] ||
        locales["en"]?.errorUnexpected ||
        "Failed to load conversation.";
      showEphemeralToast(message, "error");
      set({
        currentConversationId: null,
      });
      get().resetMessages?.(language);
      get().unsubscribeAllMessagesAndScenarios?.();
      get().setIsLoading?.(false);
    }
  },

  createNewConversation: async (returnId = false) => {
    // 현재 대화가 없고 returnId가 false이면 중단 (불필요한 생성 방지)
    if (get().currentConversationId === null && !returnId) return null;

    get().unsubscribeAllMessagesAndScenarios?.();
    get().resetMessages?.(get().language);
    get().setIsLoading?.(true);

    const { language, user, showEphemeralToast, useFastApi } = get();
    const title = locales[language]?.["newChat"] || "New Chat";

    try {
      const response = await fetch(`${FASTAPI_BASE_URL}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usr_id: user.uid,
          title,
          ten_id: "1000",
          stg_id: "DEV",
          sec_ofc_id: "000025"
        }),
      });
      if (!response.ok) throw new Error("Failed to create conversation");
      
      const newConvo = await response.json();
      const newConvoId = newConvo.id || newConvo.conversation_id;
      
      if (!newConvoId) {
        throw new Error("No conversation ID in response");
      }
      
      await get().loadConversations(user.uid); // 목록 갱신
      await get().loadConversation(newConvoId); 
      
      console.log(`New conversation (FastAPI) ${newConvoId} created and loaded.`);
      return returnId ? newConvoId : null;
    } catch (error) {
      console.error("FastAPI createNewConversation error:", error);
      showEphemeralToast("Failed to create conversation (API).", "error");
      set({ currentConversationId: null, expandedConversationId: null });
      get().setIsLoading?.(false);
      return null;
    }
  },

  deleteConversation: async (conversationId) => {
    const { user, language, showEphemeralToast, useFastApi } = get();
    if (!user || typeof conversationId !== "string" || !conversationId) {
      if (typeof conversationId !== "string" || !conversationId)
        console.error("deleteConversation invalid ID:", conversationId);
      return;
    }

    // FastAPI를 통해 대화방 삭제
    try {
      const params = new URLSearchParams({
        usr_id: user.uid,
        ten_id: "1000",
        stg_id: "DEV",
        sec_ofc_id: "000025"
      });
      const response = await fetch(`${FASTAPI_BASE_URL}/conversations/${conversationId}?${params}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete conversation");

      await get().loadConversations(user.uid); // 목록 갱신
      
      if (get().currentConversationId === conversationId) {
         get().unsubscribeAllMessagesAndScenarios?.();
         get().resetMessages?.(get().language);
         set({ 
           currentConversationId: null, 
           expandedConversationId: null 
         });
      }
      showEphemeralToast("Conversation deleted.", "success");
    } catch (error) {
      console.error("deleteConversation error:", error);
      const errorKey = getErrorKey(error);
      const message =
        locales[language]?.[errorKey] ||
        locales["en"]?.errorUnexpected ||
        "Failed to delete conversation.";
      showEphemeralToast(message, "error");
    }
  },

  updateConversationTitle: async (conversationId, newTitle) => {
    const { user, language, showEphemeralToast, useFastApi } = get();
    if (
      !user ||
      typeof conversationId !== "string" ||
      !conversationId ||
      typeof newTitle !== "string" ||
      !newTitle.trim()
    ) {
      if (typeof newTitle !== "string" || !newTitle.trim())
        showEphemeralToast("Title cannot be empty.", "error");
      return;
    }
    const trimmedTitle = newTitle.trim().substring(0, 100);

    // --- 👇 [수정] FastAPI 사용 시 ---
    if (useFastApi) {
      try {
        await fetch(`${FASTAPI_BASE_URL}/conversations/${conversationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            usr_id: user.uid,
            title: trimmedTitle,
            ten_id: "1000",
            stg_id: "DEV",
            sec_ofc_id: "000025"
          }),
        });
        await get().loadConversations(user.uid);
      } catch (error) {
        console.error("FastAPI updateConversationTitle error:", error);
        showEphemeralToast("Failed to update title.", "error");
      }
      return;
    }
    // --- 👆 [수정] ---

    // [임시] Firestore 모드는 비활성화
  },

  pinConversation: async (conversationId, pinned) => {
    const { user, language, showEphemeralToast, useFastApi } = get();
    if (
      !user ||
      typeof conversationId !== "string" ||
      !conversationId ||
      typeof pinned !== "boolean"
    )
      return;

    // --- 👇 [수정] FastAPI 사용 시 ---
    if (useFastApi) {
      try {
        await fetch(`${FASTAPI_BASE_URL}/conversations/${conversationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            usr_id: user.uid,
            is_pinned: pinned,
            ten_id: "1000",
            stg_id: "DEV",
            sec_ofc_id: "000025"
          }),
        });
        await get().loadConversations(user.uid);
      } catch (error) {
        console.error("FastAPI pinConversation error:", error);
        showEphemeralToast("Failed to update pin status.", "error");
      }
      return;
    }
    // --- 👆 [수정] ---

    // [임시] Firestore 모드는 비활성화
  },

  toggleConversationExpansion: (conversationId) => {
    const {
      expandedConversationId,
      user,
      language,
      showEphemeralToast,
    } = get();

    if (expandedConversationId === conversationId) {
      set({ expandedConversationId: null });
      return;
    }

    set({ expandedConversationId: conversationId });
    // [임시] FastAPI 모드에서는 시나리오 세션 조회가 필요하면 별도 API 호출 필요
  },

  deleteAllConversations: async () => {
    const { user, language, showEphemeralToast, unsubscribeAllMessagesAndScenarios, resetMessages } = get();
    if (!user) return;

    try {
        // 1. 모든 리스너 해제 및 UI 초기화 준비
        unsubscribeAllMessagesAndScenarios();
        resetMessages(language);
        set({
            currentConversationId: null,
            expandedConversationId: null,
            conversations: [], // Optimistic UI update
        });

        // 2. FastAPI를 통해 모든 대화 삭제
        const response = await fetch(`${FASTAPI_BASE_URL}/conversations/delete-all`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            usr_id: user.uid,
            ten_id: "1000",
            stg_id: "DEV",
            sec_ofc_id: "000025"
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to delete all conversations: ${response.status}`);
        }

        console.log("All conversations deleted successfully via FastAPI.");
        showEphemeralToast(locales[language]?.deleteAllConvosSuccess || "All conversation history successfully deleted.", "success");

    } catch (error) {
        console.error("Error deleting all conversations:", error);
        const errorKey = getErrorKey(error);
        const message =
          locales[language]?.[errorKey] ||
          locales["en"]?.errorUnexpected ||
          "Failed to delete all conversations.";
        showEphemeralToast(message, "error");
    }
},

  handleScenarioItemClick: (conversationId, scenario) => {
    if (get().currentConversationId !== conversationId) {
      get().loadConversation(conversationId);
    }
    get().setScrollToMessageId(scenario.sessionId);

    if (["completed", "failed", "canceled"].includes(scenario.status)) {
      get().setActivePanel("main");
      set({
        activeScenarioSessionId: null,
        lastFocusedScenarioSessionId: scenario.sessionId,
      });
    } else {
      get().setActivePanel("scenario", scenario.sessionId);
    }
    if (!get().scenarioStates[scenario.sessionId]) {
      get().subscribeToScenarioSession?.(scenario.sessionId);
    }
  },
});