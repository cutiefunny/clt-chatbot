import { GoogleAuthProvider, signInWithPopup, signOut } from '../../lib/firebase';

export const createAuthSlice = (set, get) => ({
  user: null,

  loginWithGoogle: async () => {
    try {
      await signInWithPopup(get().auth, new GoogleAuthProvider());
    } catch (error) {
      console.error("Login with Google failed:", error);
    }
  },

  loginWithTestId: (userId) => {
    if (!userId || !userId.trim()) {
      console.error("Test User ID cannot be empty.");
      // You can also show a toast message to the user here.
      return;
    }
    const mockUser = {
      uid: userId.trim(),
      displayName: `Test User (${userId.trim()})`,
      email: `${userId.trim()}@test.com`,
      photoURL: '/images/avatar.png',
      isTestUser: true, // Flag to identify this special user
    };
    // This function is defined in the main store file (store/index.js)
    get().setUserAndLoadData(mockUser);
  },

  logout: async () => {
    try {
      if (get().user?.isTestUser) {
        // For test users, just clear the data locally
        get().clearUserAndData();
      } else {
        // For real Firebase users, signing out will trigger onAuthStateChanged, which handles the cleanup
        await signOut(get().auth);
      }
    } catch (error) {
        console.error("Logout failed:", error);
    }
  },
});
