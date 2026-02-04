// app/store/slices/notificationSlice.js

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export const createNotificationSlice = (set, get) => ({
  notifications: [],
  unreadCount: 0,

  /**
   * [수정] 알림 목록 로드 (onSnapshot 대체)
   * GET /users/notifications
   */
  loadNotifications: async () => {
    try {
      const userId = localStorage.getItem("userId")?.replace(/['"]+/g, '') || "";
      const query = `usr_id=${userId}&ten_id=1000&stg_id=DEV&sec_ofc_id=000025`;
      
      const response = await fetch(`${API_BASE_URL}/users/notifications?${query}`);
      if (response.ok) {
        const data = await response.json();
        const unread = data.filter(n => !n.is_read).length;
        set({ 
          notifications: Array.isArray(data) ? data : [],
          unreadCount: unread
        });
      }
    } catch (error) {
      console.error("Error loading notifications:", error);
    }
  },

  /**
   * [수정] 알림 읽음 처리
   * PATCH /users/notifications/{id}
   */
  markAsRead: async (notificationId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/notifications/${notificationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_read: true })
      });

      if (response.ok) {
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
      console.error("Error marking notification as read:", error);
    }
  },

  // 리스너 관련 함수 정리
  subscribeToNotifications: () => {
    get().loadNotifications();
  },
  unsubscribeNotifications: () => {}
});