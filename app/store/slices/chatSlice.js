import { collection, addDoc, query, orderBy, onSnapshot, getDocs, serverTimestamp, deleteDoc, doc, updateDoc, limit, startAfter, where, writeBatch } from 'firebase/firestore';
import { locales } from '../../lib/locales';
import { getErrorKey } from '../../lib/errorHandler';

const MESSAGE_LIMIT = 15;

const getInitialMessages = (lang = 'ko') => {
  return [{ id: 'initial', sender: 'bot', text: locales[lang].initialBotMessage }];
};

const responseHandlers = {
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
  
  favorites: [],
  unsubscribeFavorites: null,

  unsubscribeAllMessagesAndScenarios: () => {
    get().unsubscribeMessages?.();
    const scenariosMap = get().unsubscribeScenariosMap;
    Object.values(scenariosMap).forEach(unsub => unsub());
    set({
      unsubscribeMessages: null,
      unsubscribeScenariosMap: {},
      scenarioStates: {},
      activeScenarioSessions: [],
      activeScenarioSessionId: null,
      activePanel: 'main',
    });
  },

  loadFavorites: (userId) => {
    const q = query(collection(get().db, "users", userId, "favorites"), orderBy("order", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const favorites = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      set({ favorites });
    });
    set({ unsubscribeFavorites: unsubscribe });
  },

  addFavorite: async (favoriteData) => {
    const user = get().user;
    if (!user) return;
    
    if (get().favorites.length >= get().maxFavorites) {
        get().showEphemeralToast('최대 즐겨찾기 개수에 도달했습니다.', 'error');
        return;
    }

    const favoritesCollection = collection(get().db, "users", user.uid, "favorites");
    await addDoc(favoritesCollection, {
      ...favoriteData,
      createdAt: serverTimestamp(),
      order: get().favorites.length,
    });
  },

  updateFavoritesOrder: async (newOrder) => {
    const user = get().user;
    if (!user) return;

    const originalOrder = get().favorites; 
    set({ favorites: newOrder }); 

    const batch = writeBatch(get().db);
    newOrder.forEach((fav, index) => {
        const favRef = doc(get().db, "users", user.uid, "favorites", fav.id);
        batch.update(favRef, { order: index });
    });

    try {
        await batch.commit(); 
    } catch (error) {
        console.error("Error updating favorites order:", error);
        get().showEphemeralToast("Failed to save new order.", "error");
        set({ favorites: originalOrder }); 
    }
  },

  deleteFavorite: async (favoriteId) => {
    const user = get().user;
    if (!user) return;

    const originalFavorites = get().favorites;
    const favoriteToDelete = originalFavorites.find(fav => fav.id === favoriteId);
    if (!favoriteToDelete) return;

    const newFavorites = originalFavorites
        .filter(fav => fav.id !== favoriteId)
        .map((fav, index) => ({ ...fav, order: index }));

    set({ favorites: newFavorites }); 

    try {
        const favoriteRef = doc(get().db, "users", user.uid, "favorites", favoriteId);
        await deleteDoc(favoriteRef); 

        const batch = writeBatch(get().db);
        newFavorites.forEach((fav) => {
            const favRef = doc(get().db, "users", user.uid, "favorites", fav.id);
            batch.update(favRef, { order: fav.order });
        });
        await batch.commit();
    } catch (error) {
        console.error("Error deleting favorite:", error);
        get().showEphemeralToast("Failed to delete favorite.", "error");
        set({ favorites: originalFavorites });
    }
  },

  toggleFavorite: async (item) => {
    const { user, favorites, addFavorite, deleteFavorite, showEphemeralToast, maxFavorites } = get();
    if (!user || !item?.action?.value) return;

    const favoriteToDelete = favorites.find(fav => 
        fav.action.type === item.action.type && 
        fav.action.value === item.action.value
    );

    if (favoriteToDelete) {
      await deleteFavorite(favoriteToDelete.id);
      showEphemeralToast('즐겨찾기에서 삭제되었습니다.', 'info');
    } else {
      if (favorites.length >= maxFavorites) {
        showEphemeralToast('최대 즐겨찾기 개수에 도달했습니다.', 'error');
        return;
      }
      const newFavorite = {
        icon: '🌟',
        title: item.title,
        description: item.description,
        action: item.action,
      };
      await addFavorite(newFavorite);
      showEphemeralToast('즐겨찾기에 추가되었습니다.', 'success');
    }
  },

  handleShortcutClick: async (item) => {
    if (!item || !item.action) return;
    
    if (item.action.type === 'custom') {
        await get().handleResponse({ text: item.action.value, displayText: item.title });
    } else { 
        get().openScenarioPanel(item.action.value);
    }
  },

  toggleConversationExpansion: (conversationId) => {
    const { expandedConversationId, unsubscribeScenariosMap, user } = get();
    
    if (expandedConversationId === conversationId) {
      unsubscribeScenariosMap[conversationId]?.();
      const newMap = { ...unsubscribeScenariosMap };
      delete newMap[conversationId];
      set({ expandedConversationId: null, unsubscribeScenariosMap: newMap });
      return;
    }
    
    if (expandedConversationId && unsubscribeScenariosMap[expandedConversationId]) {
        unsubscribeScenariosMap[expandedConversationId]();
        const newMap = { ...unsubscribeScenariosMap };
        delete newMap[expandedConversationId];
        set({ unsubscribeScenariosMap: newMap });
    }
    
    set({ expandedConversationId: conversationId });

    if (!user) return;
    
    const scenariosRef = collection(get().db, "chats", user.uid, "conversations", conversationId, "scenario_sessions");
    const q = query(scenariosRef, orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const scenarios = snapshot.docs.map(doc => ({ sessionId: doc.id, ...doc.data() }));
        set(state => ({
            scenariosForConversation: {
                ...state.scenariosForConversation,
                [conversationId]: scenarios,
            }
        }));
    });
    
    set(state => ({
        unsubscribeScenariosMap: {
            ...state.unsubscribeScenariosMap,
            [conversationId]: unsubscribe,
        }
    }));
  },

  loadConversations: (userId) => {
    const q = query(collection(get().db, "chats", userId, "conversations"), orderBy("pinned", "desc"), orderBy("updatedAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const conversations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      set({ conversations });
    });
    set({ unsubscribeConversations: unsubscribe });
  },

  loadConversation: async (conversationId) => {
    const user = get().user;
    if (!user || get().currentConversationId === conversationId) return;

    get().unsubscribeAllMessagesAndScenarios();

    const { language } = get();
    const initialMessage = getInitialMessages(language)[0];
    
    set({ 
        currentConversationId: conversationId, 
        isLoading: true, 
        messages: [initialMessage], 
        lastVisibleMessage: null,
        hasMoreMessages: true,
        expandedConversationId: null,
    });

    const messagesRef = collection(get().db, "chats", user.uid, "conversations", conversationId, "messages");
    const q = query(messagesRef, orderBy("createdAt", "desc"), limit(MESSAGE_LIMIT));
    
    const unsubscribeMessages = onSnapshot(q, (messagesSnapshot) => {
        const newMessages = messagesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).reverse();
        const lastVisible = messagesSnapshot.docs[messagesSnapshot.docs.length - 1];
        
        set(state => ({
            messages: [initialMessage, ...newMessages],
            lastVisibleMessage: lastVisible,
            hasMoreMessages: messagesSnapshot.docs.length === MESSAGE_LIMIT,
            isLoading: false,
        }));
    });

    set({ unsubscribeMessages });

    const scenariosRef = collection(get().db, "chats", user.uid, "conversations", conversationId, "scenario_sessions");
    const scenariosQuery = query(scenariosRef); // No "where" clause, load all
    const scenariosSnapshot = await getDocs(scenariosQuery);

    scenariosSnapshot.forEach(doc => {
        get().subscribeToScenarioSession(doc.id);
    });
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
        const existingMessages = messages.slice(1);

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

  createNewConversation: async (returnId = false) => {
    if (get().currentConversationId === null && !returnId) return;

    get().unsubscribeAllMessagesAndScenarios();

    const { language, user } = get();

    if (returnId && user) {
        const conversationRef = await addDoc(collection(get().db, "chats", user.uid, "conversations"), {
            title: 'New Conversation',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            pinned: false,
        });
        get().loadConversation(conversationRef.id);
        return conversationRef.id;
    } else {
        set({ 
            messages: getInitialMessages(language), 
            currentConversationId: null, 
            lastVisibleMessage: null,
            hasMoreMessages: true,
            expandedConversationId: null,
        });
        return null;
    }
  },

  deleteConversation: async (conversationId) => {
    const user = get().user;
    if (!user) return;
  
    const conversationRef = doc(get().db, "chats", user.uid, "conversations", conversationId);
    const batch = writeBatch(get().db);
  
    // 시나리오 세션 삭제를 배치에 추가
    const scenariosRef = collection(conversationRef, "scenario_sessions");
    const scenariosSnapshot = await getDocs(scenariosRef);
    scenariosSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });
  
    // 메시지 삭제를 배치에 추가
    const messagesRef = collection(conversationRef, "messages");
    const messagesSnapshot = await getDocs(messagesRef);
    messagesSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });
  
    // 대화 자체 삭제를 배치에 추가
    batch.delete(conversationRef);
  
    // 배치 실행
    await batch.commit();
  
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

  pinConversation: async (conversationId, pinned) => {
    const user = get().user;
    if (!user) return;
    const conversationRef = doc(get().db, "chats", user.uid, "conversations", conversationId);
    await updateDoc(conversationRef, { pinned });
  },

  saveMessage: async (message) => {
    const user = get().user;
    if (!user) return;
    let conversationId = get().currentConversationId;
    if (!conversationId) {
      const firstMessageContent = message.text || 'New Conversation';
      const conversationRef = await addDoc(collection(get().db, "chats", user.uid, "conversations"), {
        title: firstMessageContent.substring(0, 30),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        pinned: false,
      });
      conversationId = conversationRef.id;
      get().loadConversation(conversationId);
      // Wait for the conversation to be loaded before proceeding
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const { id, ...messageToSave } = message;

    Object.keys(messageToSave).forEach(key => (messageToSave[key] === undefined) && delete messageToSave[key]);
      if (messageToSave.node) {
        const { data, ...rest } = messageToSave.node;
        messageToSave.node = { ...rest, data: { content: data?.content, replies: data?.replies } };
      }
    const messagesCollection = collection(get().db, "chats", user.uid, "conversations", get().currentConversationId, "messages");
    await addDoc(messagesCollection, { ...messageToSave, createdAt: serverTimestamp() });
    await updateDoc(doc(get().db, "chats", user.uid, "conversations", get().currentConversationId), { updatedAt: serverTimestamp() });
  },

  addMessage: async (sender, messageData) => {
    let newMessage;
    if (sender === 'user') {
      newMessage = { id: Date.now(), sender, ...messageData };
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
    set(state => ({ messages: [...state.messages, newMessage] }));
    if (!newMessage.isStreaming) {
      await get().saveMessage(newMessage);
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

    const textForUser = messagePayload.displayText || messagePayload.text;
    if (textForUser) {
      await get().addMessage('user', { text: textForUser });
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: { text: messagePayload.text },
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
            if(data.type !== 'scenario_start' && data.type !== 'scenario') {
                 console.warn(`[ChatStore] Unhandled response type: ${data.type}`);
            }
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
            const content = message.text || '';
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