// app/store/slices/scenarioSlice.js
import { locales } from "../../lib/locales";
import { getErrorKey } from "../../lib/errorHandler";
import { logger } from "../../lib/logger";
import { FASTAPI_BASE_URL } from "../../lib/constants";

export const createScenarioSlice = (set, get) => ({
  scenarioStates: {},
  activeScenarioSessionId: null,
  activeScenarioSessions: [],
  scenarioCategories: [],
  availableScenarios: [],
  unsubscribeScenariosMap: {},

  setScenarioSlots: (sessionId, newSlots) => {
    set(state => {
      if (!sessionId || !state.scenarioStates[sessionId]) {
        logger.warn(`[setScenarioSlots] Invalid or non-existent scenario session ID: ${sessionId}`);
        return state;
      }
      
      const updatedScenarioState = {
        ...state.scenarioStates[sessionId],
        slots: newSlots,
      };

      return {
        scenarioStates: {
          ...state.scenarioStates,
          [sessionId]: updatedScenarioState,
        }
      };
    });
  },

  loadAvailableScenarios: async () => {
    // --- 👇 [수정] FastAPI only (Firestore 제거) ---
    try {
        const response = await fetch(`${FASTAPI_BASE_URL}/scenarios`);
        if (response.ok) {
            const scenarios = await response.json();
            console.log('[loadAvailableScenarios] FastAPI 응답:', scenarios);
            
            // API 응답 형식 분석 및 시나리오 정보 추출 (ID, 이름)
            const scenarioMap = {}; // ID -> 이름 매핑
            
            // Case 1: 직접 배열인 경우
            if(Array.isArray(scenarios)) {
                console.log('[loadAvailableScenarios] Case 1: 배열 형식');
                scenarios.forEach(scenario => {
                    // 시나리오가 직접 ID인 경우
                    if (typeof scenario === 'string') {
                        scenarioMap[scenario] = scenario;
                    }
                    // 시나리오가 객체이고 id 필드가 있는 경우
                    else if (scenario && scenario.id) {
                        // title이 있으면 사용, 없으면 id 사용
                        scenarioMap[scenario.id] = scenario.title || scenario.id;
                    }
                    // 카테고리 구조인 경우 - items에서 정보 추출
                    else if (scenario && Array.isArray(scenario.items)) {
                        scenario.items.forEach(item => {
                            if (typeof item === 'string') {
                                scenarioMap[item] = item;
                            } else if (item && item.id) {
                                scenarioMap[item.id] = item.title || item.id;
                            }
                        });
                    }
                    // subCategories가 있는 경우
                    else if (scenario && Array.isArray(scenario.subCategories)) {
                        scenario.subCategories.forEach(subCat => {
                            if (Array.isArray(subCat.items)) {
                                subCat.items.forEach(item => {
                                    if (typeof item === 'string') {
                                        scenarioMap[item] = item;
                                    } else if (item && item.id) {
                                        scenarioMap[item.id] = item.title || item.id;
                                    }
                                });
                            }
                        });
                    }
                });
            }
            // Case 2: 객체인 경우 (scenarios 필드가 있을 수 있음)
            else if (scenarios && scenarios.scenarios && Array.isArray(scenarios.scenarios)) {
                console.log('[loadAvailableScenarios] Case 2: {scenarios: Array} 형식');
                scenarios.scenarios.forEach(scenario => {
                    if (typeof scenario === 'string') {
                        scenarioMap[scenario] = scenario;
                    } else if (scenario && scenario.id) {
                        scenarioMap[scenario.id] = scenario.title || scenario.id;
                    }
                });
            }
            
            console.log('[loadAvailableScenarios] 시나리오 맵:', scenarioMap);
            set({ availableScenarios: scenarioMap });
            return;
        } else {
            throw new Error(`Failed with status ${response.status}`);
        }
    } catch (error) { 
        logger.error('Error loading available scenarios from FastAPI:', error);
        const { language, showEphemeralToast } = get();
        const errorKey = getErrorKey(error);
        const message =
          locales[language]?.[errorKey] || "Failed to load scenario list.";
        showEphemeralToast(message, "error");
        set({ availableScenarios: {} });
    }
    // --- 👆 [수정] ---
  },

  loadScenarioCategories: async () => {
    try {
      // API_DEFAULTS에서 기본값 가져오기
      const { TENANT_ID, STAGE_ID, SEC_OFC_ID } = require("../../lib/constants").API_DEFAULTS;
      
      // 쿼리 파라미터 구성
      const params = new URLSearchParams({
        ten_id: TENANT_ID,
        stg_id: STAGE_ID,
        sec_ofc_id: SEC_OFC_ID,
      });

      // GET /scenarios/categories: 응답 형식 처리
      const response = await fetch(`${FASTAPI_BASE_URL}/scenarios/categories?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        console.log('[loadScenarioCategories] FastAPI 응답:', data);
        console.log('[loadScenarioCategories] 데이터 타입:', typeof data, '배열 여부:', Array.isArray(data));
        
        // --- [수정] 백엔드 명세에 따라 응답 처리 ---
        // API 응답 구조: {categories: Array of CategoryResponse}
        // CategoryResponse: { id, name, order, subCategories }
        let categoryData = [];
        
        // Case 1: {categories: Array} 형태 (현재 백엔드가 반환하는 형식)
        if (data && data.categories && Array.isArray(data.categories)) {
          categoryData = data.categories;
          console.log('[loadScenarioCategories] Case 1: {categories: Array}에서 추출됨, 길이:', categoryData.length);
        }
        // Case 2: 이미 Array인 경우
        else if (Array.isArray(data)) {
          categoryData = data;
          console.log('[loadScenarioCategories] Case 2: 이미 Array, 길이:', categoryData.length);
        }
        // Case 3: Dictionary 형태
        else if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
          categoryData = Object.values(data);
          console.log('[loadScenarioCategories] Case 3: Dictionary에서 변환, 길이:', categoryData.length);
        }
        // Case 4: 단일 객체
        else if (typeof data === 'object' && data !== null) {
          categoryData = [data];
          console.log('[loadScenarioCategories] Case 4: 단일 객체 래핑');
        }
        
        console.log('[loadScenarioCategories] 최종 categoryData:', categoryData);
        set({ scenarioCategories: categoryData });
        logger.log("Loaded scenario categories from FastAPI /scenarios/categories");
        return;
      } else {
        throw new Error(`Failed with status ${response.status}`);
      }
    } catch (error) {
      logger.warn("Error loading scenario categories from FastAPI:", error);
      const { language, showEphemeralToast } = get();
      const errorKey = getErrorKey(error);
      const message =
        locales[language]?.[errorKey] || "Failed to load scenario categories.";
      showEphemeralToast(message, "error");
      set({ scenarioCategories: [] });
    }
  },

  saveScenarioCategories: async (newCategories) => {
    try {
      const { TENANT_ID, STAGE_ID, SEC_OFC_ID } = require("../../lib/constants").API_DEFAULTS;
      
      // --- [수정] 백엔드 명세에 따라 요청 본문 구성 ---
      // PUT /scenarios/categories
      // ShortCutInsertRequest: { categories: Array of ShortcutInsertParam }
      // ShortcutInsertParam: { id, name, order, subCategories }
      const payload = {
        categories: newCategories  // 배열 그대로 전달
      };

      console.log('[saveScenarioCategories] FastAPI PUT 요청:', payload);

      const response = await fetch(`${FASTAPI_BASE_URL}/scenarios/categories`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        console.log('[saveScenarioCategories] FastAPI 저장 성공');
        set({ scenarioCategories: newCategories });
        logger.log("Saved scenario categories to FastAPI /scenarios/categories");
        return true;
      } else {
        throw new Error(`Failed with status ${response.status}`);
      }
    } catch (error) {
      logger.warn("Error saving scenario categories to FastAPI:", error);
      const { language, showEphemeralToast } = get();
      const errorKey = getErrorKey(error);
      const message =
        locales[language]?.[errorKey] || "Failed to save scenario categories.";
      showEphemeralToast(message, "error");
      return false;
    }
  },

  openScenarioPanel: async (scenarioId, initialSlots = {}) => {
    const {
      user,
      currentConversationId,
      handleEvents,
      language,
      setActivePanel,
      addMessage,
      setForceScrollToBottom,
      showEphemeralToast,
      showScenarioBubbles,
    } = get();
    if (!user) return;

    let conversationId = currentConversationId;
    let newScenarioSessionId = null;

    try {
      // 시나리오 lastUsedAt 업데이트는 FastAPI에서 처리 예정
      // TODO: PATCH /scenarios/{scenario_id}/last-used 엔드포인트 호출

      if (!conversationId) {
        const newConversationId = await get().createNewConversation(true);
        if (!newConversationId) {
          throw new Error(
            "Failed to ensure conversation ID for starting scenario."
          );
        }
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Timeout waiting for conversation load")),
            5000
          );
          const check = () => {
            if (get().currentConversationId === newConversationId) {
              clearTimeout(timeout);
              resolve();
            } else {
              setTimeout(check, 100);
            }
          };
          check();
        });
        conversationId = newConversationId;
      }

      // --- [수정] FastAPI로 시나리오 세션 생성 ---
      const createSessionResponse = await fetch(
        `${FASTAPI_BASE_URL}/conversations/${conversationId}/scenario-sessions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            usr_id: user.uid,
            scenario_id: scenarioId,
            slots: initialSlots,
            initial_context: {},
          }),
        }
      );

      if (!createSessionResponse.ok) {
        throw new Error(`Failed to create scenario session: ${createSessionResponse.status}`);
      }

      // 응답에서 session ID 추출
      const sessionData = await createSessionResponse.json();
      newScenarioSessionId = sessionData.id || sessionData.session_id;
      console.log('[openScenarioPanel] FastAPI에서 시나리오 세션 생성:', newScenarioSessionId);
      // --- [수정] ---

      setActivePanel("main");
      setForceScrollToBottom(true);

      if (showScenarioBubbles) {
        await addMessage("user", {
          type: "scenario_bubble",
          scenarioSessionId: newScenarioSessionId,
        });
      }

      get().subscribeToScenarioSession(newScenarioSessionId);

      setTimeout(() => {
        setActivePanel("scenario", newScenarioSessionId);
      }, 100);

      // --- [수정] FastAPI /chat 호출 (시나리오 시작) ---
      const fastApiChatPayload = {
        usr_id: user.uid,
        conversation_id: conversationId,
        content: scenarioId,
        language: language,
        type: "text",
        role: "user",
        slots: initialSlots,
        scenario_session_id: newScenarioSessionId,
      };

      const scenarioTitle = get().availableScenarios?.[scenarioId] || scenarioId;
      const candidatePayloads = [
        // 1) 기존 포맷
        fastApiChatPayload,
        // 2) 명세 기반 최소 포맷
        {
          conversation_id: conversationId,
          content: scenarioId,
          language,
          slots: initialSlots,
        },
        // 3) title 기반 트리거
        {
          conversation_id: conversationId,
          content: scenarioTitle,
          language,
          slots: initialSlots,
        },
        // 4) scenario_id 힌트 추가
        {
          ...fastApiChatPayload,
          type: "scenario",
          scenario_id: scenarioId,
          scenario_state: { scenario_id: scenarioId },
        },
      ];

      let data = null;
      let lastChatError = null;

      for (let i = 0; i < candidatePayloads.length; i++) {
        const payload = candidatePayloads[i];
        try {
          const response = await fetch(`${FASTAPI_BASE_URL}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const errorData = await response
              .json()
              .catch(() => ({ message: `Server error: ${response.statusText}` }));
            throw new Error(errorData.message || `Server error: ${response.statusText}`);
          }

          data = await response.json();
          console.log(`[openScenarioPanel] FastAPI /chat response (candidate ${i + 1}):`, data);

          // 시나리오형 응답이면 즉시 채택
          if (data?.type === "scenario" || data?.type === "scenario_start" || data?.next_node || data?.nextNode) {
            break;
          }
        } catch (err) {
          lastChatError = err;
          console.warn(`[openScenarioPanel] FastAPI /chat failed for candidate ${i + 1}:`, {
            payload,
            error: String(err?.message || err),
          });
        }
      }

      if (!data) {
        throw new Error(lastChatError?.message || "Failed to call backend /chat");
      }

      // 응답 키 형태(스네이크/카멜) 흡수
      const nextNode = data?.nextNode || data?.next_node;
      const normalizedData = {
        ...data,
        nextNode,
      };

      handleEvents(normalizedData.events, newScenarioSessionId, conversationId);

      // --- [수정] FastAPI로 시나리오 세션 업데이트 ---
      let updatePayload = {};

      if (normalizedData.type === "scenario_start" || normalizedData.type === "scenario") {
        updatePayload.slots = { ...initialSlots, ...(normalizedData.slots || {}) };
        updatePayload.messages = [];
        updatePayload.state = null;

        if (normalizedData.nextNode) {
          if (normalizedData.nextNode.type !== "setSlot" && normalizedData.nextNode.type !== "set-slot") {
            updatePayload.messages.push({
              id: normalizedData.nextNode.id,
              sender: "bot",
              node: normalizedData.nextNode,
            });
          }
          const isFirstNodeSlotFillingOrForm =
            normalizedData.nextNode.type === "slotfilling" ||
            normalizedData.nextNode.type === "form" ||
            (normalizedData.nextNode.type === "branch" &&
              normalizedData.nextNode.data?.evaluationType !== "CONDITION");
          updatePayload.state = {
            scenario_id: scenarioId,
            current_node_id: normalizedData.nextNode.id,
            awaiting_input: isFirstNodeSlotFillingOrForm,
          };
        } else if (normalizedData.message) {
          updatePayload.messages.push({
            id: "end-message",
            sender: "bot",
            text: normalizedData.message,
          });
          updatePayload.status = normalizedData.status || "completed";
        }
        updatePayload.status = normalizedData.status || "active";

        // FastAPI로 세션 업데이트
        await fetch(
          `${FASTAPI_BASE_URL}/scenario-sessions/${newScenarioSessionId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              usr_id: user.uid,
              ...updatePayload,
            }),
          }
        ).then(r => {
          if (!r.ok) throw new Error(`Failed to update session: ${r.status}`);
          return r.json();
        });
      // --- [수정] ---

        if (
          normalizedData.nextNode &&
          normalizedData.nextNode.type !== "slotfilling" &&
          normalizedData.nextNode.type !== "form" &&
          !(
            normalizedData.nextNode.type === "branch" &&
            normalizedData.nextNode.data?.evaluationType !== "CONDITION"
          )
        ) {
          await get().continueScenarioIfNeeded(
            normalizedData.nextNode,
            newScenarioSessionId
          );
        }
      } else if (normalizedData.type === "error") {
        throw new Error(normalizedData.message || "Failed to start scenario from API.");
      } else if (normalizedData.type === "text") {
        throw new Error("Backend /chat did not return scenario response. Check scenario trigger mapping on backend.");
      } else {
        throw new Error(`Unexpected response type from API: ${normalizedData.type}`);
      }
    } catch (error) {
      console.error(`Error opening scenario panel for ${scenarioId}:`, error);
      const errorKey = getErrorKey(error);
      const message =
        locales[language]?.[errorKey] || "Failed to start scenario.";
      showEphemeralToast(message, "error");

      if (user && conversationId && newScenarioSessionId) {
        try {
          // --- [수정] FastAPI로 시나리오 세션 삭제 ---
          await fetch(
            `${FASTAPI_BASE_URL}/conversations/${conversationId}/scenario-sessions/${newScenarioSessionId}`,
            {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ usr_id: user.uid }),
            }
          ).then(r => {
            if (!r.ok) throw new Error(`Failed to delete session: ${r.status}`);
            return r.json();
          });
          // --- [수정] ---
          
          console.log(
            `Cleaned up failed scenario session: ${newScenarioSessionId}`
          );

          if (showScenarioBubbles) {
            set((state) => ({
              messages: state.messages.filter(
                (msg) =>
                  !(
                    msg.type === "scenario_bubble" &&
                    msg.scenarioSessionId === newScenarioSessionId
                  )
              ),
            }));
            console.log(
              `Removed scenario bubble from main chat for session: ${newScenarioSessionId}`
            );
          }
        } catch (cleanupError) {
          console.error(
            `Error cleaning up failed scenario session ${newScenarioSessionId}:`,
            cleanupError
          );
        }
      }
      setActivePanel("main");
    }
  },

  setScenarioSelectedOption: async (scenarioSessionId, messageNodeId, selectedValue) => {
    const { user, currentConversationId, scenarioStates, language, showEphemeralToast } = get();
    if (!user || !currentConversationId || !scenarioSessionId) return;

    const scenarioState = scenarioStates[scenarioSessionId];
    if (!scenarioState) return;

    const originalMessages = Array.isArray(scenarioState.messages) ? scenarioState.messages : [];
    const updatedMessages = originalMessages.map(msg => {
        if (msg.node && msg.node.id === messageNodeId) {
            return { ...msg, selectedOption: selectedValue };
        }
        return msg;
    });

    set(state => ({
        scenarioStates: {
            ...state.scenarioStates,
            [scenarioSessionId]: {
                ...state.scenarioStates[scenarioSessionId],
                messages: updatedMessages,
            },
        },
    }));

    try {
        // --- [수정] FastAPI로 업데이트 ---
        await fetch(
            `${FASTAPI_BASE_URL}/scenario-sessions/${scenarioSessionId}`,
            {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    usr_id: user.uid,
                    messages: updatedMessages
                }),
            }
        ).then(r => {
            if (!r.ok) throw new Error(`Failed to update session: ${r.status}`);
            return r.json();
        });
        // --- [수정] ---
    } catch (error) {
      console.error("Error updating scenario selected option via FastAPI:", error);
        const errorKey = getErrorKey(error);
        const message = locales[language]?.[errorKey] || 'Failed to save selection in scenario.';
        showEphemeralToast(message, 'error');
        set(state => ({
            scenarioStates: {
                ...state.scenarioStates,
                [scenarioSessionId]: {
                  ...state.scenarioStates[scenarioSessionId],
                  messages: originalMessages,
                }
            },
        }));
    }
  },

  subscribeToScenarioSession: (sessionId) => {
    const { user, currentConversationId, unsubscribeScenariosMap, language, showEphemeralToast } = get();
    if (!user || !currentConversationId || unsubscribeScenariosMap[sessionId]) return;

    // --- [임시] Firestore에서 FastAPI로 마이그레이션 필요 ---
    // 실시간 동기화가 필요한 경우 폴링 또는 WebSocket 구현 필요
    console.log(`[TODO] subscribeToScenarioSession needs FastAPI implementation for session ${sessionId}`);
    
    // 임시로 polling 구현 (향후 개선 필요)
    let pollInterval = null;
    const poll = async () => {
      try {
        const response = await fetch(
          `${FASTAPI_BASE_URL}/conversations/${currentConversationId}/scenario-sessions/${sessionId}`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" }
          }
        );
        
        if (!response.ok) {
          if (response.status === 404) {
            console.log(`Scenario session ${sessionId} not found or deleted.`);
            get().unsubscribeFromScenarioSession(sessionId);
          }
          return;
        }
        
        const data = await response.json();
        const scenarioData = data.data || data;
        
        set(state => {
            const currentLocalState = state.scenarioStates[sessionId];
            const newScenarioStates = {
                ...state.scenarioStates,
                [sessionId]: {
                    ...(currentLocalState || {}),
                    ...scenarioData
                }
            };
            const newActiveSessions = Object.keys(newScenarioStates);

            return {
                scenarioStates: newScenarioStates,
                activeScenarioSessions: newActiveSessions,
            };
        });
      } catch (error) {
        console.error(`Error polling scenario session ${sessionId}:`, error);
        const errorKey = getErrorKey(error);
        const message = locales[language]?.[errorKey] || 'Error syncing scenario state.';
        showEphemeralToast(message, 'error');
        get().unsubscribeFromScenarioSession(sessionId);
      }
    };
    
    // 초기 조회 및 폴링 시작 (5초마다)
    poll();
    pollInterval = setInterval(poll, 5000);
    
    // cleanup 함수 저장
    const unsubscribe = () => {
      if (pollInterval) clearInterval(pollInterval);
    };
    
    set(state => ({
        unsubscribeScenariosMap: {
            ...state.unsubscribeScenariosMap,
            [sessionId]: unsubscribe
        }
    }));
  },

  unsubscribeFromScenarioSession: (sessionId) => {
      set(state => {
          const newUnsubscribeMap = { ...state.unsubscribeScenariosMap };
          if (newUnsubscribeMap[sessionId]) {
              newUnsubscribeMap[sessionId]();
              delete newUnsubscribeMap[sessionId];
          }

          const updatedStates = { ...state.scenarioStates };
          delete updatedStates[sessionId];
          const updatedActiveSessions = Object.keys(updatedStates);

          const shouldResetActivePanel = state.activeScenarioSessionId === sessionId || state.lastFocusedScenarioSessionId === sessionId;

          return {
              unsubscribeScenariosMap: newUnsubscribeMap,
              scenarioStates: updatedStates,
              activeScenarioSessions: updatedActiveSessions,
              ...(shouldResetActivePanel ? {
                  activeScenarioSessionId: null,
                  lastFocusedScenarioSessionId: null,
                  activePanel: 'main'
              } : {})
          };
      });
  },

  unsubscribeAllScenarioListeners: () => {
    const { unsubscribeScenariosMap } = get();
    Object.keys(unsubscribeScenariosMap).forEach(sessionId => {
      get().unsubscribeFromScenarioSession(sessionId);
    });
  },

  endScenario: async (scenarioSessionId, status = 'completed') => {
    const { user, currentConversationId, language, showEphemeralToast } = get(); 
    if (!user || !currentConversationId || !scenarioSessionId) return;
    
    try {
        // --- [수정] FastAPI로 업데이트 ---
        await fetch(
            `${FASTAPI_BASE_URL}/scenario-sessions/${scenarioSessionId}`,
            {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    usr_id: user.uid,
                    status: status,
                    state: null
                }),
            }
        ).then(r => {
            if (!r.ok) throw new Error(`Failed to update session: ${r.status}`);
            return r.json();
        });
        // --- [수정] ---
        
        set(state => {
            const updatedState = state.scenarioStates[scenarioSessionId]
                ? { ...state.scenarioStates[scenarioSessionId], status: status, state: null } 
                : { status: status, state: null }; 

            return {
                scenarioStates: {
                    ...state.scenarioStates,
                    [scenarioSessionId]: updatedState
                },
            };
        });

        console.log(`[endScenario] Scenario ${scenarioSessionId} marked as ${status}. Panel will remain open.`);

    } catch (error) {
        console.error(`Error ending scenario ${scenarioSessionId} with status ${status}:`, error);
        const errorKey = getErrorKey(error);
        const message = locales[language]?.[errorKey] || 'Failed to update scenario status.';
        showEphemeralToast(message, 'error');
    }
  },

  handleScenarioResponse: async (payload) => {
    const { scenarioSessionId } = payload;
    const { handleEvents, showToast, user, currentConversationId, language, endScenario, showEphemeralToast } = get();
    if (!user || !currentConversationId || !scenarioSessionId) return;

    const currentScenario = get().scenarioStates[scenarioSessionId];
    if (!currentScenario) {
        console.warn(`handleScenarioResponse called for non-existent session: ${scenarioSessionId}`);
        showEphemeralToast(locales[language]?.errorUnexpected || 'An unexpected error occurred.', 'error');
        return;
    }
    const existingMessages = Array.isArray(currentScenario.messages) ? currentScenario.messages : [];

    set(state => ({
        scenarioStates: { ...state.scenarioStates, [scenarioSessionId]: { ...currentScenario, isLoading: true } }
    }));

    try {
        let newMessages = [...existingMessages];

        if (payload.userInput) {
            newMessages.push({ id: `user-${Date.now()}`, sender: 'user', text: payload.userInput });
            try {
                // --- [수정] FastAPI로 업데이트 ---
                await fetch(
                    `${FASTAPI_BASE_URL}/scenario-sessions/${scenarioSessionId}`,
                    {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            usr_id: user.uid,
                            messages: newMessages
                        }),
                    }
                ).then(r => {
                    if (!r.ok) throw new Error(`Failed to update session: ${r.status}`);
                    return r.json();
                });
                // --- [수정] ---
            } catch (error) {
                console.error("Error updating user message in FastAPI:", error);
                const errorKey = getErrorKey(error);
                const message = locales[language]?.[errorKey] || 'Failed to send message.';
                showEphemeralToast(message, 'error');
                set(state => ({
                  scenarioStates: { ...state.scenarioStates, [scenarioSessionId]: { ...state.scenarioStates[scenarioSessionId], isLoading: false } }
                }));
                return;
            }
        }

        // --- [수정] FastAPI /chat 호출 (시나리오 진행) + fallback ---
        const mergedSlots = { ...currentScenario.slots, ...(payload.formData || {}) };
        const fastApiChatPayload = {
          usr_id: user.uid,
          conversation_id: currentConversationId,
          content: payload.userInput,
          language: language,
          type: "text",
          role: "user",
          slots: mergedSlots,
          scenario_session_id: scenarioSessionId,
          source_handle: payload.sourceHandle || null,
          current_node_id: currentScenario.state?.current_node_id || null,
        };

        const candidatePayloads = [
          fastApiChatPayload,
          {
            conversation_id: currentConversationId,
            content: payload.userInput,
            language,
            slots: mergedSlots,
            scenario_session_id: scenarioSessionId,
            source_handle: payload.sourceHandle || null,
            current_node_id: currentScenario.state?.current_node_id || null,
            scenario_state: currentScenario.state || null,
          },
        ];

        let data = null;
        let lastChatError = null;
        for (let i = 0; i < candidatePayloads.length; i++) {
          const requestPayload = candidatePayloads[i];
          try {
            const response = await fetch(`${FASTAPI_BASE_URL}/chat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(requestPayload),
            });
            if (!response.ok) {
              const errorData = await response.json().catch(() => ({ message: `Server error: ${response.statusText}` }));
              throw new Error(errorData.message || `Server error: ${response.statusText}`);
            }

            data = await response.json();
            console.log(`[handleScenarioResponse] FastAPI /chat response (candidate ${i + 1}):`, data);

            if (data?.type === 'scenario' || data?.type === 'scenario_end' || data?.type === 'scenario_validation_fail' || data?.next_node || data?.nextNode) {
              break;
            }
          } catch (err) {
            lastChatError = err;
            console.warn(`[handleScenarioResponse] FastAPI /chat failed for candidate ${i + 1}:`, {
              requestPayload,
              error: String(err?.message || err),
            });
          }
        }

        if (!data) {
          throw new Error(lastChatError?.message || 'Failed to call backend /chat');
        }

        // FastAPI 응답 키 형태(스네이크/카멜) 흡수
        const nextNode = data.nextNode || data.next_node;
        const scenarioState = data.scenarioState || data.scenario_state || data.state;
        const normalizedData = {
          ...data,
          nextNode,
          scenarioState,
        };

        handleEvents(normalizedData.events, scenarioSessionId, currentConversationId);

        if (normalizedData.nextNode && normalizedData.nextNode.type !== 'setSlot' && normalizedData.nextNode.type !== 'set-slot') {
          newMessages.push({ id: normalizedData.nextNode.id, sender: 'bot', node: normalizedData.nextNode });
        } else if (normalizedData.message && normalizedData.type !== 'scenario_validation_fail') {
          newMessages.push({ id: `bot-end-${Date.now()}`, sender: 'bot', text: normalizedData.message });
        }

        let updatePayload = {
            messages: newMessages,
        };

        if (normalizedData.type === 'scenario_validation_fail') {
          showEphemeralToast(normalizedData.message, 'error');
            updatePayload.status = 'active';
        } else if (normalizedData.type === 'scenario_end') {
          const finalStatus = normalizedData.slots?.apiFailed ? 'failed' : 'completed';
            updatePayload.status = finalStatus;
            updatePayload.state = null;
          updatePayload.slots = normalizedData.slots || currentScenario.slots;
            
            // --- [수정] FastAPI로 업데이트 ---
            await fetch(
                `${FASTAPI_BASE_URL}/scenario-sessions/${scenarioSessionId}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        usr_id: user.uid,
                        ...updatePayload
                    }),
                }
            ).then(r => {
                if (!r.ok) throw new Error(`Failed to update session: ${r.status}`);
                return r.json();
            });
            // --- [수정] ---
            
            endScenario(scenarioSessionId, finalStatus); 
            
            return;
          } else if (normalizedData.type === 'scenario') {
            updatePayload.status = 'active';
            updatePayload.state = normalizedData.scenarioState;
            updatePayload.slots = normalizedData.slots || currentScenario.slots;
          } else if (normalizedData.type === 'error') {
            throw new Error(normalizedData.message || "Scenario step failed.");
          } else if (normalizedData.type === 'text') {
            throw new Error("Backend /chat did not return scenario step response.");
        } else {
            throw new Error(`Unexpected response type from API: ${normalizedData.type}`);
        }

        // --- [수정] FastAPI로 업데이트 ---
        await fetch(
            `${FASTAPI_BASE_URL}/scenario-sessions/${scenarioSessionId}`,
            {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    usr_id: user.uid,
                    ...updatePayload
                }),
            }
        ).then(r => {
            if (!r.ok) throw new Error(`Failed to update session: ${r.status}`);
            return r.json();
        });
        // --- [수정] ---

        if (normalizedData.type === 'scenario' && normalizedData.nextNode) {
          const isInteractive = normalizedData.nextNode.type === 'slotfilling' ||
                      normalizedData.nextNode.type === 'form' ||
                      (normalizedData.nextNode.type === 'branch' && normalizedData.nextNode.data?.evaluationType !== 'CONDITION');
            if (!isInteractive) {
            await get().continueScenarioIfNeeded(normalizedData.nextNode, scenarioSessionId);
            }
        }

    } catch (error) {
        console.error(`Error handling scenario response for ${scenarioSessionId}:`, error);
        const errorKey = getErrorKey(error);
        const errorMessage = locales[language]?.[errorKey] || 'An error occurred during the scenario.';
        showEphemeralToast(errorMessage, 'error');

        const errorMessages = [...existingMessages, { id: `bot-error-${Date.now()}`, sender: 'bot', text: errorMessage }];
        try {
            // --- [수정] FastAPI로 업데이트 ---
            await fetch(
                `${FASTAPI_BASE_URL}/scenario-sessions/${scenarioSessionId}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        usr_id: user.uid,
                        messages: errorMessages,
                        status: 'failed',
                        state: null
                    }),
                }
            ).then(r => {
                if (!r.ok) throw new Error(`Failed to update session: ${r.status}`);
                return r.json();
            });
            // --- [수정] ---
            
            endScenario(scenarioSessionId, 'failed');
        } catch (updateError) {
             console.error(`Failed to update scenario status to failed for ${scenarioSessionId}:`, updateError);
              set(state => ({
                scenarioStates: {
                    ...state.scenarioStates,
                    [scenarioSessionId]: {
                        ...(state.scenarioStates[scenarioSessionId] || {}),
                        messages: errorMessages,
                        status: 'failed',
                        state: null,
                        isLoading: false
                    }
                }
             }));
             endScenario(scenarioSessionId, 'failed');
        }
    } finally {
      set(state => {
         if(state.scenarioStates[scenarioSessionId]) {
            return {
                scenarioStates: { ...state.scenarioStates, [scenarioSessionId]: { ...state.scenarioStates[scenarioSessionId], isLoading: false } }
            };
         }
         return state;
      });
    }
  },

  continueScenarioIfNeeded: async (lastNode, scenarioSessionId) => {
    if (!lastNode || !scenarioSessionId) {
      console.warn("continueScenarioIfNeeded: lastNode or scenarioSessionId is missing.");
      return;
    }

    const isInteractive = lastNode.type === 'slotfilling' ||
                          lastNode.type === 'form' ||
                          (lastNode.type === 'branch' && lastNode.data?.evaluationType !== 'CONDITION');

    if (!isInteractive && lastNode.id !== 'end') {
      console.log(`Node ${lastNode.id} (${lastNode.type}) is not interactive, continuing...`);
      try {
          await new Promise(resolve => setTimeout(resolve, 300));
          await get().handleScenarioResponse({
            scenarioSessionId: scenarioSessionId,
            currentNodeId: lastNode.id,
            sourceHandle: null,
            userInput: null,
          });
      } catch (error) {
          console.error(`[continueScenarioIfNeeded] Unexpected error during auto-continue for session ${scenarioSessionId}:`, error);
          const { language, showEphemeralToast, endScenario } = get();
          const errorKey = getErrorKey(error);
          const message = locales[language]?.[errorKey] || 'Scenario auto-continue failed.';
          showEphemeralToast(message, 'error');
          endScenario(scenarioSessionId, 'failed');
      }
    } else {
        console.log(`Node ${lastNode.id} (${lastNode.type}) is interactive or end node, stopping auto-continue.`);
    }
  },
});