// app/store/slices/searchSlice.js
import { collection, getDocs } from "firebase/firestore"; // Firestore 접근 필요
import { locales } from "../../lib/locales"; // 오류 메시지용
import { getErrorKey } from "../../lib/errorHandler"; // 오류 처리용

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
    const { user, conversations, language, showEphemeralToast, db } = get(); // db 인스턴스 가져오기

    // 사용자 또는 대화 목록 없으면 검색 중단
    if (!user || !conversations) {
      console.warn("Search cannot proceed: User or conversations not available.");
      set({ isSearching: false });
      return;
    }

    const lowerCaseQuery = trimmedQuery.toLowerCase();
    const results = [];

    try {
      // 모든 대화에 대해 병렬로 메시지 검색 (Promise.all 사용)
      const searchPromises = conversations.map(async (convo) => {
        // convo 객체 및 ID 유효성 검사
        if (!convo || typeof convo.id !== 'string' || !convo.id) {
            console.warn("Invalid conversation object found during search:", convo);
            return null; // 유효하지 않은 대화 건너뛰기
        }
        try {
          const messagesCollection = collection(
            db, // get()으로 가져온 db 인스턴스 사용
            "chats",
            user.uid,
            "conversations",
            convo.id,
            "messages"
          );
          // Firestore 쿼리 대신 모든 메시지 가져오기 (성능 고려 필요)
          // TODO: 대규모 데이터의 경우 Firestore 텍스트 검색 또는 외부 검색 엔진 사용 고려
          const messagesSnapshot = await getDocs(messagesCollection); // Firestore 읽기

          let foundInConvo = false;
          const matchingSnippets = []; // 스니펫 이름 변경

          messagesSnapshot.forEach((doc) => {
            const message = doc.data();
            const content = message.text || ""; // text 필드 없을 수 있음

            // 문자열 타입이고, 검색어 포함하는지 확인
            if (typeof content === 'string' && content.toLowerCase().includes(lowerCaseQuery)) {
              foundInConvo = true;
              // 스니펫 생성 (최대 3개)
              if (matchingSnippets.length < 3) {
                const snippetIndex = content.toLowerCase().indexOf(lowerCaseQuery);
                const start = Math.max(0, snippetIndex - 30); // 스니펫 범위 조정
                const end = Math.min(content.length, snippetIndex + lowerCaseQuery.length + 30); // 스니펫 범위 조정
                matchingSnippets.push(`...${content.substring(start, end)}...`);
              }
            }
          });

          // 해당 대화에서 검색 결과 찾으면 결과 객체 반환
          if (foundInConvo) {
            return {
              id: convo.id,
              title: convo.title || "Untitled Conversation", // 기본 제목 설정
              snippets: matchingSnippets,
            };
          }
        } catch (convoSearchError) {
          // 개별 대화 검색 중 오류 발생 시 로깅하고 null 반환
          console.error(`Error searching messages in conversation ${convo.id}:`, convoSearchError);
        }
        return null; // 검색 결과 없거나 오류 시 null 반환
      });

      // 모든 검색 Promise가 완료될 때까지 기다림
      const searchResultsRaw = await Promise.all(searchPromises);
      // null이 아닌 유효한 결과만 필터링
      results.push(...searchResultsRaw.filter(result => result !== null));

      set({ searchResults: results }); // 최종 결과 상태 업데이트

    } catch (error) { // 전체 검색 프로세스 중 오류 발생 시 (거의 발생 안 함)
      console.error("Error during conversation search process:", error);
      const errorKey = getErrorKey(error);
      const message = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Search failed.';
      showEphemeralToast(message, 'error');
      set({ searchResults: [] }); // 오류 시 결과 초기화
    } finally {
      set({ isSearching: false }); // 검색 상태 종료 (성공/실패 무관)
    }
  }, // end searchConversations
});