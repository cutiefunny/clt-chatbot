// app/store/slices/conversationSlice.js
import { fetchScenarioSessions } from "../../lib/api";

export const createConversationSlice = (set, get) => ({
  currentConversationId: null,
  expandedConversationId: null,
  scenariosForConversation: {}, 

  loadConversation: async (conversationId) => {
    const { language, useFastApi } = get();
    if (!conversationId || get().currentConversationId === conversationId) return;

    set({
      currentConversationId: conversationId,
      expandedConversationId: null,
    });

    if (useFastApi) {
       get().unsubscribeAllMessagesAndScenarios?.(); 
       get().resetMessages?.(language);
       await get().loadInitialMessages(conversationId);
       return;
    }
  },

  // onSnapshot 제거 후 API 호출 방식
  toggleConversationExpansion: async (conversationId) => {
    const { expandedConversationId } = get();

    if (expandedConversationId === conversationId) {
      set({ expandedConversationId: null });
      return;
    }

    set({ expandedConversationId: conversationId });

    try {
      // API 호출을 통해 시나리오 세션 목록을 가져옴
      const scenarios = await fetchScenarioSessions(conversationId);
      
      set((state) => ({
        scenariosForConversation: {
          ...state.scenariosForConversation,
          [conversationId]: Array.isArray(scenarios) ? scenarios : [],
        },
      }));
    } catch (error) {
      console.error(`[ConversationSlice] Failed to fetch scenarios:`, error);
      // 에러 발생 시 빈 배열로 초기화하여 UI 깨짐 방지
      set((state) => ({
        scenariosForConversation: {
          ...state.scenariosForConversation,
          [conversationId]: [],
        },
      }));
    }
  },

  handleScenarioItemClick: (conversationId, scenario) => {
    if (get().currentConversationId !== conversationId) {
      get().loadConversation(conversationId);
    }
    
    // 세션 ID가 존재하는 경우 스크롤 이동
    const sessionId = scenario.sessionId || scenario.id;
    if (sessionId) {
      get().setScrollToMessageId(sessionId);
    }

    if (["completed", "failed", "canceled"].includes(scenario.status)) {
      get().setActivePanel("main");
      set({
        activeScenarioSessionId: null,
        lastFocusedScenarioSessionId: sessionId,
      });
    } else {
      get().setActivePanel("scenario", sessionId);
    }
    
    // 시나리오 상세 리스너는 다음 단계에서 제거 예정
    if (sessionId && !get().scenarioStates[sessionId]) {
      get().subscribeToScenarioSession?.(sessionId);
    }
  },
});