// app/store/slices/notificationSlice.js
import { fetchNotifications, markNotificationAsRead } from "../../lib/api";
import { handleError } from "../../lib/errorHandler";

export const createNotificationSlice = (set, get) => ({
  notifications: [],
  unreadCount: 0,

  /**
   * [수정] 알림 목록 로드 (onSnapshot 대체)
   * GET /users/notifications
   */
  loadNotifications: async () => {
    try {
      const data = await fetchNotifications();
      const unread = data.filter(n => !n.is_read).length;
      set({ 
        notifications: Array.isArray(data) ? data : [],
        unreadCount: unread
      });
    } catch (error) {
      handleError("Error loading notifications", error);
    }
  },

  /**
   * [수정] 알림 읽음 처리
   * PATCH /users/notifications/{id}
   */
  markAsRead: async (notificationId) => {
    try {
      const result = await markNotificationAsRead(notificationId);
      
      if (result) {
        set((state) => {
          const updated = state.notifications.map(n => 
            n.id === notificationId ? { ...n, is_read: true } : n
          );
          return {
            notifications: updated,
            unreadCount: updated.filter(n => !n.is_read).length
          };
        });
      }
    } catch (error) {
      handleError("Error marking notification as read", error);
    }
  },

  // 리스너 관련 함수 정리
  subscribeToNotifications: () => {
    get().loadNotifications();
  },
  unsubscribeNotifications: () => {}
});