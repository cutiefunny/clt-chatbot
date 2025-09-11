'use client';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, deleteDoc, updateDoc } from 'firebase/firestore';

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
  // lastCheckedNotifications는 더 이상 읽음 처리 용도로 사용하지 않습니다.

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
  
  showToast: (message, type = 'info') => {
    set({ toast: { id: Date.now(), message, type, visible: true } });

    // Firestore에 저장 시 read: false 상태를 추가합니다.
    const dataToSave = { message, type, createdAt: serverTimestamp(), read: false };
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

  loadNotifications: (userId) => {
    const q = query(collection(get().db, "users", userId, "notifications"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // read: false인 알림이 있는지 확인하여 unread 상태를 결정합니다.
      const hasUnread = notifications.some(n => !n.read);
      set({ toastHistory: notifications, hasUnreadNotifications: hasUnread });
    }, (error) => {
        console.error("Error listening to notification changes:", error);
    });
    set({ unsubscribeNotifications: unsubscribe });
  },
  
  // --- 👇 [추가된 함수] ---
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

  handleEvents: (events) => {
      if (!events || !Array.isArray(events)) return;
      events.forEach(event => {
        if (event.type === 'toast') {
          get().showToast(event.message, event.toastType);
        }
      });
  },
  
  // --- 👇 [수정된 함수] ---
  // 모달을 닫을 때 더 이상 모든 알림을 읽음 처리하지 않습니다.
  closeNotificationModal: () => {
    set({ isNotificationModalOpen: false });
  },
});