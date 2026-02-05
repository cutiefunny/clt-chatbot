// app/store/slices/searchSlice.js
import { searchMessages } from "../../lib/api"; // API 함수 사용
import { locales } from "../../lib/locales"; // 오류 메시지용
import { getErrorKey, handleError } from "../../lib/errorHandler"; // 오류 처리용

export const createSearchSlice = (set, get) => ({
  // State
  isSearching: false, // 검색 진행 상태
  searchResults: [], // 검색 결과 배열

  // Actions
  searchConversations: async (searchQuery) => {
    // 입력값 공백 제거 및 유효성 검사
    const trimmedQuery = searchQuery?.trim() ?? '';
    if (!trimmedQuery) {
      set({ searchResults: [], isSearching: false }); // 쿼리 없으면 결과 초기화
      return;
    }

    set({ isSearching: true, searchResults: [] }); // 검색 시작, 이전 결과 초기화

    // 필요한 상태 및 함수 가져오기
    const { language, showEphemeralToast } = get();

    try {
      // API를 통해 검색 수행
      const results = await searchMessages(trimmedQuery);
      
      // API 응답을 프론트엔드 형식으로 변환
      const formattedResults = results.map(result => ({
        id: result.conversation_id || result.id,
        title: result.conversation_title || result.title || "Untitled Conversation",
        snippets: result.snippets || result.matches || []
      }));

      set({ searchResults: formattedResults }); // 최종 결과 상태 업데이트

    } catch (error) {
      handleError("Error during conversation search process", error, {
        getStore: get,
        showToast: true
      });
      set({ searchResults: [] }); // 오류 시 결과 초기화
    } finally {
      set({ isSearching: false }); // 검색 상태 종료 (성공/실패 무관)
    }
  }, // end searchConversations
});