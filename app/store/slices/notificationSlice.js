// app/store/slices/notificationSlice.js

'use client';
import { openLinkThroughParent } from '../../lib/parentMessaging';

const STORAGE_KEY_PREFIX = "notifications_v1";

function getStorageKey(userId) {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

function safeReadNotifications(userId) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(getStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWriteNotifications(userId, notifications) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify(notifications));
  } catch {
    // ignore
  }
}

function sortByCreatedAtDesc(items) {
  return [...items].sort((a, b) => {
    const aT = new Date(a.createdAt || a.created_at || 0).getTime();
    const bT = new Date(b.createdAt || b.created_at || 0).getTime();
    return bT - aT;
  });
}

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
  unreadConversations: new Set(),
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
      const existing = safeReadNotifications(user.uid);
      const next = existing.filter((n) => String(n.id) !== String(notificationId));
      safeWriteNotifications(user.uid, next);

      // UI 동기화
      set({ toastHistory: sortByCreatedAtDesc(next) });
    } catch (error) {
      console.error("Error deleting notification from localStorage:", error);
      get().showToast("Failed to delete notification.", "error");
    }
  },

  showToast: (message, type = 'info', scenarioSessionId = null, conversationId = null) => {
    set({ toast: { id: Date.now(), message, type, visible: true } });

    const dataToSave = {
      id: `notif_${Date.now()}`,
      message,
      type,
      createdAt: new Date().toISOString(),
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
      const existing = safeReadNotifications(user.uid);
      const next = sortByCreatedAtDesc([toastData, ...existing]);
      safeWriteNotifications(user.uid, next);

      // 즉시 UI 반영
      set({ toastHistory: next });
    } catch (error) {
      console.error("Error saving notification to localStorage:", error);
    }
  },

  loadNotificationHistory: (userId) => {
    if (get().unsubscribeNotifications) return;

    // 최초 로드
    const initial = sortByCreatedAtDesc(safeReadNotifications(userId));
    set({ toastHistory: initial });

    // localStorage 기반 폴링 (Firestore onSnapshot 대체)
    const intervalId = window.setInterval(() => {
      const items = sortByCreatedAtDesc(safeReadNotifications(userId));
      set({ toastHistory: items });
    }, 2000);

    set({
      unsubscribeNotifications: () => {
        window.clearInterval(intervalId);
      },
    });
  },

  subscribeToUnreadStatus: (userId) => {
    if (get().unsubscribeUnreadStatus) return;

    const intervalId = window.setInterval(() => {
      const items = safeReadNotifications(userId);
      set({ hasUnreadNotifications: items.some((n) => n && n.read === false) });
    }, 2000);

    set({
      unsubscribeUnreadStatus: () => {
        window.clearInterval(intervalId);
      },
    });
  },

  subscribeToUnreadScenarioNotifications: (userId) => {
    if (get().unsubscribeUnreadScenarioNotifications) return;

    const intervalId = window.setInterval(() => {
      const items = safeReadNotifications(userId).filter((n) => n && n.read === false);
      const unreadSessions = new Set();
      const unreadConvos = new Set();
      items.forEach((n) => {
        if (n.scenarioSessionId) {
          unreadSessions.add(n.scenarioSessionId);
          if (n.conversationId) unreadConvos.add(n.conversationId);
        }
      });
      set({ unreadScenarioSessions: unreadSessions, unreadConversations: unreadConvos });
    }, 2000);

    set({
      unsubscribeUnreadScenarioNotifications: () => {
        window.clearInterval(intervalId);
      },
    });
  },

  markNotificationAsRead: async (notificationId) => {
    const user = get().user;
    if (!user) return;
    try {
      const existing = safeReadNotifications(user.uid);
      const next = existing.map((n) =>
        String(n.id) === String(notificationId) ? { ...n, read: true } : n
      );
      safeWriteNotifications(user.uid, next);

      // 즉시 UI 반영
      set({ toastHistory: sortByCreatedAtDesc(next) });
    } catch (error) {
      console.error("Error marking notification as read (localStorage):", error);
    }
  },

  handleEvents: (events, scenarioSessionId = null, conversationId = null) => {
      if (!events || !Array.isArray(events)) return;
      events.forEach(event => {
        if (event.type === 'toast') {
          get().showToast(event.message, event.toastType, scenarioSessionId, conversationId);
        } else if (event.type === 'open_link' && event.url) { // 'open_link' 이벤트 처리 추가
          if (typeof window !== 'undefined') {
            window.open(event.url, '_blank', 'noopener,noreferrer');
            console.log(`[handleEvents] Opened link: ${event.url}`);
          } else {
             console.warn("[handleEvents] Cannot open link: window object not available.");
             return;
          }
          const didSend = openLinkThroughParent(event.url);
          if (!didSend) {
            console.warn('[handleEvents] Parent window not reachable. Opened link in a new tab.');
          }
          console.log(`[handleEvents] Opened link: ${event.url}`);
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

  handleNotificationNavigation: async (notification) => {
    // 알림 클릭 시 대화 로드 및 스크롤 처리
    get().closeNotificationModal(); // uiSlice
    get().markNotificationAsRead(notification.id); // notificationSlice

    if (notification.conversationId) { // 대화 ID가 있는 경우
      if (get().currentConversationId !== notification.conversationId) { // conversationSlice 상태 참조
        await get().loadConversation(notification.conversationId); // conversationSlice 액션 호출
      }
      // 시나리오 세션 ID가 있으면 해당 메시지로 스크롤
      if (notification.scenarioSessionId) {
        // 약간의 지연 후 스크롤 시도 (대화 로딩 완료 시간 확보)
        setTimeout(() => { get().setScrollToMessageId(notification.scenarioSessionId); }, 300); // uiSlice 액션 호출
      }
    }
  },
});