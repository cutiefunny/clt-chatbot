import { collection, addDoc, query, orderBy, onSnapshot, getDocs, serverTimestamp, deleteDoc, doc, updateDoc, limit, startAfter, where } from 'firebase/firestore';
import { locales } from '../../lib/locales';
import { getErrorKey } from '../../lib/errorHandler';

const MESSAGE_LIMIT = 15;

const getInitialMessages = (lang = 'ko') => {
  return [{ id: 'initial', sender: 'bot', text: locales[lang].initialBotMessage }];
};

const responseHandlers = {
    'scenario_start': (data, get) => {
      get().addMessage('bot', data.nextNode);
    },
    'scenario': (data, get) => {
      responseHandlers['scenario_start'](data, get);
    },
    'scenario_end': (data, get) => {
      get().addMessage('bot', { text: data.message });
    },
    'scenario_list': (data, get) => {
      get().addMessage('bot', { text: data.message, scenarios: data.scenarios });
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
  lastVisibleMessage: null,
  hasMoreMessages: true,
  expandedConversationId: null,
  scenariosForConversation: {},

  toggleConversationExpansion: async (conversationId) => {
    const { expandedConversationId, scenariosForConversation, user } = get();

    if (expandedConversationId === conversationId) {
      set({ expandedConversationId: null });
    } else {
      set({ expandedConversationId: conversationId });
      
      if (!scenariosForConversation[conversationId] && user) {
        try {
          const scenariosRef = collection(get().db, "chats", user.uid, "conversations", conversationId, "scenario_sessions");
          const q = query(scenariosRef, orderBy("createdAt", "desc"));
          const snapshot = await getDocs(q);
          const scenarios = snapshot.docs.map(doc => ({
            sessionId: doc.id,
            ...doc.data()
          }));

          set(state => ({
            scenariosForConversation: {
              ...state.scenariosForConversation,
              [conversationId]: scenarios,
            }
          }));
        } catch (error) {
          console.error("Failed to load scenarios for conversation:", error);
          set(state => ({
            scenariosForConversation: {
              ...state.scenariosForConversation,
              [conversationId]: [],
            }
          }));
        }
      }
    }
  },

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
    get().unsubscribeScenario?.();

    const { language } = get();
    const initialMessage = getInitialMessages(language)[0];
    
    set({ 
        currentConversationId: conversationId, 
        isLoading: true, 
        messages: [initialMessage], 
        scenarioStates: {},
        activeScenarioSessionId: null, 
        isScenarioPanelOpen: false,
        lastVisibleMessage: null,
        hasMoreMessages: true,
    });

    const messagesRef = collection(get().db, "chats", user.uid, "conversations", conversationId, "messages");
    const q = query(messagesRef, orderBy("createdAt", "desc"), limit(MESSAGE_LIMIT));
    
    const unsubscribe = onSnapshot(q, async (messagesSnapshot) => {
        const newMessages = messagesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).reverse();
        const lastVisible = messagesSnapshot.docs[messagesSnapshot.docs.length - 1];

        const scenarioSessionsRef = collection(get().db, "chats", user.uid, "conversations", conversationId, "scenario_sessions");
        const scenarioQuery = query(scenarioSessionsRef, where("status", "==", "active"));
        const scenarioSnapshot = await getDocs(scenarioQuery);

        const resumePrompts = [];
        const newScenarioStates = {};

        scenarioSnapshot.forEach(doc => {
            const session = doc.data();
            resumePrompts.push({
                id: `resume-${doc.id}`,
                sender: 'bot',
                type: 'scenario_resume_prompt',
                scenarioId: session.scenarioId,
                scenarioSessionId: doc.id,
                text: '',
            });
            newScenarioStates[doc.id] = session;
        });
        
        set(state => ({
            messages: [initialMessage, ...newMessages, ...resumePrompts],
            lastVisibleMessage: lastVisible,
            hasMoreMessages: messagesSnapshot.docs.length === MESSAGE_LIMIT,
            isLoading: false,
            scenarioStates: newScenarioStates,
        }));
    });
    set({ unsubscribeMessages: unsubscribe });
  },

  loadMoreMessages: async () => {
    const user = get().user;
    const { currentConversationId, lastVisibleMessage, hasMoreMessages, messages } = get();
    
    if (!user || !currentConversationId || !hasMoreMessages || !lastVisibleMessage) return;

    set({ isLoading: true });

    try {
        const messagesRef = collection(get().db, "chats", user.uid, "conversations", currentConversationId, "messages");
        const q = query(messagesRef, orderBy("createdAt", "desc"), startAfter(lastVisibleMessage), limit(MESSAGE_LIMIT));

        const snapshot = await getDocs(q);
        const newMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).reverse();
        const newLastVisible = snapshot.docs[snapshot.docs.length - 1];

        const initialMessage = messages[0];
        const existingMessages = messages.slice(1).filter(m => m.type !== 'scenario_resume_prompt');

        set({
            messages: [initialMessage, ...newMessages, ...existingMessages],
            lastVisibleMessage: newLastVisible,
            hasMoreMessages: snapshot.docs.length === MESSAGE_LIMIT,
        });

    } catch (error) {
        console.error("Error loading more messages:", error);
    } finally {
        set({ isLoading: false });
    }
  },

  createNewConversation: () => {
    if (get().currentConversationId === null) return;
    get().unsubscribeMessages?.();
    get().unsubscribeScenario?.();
    const { language } = get();
    set({ 
        messages: getInitialMessages(language), 
        currentConversationId: null, 
        scenarioStates: {}, 
        activeScenarioSessionId: null, 
        isScenarioPanelOpen: false,
        lastVisibleMessage: null,
        hasMoreMessages: true,
        expandedConversationId: null,
    });
  },

  deleteConversation: async (conversationId) => {
    const user = get().user;
    if (!user) return;
    const conversationRef = doc(get().db, "chats", user.uid, "conversations", conversationId);

    const scenariosRef = collection(conversationRef, "scenario_sessions");
    const scenariosSnapshot = await getDocs(scenariosRef);
    scenariosSnapshot.forEach(async (scenarioDoc) => {
      await deleteDoc(scenarioDoc.ref);
    });

    const messagesRef = collection(conversationRef, "messages");
    const messagesSnapshot = await getDocs(messagesRef);
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
      get().unsubscribeMessages?.();
      get().loadConversation(conversationId);
    }
    
    const { id, ...messageToSave } = message;
    if (messageToSave.type === 'scenario_resume_prompt') return;

    Object.keys(messageToSave).forEach(key => (messageToSave[key] === undefined) && delete messageToSave[key]);
      if (messageToSave.node) {
        const { data, ...rest } = messageToSave.node;
        messageToSave.node = { ...rest, data: { content: data?.content, replies: data?.replies } };
      }
    const messagesCollection = collection(get().db, "chats", user.uid, "conversations", conversationId, "messages");
    await addDoc(messagesCollection, { ...messageToSave, createdAt: serverTimestamp() });
    await updateDoc(doc(get().db, "chats", user.uid, "conversations", conversationId), { updatedAt: serverTimestamp() });
  },

  // --- 👇 [수정] async 함수로 변경하고, 내부의 saveMessage를 await 처리 ---
  addMessage: async (sender, messageData) => {
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
                scenarioSessionId: messageData.scenarioSessionId,
            };
        }
    }
    set(state => ({ messages: [...state.messages, newMessage] }));
    if (!newMessage.isStreaming) {
      await get().saveMessage(newMessage); // Await this to ensure conversation is created
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

  // --- 👇 [수정] async로 변경하고, optional displayText를 받도록 수정 ---
  handleResponse: async (messagePayload) => {
    set({ isLoading: true });

    // 사용자에게 보여줄 텍스트 (displayText가 있으면 그것을, 없으면 text를 사용)
    const textForUser = messagePayload.displayText || messagePayload.text;
    if (textForUser) {
      await get().addMessage('user', { text: textForUser });
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: { text: messagePayload.text }, // API에는 항상 실제 처리할 text를 보냄
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
      const errorKey = getErrorKey(error);
      const { language } = get();
      const errorMessage = locales[language][errorKey] || locales[language]['errorUnexpected'];
      get().showToast(errorMessage, 'error');
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