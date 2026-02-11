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
  writeBatch,
} from "firebase/firestore";
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
    // --- 👇 [수정] FastAPI 사용 시 분기 처리 ---
    if (get().useFastApi) {
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
        // 에러 처리 (토스트 등)
      }
      return;
    }
    // --- 👆 [수정] ---

    if (get().unsubscribeConversations) return;

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
        console.error("Error listening to conversations:", error);
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

    // --- 👇 [수정] FastAPI 모드일 때 리스너 해제 및 메시지 로드 호출 ---
    if (useFastApi) {
       get().unsubscribeAllMessagesAndScenarios?.(); 
       get().resetMessages?.(language); // 메시지 초기화
       await get().loadInitialMessages(conversationId);
       return;
    }
    // --- 👆 [수정] ---

    get().unsubscribeAllMessagesAndScenarios?.();
    get().resetMessages?.(language);
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
    // 현재 대화가 없고 returnId가 false이면 중단 (불필요한 생성 방지)
    if (get().currentConversationId === null && !returnId) return null;

    get().unsubscribeAllMessagesAndScenarios?.();
    get().resetMessages?.(get().language);

    const { language, user, showEphemeralToast, useFastApi } = get();
    const title = locales[language]?.["newChat"] || "New Chat";

    // --- 👇 [수정] FastAPI 사용 시 ---
    if (useFastApi) {
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
        await get().loadConversations(user.uid); // 목록 갱신
        
        // returnId가 true일 때만 로드 (저장 시 자동 생성 등의 경우)
        // 또는 명시적으로 새 대화 버튼을 눌렀을 때
        await get().loadConversation(newConvo.id); 
        
        console.log(`New conversation (FastAPI) ${newConvo.id} created and loaded.`);
        return returnId ? newConvo.id : null;
      } catch (error) {
        console.error("FastAPI createNewConversation error:", error);
        showEphemeralToast("Failed to create conversation (API).", "error");
        set({ currentConversationId: null, expandedConversationId: null });
        get().setIsLoading?.(false);
        return null;
      }
    }
    // --- 👆 [수정] ---

    if (user) {
      try {
        const conversationRef = await addDoc(
          collection(get().db, "chats", user.uid, "conversations"),
          {
            title,
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

    // NOTE: FastAPI 모드에서는 시나리오 세션 서브컬렉션이 없을 수 있으므로
    // 이 부분은 Firebase 모드에서만 동작하거나, API가 지원하도록 수정 필요.
    // 현재는 기존 Firebase 로직 유지.
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