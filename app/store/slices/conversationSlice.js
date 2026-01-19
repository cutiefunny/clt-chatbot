// app/store/slices/conversationSlice.js
import {
  collection,
  query,
  orderBy,
  onSnapshot,
} from "firebase/firestore";

// 👇 불필요한 import 제거 (FastAPI, addDoc, deleteDoc, updateDoc 등)

export const createConversationSlice = (set, get) => ({
  // State
  currentConversationId: null,
  expandedConversationId: null,
  scenariosForConversation: {}, // 하위 시나리오 목록 (필요하다면 React Query로 추후 이관)
  
  // [삭제됨] conversations 배열 및 리스너

  // Actions
  loadConversation: async (conversationId) => {
    const { user, language, useFastApi } = get();
    if (
      !user ||
      get().currentConversationId === conversationId ||
      !conversationId
    ) {
      return;
    }

    // 완료 응답 표시 해제
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

    // 메시지 로드 (FastAPI 모드)
    if (useFastApi) {
       get().unsubscribeAllMessagesAndScenarios?.(); 
       get().resetMessages?.(language);
       await get().loadInitialMessages(conversationId);
       return;
    }

    // (기존 Firebase 로직은 useFastApi가 true이므로 실행되지 않으나, 백업용으로 두거나 삭제 가능)
    // 여기서는 간결함을 위해 유지하되 실행되지 않음
  },

  // [삭제됨] loadConversations, createNewConversation, deleteConversation...

  toggleConversationExpansion: (conversationId) => {
    const { expandedConversationId, user } = get();

    if (expandedConversationId === conversationId) {
      set({ expandedConversationId: null });
      return;
    }

    set({ expandedConversationId: conversationId });
    if (!user) return;

    // 시나리오 세션 목록 구독 (이 부분도 React Query로 추후 전환 권장)
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
      }
    );
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