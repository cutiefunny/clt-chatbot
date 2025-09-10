import { GoogleAuthProvider, signInWithPopup, signOut } from '../../lib/firebase';

export const createAuthSlice = (set, get) => ({
  user: null,

  login: async () => {
    try {
      await signInWithPopup(get().auth, new GoogleAuthProvider());
    } catch (error) {
      console.error("Login failed:", error);
    }
  },

  logout: async () => {
    try {
        await signOut(get().auth);
    } catch (error) {
        console.error("Logout failed:", error);
    }
  },
});