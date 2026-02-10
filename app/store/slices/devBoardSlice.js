import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';

export const createDevBoardSlice = (set, get) => ({
  // State
  devMemos: [],
  unsubscribeDevMemos: null,

  // Actions
  loadDevMemos: () => {
    const q = query(collection(get().db, "dev-board"), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const memos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      set({ devMemos: memos });
    });
    set({ unsubscribeDevMemos: unsubscribe });
  },

  addDevMemo: async (text) => {
    const user = get().user;
    if (!user) return;
    await addDoc(collection(get().db, "dev-board"), {
      text,
      authorName: user.displayName,
      authorUid: user.uid,
      createdAt: serverTimestamp(),
    });
  },

  deleteDevMemo: async (memoId) => {
    const memoRef = doc(get().db, "dev-board", memoId);
    await deleteDoc(memoRef);
  },
});