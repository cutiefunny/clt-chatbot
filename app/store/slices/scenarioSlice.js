import { collection, addDoc, doc, updateDoc, onSnapshot, serverTimestamp, getDoc, setDoc, getDocs } from 'firebase/firestore';
import { locales } from '../../lib/locales';
import { getErrorKey } from '../../lib/errorHandler'; 

export const createScenarioSlice = (set, get) => ({
  // State
  scenarioStates: {},
  activeScenarioSessionId: null,
  isScenarioPanelOpen: false,
  scenarioCategories: [],
  availableScenarios: [], // --- [추가] 사용 가능한 시나리오 ID 목록
  unsubscribeScenario: null,

  // Actions
  // --- 👇 [추가] scenarios 컬렉션에서 모든 문서 ID를 불러오는 함수 ---
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
    const { user, currentConversationId, handleEvents, scenarioStates, language } = get();
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
      if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
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
      } else if (data.type === 'scenario_end') {
        const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", newScenarioSessionId);
        await updateDoc(sessionRef, {
            messages: [{ id: 'error-start', sender: 'bot', text: data.message }],
            status: 'completed',
        });
      } else {
        throw new Error("Failed to start scenario properly");
      }
    } catch (error) {
      const errorKey = getErrorKey(error);
      const errorMessage = locales[language][errorKey] || locales[language]['errorUnexpected'];
      const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", newScenarioSessionId);
      await updateDoc(sessionRef, {
        messages: [{ id: 'error', sender: 'bot', text: errorMessage }],
        status: 'completed'
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
    
    const sessionRef = doc(get().db, "chats", user.uid, "conversations", currentConversationId, "scenario_sessions", scenarioSessionId);
    await updateDoc(sessionRef, { status: 'completed' });

    const endMessage = {
      id: Date.now(),
      sender: 'bot',
      text: locales[get().language].scenarioEnded(scenarioId),
      type: 'scenario_end_notice',
      scenarioId: scenarioId,
      scenarioSessionId: scenarioSessionId, 
    };

    const filteredMessages = messages.filter(
      (msg) => msg.type !== 'scenario_resume_prompt' || msg.scenarioSessionId !== scenarioSessionId
    );
    
    get().unsubscribeScenario?.();
    
    set({
      isScenarioPanelOpen: false,
      activeScenarioSessionId: null,
      activePanel: 'main',
      messages: [...filteredMessages, endMessage],
      unsubscribeScenario: null,
    });

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
    const { handleEvents, showToast, user, currentConversationId, language } = get();
    if (!user || !currentConversationId || !scenarioSessionId) return;

    set(state => ({
        scenarioStates: { ...state.scenarioStates, [scenarioSessionId]: { ...state.scenarioStates[scenarioSessionId], isLoading: true } }
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
      if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
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
        const errorKey = getErrorKey(error);
        const errorMessage = locales[language][errorKey] || locales[language]['errorUnexpected'];
        await updateDoc(sessionRef, {
            messages: [...get().scenarioStates[scenarioSessionId].messages, { id: 'error', sender: 'bot', text: errorMessage }]
        });
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

