// app/store/slices/conversationSlice.js
import { locales } from "../../lib/locales";
import { getErrorKey } from "../../lib/errorHandler";
import { FASTAPI_BASE_URL } from "../../lib/constants";
import {
  fetchAllConversationsForUser,
  fetchScenarioSessionsForConversation,
  deleteScenarioSession,
  deleteConversationFull
} from "../../lib/api";

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
    const { user, language, showEphemeralToast } = get();
    if (
      !user ||
      get().currentConversationId === conversationId ||
      typeof conversationId !== "string" ||
      !conversationId
    ) {
      console.warn(
        `loadConversation called with invalid params: user=${!!user}, currentId=${get().currentConversationId
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

    const { language, user, showEphemeralToast } = get();
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
    const { user, language, showEphemeralToast } = get();
    if (!user || typeof conversationId !== "string" || !conversationId) {
      if (typeof conversationId !== "string" || !conversationId)
        console.error("deleteConversation invalid ID:", conversationId);
      return;
    }

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
    const { user, language, showEphemeralToast } = get();
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
      console.error("updateConversationTitle error:", error);
      showEphemeralToast("Failed to update title.", "error");
    }
  },

  pinConversation: async (conversationId, pinned) => {
    const { user, language, showEphemeralToast } = get();
    if (
      !user ||
      typeof conversationId !== "string" ||
      !conversationId ||
      typeof pinned !== "boolean"
    )
      return;

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
      console.error("pinConversation error:", error);
      showEphemeralToast("Failed to update pin status.", "error");
    }
  },

  toggleConversationExpansion: (conversationId) => {
    const { expandedConversationId } = get();

    if (expandedConversationId === conversationId) {
      set({ expandedConversationId: null });
      return;
    }

    set({ expandedConversationId: conversationId });
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
      // 2-1. 사용자의 모든 conversations 조회
      const allConversations = await fetchAllConversationsForUser(user.uid);
      console.log(`[deleteAllConversations] Found ${allConversations.length} conversations for user ${user.uid}`);

      // 2-2. 각 conversation에 대해 scenario-sessions 삭제 후 conversation 삭제
      for (const conversation of allConversations) {
        const conversationId = conversation.id || conversation.conversation_id;
        console.log(`[deleteAllConversations] Processing conversation: ${conversationId}`);

        // 2-2-1. 해당 conversation의 모든 scenario-sessions 조회
        const scenarioSessions = await fetchScenarioSessionsForConversation(conversationId, user.uid);
        console.log(`[deleteAllConversations] Found ${scenarioSessions.length} scenario sessions in conversation ${conversationId}`);

        // 2-2-2. 각 scenario-session 삭제
        for (const session of scenarioSessions) {
          const sessionId = session.id || session.session_id;
          console.log(`[deleteAllConversations] Deleting scenario session: ${sessionId}`);
          const deleteResult = await deleteScenarioSession(conversationId, sessionId, user.uid);
          console.log(`[deleteAllConversations] Scenario session deletion result: ${deleteResult}`);
        }

        // 2-2-3. conversation 삭제
        console.log(`[deleteAllConversations] Deleting conversation: ${conversationId}`);
        const convDeleteResult = await deleteConversationFull(conversationId, user.uid);
        console.log(`[deleteAllConversations] Conversation deletion result: ${convDeleteResult}`);
      }

      console.log("[deleteAllConversations] All conversations and scenario sessions deleted successfully via FastAPI.");
      showEphemeralToast(locales[language]?.deleteAllConvosSuccess || "All conversation history successfully deleted.", "success");

    } catch (error) {
      console.error("[deleteAllConversations] Error deleting all conversations:", error);
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