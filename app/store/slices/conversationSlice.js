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

// getInitialMessages는 chatSlice 또는 별도 유틸로 이동 고려
// 여기서는 conversationSlice가 직접 chatSlice의 초기 메시지 상태를 알 필요는 없음
// const getInitialMessages = (lang = "ko") => { ... };

const MESSAGE_LIMIT = 15; // 메시지 로드 제한 (chatSlice와 일치)

export const createConversationSlice = (set, get) => ({
  // State
  conversations: [], // 전체 대화 목록
  currentConversationId: null, // 현재 활성화된 대화 ID
  unsubscribeConversations: null, // 대화 목록 리스너 해제 함수
  scenariosForConversation: {}, // 각 대화별 시나리오 세션 목록 (확장 시 로드)
  expandedConversationId: null, // 히스토리 패널에서 확장된 대화 ID
  // isLoading 상태는 uiSlice 또는 chatSlice에서 관리하는 것이 더 적합

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

  // --- 👇 [수정] loadConversation (completedResponses 뱃지 제거 로직 추가) ---
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

    // --- [NEW] ---
    // "완료" 뱃지 제거 (사용자가 확인했으므로)
    set(state => {
        if (state.completedResponses.has(conversationId)) {
            const newCompletedSet = new Set(state.completedResponses);
            newCompletedSet.delete(conversationId);
            return { completedResponses: newCompletedSet };
        }
        return {}; // 변경 없음
    });
    // --- [NEW END] ---

    // 다른 슬라이스의 액션 호출 (구독 해제, 상태 초기화)
    get().unsubscribeAllMessagesAndScenarios?.(); // chatSlice + scenarioSlice
    get().resetMessages?.(language); // chatSlice 호출하여 메시지 상태 초기화

    // conversationSlice 상태 업데이트
    set({
      currentConversationId: conversationId,
      expandedConversationId: null, // 대화 변경 시 확장 닫기
    });
    get().setIsLoading?.(true); // uiSlice 또는 chatSlice에 setIsLoading 함수 필요

    try {
      // chatSlice의 초기 메시지 로드 및 구독 함수 호출
      await get().loadInitialMessages?.(conversationId); // chatSlice 호출

      // 시나리오 세션 구독 시작 (scenarioSlice 호출)
      const scenariosRef = collection(
        get().db,
        "chats",
        user.uid,
        "conversations",
        conversationId,
        "scenario_sessions"
      );
      const scenariosQuery = query(scenariosRef);
      const scenariosSnapshot = await getDocs(scenariosQuery); // Firestore 읽기

      scenariosSnapshot.forEach((doc) => {
        get().subscribeToScenarioSession?.(doc.id); // scenarioSlice 호출
      });

    } catch (error) {
      console.error(`Error loading conversation ${conversationId}:`, error);
      const errorKey = getErrorKey(error);
      const message =
        locales[language]?.[errorKey] ||
        locales["en"]?.errorUnexpected ||
        "Failed to load conversation.";
      showEphemeralToast(message, "error");
      // 오류 발생 시 상태 초기화
      set({
        currentConversationId: null,
      });
      get().resetMessages?.(language); // chatSlice 메시지 초기화
      get().unsubscribeAllMessagesAndScenarios?.(); // 모든 관련 리스너 정리
      get().setIsLoading?.(false); // 로딩 상태 해제
    }
  },
  // --- 👆 [수정] ---

  createNewConversation: async (returnId = false) => {
    // 현재 대화 ID가 없고, ID 반환 목적도 아니면 중복 생성 방지
    if (get().currentConversationId === null && !returnId) return null;

    // 다른 슬라이스 호출 (구독 해제, 상태 초기화)
    get().unsubscribeAllMessagesAndScenarios?.(); // chatSlice + scenarioSlice
    get().resetMessages?.(get().language); // chatSlice 메시지 초기화

    const { language, user, showEphemeralToast } = get();

    // 새 대화 생성 로직 (사용자 로그인 상태 확인)
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

        // 새 대화 로드를 바로 호출하고 기다림 (내부에서 상태 업데이트 및 로딩 처리)
        await get().loadConversation(newConversationId);

        // loadConversation 완료 후 ID가 정상 설정되었는지 확인 (방어 코드)
        if (get().currentConversationId !== newConversationId) {
          await new Promise((res) => setTimeout(res, 200)); // 상태 업데이트 시간 확보
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

        return returnId ? newConversationId : null; // ID 반환 또는 null
      } catch (error) {
        console.error("Error creating new conversation:", error);
        const errorKey = getErrorKey(error);
        const message =
          locales[language]?.[errorKey] ||
          locales["en"]?.errorUnexpected ||
          "Failed to create new conversation.";
        showEphemeralToast(message, "error");
        // 상태 초기화
        set({ currentConversationId: null, expandedConversationId: null });
        get().resetMessages?.(language); // chatSlice 호출
        get().setIsLoading?.(false); // 로딩 상태 해제
        return null; // 실패 시 null 반환
      }
    } else {
      // 사용자가 없는 경우 (로그아웃 상태 등) UI만 초기화
      set({ currentConversationId: null, expandedConversationId: null });
      get().resetMessages?.(language); // chatSlice 호출
      get().setIsLoading?.(false); // 로딩 상태 해제
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
      // 하위 컬렉션 문서 삭제
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

      batch.delete(conversationRef); // 대화 문서 삭제
      await batch.commit(); // 일괄 실행

      console.log(`Conversation ${conversationId} deleted successfully.`);

      // --- 👇 [수정된 부분 시작] ---
      // 현재 대화가 삭제되었다면 (로컬) 상태를 초기화 (새 대화 생성 방지)
      if (get().currentConversationId === conversationId) {
        // get().createNewConversation(); // <- 이 코드가 버그의 원인입니다.
        
        // 새 대화 생성 대신, 로컬 상태만 초기화합니다.
        get().unsubscribeAllMessagesAndScenarios?.(); // 구독 해제
        get().resetMessages?.(get().language); // 메시지 패널 초기화 (chatSlice)
        set({ 
          currentConversationId: null, 
          expandedConversationId: null 
        }); // 현재 대화 ID 제거
        // isLoading 상태는 resetMessages에서 false로 설정됨
      }
      // --- 👆 [수정된 부분 끝] ---
      // Firestore 리스너가 conversations 목록 업데이트 처리
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
    const trimmedTitle = newTitle.trim().substring(0, 100); // 길이 제한 적용
    try {
      const conversationRef = doc(
        get().db,
        "chats",
        user.uid,
        "conversations",
        conversationId
      );
      await updateDoc(conversationRef, { title: trimmedTitle });
      // Firestore 리스너가 UI 업데이트 처리
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
      // Firestore 리스너가 UI 업데이트 처리
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
      /* unsubscribeScenariosMap 제거 */ user,
      language,
      showEphemeralToast,
    } = get();
    const currentUnsubscribeMap = get().unsubscribeScenariosMap || {}; // scenarioSlice의 상태 참조

    // 닫기
    if (expandedConversationId === conversationId) {
      // scenarioSlice의 구독 해제 함수 호출
      get().unsubscribeFromScenarioSession?.(conversationId);
      set({ expandedConversationId: null });
      // scenariosForConversation 데이터는 유지해도 무방

      return;
    }

    // 다른 거 열려있으면 닫기
    if (expandedConversationId) {
      get().unsubscribeFromScenarioSession?.(expandedConversationId); // scenarioSlice 호출
    }

    // 새로 열기 - UI 상태 먼저 업데이트
    set({ expandedConversationId: conversationId });
    if (!user) return;

    // 시나리오 목록 로드 리스너 (Firestore 직접 접근)
    const scenariosRef = collection(
      get().db,
      "chats",
      user.uid,
      "conversations",
      conversationId,
      "scenario_sessions"
    );
    const q = query(scenariosRef, orderBy("createdAt", "desc"));

    // 이 리스너는 conversationSlice가 관리
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
        // 시나리오 데이터 로드 후, 각 시나리오 구독 시작 (선택적: loadConversation에서 이미 처리?)
        // scenarios.forEach(s => {
        //    if (!get().scenarioStates[s.sessionId]) {
        //        get().subscribeToScenarioSession?.(s.sessionId);
        //    }
        // });
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
        unsubscribe(); // 오류 시 리스너 해제
        set((state) => ({
          ...(state.expandedConversationId === conversationId
            ? { expandedConversationId: null }
            : {}),
          // unsubscribeScenariosMap는 scenarioSlice에서 관리하므로 여기서 직접 건드리지 않음
          scenariosForConversation: {
            ...state.scenariosForConversation,
            [conversationId]: [],
          },
        }));
        // scenarioSlice의 관련 구독도 해제해야 할 수 있음 (오류 상황 고려)
        // get().unsubscribeFromScenarioSession?.(conversationId);
      }
    );
    // conversationSlice 내부에서 이 리스너를 관리할 필요는 없음 (scenarioSlice가 담당)
    // set((state) => ({ unsubscribeScenariosMap: { ...state.unsubscribeScenariosMap, [conversationId]: unsubscribe } }));

    // 시나리오 상태 구독은 scenarioSlice의 subscribeToScenarioSession 호출로 위임
    // getDocs로 목록 가져와서 각각 subscribeToScenarioSession 호출 (loadConversation에서 이미 할 가능성 높음)
    // 필요 시 여기에 추가:
    // getDocs(q).then(snapshot => snapshot.forEach(doc => {
    //     if (!get().scenarioStates[doc.id]) {
    //         get().subscribeToScenarioSession?.(doc.id);
    //     }
    // })).catch(err => console.error("Error fetching scenarios for subscription:", err));
  },
});