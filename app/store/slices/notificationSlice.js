import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';

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
  lastCheckedNotifications: null,

  // Actions
  showToast: (message, type = 'info') => {
    const newToast = { id: Date.now(), message, type, createdAt: serverTimestamp() };
    set({ toast: { ...newToast, visible: true } });
    get().saveNotification(newToast);
    setTimeout(() => set(state => ({ toast: { ...state.toast, visible: false } })), 3000);
  },

  saveNotification: async (toastData) => {
    const user = get().user;
    if (!user) return;
    try {
      const notificationsCollection = collection(get().db, "users", user.uid, "notifications");
      const { visible, ...dataToSave } = toastData;
      await addDoc(notificationsCollection, dataToSave);
    } catch (error) {
      console.error("Error saving notification:", error);
    }
  },

  loadNotifications: (userId) => {
    const q = query(collection(get().db, "users", userId, "notifications"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const lastChecked = get().lastCheckedNotifications;
      const hasUnread = notifications.some(n => n.createdAt?.toDate().getTime() > lastChecked);
      set({ toastHistory: notifications, hasUnreadNotifications: hasUnread });
    });
    set({ unsubscribeNotifications: unsubscribe });
    
    // Load last checked time from local storage or set it
    const lastChecked = localStorage.getItem(`lastChecked_${userId}`);
    set({ lastCheckedNotifications: lastChecked ? parseInt(lastChecked, 10) : Date.now() });
  },
  
  handleEvents: (events) => {
      if (!events || !Array.isArray(events)) return;
      events.forEach(event => {
        if (event.type === 'toast') {
          get().showToast(event.message, event.toastType);
        }
      });
  },
  
  closeNotificationModal: () => {
    const userId = get().user?.uid;
    const now = Date.now();
    set({ isNotificationModalOpen: false, hasUnreadNotifications: false, lastCheckedNotifications: now });
    if(userId) {
        localStorage.setItem(`lastChecked_${userId}`, now.toString());
    }
  },
});