import { create } from 'zustand';
import { auth, db, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, serverTimestamp, deleteDoc } from '../lib/firebase';
import { collection, addDoc, query, orderBy, onSnapshot, doc, updateDoc, getDocs } from "firebase/firestore";

const initialState = {
  messages: [{ id: 'initial', sender: 'bot', text: '안녕하세요! 무엇을 도와드릴까요?' }],
  scenarioState: null,
  slots: {},
  isLoading: false,
  user: null,
  conversations: [],
  currentConversationId: null,
  unsubscribeMessages: null,
  unsubscribeConversations: null,
  scenarioPanel: { isOpen: false, scenarioId: null },
  scenarioMessages: [],
  isScenarioLoading: false,
  currentScenarioNodeId: null,
  activePanel: 'main', 
  focusRequest: 0,
  isHistoryPanelOpen: false, 
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
    },
    'canvas_trigger': (data) => {
      get().addMessage('bot', { text: `'${data.scenarioId}' 시나리오를 시작합니다.`});
      get().openScenarioPanel(data.scenarioId);
    },
  };

  return {
    ...initialState,

    toggleHistoryPanel: () => set(state => ({ isHistoryPanelOpen: !state.isHistoryPanelOpen })),

    focusChatInput: () => set(state => ({ focusRequest: state.focusRequest + 1 })),
    setActivePanel: (panel) => set({ activePanel: panel }),

    initAuth: () => {
      const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
        if (user) {
          set({ user });
          get().unsubscribeAll();
          get().loadConversations(user.uid);
        } else {
          get().unsubscribeAll();
          set({ ...initialState });
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
      set({ currentConversationId: conversationId, isLoading: true, messages: [], scenarioState: null, slots: {} });
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
      set({ messages: initialState.messages, currentConversationId: null, scenarioState: null, slots: {} });
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
    // --- 👇 [추가된 함수] ---
    updateConversationTitle: async (conversationId, newTitle) => {
        const user = get().user;
        if (!user || !newTitle.trim()) return;
        const conversationRef = doc(db, "chats", user.uid, "conversations", conversationId);
        await updateDoc(conversationRef, {
            title: newTitle.trim()
        });
    },
    // --- 👆 [여기까지] ---
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
          };
        }
      }
      set(state => ({ messages: [...state.messages, newMessage] }));
      if (!newMessage.isStreaming) {
        get().saveMessage(newMessage);
      }
    },
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
          body: JSON.stringify({ message: messagePayload, scenarioState: get().scenarioState, slots: get().slots }),
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
      set({ scenarioPanel: { isOpen: true, scenarioId }, scenarioMessages: [], isScenarioLoading: true, currentScenarioNodeId: null, activePanel: 'scenario' });
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
            scenarioMessages: [...state.scenarioMessages, { id: startNode.id, sender: 'bot', node: startNode }],
            currentScenarioNodeId: startNode.id,
            scenarioState: data.scenarioState,
          }));
          await get().continueScenarioIfNeeded(startNode);
        } else {
          throw new Error("Failed to start scenario properly");
        }
      } catch (error) {
        console.error("Error starting scenario:", error);
        set({ scenarioMessages: [{ id: 'error', sender: 'bot', text: '시나리오를 시작하는 중 오류가 발생했습니다.' }] });
      } finally {
        set({ isScenarioLoading: false });
        get().focusChatInput();
      }
    },
    closeScenario: () => {
      set({ scenarioPanel: { isOpen: false, scenarioId: null }, scenarioMessages: [], isScenarioLoading: false, currentScenarioNodeId: null, activePanel: 'main' });
    },
    handleScenarioResponse: async (payload) => {
      set({ isScenarioLoading: true });
      if (payload.userInput) {
        set(state => ({ scenarioMessages: [...state.scenarioMessages, { id: Date.now(), sender: 'user', text: payload.userInput }] }));
      }
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: { sourceHandle: payload.sourceHandle, text: payload.userInput },
            scenarioState: { scenarioId: payload.scenarioId, currentNodeId: payload.currentNodeId },
            slots: {},
          }),
        });
        const data = await response.json();
        if (data.type === 'scenario') {
          const nextNode = data.nextNode;
          set(state => ({
            scenarioMessages: [...state.scenarioMessages, { id: nextNode.id, sender: 'bot', node: nextNode }],
            currentScenarioNodeId: nextNode.id,
            scenarioState: data.scenarioState,
          }));
          await get().continueScenarioIfNeeded(nextNode);
        } else if (data.type === 'scenario_end') {
          set(state => ({ scenarioMessages: [...state.scenarioMessages, { id: 'end', sender: 'bot', text: data.message }] }));
        } else {
          throw new Error("Invalid scenario response");
        }
      } catch (error) {
        console.error("Error in scenario conversation:", error);
        set(state => ({ scenarioMessages: [...state.scenarioMessages, { id: 'error', sender: 'bot', text: '오류가 발생했습니다.' }] }));
      } finally {
        set({ isScenarioLoading: false });
      }
    },
    continueScenarioIfNeeded: async (lastNode) => {
      const isInteractive = lastNode.type === 'slotfilling' || lastNode.type === 'form' || (lastNode.data?.replies && lastNode.data.replies.length > 0);
      if (!isInteractive && lastNode.id !== 'end') {
        await new Promise(resolve => setTimeout(resolve, 500));
        await get().handleScenarioResponse({
          scenarioId: get().scenarioPanel.scenarioId,
          currentNodeId: lastNode.id,
          sourceHandle: null,
          userInput: null,
        });
      }
    }
  };
});

useChatStore.getState().initAuth();