import { collection, addDoc, doc, updateDoc, onSnapshot, serverTimestamp, getDoc, setDoc, getDocs, query, orderBy, where } from 'firebase/firestore';
import { locales } from '../../lib/locales';
import { getErrorKey } from '../../lib/errorHandler'; 

export const createScenarioSlice = (set, get) => ({
  // State
  scenarioStates: {},
  activeScenarioSessionId: null,
  isScenarioPanelOpen: false, 
  scenarioCategories: [],
  availableScenarios: [],
  unsubscribeScenario: null,

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

  openScenarioPanel: async (scenarioId, scenarioSessionId = null) => {
    const { user, currentConversationId, handleEvents, language, activeScenarioSessionId } = get();
    if (!user) return;
    
    const previousScenarioSessionId = activeScenarioSessionId;

    let conversationId = currentConversationId;
    if (!conversationId) {
        const newConversationId = await get().createNewConversation(true);
        if (!newConversationId) return;
        conversationId = newConversationId;
    }

    if (scenarioSessionId) {
      if (!get().scenarioStates[scenarioSessionId]) {
        get().subscribeToScenarioSession(scenarioSessionId);
      }
      set({
          isScenarioPanelOpen: true,
          activeScenarioSessionId: scenarioSessionId,
          activePanel: 'scenario'
      });
      if (previousScenarioSessionId && previousScenarioSessionId !== scenarioSessionId) {
        const prevSessionRef = doc(get().db, "chats", user.uid, "conversations", conversationId, "scenario_sessions", previousScenarioSessionId);
        await updateDoc(prevSessionRef, { status: 'cancelled' });
      }
      get().focusChatInput();
      return;
    }

    const scenarioSessionsRef = collection(get().db, "chats", user.uid, "conversations", conversationId, "scenario_sessions");
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
    
    if (previousScenarioSessionId) {
        const prevSessionRef = doc(get().db, "chats", user.uid, "conversations", conversationId, "scenario_sessions", previousScenarioSessionId);
        await updateDoc(prevSessionRef, { status: 'cancelled' });
    }

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
        });
        await get().continueScenarioIfNeeded(data.nextNode, newScenarioSessionId);
      } else {
        const errorText = data.message || "Failed to start scenario properly";
        const sessionRef = doc(get().db, "chats", user.uid, "conversations", conversationId, "scenario_sessions", newScenarioSessionId);
        await updateDoc(sessionRef, {
            messages: [{ id: 'error-start', sender: 'bot', text: errorText }],
            status: 'failed',
        });
      }
    } catch (error) {
      const errorKey = getErrorKey(error);
      const errorMessage = locales[language][errorKey] || locales[language]['errorUnexpected'];
      const sessionRef = doc(get().db, "chats", user.uid, "conversations", conversationId, "scenario_sessions", newScenarioSessionId);
      await updateDoc(sessionRef, {
        messages: [{ id: 'error', sender: 'bot', text: errorMessage }],
        status: 'failed'
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

  endScenario: async (scenarioSessionId, status = 'completed') => {
    const { user, currentConversationId } = get();
    if (!user || !currentConversationId || !scenarioSessionId) return;
    
    const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", scenarioSessionId);
    await updateDoc(sessionRef, { status });
    
    if (get().activeScenarioSessionId === scenarioSessionId) {
        set({ activePanel: 'main' });
    }
  },

  setScenarioPanelOpen: (isOpen) => {
    const { activeScenarioSessionId, endScenario, focusChatInput } = get();
    if (!isOpen && activeScenarioSessionId) {
        endScenario(activeScenarioSessionId, 'cancelled');
    }
    set({
        isScenarioPanelOpen: isOpen,
        activeScenarioSessionId: isOpen ? activeScenarioSessionId : null,
        activePanel: 'main',
    });
    if(!isOpen) {
        focusChatInput();
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
    
    await updateDoc(sessionRef, { status: 'generating' });

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
          await updateDoc(sessionRef, { status: 'active' });
      } else if (data.type === 'scenario_end') {
        const finalStatus = data.slots?.apiFailed ? 'failed' : 'completed';
        endScenario(scenarioSessionId, finalStatus);
        await updateDoc(sessionRef, { messages: newMessages, status: finalStatus });
      }
      else {
        await updateDoc(sessionRef, {
            messages: newMessages,
            state: data.scenarioState,
            slots: data.slots,
            status: 'active',
        });
        if (data.nextNode) {
            await get().continueScenarioIfNeeded(data.nextNode, scenarioSessionId);
        }
      }
    } catch (error) {
        const errorKey = getErrorKey(error);
        const errorMessage = locales[language][errorKey] || locales[language]['errorUnexpected'];
        
        const errorMessages = [...existingMessages, { id: 'error', sender: 'bot', text: errorMessage }];
        await updateDoc(sessionRef, { messages: errorMessages, status: 'failed' });
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