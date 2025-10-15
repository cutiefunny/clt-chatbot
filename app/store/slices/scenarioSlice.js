import { collection, addDoc, doc, updateDoc, onSnapshot, serverTimestamp, getDoc, setDoc, getDocs, query, orderBy, where } from 'firebase/firestore';
import { locales } from '../../lib/locales';
import { getErrorKey } from '../../lib/errorHandler'; 

export const createScenarioSlice = (set, get) => ({
  // State
  scenarioStates: {},
  activeScenarioSessionId: null, // This now represents the "focused" scenario
  activeScenarioSessions: [], // Holds IDs of all visible scenarios in a conversation
  scenarioCategories: [],
  availableScenarios: [],
  unsubscribeScenariosMap: {},

  // Actions
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

  openScenarioPanel: async (scenarioId) => {
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
      slots: {},
    });

    const newScenarioSessionId = newSessionDoc.id;
    
    // --- 👇 [수정된 부분] ---
    // 1. 메인챗으로 포커스 이동
    setActivePanel('main');
    // 2. 스크롤 맨 아래로 내리기 명령
    setForceScrollToBottom(true);
    // 3. 시나리오 버블 생성
    addMessage('user', {
        type: 'scenario_bubble',
        scenarioSessionId: newScenarioSessionId,
    });
    
    get().subscribeToScenarioSession(newScenarioSessionId);
    
    // 4. 잠시 후 (렌더링 및 스크롤 이후) 시나리오 버블로 다시 포커스 이동
    setTimeout(() => {
        setActivePanel('scenario', newScenarioSessionId);
    }, 50);
    // --- 👆 [여기까지] ---

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: { text: scenarioId },
          scenarioSessionId: newScenarioSessionId
        }),
      });
      if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
      const data = await response.json();
      
      handleEvents(data.events, newScenarioSessionId);

      if (data.type === 'scenario_start' || data.type === 'scenario') {
        const sessionRef = doc(get().db, "chats", user.uid, "conversations", conversationId, "scenario_sessions", newScenarioSessionId);
        await updateDoc(sessionRef, {
            messages: [{ id: data.nextNode.id, sender: 'bot', node: data.nextNode }],
            state: data.scenarioState,
            slots: data.slots || {},
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

      handleEvents(data.events, scenarioSessionId);
      
      if (data.nextNode) {
          newMessages.push({ id: data.nextNode.id, sender: 'bot', node: data.nextNode });
      } else if (data.message) {
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