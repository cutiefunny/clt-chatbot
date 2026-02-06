// app/store/slices/conversationSlice.js
import { 
  fetchConversations, 
  createConversation, 
  updateConversation, 
  deleteConversation 
} from "../../lib/api";
import { handleError } from "../../lib/errorHandler";

export const createConversationSlice = (set, get) => ({
  conversations: [],
  currentConversationId: null,
  currentConversationTitle: "New Chat",
  isConversationsLoading: false,

  /**
   * 전체 대화 목록 로드 (FastAPI 기반)
   */
  loadConversations: async () => {
    set({ isConversationsLoading: true });
    try {
      const data = await fetchConversations(0, 50);
      // 서버 응답 데이터 구조에 따라 필터링 및 정렬 (필요 시)
      set({ 
        conversations: Array.isArray(data) ? data : [],
        isConversationsLoading: false 
      });
    } catch (error) {
      handleError("Error loading conversations", error);
      set({ isConversationsLoading: false });
    }
  },

  /**
   * 새 대화 생성
   */
  createNewConversation: async (shouldSelect = true) => {
    try {
      const newConv = await createConversation("New Chat");
      
      set((state) => ({
        conversations: [newConv, ...state.conversations],
      }));

      if (shouldSelect) {
        get().selectConversation(newConv.id);
      }
      return newConv.id;
    } catch (error) {
      handleError("Error creating conversation", error);
      return null;
    }
  },

  /**
   * 대화 선택 및 관련 데이터 로드
   */
  selectConversation: (conversationId) => {
    const { conversations, loadInitialMessages, unsubscribeAllMessagesAndScenarios } = get();
    
    // 기존 리스너 및 시나리오 정리
    unsubscribeAllMessagesAndScenarios();

    const selected = conversations.find((c) => c.id === conversationId);
    
    set({
      currentConversationId: conversationId,
      currentConversationTitle: selected ? selected.title : "New Chat",
    });

    // chatSlice의 메시지 로드 함수 호출
    loadInitialMessages(conversationId);
  },

  /**
   * 대화 제목 수정 (낙관적 업데이트 적용)
   */
  updateConversationTitle: async (conversationId, newTitle) => {
    const previousConversations = get().conversations;
    
    // 로컬 상태 먼저 업데이트
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, title: newTitle } : c
      ),
      currentConversationTitle: state.currentConversationId === conversationId ? newTitle : state.currentConversationTitle,
    }));

    try {
      await updateConversation(conversationId, { title: newTitle });
    } catch (error) {
      handleError("Error updating conversation title", error);
      // 에러 시 롤백
      set({ conversations: previousConversations });
    }
  },

  /**
   * 대화 고정 상태 변경
   */
  togglePinConversation: async (conversationId) => {
    const { conversations } = get();
    const target = conversations.find((c) => c.id === conversationId);
    if (!target) return;

    const newPinnedStatus = !target.is_pinned;

    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, is_pinned: newPinnedStatus } : c
      ),
    }));

    try {
      await updateConversation(conversationId, { isPinned: newPinnedStatus });
    } catch (error) {
      handleError("Error toggling pin status", error);
      // 에러 시 로컬 상태 복구 (생략 가능 또는 로직 추가)
    }
  },

  /**
   * 대화 삭제
   */
  deleteConversationById: async (conversationId) => {
    const { currentConversationId, conversations, resetMessages, cleanupScenarioStates } = get();
    
    try {
      await deleteConversation(conversationId);
      
      set({
        conversations: conversations.filter((c) => c.id !== conversationId),
      });

      // 현재 보고 있는 대화를 삭제한 경우 초기화
      if (currentConversationId === conversationId) {
        console.log('[deleteConversationById] Deleting current conversation, resetting chat');
        set({
          currentConversationId: null,
          currentConversationTitle: "New Chat",
          scenarioStates: {}, // 시나리오 상태 초기화
          activeScenarioSessionId: null, // 활성 시나리오 세션 초기화
        });
        resetMessages();
        get().setActivePanel?.("main"); // 메인 패널로 전환
      }
    } catch (error) {
      handleError("Error deleting conversation", error);
    }
  },

  /**
   * Firebase 리스너 관련 함수 (인터페이스 유지를 위해 빈 함수로 둠)
   */
  subscribeToConversations: () => {
    get().loadConversations();
  },
  unsubscribeConversations: () => {},
});