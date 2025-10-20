import { collection, addDoc, doc, updateDoc, onSnapshot, serverTimestamp, getDoc, setDoc, getDocs, query, orderBy, where } from 'firebase/firestore';
import { locales } from '../../lib/locales';
import { getErrorKey } from '../../lib/errorHandler'; 

export const createScenarioSlice = (set, get) => ({
  // ... (기존 State 및 다른 함수들은 그대로 유지)
  scenarioStates: {},
  activeScenarioSessionId: null,
  activeScenarioSessions: [],
  scenarioCategories: [],
  availableScenarios: [],
  unsubscribeScenariosMap: {},

  loadAvailableScenarios: async () => {
    try {
      const scenariosCollection = collection(get().db, 'scenarios');
      const querySnapshot = await getDocs(scenariosCollection);
      const scenarioIds = querySnapshot.docs.map(doc => doc.id);
      set({ availableScenarios: scenarioIds });
    } catch (error) {
      console.error("Error loading available scenarios:", error);
      set({ availableScenarios: [] });
    }
  },

  loadScenarioCategories: async () => {
    try {
      const shortcutRef = doc(get().db, "shortcut", "main");
      const docSnap = await getDoc(shortcutRef);

      if (docSnap.exists() && docSnap.data().categories) {
        set({ scenarioCategories: docSnap.data().categories });
      } else {
        console.log("No shortcut document found, initializing with default data.");
        const initialData = []; 
        set({ scenarioCategories: initialData });
        await setDoc(shortcutRef, { categories: initialData });
      }
    } catch (error) {
      console.error("Error loading scenario categories from Firestore.", error);
      set({ scenarioCategories: [] });
    }
  },

  saveScenarioCategories: async (newCategories) => {
    const shortcutRef = doc(get().db, "shortcut", "main");
    try {
      await setDoc(shortcutRef, { categories: newCategories });
      set({ scenarioCategories: newCategories });
      return true;
    } catch (error) {
      console.error("Error saving scenario categories to Firestore:", error);
      return false;
    }
  },

  openScenarioPanel: async (scenarioId, initialSlots = {}) => {
    const { user, currentConversationId, handleEvents, language, setActivePanel, addMessage, setForceScrollToBottom } = get();
    if (!user) return;
    
    let conversationId = currentConversationId;
    if (!conversationId) {
        const newConversationId = await get().createNewConversation(true);
        if (!newConversationId) return;
        
        await new Promise(resolve => {
            const check = () => {
                if (get().currentConversationId === newConversationId) {
                    resolve();
                } else {
                    setTimeout(check, 50);
                }
            };
            check();
        });
        conversationId = newConversationId;
    }
    
    const scenarioSessionsRef = collection(get().db, "chats", user.uid, "conversations", conversationId, "scenario_sessions");
    const newSessionDoc = await addDoc(scenarioSessionsRef, {
      scenarioId: scenarioId,
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      messages: [],
      state: null,
      slots: initialSlots, 
    });

    const newScenarioSessionId = newSessionDoc.id;
    
    setActivePanel('main');
    setForceScrollToBottom(true);
    addMessage('user', {
        type: 'scenario_bubble',
        scenarioSessionId: newScenarioSessionId,
    });
    
    get().subscribeToScenarioSession(newScenarioSessionId);
    
    setTimeout(() => {
        setActivePanel('scenario', newScenarioSessionId);
    }, 50);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: { text: scenarioId },
          scenarioSessionId: newScenarioSessionId,
          slots: initialSlots, 
        }),
      });
      if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
      const data = await response.json();
      
      handleEvents(data.events, newScenarioSessionId, conversationId);

      if (data.type === 'scenario_start' || data.type === 'scenario') {
        const sessionRef = doc(get().db, "chats", user.uid, "conversations", conversationId, "scenario_sessions", newScenarioSessionId);
        const updatedSlots = { ...initialSlots, ...(data.slots || {}) };
        
        // --- 👇 [수정된 부분] ---
        // setSlot 노드는 메시지 리스트에 추가하지 않음
        const initialMessages = [];
        if (data.nextNode && data.nextNode.type !== 'setSlot') {
            initialMessages.push({ id: data.nextNode.id, sender: 'bot', node: data.nextNode });
        }
        // --- 👆 [여기까지] ---

        await updateDoc(sessionRef, {
            messages: initialMessages,
            state: data.scenarioState,
            slots: updatedSlots, 
            updatedAt: serverTimestamp(),
        });
        await get().continueScenarioIfNeeded(data.nextNode, newScenarioSessionId);
      } else {
        const errorText = data.message || "Failed to start scenario properly";
        const sessionRef = doc(get().db, "chats", user.uid, "conversations", conversationId, "scenario_sessions", newScenarioSessionId);
        await updateDoc(sessionRef, {
            messages: [{ id: 'error-start', sender: 'bot', text: errorText }],
            status: 'failed',
            updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      const errorKey = getErrorKey(error);
      const errorMessage = locales[language][errorKey] || locales[language]['errorUnexpected'];
      const sessionRef = doc(get().db, "chats", user.uid, "conversations", conversationId, "scenario_sessions", newScenarioSessionId);
      await updateDoc(sessionRef, {
        messages: [{ id: 'error', sender: 'bot', text: errorMessage }],
        status: 'failed',
        updatedAt: serverTimestamp(),
      });
    }
  },

  setScenarioSelectedOption: async (scenarioSessionId, messageNodeId, selectedValue) => {
    const { user, currentConversationId, scenarioStates } = get();
    if (!user || !currentConversationId || !scenarioSessionId) return;

    const scenarioState = scenarioStates[scenarioSessionId];
    if (!scenarioState) return;

    const originalMessages = scenarioState.messages;
    const updatedMessages = originalMessages.map(msg => {
        if (msg.node && msg.node.id === messageNodeId) {
            return { ...msg, selectedOption: selectedValue };
        }
        return msg;
    });

    // 1. Optimistic UI update
    set(state => ({
        scenarioStates: {
            ...state.scenarioStates,
            [scenarioSessionId]: {
                ...state.scenarioStates[scenarioSessionId],
                messages: updatedMessages,
            },
        },
    }));

    // 2. Update Firestore
    try {
        const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", scenarioSessionId);
        await updateDoc(sessionRef, {
            messages: updatedMessages
        });
    } catch (error) {
        console.error("Error updating scenario selected option in Firestore:", error);
        // Rollback UI on error
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
    const { user, currentConversationId, unsubscribeScenariosMap } = get();
    if (!user || !currentConversationId || unsubscribeScenariosMap[sessionId]) return;

    const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", sessionId);
    const unsubscribe = onSnapshot(sessionRef, (doc) => {
      if (doc.exists()) {
        const scenarioData = doc.data();
        set(state => {
            const newScenarioStates = {
                ...state.scenarioStates,
                [sessionId]: { ...scenarioData, isLoading: false }
            };
            const newActiveSessions = Object.keys(newScenarioStates);
                
            return {
                scenarioStates: newScenarioStates,
                activeScenarioSessions: newActiveSessions,
            };
        });
      } else {
        get().unsubscribeFromScenarioSession(sessionId);
      }
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
          newUnsubscribeMap[sessionId]?.();
          delete newUnsubscribeMap[sessionId];
          
          return {
              unsubscribeScenariosMap: newUnsubscribeMap,
          }
      });
  },

  endScenario: async (scenarioSessionId, status = 'completed') => {
    const { user, currentConversationId } = get();
    if (!user || !currentConversationId || !scenarioSessionId) return;
    
    const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", scenarioSessionId);
    await updateDoc(sessionRef, { status, updatedAt: serverTimestamp() });
    
    if (get().activeScenarioSessionId === scenarioSessionId) {
        get().setActivePanel('main');
    }
  },

  handleScenarioResponse: async (payload) => {
    const { scenarioSessionId } = payload;
    const { handleEvents, showToast, user, currentConversationId, language, endScenario } = get();
    if (!user || !currentConversationId || !scenarioSessionId) return;

    const currentScenario = get().scenarioStates[scenarioSessionId] || {};
    const existingMessages = Array.isArray(currentScenario.messages) ? currentScenario.messages : [];

    set(state => ({
        scenarioStates: { ...state.scenarioStates, [scenarioSessionId]: { ...currentScenario, isLoading: true } }
    }));
    
    const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", scenarioSessionId);
    
    await updateDoc(sessionRef, { status: 'generating', updatedAt: serverTimestamp() });

    let newMessages = [...existingMessages];

    if (payload.userInput) {
        newMessages.push({ id: Date.now(), sender: 'user', text: payload.userInput });
        await updateDoc(sessionRef, { messages: newMessages });
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
      if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
      const data = await response.json();

      handleEvents(data.events, scenarioSessionId, currentConversationId);
      
      // --- 👇 [수정된 부분] ---
      // 'setSlot' 노드는 메시지로 표시하지 않습니다.
      if (data.nextNode && data.nextNode.type !== 'setSlot') {
          newMessages.push({ id: data.nextNode.id, sender: 'bot', node: data.nextNode });
      } else if (data.message) {
      // --- 👆 [여기까지] ---
          newMessages.push({ id: 'end', sender: 'bot', text: data.message });
      }
      
      if (data.type === 'scenario_validation_fail') {
          showToast(data.message, 'error');
          await updateDoc(sessionRef, { status: 'active', updatedAt: serverTimestamp() });
      } else if (data.type === 'scenario_end') {
        const finalStatus = data.slots?.apiFailed ? 'failed' : 'completed';
        endScenario(scenarioSessionId, finalStatus);
        await updateDoc(sessionRef, { messages: newMessages, status: finalStatus, updatedAt: serverTimestamp() });
      }
      else {
        await updateDoc(sessionRef, {
            messages: newMessages,
            state: data.scenarioState,
            slots: data.slots,
            status: 'active',
            updatedAt: serverTimestamp(),
        });
        if (data.nextNode) {
            await get().continueScenarioIfNeeded(data.nextNode, scenarioSessionId);
        }
      }
    } catch (error) {
        const errorKey = getErrorKey(error);
        const errorMessage = locales[language][errorKey] || locales[language]['errorUnexpected'];
        
        const errorMessages = [...existingMessages, { id: 'error', sender: 'bot', text: errorMessage }];
        await updateDoc(sessionRef, { messages: errorMessages, status: 'failed', updatedAt: serverTimestamp() });
        endScenario(scenarioSessionId, 'failed');
    } finally {
      set(state => ({
        scenarioStates: { ...state.scenarioStates, [scenarioSessionId]: { ...state.scenarioStates[scenarioSessionId], isLoading: false } }
      }));
    }
  },

  continueScenarioIfNeeded: async (lastNode, scenarioSessionId) => {
    // --- 👇 [수정된 부분] ---
    // 'setSlot' 노드도 비대화형 노드로 간주합니다.
    const isInteractive = lastNode.type === 'slotfilling' || lastNode.type === 'form' || (lastNode.data?.replies && lastNode.data.replies.length > 0);
    // --- 👆 [여기까지] ---

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