// app/store/slices/conversationSlice.js
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  getDocs,
  serverTimestamp,
  deleteDoc,
  doc,
  updateDoc,
  limit, // loadConversation에서 사용될 수 있으므로 유지
  startAfter, // loadConversation에서 사용될 수 있으므로 유지
  writeBatch,
} from "firebase/firestore";
import { locales } from "../../lib/locales";
import { getErrorKey } from "../../lib/errorHandler";

const MESSAGE_LIMIT = 15; // 메시지 로드 제한 (chatSlice와 일치)

export const createConversationSlice = (set, get) => ({
  // State
  conversations: [], // 전체 대화 목록
  currentConversationId: null, // 현재 활성화된 대화 ID
  unsubscribeConversations: null, // 대화 목록 리스너 해제 함수
  scenariosForConversation: {}, // 각 대화별 시나리오 세션 목록 (확장 시 로드)
  expandedConversationId: null, // 히스토리 패널에서 확장된 대화 ID

  // Actions
  loadConversations: (userId) => {
    if (get().unsubscribeConversations) {
      console.log("Conversations listener already active.");
      return;
    }

    const q = query(
      collection(get().db, "chats", userId, "conversations"),
      orderBy("pinned", "desc"),
      orderBy("updatedAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const conversations = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        set({ conversations });
      },
      (error) => {
        console.error("Error listening to conversations changes:", error);
        const { language, showEphemeralToast } = get();
        const errorKey = getErrorKey(error);
        const message =
          locales[language]?.[errorKey] ||
          locales["en"]?.errorUnexpected ||
          "Failed to load conversations.";
        showEphemeralToast(message, "error");
      }
    );

    set({ unsubscribeConversations: unsubscribe });
  },

  loadConversation: async (conversationId) => {
    const user = get().user;
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

    const { language, showEphemeralToast } = get();

    set(state => {
        if (state.completedResponses.has(conversationId)) {
            const newCompletedSet = new Set(state.completedResponses);
            newCompletedSet.delete(conversationId);
            return { completedResponses: newCompletedSet };
        }
        return {};
    });

    get().unsubscribeAllMessagesAndScenarios?.();
    get().resetMessages?.(language);

    set({
      currentConversationId: conversationId,
      expandedConversationId: null,
    });
    get().setIsLoading?.(true);

    try {
      await get().loadInitialMessages?.(conversationId);

      const scenariosRef = collection(
        get().db,
        "chats",
        user.uid,
        "conversations",
        conversationId,
        "scenario_sessions"
      );
      const scenariosQuery = query(scenariosRef);
      const scenariosSnapshot = await getDocs(scenariosQuery);

      scenariosSnapshot.forEach((doc) => {
        get().subscribeToScenarioSession?.(doc.id);
      });

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
    if (get().currentConversationId === null && !returnId) return null;

    get().unsubscribeAllMessagesAndScenarios?.();
    get().resetMessages?.(get().language);

    const { language, user, showEphemeralToast } = get();

    if (user) {
      try {
        const conversationRef = await addDoc(
          collection(get().db, "chats", user.uid, "conversations"),
          {
            title: locales[language]?.["newChat"] || "New Conversation",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            pinned: false,
          }
        );
        const newConversationId = conversationRef.id;

        await get().loadConversation(newConversationId);

        if (get().currentConversationId !== newConversationId) {
          await new Promise((res) => setTimeout(res, 200));
          if (get().currentConversationId !== newConversationId) {
            console.error(
              "State update race condition: currentConversationId not set after loadConversation."
            );
            throw new Error(
              "Failed to properly load the new conversation after creation."
            );
          }
        }
        console.log(
          `New conversation ${newConversationId} created and loaded.`
        );

        return returnId ? newConversationId : null;
      } catch (error) {
        console.error("Error creating new conversation:", error);
        const errorKey = getErrorKey(error);
        const message =
          locales[language]?.[errorKey] ||
          locales["en"]?.errorUnexpected ||
          "Failed to create new conversation.";
        showEphemeralToast(message, "error");
        set({ currentConversationId: null, expandedConversationId: null });
        get().resetMessages?.(language);
        get().setIsLoading?.(false);
        return null;
      }
    } else {
      set({ currentConversationId: null, expandedConversationId: null });
      get().resetMessages?.(language);
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

    const conversationRef = doc(
      get().db,
      "chats",
      user.uid,
      "conversations",
      conversationId
    );
    const batch = writeBatch(get().db);

    try {
      const scenariosRef = collection(conversationRef, "scenario_sessions");
      const scenariosSnapshot = await getDocs(scenariosRef);
      scenariosSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      const messagesRef = collection(conversationRef, "messages");
      const messagesSnapshot = await getDocs(messagesRef);
      messagesSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      batch.delete(conversationRef);
      await batch.commit();

      console.log(`Conversation ${conversationId} deleted successfully.`);

      if (get().currentConversationId === conversationId) {
        get().unsubscribeAllMessagesAndScenarios?.();
        get().resetMessages?.(get().language);
        set({ 
          currentConversationId: null, 
          expandedConversationId: null 
        });
      }
    } catch (error) {
      console.error(`Error deleting conversation ${conversationId}:`, error);
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
      const conversationRef = doc(
        get().db,
        "chats",
        user.uid,
        "conversations",
        conversationId
      );
      await updateDoc(conversationRef, { title: trimmedTitle });
    } catch (error) {
      console.error(
        `Error updating title for conversation ${conversationId}:`,
        error
      );
      const errorKey = getErrorKey(error);
      const message =
        locales[language]?.[errorKey] ||
        locales["en"]?.errorUnexpected ||
        "Failed to update conversation title.";
      showEphemeralToast(message, "error");
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
      const conversationRef = doc(
        get().db,
        "chats",
        user.uid,
        "conversations",
        conversationId
      );
      await updateDoc(conversationRef, { pinned });
    } catch (error) {
      console.error(
        `Error updating pin status for conversation ${conversationId}:`,
        error
      );
      const errorKey = getErrorKey(error);
      const message =
        locales[language]?.[errorKey] ||
        locales["en"]?.errorUnexpected ||
        "Failed to update pin status.";
      showEphemeralToast(message, "error");
    }
  },

  toggleConversationExpansion: (conversationId) => {
    const {
      expandedConversationId,
      user,
      language,
      showEphemeralToast,
    } = get();
    const currentUnsubscribeMap = get().unsubscribeScenariosMap || {};

    if (expandedConversationId === conversationId) {
      get().unsubscribeFromScenarioSession?.(conversationId);
      set({ expandedConversationId: null });
      return;
    }

    if (expandedConversationId) {
      get().unsubscribeFromScenarioSession?.(expandedConversationId);
    }

    set({ expandedConversationId: conversationId });
    if (!user) return;

    const scenariosRef = collection(
      get().db,
      "chats",
      user.uid,
      "conversations",
      conversationId,
      "scenario_sessions"
    );
    const q = query(scenariosRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const scenarios = snapshot.docs.map((doc) => ({
          sessionId: doc.id,
          ...doc.data(),
        }));
        set((state) => ({
          scenariosForConversation: {
            ...state.scenariosForConversation,
            [conversationId]: scenarios,
          },
        }));
      },
      (error) => {
        console.error(
          `Error listening to scenarios for conversation ${conversationId}:`,
          error
        );
        const errorKey = getErrorKey(error);
        const message =
          locales[language]?.[errorKey] ||
          locales["en"]?.errorUnexpected ||
          "Failed to load scenario list.";
        showEphemeralToast(message, "error");
        unsubscribe();
        set((state) => ({
          ...(state.expandedConversationId === conversationId
            ? { expandedConversationId: null }
            : {}),
          scenariosForConversation: {
            ...state.scenariosForConversation,
            [conversationId]: [],
          },
        }));
      }
    );
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

        // 2. 모든 대화 ID 가져오기
        const conversationsRef = collection(get().db, "chats", user.uid, "conversations");
        const allConversationsSnapshot = await getDocs(conversationsRef);
        const conversationIds = allConversationsSnapshot.docs.map(doc => doc.id);

        if (conversationIds.length === 0) {
            showEphemeralToast(locales[language]?.deleteAllConvosSuccess || "All conversation history successfully deleted.", "success");
            return;
        }

        let batch = writeBatch(get().db);
        let batchCount = 0;

        for (const convoId of conversationIds) {
            const conversationRef = doc(get().db, "chats", user.uid, "conversations", convoId);

            // 3. 메시지 서브컬렉션 삭제
            const messagesRef = collection(conversationRef, "messages");
            const messagesSnapshot = await getDocs(messagesRef);
            messagesSnapshot.forEach((doc) => {
                batch.delete(doc.ref);
                batchCount++;
            });

            // 4. 시나리오 세션 서브컬렉션 삭제
            const scenariosRef = collection(conversationRef, "scenario_sessions");
            const scenariosSnapshot = await getDocs(scenariosRef);
            scenariosSnapshot.forEach((doc) => {
                batch.delete(doc.ref);
                batchCount++;
            });

            // 5. 대화 문서 삭제
            batch.delete(conversationRef);
            batchCount++;

            // Firestore는 한 배치에 최대 500개의 작업만 허용합니다.
            // 안전을 위해 490개마다 커밋하고 새 배치를 시작합니다.
            if (batchCount >= 490) {
                await batch.commit();
                batch = writeBatch(get().db);
                batchCount = 0;
            }
        }

        // 6. 남은 작업 커밋
        if (batchCount > 0) {
            await batch.commit();
        }

        console.log(`All ${conversationIds.length} conversations and their subcollections deleted successfully.`);
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

  // --- 👇 [추가] index.js에서 이동된 복합 액션 ---
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
  // --- 👆 [추가] ---
});