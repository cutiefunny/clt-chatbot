// app/store/slices/scenarioSessionSlice.js
// 세션 구독 및 관리 관련 함수들

import { locales } from "../../lib/locales";
import { getErrorKey } from "../../lib/errorHandler";
import { logger } from "../../lib/logger";
import { FASTAPI_BASE_URL } from "../../lib/constants";

export const createScenarioSessionSlice = (set, get) => ({
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
        // --- [수정] FastAPI로 업데이트 (정확한 경로: /conversations/{conversation_id}/scenario-sessions/{session_id}) ---
        await fetch(
            `${FASTAPI_BASE_URL}/conversations/${currentConversationId}/scenario-sessions/${scenarioSessionId}`,
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
});
