import { create } from 'zustand';
import { auth, db, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, serverTimestamp, deleteDoc, doc, getDoc, setDoc, updateDoc } from '../lib/firebase';
import { collection, addDoc, query, orderBy, onSnapshot, getDocs } from "firebase/firestore";
import { scenarioTriggers } from '../lib/chatbotEngine';

const initialState = {
  messages: [{ id: 'initial', sender: 'bot', text: '안녕하세요! 무엇을 도와드릴까요?' }],
  slots: {},
  isLoading: false,
  user: null,
  conversations: [],
  currentConversationId: null,
  unsubscribeMessages: null,
  unsubscribeConversations: null,
  
  scenarioStates: {},
  activeScenarioId: null,
  isScenarioPanelOpen: false,

  activePanel: 'main', 
  focusRequest: 0,
  isHistoryPanelOpen: false, 
  theme: 'light',
  isScenarioModalOpen: false,
  isSearchModalOpen: false,
  scenarioTriggers: {},
  isSearching: false,
  searchResults: [],
  fontSize: 'default',
  isProfileModalOpen: false,
};

export const useChatStore = create((set, get) => {
  const responseHandlers = {
    'scenario_start': (data) => {
      get().addMessage('bot', data.nextNode);
      set({ scenarioState: data.scenarioState });
    },
    'scenario': (data) => {
      responseHandlers.scenario_start(data);
    },
    'scenario_end': (data) => {
      get().addMessage('bot', { text: data.message });
      set({ scenarioState: null });
    },
    'scenario_list': (data) => {
      get().addMessage('bot', { text: data.message, scenarios: data.scenarios });
      set({ scenarioState: data.scenarioState });
    },
    'canvas_trigger': (data) => {
      get().addMessage('bot', { text: `'${data.scenarioId}' 시나리오를 시작합니다.`});
      get().openScenarioPanel(data.scenarioId);
    },
  };

  return {
    ...initialState,

    openSearchModal: () => set({ isSearchModalOpen: true, searchResults: [], isSearching: false }),
    closeSearchModal: () => set({ isSearchModalOpen: false }),

    searchConversations: async (searchQuery) => {
        if (!searchQuery.trim()) {
            set({ searchResults: [], isSearching: false });
            return;
        }
        set({ isSearching: true, searchResults: [] });

        const user = get().user;
        const conversations = get().conversations;
        if (!user || !conversations) {
            set({ isSearching: false });
            return;
        }

        const results = [];
        const lowerCaseQuery = searchQuery.toLowerCase();

        for (const convo of conversations) {
            const messagesCollection = collection(db, "chats", user.uid, "conversations", convo.id, "messages");
            const messagesSnapshot = await getDocs(messagesCollection);
            
            let foundInConvo = false;
            const matchingMessages = [];

            messagesSnapshot.forEach(doc => {
                const message = doc.data();
                const content = message.text || message.node?.data?.content || '';
                if (content.toLowerCase().includes(lowerCaseQuery)) {
                    foundInConvo = true;
                    const snippetIndex = content.toLowerCase().indexOf(lowerCaseQuery);
                    const start = Math.max(0, snippetIndex - 20);
                    const end = Math.min(content.length, snippetIndex + 20);
                    const snippet = `...${content.substring(start, end)}...`;
                    matchingMessages.push(snippet);
                }
            });

            if (foundInConvo) {
                results.push({
                    id: convo.id,
                    title: convo.title || 'Untitled Conversation',
                    snippets: matchingMessages.slice(0, 3)
                });
            }
        }
        
        set({ searchResults: results, isSearching: false });
    },

    toggleTheme: async () => {
        const newTheme = get().theme === 'light' ? 'dark' : 'light';
        set({ theme: newTheme });
        if (typeof window !== 'undefined') {
            localStorage.setItem('theme', newTheme);
        }
        const user = get().user;
        if (user) {
            try {
                const userSettingsRef = doc(db, 'settings', user.uid);
                await setDoc(userSettingsRef, { theme: newTheme }, { merge: true });
            } catch (error) {
                console.error("Error saving theme to Firestore:", error);
            }
        }
    },
    
    setFontSize: async (size) => {
        set({ fontSize: size });
        if (typeof window !== 'undefined') {
            localStorage.setItem('fontSize', size);
        }
        const user = get().user;
        if (user) {
            try {
                const userSettingsRef = doc(db, 'settings', user.uid);
                await setDoc(userSettingsRef, { fontSize: size }, { merge: true });
            } catch (error) {
                console.error("Error saving font size to Firestore:", error);
            }
        }
    },

    openProfileModal: () => set({ isProfileModalOpen: true }),
    closeProfileModal: () => set({ isProfileModalOpen: false }),

    openScenarioModal: () => set({ isScenarioModalOpen: true }),
    closeScenarioModal: () => set({ isScenarioModalOpen: false }),
    loadScenarioTriggers: () => {
        set({ scenarioTriggers });
    },
    
    toggleHistoryPanel: () => set(state => ({ isHistoryPanelOpen: !state.isHistoryPanelOpen })),

    focusChatInput: () => set(state => ({ focusRequest: state.focusRequest + 1 })),
    setActivePanel: (panel) => set({ activePanel: panel }),

    initAuth: () => {
      get().loadScenarioTriggers();
      const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        if (user) {
          try {
            const userSettingsRef = doc(db, 'settings', user.uid);
            const docSnap = await getDoc(userSettingsRef);
            const settings = docSnap.exists() ? docSnap.data() : {};
            
            const theme = settings.theme || localStorage.getItem('theme') || 'light';
            set({ theme });

            const fontSize = settings.fontSize || localStorage.getItem('fontSize') || 'default';
            set({ fontSize });

          } catch (error) {
            console.error("Error loading settings from Firestore:", error);
            const theme = localStorage.getItem('theme') || 'light';
            const fontSize = localStorage.getItem('fontSize') || 'default';
            set({ theme, fontSize });
          }
          set({ user });
          get().unsubscribeAll();
          get().loadConversations(user.uid);
        } else {
          get().unsubscribeAll();
          const currentTriggers = get().scenarioTriggers;
          set({ ...initialState, scenarioTriggers: currentTriggers });
           if (typeof window !== 'undefined') {
              const savedTheme = localStorage.getItem('theme') || 'light';
              const savedFontSize = localStorage.getItem('fontSize') || 'default';
              set({ theme: savedTheme, fontSize: savedFontSize });
            }
        }
      });
    },

    login: async () => {
      try {
        await signInWithPopup(auth, new GoogleAuthProvider());
      } catch (error) {
        console.error("Login failed:", error);
      }
    },
    logout: async () => {
      await signOut(auth);
    },
    unsubscribeAll: () => {
      get().unsubscribeConversations?.();
      get().unsubscribeMessages?.();
      set({ unsubscribeConversations: null, unsubscribeMessages: null });
    },
    loadConversations: (userId) => {
      const q = query(collection(db, "chats", userId, "conversations"), orderBy("updatedAt", "desc"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const conversations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        set({ conversations });
      });
      set({ unsubscribeConversations: unsubscribe });
    },
    loadConversation: (conversationId) => {
      const user = get().user;
      if (!user || get().currentConversationId === conversationId) return;
      get().unsubscribeMessages?.();
      set({ currentConversationId: conversationId, isLoading: true, messages: [], scenarioStates: {}, activeScenarioId: null, isScenarioPanelOpen: false });
      const q = query(collection(db, "chats", user.uid, "conversations", conversationId, "messages"), orderBy("createdAt", "asc"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        set({ messages: [initialState.messages[0], ...messages], isLoading: false });
      });
      set({ unsubscribeMessages: unsubscribe });
    },
    createNewConversation: () => {
      if (get().currentConversationId === null) return;
      get().unsubscribeMessages?.();
      set({ messages: initialState.messages, currentConversationId: null, scenarioStates: {}, activeScenarioId: null, isScenarioPanelOpen: false });
    },
    deleteConversation: async (conversationId) => {
      const user = get().user;
      if (!user) return;
      const conversationRef = doc(db, "chats", user.uid, "conversations", conversationId);
      const messagesQuery = query(collection(conversationRef, "messages"));
      const messagesSnapshot = await getDocs(messagesQuery);
      messagesSnapshot.forEach(async (messageDoc) => {
        await deleteDoc(messageDoc.ref);
      });
      await deleteDoc(conversationRef);
      if (get().currentConversationId === conversationId) {
        get().createNewConversation();
      }
    },
    updateConversationTitle: async (conversationId, newTitle) => {
        const user = get().user;
        if (!user || !newTitle.trim()) return;
        const conversationRef = doc(db, "chats", user.uid, "conversations", conversationId);
        await updateDoc(conversationRef, {
            title: newTitle.trim()
        });
    },
    saveMessage: async (message) => {
      const user = get().user;
      if (!user) return;
      let conversationId = get().currentConversationId;
      if (!conversationId) {
        const firstMessageContent = message.text || message.node?.data?.content || '새로운 대화';
        const conversationRef = await addDoc(collection(db, "chats", user.uid, "conversations"), {
          title: firstMessageContent.substring(0, 30),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        conversationId = conversationRef.id;
        set({ currentConversationId: conversationId });
        get().loadConversation(conversationId);
      }
      const { id, ...messageToSave } = message;
      Object.keys(messageToSave).forEach(key => (messageToSave[key] === undefined) && delete messageToSave[key]);
      if (messageToSave.node) {
        const { data, ...rest } = messageToSave.node;
        messageToSave.node = { ...rest, data: { content: data?.content, replies: data?.replies } };
      }
      const messagesCollection = collection(db, "chats", user.uid, "conversations", conversationId, "messages");
      await addDoc(messagesCollection, { ...messageToSave, createdAt: serverTimestamp() });
      await updateDoc(doc(db, "chats", user.uid, "conversations", conversationId), { updatedAt: serverTimestamp() });
    },
    // --- 👇 [수정된 부분] ---
    addMessage: (sender, messageData) => {
      let newMessage;
      if (sender === 'user') {
        newMessage = { id: Date.now(), sender, text: messageData.text };
      } else {
        if (messageData.data) {
          newMessage = { id: messageData.id, sender: 'bot', node: messageData };
        } else {
          newMessage = {
            id: messageData.id || Date.now(),
            sender: 'bot',
            text: messageData.text,
            scenarios: messageData.scenarios,
            isStreaming: messageData.isStreaming || false,
            type: messageData.type,
            scenarioId: messageData.scenarioId,
          };
        }
      }
      set(state => ({ messages: [...state.messages, newMessage] }));
      
      // '이어하기' 버튼과 같은 UI 전용 메시지는 저장하지 않습니다.
      if (!newMessage.isStreaming && newMessage.type !== 'scenario_resume_prompt') {
        get().saveMessage(newMessage);
      }
    },
    // --- 👆 [여기까지] ---
    updateStreamingMessage: (id, chunk) => {
      set(state => ({ messages: state.messages.map(m => m.id === id ? { ...m, text: m.text + chunk } : m) }));
    },
    finalizeStreamingMessage: (id) => {
      set(state => {
        const finalMessage = state.messages.find(m => m.id === id);
        if (finalMessage) {
          const messageToSave = { ...finalMessage, isStreaming: false };
          get().saveMessage(messageToSave);
        }
        return { messages: state.messages.map(m => m.id === id ? { ...m, isStreaming: false } : m) };
      });
    },
    startLoading: () => set({ isLoading: true }),
    stopLoading: () => set({ isLoading: false }),
    handleResponse: async (messagePayload) => {
      const { addMessage, updateStreamingMessage, finalizeStreamingMessage, startLoading, stopLoading } = get();
      startLoading();
      if (messagePayload.text) {
        addMessage('user', { text: messagePayload.text });
      }
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            message: messagePayload, 
            scenarioState: null, 
            slots: get().slots 
          }),
        });
        if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          const handler = responseHandlers[data.type];
          if (handler) {
            handler(data);
          } else {
            console.warn(`[ChatStore] Unhandled response type: ${data.type}`);
          }
        } else {
          const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
          const streamingMessageId = Date.now();
          addMessage('bot', { id: streamingMessageId, text: '', isStreaming: true });
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              finalizeStreamingMessage(streamingMessageId);
              break;
            }
            updateStreamingMessage(streamingMessageId, value);
          }
        }
      } catch (error) {
        console.error('Failed to fetch chat response:', error);
        addMessage('bot', { text: '오류가 발생했습니다. 잠시 후 다시 시도해주세요.' });
      } finally {
        stopLoading();
      }
    },
    openScenarioPanel: async (scenarioId) => {
      const { scenarioStates } = get();

      if (scenarioStates[scenarioId]) {
          set({ 
              isScenarioPanelOpen: true, 
              activeScenarioId: scenarioId,
              activePanel: 'scenario' 
          });
          get().focusChatInput();
          return;
      }
      
      set({ 
          isScenarioPanelOpen: true, 
          activeScenarioId: scenarioId,
          activePanel: 'scenario',
          scenarioStates: {
              ...scenarioStates,
              [scenarioId]: {
                  messages: [],
                  state: null,
                  slots: {},
                  isLoading: true,
              }
          }
      });
      
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: { text: scenarioId } }),
        });
        const data = await response.json();

        if (data.type === 'scenario_start') {
          const startNode = data.nextNode;
          set(state => ({
            scenarioStates: {
              ...state.scenarioStates,
              [scenarioId]: {
                messages: [{ id: startNode.id, sender: 'bot', node: startNode }],
                state: data.scenarioState,
                slots: data.slots || {},
                isLoading: false,
              },
            },
          }));
          await get().continueScenarioIfNeeded(startNode, scenarioId);
        } else {
          throw new Error("Failed to start scenario properly");
        }
      } catch (error) {
        console.error("Error starting scenario:", error);
        set(state => ({
          scenarioStates: {
            ...state.scenarioStates,
            [scenarioId]: {
              ...state.scenarioStates[scenarioId],
              messages: [{ id: 'error', sender: 'bot', text: '시나리오를 시작하는 중 오류가 발생했습니다.' }],
              isLoading: false,
            },
          },
        }));
      } finally {
        get().focusChatInput();
      }
    },
    endScenario: (scenarioId) => {
      const { scenarioStates, messages } = get();
      const newScenarioStates = { ...scenarioStates };
      delete newScenarioStates[scenarioId];

      set({
        scenarioStates: newScenarioStates,
        isScenarioPanelOpen: false,
        activeScenarioId: null,
        activePanel: 'main',
        messages: messages.filter(msg => msg.type !== 'scenario_resume_prompt' || msg.scenarioId !== scenarioId),
      });
    },
    // --- 👇 [수정된 부분] ---
    setScenarioPanelOpen: (isOpen) => {
        const { activeScenarioId } = get();
        
        set(state => {
            let newMessages = state.messages;
            if (!isOpen && activeScenarioId) {
                // 기존 이어하기 버튼 제거
                newMessages = state.messages.filter(msg =>
                    msg.type !== 'scenario_resume_prompt' || msg.scenarioId !== activeScenarioId
                );
                // 새 이어하기 버튼 추가
                newMessages.push({
                    id: Date.now(),
                    sender: 'bot',
                    type: 'scenario_resume_prompt',
                    scenarioId: activeScenarioId,
                    text: `'${activeScenarioId}' 시나리오 이어하기`,
                });
            }

            return {
                isScenarioPanelOpen: isOpen,
                activePanel: isOpen ? 'scenario' : 'main',
                messages: newMessages,
            };
        });

        get().focusChatInput();
    },
    // --- 👆 [여기까지] ---
    handleScenarioResponse: async (payload) => {
      const { scenarioId } = payload;
      set(state => ({
        scenarioStates: {
          ...state.scenarioStates,
          [scenarioId]: {
            ...state.scenarioStates[scenarioId],
            isLoading: true,
            messages: payload.userInput 
              ? [...state.scenarioStates[scenarioId].messages, { id: Date.now(), sender: 'user', text: payload.userInput }]
              : state.scenarioStates[scenarioId].messages,
          }
        }
      }));
      
      const currentScenario = get().scenarioStates[scenarioId];

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
          }),
        });
        const data = await response.json();

        if (data.type === 'scenario') {
          const nextNode = data.nextNode;
          set(state => ({
            scenarioStates: {
                ...state.scenarioStates,
                [scenarioId]: {
                    ...state.scenarioStates[scenarioId],
                    messages: [...state.scenarioStates[scenarioId].messages, { id: nextNode.id, sender: 'bot', node: nextNode }],
                    state: data.scenarioState,
                    slots: data.slots, 
                    isLoading: false,
                }
            }
          }));
          await get().continueScenarioIfNeeded(nextNode, scenarioId);
        } else if (data.type === 'scenario_end') {
           set(state => ({
            scenarioStates: {
                ...state.scenarioStates,
                [scenarioId]: {
                    ...state.scenarioStates[scenarioId],
                    messages: [...state.scenarioStates[scenarioId].messages, { id: 'end', sender: 'bot', text: data.message }],
                    slots: data.slots, 
                    state: null,
                    isLoading: false,
                }
            }
          }));
        } else {
          throw new Error("Invalid scenario response");
        }
      } catch (error) {
        console.error("Error in scenario conversation:", error);
         set(state => ({
            scenarioStates: {
                ...state.scenarioStates,
                [scenarioId]: {
                    ...state.scenarioStates[scenarioId],
                    messages: [...state.scenarioStates[scenarioId].messages, { id: 'error', sender: 'bot', text: '오류가 발생했습니다.' }],
                    isLoading: false,
                }
            }
          }));
      }
    },
    continueScenarioIfNeeded: async (lastNode, scenarioId) => {
      const isInteractive = lastNode.type === 'slotfilling' || lastNode.type === 'form' || (lastNode.data?.replies && lastNode.data.replies.length > 0);
      if (!isInteractive && lastNode.id !== 'end') {
        await new Promise(resolve => setTimeout(resolve, 500));
        await get().handleScenarioResponse({
          scenarioId: scenarioId,
          currentNodeId: lastNode.id,
          sourceHandle: null,
          userInput: null,
        });
      }
    }
  };
});

useChatStore.getState().initAuth();