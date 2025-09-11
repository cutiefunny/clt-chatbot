import { collection, addDoc, doc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { scenarioTriggers } from '../../lib/chatbotEngine';
import { locales } from '../../lib/locales';

export const createScenarioSlice = (set, get) => ({
  // State
  scenarioStates: {},
  activeScenarioSessionId: null,
  isScenarioPanelOpen: false,
  scenarioTriggers: {},
  unsubscribeScenario: null,

  // Actions
  loadScenarioTriggers: () => {
    set({ scenarioTriggers });
  },

  openScenarioPanel: async (scenarioId, scenarioSessionId = null) => {
    const { user, currentConversationId, handleEvents, scenarioStates } = get();
    if (!user || !currentConversationId) return;

    if (scenarioSessionId) {
      if (!scenarioStates[scenarioSessionId]) {
        get().subscribeToScenarioSession(scenarioSessionId);
      }
      set({
          isScenarioPanelOpen: true,
          activeScenarioSessionId: scenarioSessionId,
          activePanel: 'scenario'
      });
      get().focusChatInput();
      return;
    }

    const scenarioSessionsRef = collection(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions");
    const newSessionDoc = await addDoc(scenarioSessionsRef, {
      scenarioId: scenarioId,
      status: 'active',
      createdAt: serverTimestamp(),
      messages: [],
      state: null,
      slots: {},
    });

    const newScenarioSessionId = newSessionDoc.id;
    get().subscribeToScenarioSession(newScenarioSessionId);
    set({
        isScenarioPanelOpen: true,
        activeScenarioSessionId: newScenarioSessionId,
        activePanel: 'scenario',
    });

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: { text: scenarioId },
          scenarioSessionId: newScenarioSessionId
        }),
      });
      const data = await response.json();
      
      handleEvents(data.events);

      if (data.type === 'scenario_start' || data.type === 'scenario') {
        const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", newScenarioSessionId);
        await updateDoc(sessionRef, {
            messages: [{ id: data.nextNode.id, sender: 'bot', node: data.nextNode }],
            state: data.scenarioState,
            slots: data.slots || {},
        });
        await get().continueScenarioIfNeeded(data.nextNode, newScenarioSessionId);
      } else {
        throw new Error("Failed to start scenario properly");
      }
    } catch (error) {
      console.error("Error starting scenario:", error);
      const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", newScenarioSessionId);
      await updateDoc(sessionRef, {
        messages: [{ id: 'error', sender: 'bot', text: 'An error occurred while starting the scenario.' }],
      });
    } finally {
      get().focusChatInput();
    }
  },
  
  subscribeToScenarioSession: (sessionId) => {
    const { user, currentConversationId } = get();
    if (!user || !currentConversationId) return;

    get().unsubscribeScenario?.();

    const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", sessionId);
    const unsubscribe = onSnapshot(sessionRef, (doc) => {
      if (doc.exists()) {
        set(state => ({
          scenarioStates: {
            ...state.scenarioStates,
            [sessionId]: { ...doc.data(), isLoading: false }
          }
        }));
      }
    });
    set({ unsubscribeScenario: unsubscribe });
  },

  endScenario: async (scenarioSessionId) => {
    const { user, currentConversationId, messages, saveMessage, scenarioStates } = get();
    if (!user || !currentConversationId || !scenarioSessionId) return;
    
    const scenarioId = scenarioStates[scenarioSessionId]?.scenarioId || 'Scenario';
    
    // Firestore 상태를 'completed'로 업데이트
    const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", scenarioSessionId);
    await updateDoc(sessionRef, { status: 'completed' });

    // --- 👇 [수정] 종료 메시지에 scenarioSessionId와 scenarioId 추가 ---
    const endMessage = {
      id: Date.now(),
      sender: 'bot',
      text: locales[get().language].scenarioEnded(scenarioId),
      type: 'scenario_end_notice',
      scenarioId: scenarioId,
      scenarioSessionId: scenarioSessionId, 
    };
    // --- 👆 [여기까지] ---

    const filteredMessages = messages.filter(
      (msg) => msg.type !== 'scenario_resume_prompt' || msg.scenarioSessionId !== scenarioSessionId
    );
    
    get().unsubscribeScenario?.();
    
    // --- 👇 [수정] 로컬 상태에서 시나리오 정보를 삭제하지 않고 유지 ---
    set({
      isScenarioPanelOpen: false,
      activeScenarioSessionId: null,
      activePanel: 'main',
      messages: [...filteredMessages, endMessage],
      unsubscribeScenario: null,
    });
    // --- 👆 [여기까지] ---

    saveMessage(endMessage);
  },

  setScenarioPanelOpen: (isOpen) => {
      const { activeScenarioSessionId } = get();
      
      set(state => {
          let newMessages = state.messages;
          if (!isOpen && activeScenarioSessionId) {
              const filteredMessages = state.messages.filter(msg => 
                  msg.type !== 'scenario_resume_prompt' || msg.scenarioSessionId !== activeScenarioSessionId
              );
              
              const scenarioData = state.scenarioStates[activeScenarioSessionId];
              // 시나리오가 'active' 상태일 때만 '이어하기' 버튼 추가
              if (scenarioData?.status === 'active') {
                newMessages = [...filteredMessages, {
                    id: Date.now(),
                    sender: 'bot',
                    type: 'scenario_resume_prompt',
                    scenarioId: scenarioData.scenarioId,
                    scenarioSessionId: activeScenarioSessionId,
                    text: '',
                }];
              } else {
                newMessages = filteredMessages;
              }
          }

          return {
              isScenarioPanelOpen: isOpen,
              activePanel: isOpen ? 'scenario' : 'main',
              messages: newMessages,
          };
      });

      get().focusChatInput();
  },

  handleScenarioResponse: async (payload) => {
    const { scenarioSessionId } = payload;
    const { handleEvents, showToast, user, currentConversationId } = get();
    if (!user || !currentConversationId || !scenarioSessionId) return;

    set(state => ({
        scenarioStates: {
            ...state.scenarioStates,
            [scenarioSessionId]: {
                ...state.scenarioStates[scenarioSessionId],
                isLoading: true,
            }
        }
    }));
    
    const currentScenario = get().scenarioStates[scenarioSessionId];
    const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", scenarioSessionId);

    if (payload.userInput) {
        await updateDoc(sessionRef, {
            messages: [...currentScenario.messages, { id: Date.now(), sender: 'user', text: payload.userInput }]
        });
    }

    try {
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
          language: get().language,
          scenarioSessionId: scenarioSessionId,
        }),
      });
      const data = await response.json();
      handleEvents(data.events);
      
      const updatedMessages = [...get().scenarioStates[scenarioSessionId].messages];
      if (data.nextNode) {
          updatedMessages.push({ id: data.nextNode.id, sender: 'bot', node: data.nextNode });
      } else if (data.message) {
          updatedMessages.push({ id: 'end', sender: 'bot', text: data.message });
      }
      
      if (data.type === 'scenario_validation_fail') {
          showToast(data.message, 'error');
          set(state => ({
            scenarioStates: { ...state.scenarioStates, [scenarioSessionId]: { ...state.scenarioStates[scenarioSessionId], isLoading: false } }
          }));
      } else {
        await updateDoc(sessionRef, {
            messages: updatedMessages,
            state: data.scenarioState,
            slots: data.slots,
        });
        if (data.nextNode) {
            await get().continueScenarioIfNeeded(data.nextNode, scenarioSessionId);
        }
      }
    } catch (error) {
      console.error("Error in scenario conversation:", error);
      await updateDoc(sessionRef, {
          messages: [...get().scenarioStates[scenarioSessionId].messages, { id: 'error', sender: 'bot', text: 'An error occurred.' }]
      });
    }
  },

  continueScenarioIfNeeded: async (lastNode, scenarioSessionId) => {
    const isInteractive = lastNode.type === 'slotfilling' || lastNode.type === 'form' || (lastNode.data?.replies && lastNode.data.replies.length > 0);
    if (!isInteractive && lastNode.id !== 'end') {
      await new Promise(resolve => setTimeout(resolve, 500));
      await get().handleScenarioResponse({
        scenarioSessionId: scenarioSessionId,
        currentNodeId: lastNode.id,
        sourceHandle: null,
        userInput: null,
      });
    }
  },
});