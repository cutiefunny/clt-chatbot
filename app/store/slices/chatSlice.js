import { collection, addDoc, query, orderBy, onSnapshot, getDocs, serverTimestamp, deleteDoc, doc, updateDoc, limit, startAfter, where } from 'firebase/firestore';
import { locales } from '../../lib/locales';
import { getErrorKey } from '../../lib/errorHandler'; // --- [추가]

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
    get().unsubscribeScenario?.(); // 다른 대화로 전환 시 시나리오 구독 해제

    const { language } = get();
    const initialMessage = getInitialMessages(language)[0];
    
    set({ 
        currentConversationId: conversationId, 
        isLoading: true, 
        messages: [initialMessage], 
        scenarioStates: {}, // 이전 대화의 시나리오 상태 초기화
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

        // --- 👇 [추가된 부분] 활성화된 시나리오 세션을 가져와 이어하기 버튼 생성 ---
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
                text: '', // 텍스트는 Chat.jsx에서 동적으로 생성
            });
            // 이어하기를 위해 시나리오 상태를 미리 로드
            newScenarioStates[doc.id] = session;
        });
        // --- 👆 [여기까지] ---
        
        set(state => ({
            messages: [initialMessage, ...newMessages, ...resumePrompts],
            lastVisibleMessage: lastVisible,
            hasMoreMessages: messagesSnapshot.docs.length === MESSAGE_LIMIT,
            isLoading: false,
            scenarioStates: newScenarioStates, // 활성 시나리오 상태 업데이트
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
        // 이어하기 버튼 등 메시지가 아닌 요소를 제외하고 순수 메시지만 필터링
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
    });
  },

  deleteConversation: async (conversationId) => {
    const user = get().user;
    if (!user) return;
    const conversationRef = doc(get().db, "chats", user.uid, "conversations", conversationId);

    // 하위 컬렉션(scenario_sessions)의 모든 문서 삭제
    const scenariosRef = collection(conversationRef, "scenario_sessions");
    const scenariosSnapshot = await getDocs(scenariosRef);
    scenariosSnapshot.forEach(async (scenarioDoc) => {
      await deleteDoc(scenarioDoc.ref);
    });

    // 하위 컬렉션(messages)의 모든 문서 삭제
    const messagesRef = collection(conversationRef, "messages");
    const messagesSnapshot = await getDocs(messagesRef);
    messagesSnapshot.forEach(async (messageDoc) => {
      await deleteDoc(messageDoc.ref);
    });

    // 상위 문서 삭제
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
      // 새 대화 생성 시, 기존 구독을 해제하고 새 대화를 로드
      get().unsubscribeMessages?.();
      get().loadConversation(conversationId);
    }
    
    const { id, ...messageToSave } = message;
    // 'scenario_resume_prompt' 타입의 메시지는 저장하지 않음
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
                scenarioSessionId: messageData.scenarioSessionId,
            };
        }
    }
    set(state => ({ messages: [...state.messages, newMessage] }));
    if (!newMessage.isStreaming) {
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
    // --- 👇 [수정된 부분] ---
    } catch (error) {
      const errorKey = getErrorKey(error);
      const { language } = get();
      const errorMessage = locales[language][errorKey] || locales[language]['errorUnexpected'];
      get().showToast(errorMessage, 'error');
    // --- 👆 [여기까지] ---
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