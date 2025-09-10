import { collection, addDoc, query, orderBy, onSnapshot, getDocs, serverTimestamp, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { locales } from '../../lib/locales';

const getInitialMessages = (lang = 'ko') => {
  return [{ id: 'initial', sender: 'bot', text: locales[lang].initialBotMessage }];
};

const responseHandlers = {
    'scenario_start': (data, get) => {
      get().addMessage('bot', data.nextNode);
      get().setScenarioState(data.scenarioState);
    },
    'scenario': (data, get) => {
      responseHandlers['scenario_start'](data, get);
    },
    'scenario_end': (data, get) => {
      get().addMessage('bot', { text: data.message });
      get().setScenarioState(null);
    },
    'scenario_list': (data, get) => {
      get().addMessage('bot', { text: data.message, scenarios: data.scenarios });
      get().setScenarioState(data.scenarioState);
    },
    'canvas_trigger': (data, get) => {
      get().addMessage('bot', { text: `'${data.scenarioId}' 시나리오를 시작합니다.`});
      get().openScenarioPanel(data.scenarioId);
    },
    'toast': (data, get) => {
      get().showToast(data.message, data.toastType);
    },
};

export const createChatSlice = (set, get) => ({
  messages: getInitialMessages('ko'),
  conversations: [],
  currentConversationId: null,
  isLoading: false,
  isSearching: false,
  searchResults: [],
  slots: {},
  unsubscribeMessages: null,
  unsubscribeConversations: null,

  loadConversations: (userId) => {
    const q = query(collection(get().db, "chats", userId, "conversations"), orderBy("updatedAt", "desc"));
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
    const { language } = get();
    const initialMessage = getInitialMessages(language)[0];
    set({ currentConversationId: conversationId, isLoading: true, messages: [initialMessage], scenarioStates: {}, activeScenarioId: null, isScenarioPanelOpen: false });
    const q = query(collection(get().db, "chats", user.uid, "conversations", conversationId, "messages"), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      set({ messages: [initialMessage, ...messages], isLoading: false });
    });
    set({ unsubscribeMessages: unsubscribe });
  },

  createNewConversation: () => {
    if (get().currentConversationId === null) return;
    get().unsubscribeMessages?.();
    const { language } = get();
    set({ messages: getInitialMessages(language), currentConversationId: null, scenarioStates: {}, activeScenarioId: null, isScenarioPanelOpen: false });
  },

  deleteConversation: async (conversationId) => {
    const user = get().user;
    if (!user) return;
    const conversationRef = doc(get().db, "chats", user.uid, "conversations", conversationId);
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
    const conversationRef = doc(get().db, "chats", user.uid, "conversations", conversationId);
    await updateDoc(conversationRef, { title: newTitle.trim() });
  },

  saveMessage: async (message) => {
    const user = get().user;
    if (!user) return;
    let conversationId = get().currentConversationId;
    if (!conversationId) {
      const firstMessageContent = message.text || message.node?.data?.content || 'New Conversation';
      const conversationRef = await addDoc(collection(get().db, "chats", user.uid, "conversations"), {
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
    const messagesCollection = collection(get().db, "chats", user.uid, "conversations", conversationId, "messages");
    await addDoc(messagesCollection, { ...messageToSave, createdAt: serverTimestamp() });
    await updateDoc(doc(get().db, "chats", user.uid, "conversations", conversationId), { updatedAt: serverTimestamp() });
  },

  addMessage: (sender, messageData) => {
    let newMessage;
    if (sender === 'user') {
      newMessage = { id: Date.now(), sender, text: messageData.text };
    } else {
        if (messageData.data) { // Scenario node
            newMessage = { id: messageData.id, sender: 'bot', node: messageData };
        } else { // Regular text/streaming message
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
    if (!newMessage.isStreaming && newMessage.type !== 'scenario_resume_prompt') {
      get().saveMessage(newMessage);
    }
  },

  updateStreamingMessage: (id, chunk) => {
    set(state => ({
      messages: state.messages.map(m =>
        m.id === id ? { ...m, text: (m.text || '') + chunk } : m
      ),
    }));
  },

  finalizeStreamingMessage: (id) => {
    set(state => {
      const finalMessage = state.messages.find(m => m.id === id);
      if (finalMessage) {
        const messageToSave = { ...finalMessage, isStreaming: false };
        get().saveMessage(messageToSave);
      }
      return {
        messages: state.messages.map(m => (m.id === id ? { ...m, isStreaming: false } : m)),
      };
    });
  },

  handleResponse: async (messagePayload) => {
    set({ isLoading: true });
    if (messagePayload.text) {
      get().addMessage('user', { text: messagePayload.text });
    }
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messagePayload,
          scenarioState: null,
          slots: get().slots,
          language: get().language,
        }),
      });
      if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
      
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        const handler = responseHandlers[data.type];
        if (handler) {
          handler(data, get);
        } else {
          console.warn(`[ChatStore] Unhandled response type: ${data.type}`);
        }
      } else {
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        const streamingMessageId = Date.now();
        get().addMessage('bot', { id: streamingMessageId, text: '', isStreaming: true });
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            get().finalizeStreamingMessage(streamingMessageId);
            break;
          }
          get().updateStreamingMessage(streamingMessageId, value);
        }
      }
    } catch (error) {
      console.error('Failed to fetch chat response:', error);
      get().showToast('An error occurred. Please try again.', 'error');
    } finally {
      set({ isLoading: false });
    }
  },

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
        const messagesCollection = collection(get().db, "chats", user.uid, "conversations", convo.id, "messages");
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
});