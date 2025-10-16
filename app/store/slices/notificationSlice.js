'use client';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, deleteDoc, updateDoc, where, limit } from 'firebase/firestore';

export const createNotificationSlice = (set, get) => ({
  // State
  toast: {
    visible: false,
    message: '',
    type: 'info',
  },
  toastHistory: [],
  unsubscribeNotifications: null,
  hasUnreadNotifications: false,
  unreadScenarioSessions: new Set(),
  unreadConversations: new Set(), // --- 👈 [추가]
  unsubscribeUnreadStatus: null,
  unsubscribeUnreadScenarioNotifications: null,


  // Actions
  deleteNotification: async (notificationId) => {
    const user = get().user;
    if (!user) return;

    if (typeof notificationId !== 'string' || !notificationId) {
        console.error("Delete failed: Invalid notificationId provided.", notificationId);
        get().showToast("Failed to delete notification due to an invalid ID.", "error");
        return;
    }

    try {
        const notificationRef = doc(get().db, "users", user.uid, "notifications", notificationId);
        await deleteDoc(notificationRef);
    } catch (error) {
        console.error("Error deleting notification from Firestore:", error);
        get().showToast("Failed to delete notification.", "error");
    }
  },
  
  showToast: (message, type = 'info', scenarioSessionId = null, conversationId = null) => {
    set({ toast: { id: Date.now(), message, type, visible: true } });

    const dataToSave = { 
        message, 
        type, 
        createdAt: serverTimestamp(), 
        read: false,
        scenarioSessionId,
        conversationId,
    };
    get().saveNotification(dataToSave); 

    setTimeout(() => set(state => ({ toast: { ...state.toast, visible: false } })), 3000);
  },

  saveNotification: async (toastData) => {
    const user = get().user;
    if (!user) return;
    try {
      const notificationsCollection = collection(get().db, "users", user.uid, "notifications");
      await addDoc(notificationsCollection, toastData);
    } catch (error) {
      console.error("Error saving notification to Firestore:", error);
    }
  },

  loadNotificationHistory: (userId) => {
    if (get().unsubscribeNotifications) return; 
    const q = query(collection(get().db, "users", userId, "notifications"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      set({ toastHistory: notifications });
    }, (error) => {
        console.error("Error listening to notification changes:", error);
    });
    set({ unsubscribeNotifications: unsubscribe });
  },

  subscribeToUnreadStatus: (userId) => {
    const q = query(
      collection(get().db, "users", userId, "notifications"),
      where("read", "==", false),
      limit(1)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      set({ hasUnreadNotifications: !snapshot.empty });
    }, (error) => {
      console.error("Error listening to unread status:", error);
    });
    set({ unsubscribeUnreadStatus: unsubscribe });
  },

  // --- 👇 [수정된 부분] ---
  subscribeToUnreadScenarioNotifications: (userId) => {
    const q = query(
      collection(get().db, "users", userId, "notifications"),
      where("read", "==", false)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const unreadSessions = new Set();
      const unreadConvos = new Set();
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.scenarioSessionId) {
          unreadSessions.add(data.scenarioSessionId);
          if (data.conversationId) {
            unreadConvos.add(data.conversationId);
          }
        }
      });
      set({ 
        unreadScenarioSessions: unreadSessions,
        unreadConversations: unreadConvos 
      });
    }, (error) => {
      console.error("Error listening to unread scenario notifications:", error);
    });
    set({ unsubscribeUnreadScenarioNotifications: unsubscribe });
  },
  // --- 👆 [여기까지] ---
  
  markNotificationAsRead: async (notificationId) => {
    const user = get().user;
    if (!user) return;

    const notificationRef = doc(get().db, "users", user.uid, "notifications", notificationId);
    try {
      await updateDoc(notificationRef, { read: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  },

  handleEvents: (events, scenarioSessionId = null, conversationId = null) => {
      if (!events || !Array.isArray(events)) return;
      events.forEach(event => {
        if (event.type === 'toast') {
          get().showToast(event.message, event.toastType, scenarioSessionId, conversationId);
        }
      });
  },
  
  openNotificationModal: () => {
    const user = get().user;
    if (user) {
      get().loadNotificationHistory(user.uid);
    }
    set({ isNotificationModalOpen: true });
  },

  closeNotificationModal: () => {
    get().unsubscribeNotifications?.();
    set({ isNotificationModalOpen: false, unsubscribeNotifications: null });
  },
});