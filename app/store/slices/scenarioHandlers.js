// app/store/slices/scenarioHandlers.js
// 시나리오 이벤트 및 상호작용 핸들링 함수들

import { locales } from "../../lib/locales";
import { getErrorKey } from "../../lib/errorHandler";
import { logger } from "../../lib/logger";
import { FASTAPI_BASE_URL } from "../../lib/constants";

export const createScenarioHandlersSlice = (set, get) => ({
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

      // --- [수정] FastAPI /chat 호출 (시나리오 시작) - 백엔드 스펙 준수 ---
      // 백엔드 필수 필드: usr_id, conversation_id, role, scenario_session_id, content, type, language, slots
      // 중요: type을 "scenario"로 설정하면 백엔드가 시나리오 모드로 인식
      const fastApiChatPayload = {
        usr_id: user.uid,
        conversation_id: conversationId,
        role: "user",
        scenario_session_id: newScenarioSessionId,
        content: scenarioId,
        type: "scenario",  // 👈 시나리오 모드 트리거
        language,
        slots: initialSlots || {},
      };

      const scenarioTitle = get().availableScenarios?.[scenarioId] || scenarioId;
      const candidatePayloads = [
        // 1) type="scenario" 모드 (최고 우선순위)
        fastApiChatPayload,
        // 2) content를 시나리오 타이틀로 시도
        {
          ...fastApiChatPayload,
          content: scenarioTitle,
        },
        // 3) slots 없이 시도
        {
          usr_id: user.uid,
          conversation_id: conversationId,
          role: "user",
          scenario_session_id: newScenarioSessionId,
          content: scenarioId,
          type: "scenario",
          language,
        },
        // 4) type을 "text"로 시도 (fallback)
        {
          usr_id: user.uid,
          conversation_id: conversationId,
          role: "user",
          scenario_session_id: newScenarioSessionId,
          content: scenarioId,
          type: "text",
          language,
          slots: initialSlots || {},
        },
      ];

      let data = null;
      let lastChatError = null;

      for (let i = 0; i < candidatePayloads.length; i++) {
        const payload = candidatePayloads[i];
        console.log(`[openScenarioPanel] Trying candidate ${i + 1} payload:`, JSON.stringify(payload, null, 2));
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

          // 시나리오형 응답 조건 (모든 시나리오 타입 포함)
          const isValidScenarioResponse = 
            data?.type === "scenario" || 
            data?.type === "scenario_start" ||
            data?.type === "scenario_end" ||
            data?.type === "scenario_validation_fail" ||
            (data?.next_node && typeof data.next_node === 'object' && Object.keys(data.next_node).length > 0) ||
            (data?.nextNode && typeof data.nextNode === 'object' && Object.keys(data.nextNode).length > 0);
          
          if (isValidScenarioResponse) {
            console.log(`[openScenarioPanel] ✅ Candidate ${i + 1} successful (type: ${data?.type})`);
            break;
          } else {
            console.log(`[openScenarioPanel] ❌ Candidate ${i + 1} returned type: ${data?.type} (not scenario)`);
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

      // scenario_start, scenario, scenario_end 모두 처리
      if (normalizedData.type === "scenario_start" || normalizedData.type === "scenario" || normalizedData.type === "scenario_end") {
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
        // scenario_end일 때 상태를 "completed"로 설정
        if (normalizedData.type === "scenario_end") {
          updatePayload.status = "completed";
        } else {
          updatePayload.status = normalizedData.status || "active";
        }

        // FastAPI로 세션 업데이트 (정확한 경로: /conversations/{conversation_id}/scenario-sessions/{session_id})
        await fetch(
          `${FASTAPI_BASE_URL}/conversations/${conversationId}/scenario-sessions/${newScenarioSessionId}`,
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

        // --- [수정] FastAPI /chat 호출 (시나리오 진행) - 백엔드 스펙 준수 ---
        const mergedSlots = { ...currentScenario.slots, ...(payload.formData || {}) };
        
        // content는 null이 아니어야 함 (빈 문자열도 피함)
        const userContent = payload.userInput || payload.content || "";
        if (!userContent) {
          console.warn("[handleScenarioResponse] Warning: content is empty, using default empty string");
        }
        
        const fastApiChatPayload = {
          usr_id: user.uid,
          conversation_id: currentConversationId,
          role: "user",
          scenario_session_id: scenarioSessionId,
          content: userContent,
          type: "text",
          language,
          slots: mergedSlots || {},
          source_handle: payload.sourceHandle || "",
          current_node_id: currentScenario.state?.current_node_id || "",
        };

        const candidatePayloads = [
          // 1) 모든 필드 포함 (백엔드 스펙 정확)
          fastApiChatPayload,
          // 2) slots 없이 시도
          {
            usr_id: user.uid,
            conversation_id: currentConversationId,
            role: "user",
            scenario_session_id: scenarioSessionId,
            content: userContent,
            type: "text",
            language,
            source_handle: payload.sourceHandle || "",
            current_node_id: currentScenario.state?.current_node_id || "",
          },
        ];

        let data = null;
        let lastChatError = null;
        for (let i = 0; i < candidatePayloads.length; i++) {
          const requestPayload = candidatePayloads[i];
          console.log(`[handleScenarioResponse] Trying candidate ${i + 1} payload:`, JSON.stringify(requestPayload, null, 2));
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

            // 유효한 시나리오 응답 조건 (엄격함)
            const isValidScenarioResponse =
              data?.type === 'scenario' ||
              data?.type === 'scenario_end' ||
              data?.type === 'scenario_validation_fail' ||
              (data?.next_node && typeof data.next_node === 'object' && Object.keys(data.next_node).length > 0) ||
              (data?.nextNode && typeof data.nextNode === 'object' && Object.keys(data.nextNode).length > 0);

            if (isValidScenarioResponse) {
              console.log(`[handleScenarioResponse] ✅ Candidate ${i + 1} successful (type: ${data?.type})`);
              break;
            } else {
              console.log(`[handleScenarioResponse] ❌ Candidate ${i + 1} returned type: ${data?.type} (not scenario)`);
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

        // --- [수정] FastAPI로 업데이트 (정확한 경로: /conversations/{conversation_id}/scenario-sessions/{session_id}) ---
        await fetch(
            `${FASTAPI_BASE_URL}/conversations/${currentConversationId}/scenario-sessions/${scenarioSessionId}`,
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
            // --- [수정] FastAPI로 업데이트 (정확한 경로: /conversations/{conversation_id}/scenario-sessions/{session_id}) ---
            await fetch(
                `${FASTAPI_BASE_URL}/conversations/${currentConversationId}/scenario-sessions/${scenarioSessionId}`,
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
