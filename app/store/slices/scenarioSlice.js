// app/store/slices/scenarioSlice.js
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  where,
  deleteDoc,
} from "firebase/firestore";
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

      const scenarioSessionsRef = collection(
        get().db,
        "chats",
        user.uid,
        "conversations",
        conversationId,
        "scenario_sessions"
      );
      const newSessionDoc = await addDoc(scenarioSessionsRef, {
        scenarioId: scenarioId,
        status: "starting",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        messages: [],
        state: null,
        slots: initialSlots,
      });
      newScenarioSessionId = newSessionDoc.id;

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

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: { text: scenarioId },
          scenarioSessionId: newScenarioSessionId,
          slots: initialSlots,
          language: language,
        }),
      });
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: `Server error: ${response.statusText}` }));
        throw new Error(
          errorData.message || `Server error: ${response.statusText}`
        );
      }
      const data = await response.json();

      handleEvents(data.events, newScenarioSessionId, conversationId);

      const sessionRef = doc(
        get().db,
        "chats",
        user.uid,
        "conversations",
        conversationId,
        "scenario_sessions",
        newScenarioSessionId
      );
      let updatePayload = { updatedAt: serverTimestamp() };

      if (data.type === "scenario_start" || data.type === "scenario") {
        updatePayload.slots = { ...initialSlots, ...(data.slots || {}) };
        updatePayload.messages = [];
        updatePayload.state = null;

        if (data.nextNode) {
          if (data.nextNode.type !== "setSlot" && data.nextNode.type !== "set-slot") {
            updatePayload.messages.push({
              id: data.nextNode.id,
              sender: "bot",
              node: data.nextNode,
            });
          }
          const isFirstNodeSlotFillingOrForm =
            data.nextNode.type === "slotfilling" ||
            data.nextNode.type === "form" ||
            (data.nextNode.type === "branch" &&
              data.nextNode.data?.evaluationType !== "CONDITION");
          updatePayload.state = {
            scenarioId: scenarioId,
            currentNodeId: data.nextNode.id,
            awaitingInput: isFirstNodeSlotFillingOrForm,
          };
        } else if (data.message) {
          updatePayload.messages.push({
            id: "end-message",
            sender: "bot",
            text: data.message,
          });
          updatePayload.status = data.status || "completed";
        }
        updatePayload.status = data.status || "active";

        await updateDoc(sessionRef, updatePayload);

        if (
          data.nextNode &&
          data.nextNode.type !== "slotfilling" &&
          data.nextNode.type !== "form" &&
          !(
            data.nextNode.type === "branch" &&
            data.nextNode.data?.evaluationType !== "CONDITION"
          )
        ) {
          await get().continueScenarioIfNeeded(
            data.nextNode,
            newScenarioSessionId
          );
        }
      } else if (data.type === "error") {
        throw new Error(data.message || "Failed to start scenario from API.");
      } else {
        throw new Error(`Unexpected response type from API: ${data.type}`);
      }
    } catch (error) {
      console.error(`Error opening scenario panel for ${scenarioId}:`, error);
      const errorKey = getErrorKey(error);
      const message =
        locales[language]?.[errorKey] || "Failed to start scenario.";
      showEphemeralToast(message, "error");

      if (user && conversationId && newScenarioSessionId) {
        try {
          const sessionRef = doc(
            get().db,
            "chats",
            user.uid,
            "conversations",
            conversationId,
            "scenario_sessions",
            newScenarioSessionId
          );
          await deleteDoc(sessionRef);
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
        const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", scenarioSessionId);
        await updateDoc(sessionRef, {
            messages: updatedMessages
        });
    } catch (error) {
        console.error("Error updating scenario selected option in Firestore:", error);
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

    const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", sessionId);
    const unsubscribe = onSnapshot(sessionRef, (doc) => {
      if (doc.exists()) {
        const scenarioData = doc.data();
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
      } else {
        console.log(`Scenario session ${sessionId} not found or deleted.`);
        get().unsubscribeFromScenarioSession(sessionId);
      }
    }, (error) => {
        console.error(`Error listening to scenario session ${sessionId}:`, error);
        const errorKey = getErrorKey(error);
        const message = locales[language]?.[errorKey] || 'Error syncing scenario state.';
        showEphemeralToast(message, 'error');
        get().unsubscribeFromScenarioSession(sessionId);
    });

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

    const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", scenarioSessionId);
    
    try {
        await updateDoc(sessionRef, { status, state: null, updatedAt: serverTimestamp() }); 
        
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

    const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", scenarioSessionId);

    try {
        let newMessages = [...existingMessages];

        if (payload.userInput) {
            newMessages.push({ id: `user-${Date.now()}`, sender: 'user', text: payload.userInput });
            try {
                await updateDoc(sessionRef, { messages: newMessages, updatedAt: serverTimestamp() });
            } catch (error) {
                console.error("Error updating user message in Firestore:", error);
                const errorKey = getErrorKey(error);
                const message = locales[language]?.[errorKey] || 'Failed to send message.';
                showEphemeralToast(message, 'error');
                set(state => ({
                  scenarioStates: { ...state.scenarioStates, [scenarioSessionId]: { ...state.scenarioStates[scenarioSessionId], isLoading: false } }
                }));
                return;
            }
        }

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: {
                sourceHandle: payload.sourceHandle,
                text: payload.userInput
              },
              scenarioState: currentScenario.state,
              slots: { ...currentScenario.slots, ...(payload.formData || {}) },
              language: language,
              scenarioSessionId: scenarioSessionId,
            }),
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: `Server error: ${response.statusText}` }));
            throw new Error(errorData.message || `Server error: ${response.statusText}`);
        }
        const data = await response.json();

        handleEvents(data.events, scenarioSessionId, currentConversationId);

        if (data.nextNode && data.nextNode.type !== 'setSlot' && data.nextNode.type !== 'set-slot') {
            newMessages.push({ id: data.nextNode.id, sender: 'bot', node: data.nextNode });
        } else if (data.message && data.type !== 'scenario_validation_fail') {
            newMessages.push({ id: `bot-end-${Date.now()}`, sender: 'bot', text: data.message });
        }

        let updatePayload = {
            messages: newMessages,
            updatedAt: serverTimestamp(),
        };

        if (data.type === 'scenario_validation_fail') {
            showEphemeralToast(data.message, 'error');
            updatePayload.status = 'active';
        } else if (data.type === 'scenario_end') {
            const finalStatus = data.slots?.apiFailed ? 'failed' : 'completed';
            updatePayload.status = finalStatus;
            updatePayload.state = null;
            updatePayload.slots = data.slots || currentScenario.slots;
            await updateDoc(sessionRef, updatePayload);
            
            endScenario(scenarioSessionId, finalStatus); 
            
            return;
        } else if (data.type === 'scenario') {
            updatePayload.status = 'active';
            updatePayload.state = data.scenarioState;
            updatePayload.slots = data.slots || currentScenario.slots;
        } else if (data.type === 'error') {
            throw new Error(data.message || "Scenario step failed.");
        } else {
            throw new Error(`Unexpected response type from API: ${data.type}`);
        }

        await updateDoc(sessionRef, updatePayload);

        if (data.type === 'scenario' && data.nextNode) {
            const isInteractive = data.nextNode.type === 'slotfilling' ||
                                  data.nextNode.type === 'form' ||
                                  (data.nextNode.type === 'branch' && data.nextNode.data?.evaluationType !== 'CONDITION');
            if (!isInteractive) {
                await get().continueScenarioIfNeeded(data.nextNode, scenarioSessionId);
            }
        }

    } catch (error) {
        console.error(`Error handling scenario response for ${scenarioSessionId}:`, error);
        const errorKey = getErrorKey(error);
        const errorMessage = locales[language]?.[errorKey] || 'An error occurred during the scenario.';
        showEphemeralToast(errorMessage, 'error');

        const errorMessages = [...existingMessages, { id: `bot-error-${Date.now()}`, sender: 'bot', text: errorMessage }];
        try {
            await updateDoc(sessionRef, { messages: errorMessages, status: 'failed', state: null, updatedAt: serverTimestamp() });
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