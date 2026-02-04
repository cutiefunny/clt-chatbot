import { fetchDevMemos, createDevMemo, deleteDevMemo } from '../../lib/api';

export const createDevBoardSlice = (set, get) => ({
  // State
  devMemos: [],
  devMemosInterval: null,

  // Actions
  loadDevMemos: async () => {
    try {
      const memos = await fetchDevMemos();
      set({ devMemos: memos });
    } catch (error) {
      console.error("Error loading dev memos:", error);
      set({ devMemos: [] });
    }
  },

  // 주기적으로 메모 로드 (폴링 방식)
  startDevMemosPolling: (intervalMs = 5000) => {
    get().loadDevMemos(); // 즉시 로드
    const interval = setInterval(() => {
      get().loadDevMemos();
    }, intervalMs);
    set({ devMemosInterval: interval });
  },

  stopDevMemosPolling: () => {
    const interval = get().devMemosInterval;
    if (interval) {
      clearInterval(interval);
      set({ devMemosInterval: null });
    }
  },

  addDevMemo: async (text) => {
    const user = get().user;
    if (!user) return;
    
    try {
      await createDevMemo({
        text,
        authorName: user.displayName,
        authorUid: user.uid,
        createdAt: new Date().toISOString(),
      });
      // 메모 추가 후 목록 다시 로드
      await get().loadDevMemos();
    } catch (error) {
      console.error("Error adding dev memo:", error);
    }
  },

  deleteDevMemo: async (memoId) => {
    try {
      await deleteDevMemo(memoId);
      // 메모 삭제 후 목록 다시 로드
      await get().loadDevMemos();
    } catch (error) {
      console.error("Error deleting dev memo:", error);
    }
  },
});