// app/store/slices/favoritesSlice.js
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  deleteDoc,
  doc,
  writeBatch,
} from "firebase/firestore";
import { getErrorKey } from "../../lib/errorHandler";
import { locales } from "../../lib/locales"; // 오류 메시지를 위해 추가

export const createFavoritesSlice = (set, get) => ({
  // State
  favorites: [],
  unsubscribeFavorites: null,

  // Actions
  loadFavorites: (userId) => {
    if (get().unsubscribeFavorites) {
      console.log("Favorites listener already active.");
      return;
    }

    const q = query(
      collection(get().db, "users", userId, "favorites"),
      orderBy("order", "asc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const favorites = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      set({ favorites });
    }, (error) => {
      console.error("Error listening to favorites changes:", error);
      const { language, showEphemeralToast } = get();
      const errorKey = getErrorKey(error);
      const message = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to load favorites.';
      showEphemeralToast(message, 'error');
    });
    set({ unsubscribeFavorites: unsubscribe });
  },

  addFavorite: async (favoriteData) => {
    const { user, favorites, maxFavorites, language, showEphemeralToast } = get();
    if (!user) return;

    if (favorites.length >= maxFavorites) {
      showEphemeralToast(locales[language]?.['최대 즐겨찾기 개수에 도달했습니다.'] || "Favorite limit reached.", "error");
      return;
    }

    try {
      const favoritesCollection = collection(
        get().db,
        "users",
        user.uid,
        "favorites"
      );
      const currentOrder = get().favorites.length;
      const dataToSave = {
        ...favoriteData,
        createdAt: serverTimestamp(),
        order: currentOrder,
      };
      await addDoc(favoritesCollection, dataToSave);
      // 성공 메시지는 toggleFavorite에서 처리
    } catch (error) {
      console.error("Error adding favorite to Firestore:", error);
      const errorKey = getErrorKey(error);
      const message = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to add favorite.';
      showEphemeralToast(message, 'error');
    }
  },

  updateFavoritesOrder: async (newOrder) => {
    const { user, favorites: originalOrder, language, showEphemeralToast } = get();
    if (!user) return;

    // 낙관적 UI 업데이트
    set({ favorites: newOrder });

    const batch = writeBatch(get().db);
    newOrder.forEach((fav, index) => {
      if (typeof fav.id !== 'string' || !fav.id) {
         console.error("Invalid favorite item found during order update:", fav);
         return;
      }
      const favRef = doc(get().db, "users", user.uid, "favorites", fav.id);
      batch.update(favRef, { order: index });
    });

    try {
      await batch.commit();
    } catch (error) {
      console.error("Error updating favorites order:", error);
      const errorKey = getErrorKey(error);
      const message = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to save new order.';
      showEphemeralToast(message, 'error');
      set({ favorites: originalOrder }); // 롤백
    }
  },

  deleteFavorite: async (favoriteId) => {
    const { user, favorites: originalFavorites, language, showEphemeralToast } = get();
    if (!user) return;

    const favoriteToDelete = originalFavorites.find(
      (fav) => fav.id === favoriteId
    );
    if (!favoriteToDelete) {
        console.warn(`Favorite with ID ${favoriteId} not found for deletion.`);
        return;
    }

    // 낙관적 UI 업데이트
    const newFavorites = originalFavorites
      .filter((fav) => fav.id !== favoriteId)
      .map((fav, index) => ({ ...fav, order: index }));
    set({ favorites: newFavorites });

    try {
      const favoriteRef = doc(
        get().db,
        "users",
        user.uid,
        "favorites",
        favoriteId
      );
      await deleteDoc(favoriteRef);

      const batch = writeBatch(get().db);
      newFavorites.forEach((fav) => {
         if (typeof fav.id !== 'string' || !fav.id) {
             console.error("Invalid favorite item found during reorder after delete:", fav);
             return;
         }
        const favRef = doc(get().db, "users", user.uid, "favorites", fav.id);
        batch.update(favRef, { order: fav.order });
      });
      await batch.commit();
      // 성공 메시지는 toggleFavorite에서 처리
    } catch (error) {
      console.error("Error deleting favorite:", error);
      const errorKey = getErrorKey(error);
      const message = locales[language]?.[errorKey] || locales['en']?.errorUnexpected || 'Failed to delete favorite.';
      showEphemeralToast(message, 'error');
      set({ favorites: originalFavorites }); // 롤백
    }
  },

  toggleFavorite: async (item) => {
    const {
      user,
      favorites,
      addFavorite,
      deleteFavorite,
      showEphemeralToast,
      maxFavorites,
      language,
    } = get();
    if (!user || !item?.action?.type || typeof item.action.value !== 'string' || !item.action.value.trim()) {
        console.warn("Invalid item provided to toggleFavorite:", item);
        return;
    }

    const valueToCompare = item.action.value.trim();
    const favoriteToDelete = favorites.find(
      (fav) =>
        fav.action?.type === item.action.type &&
        fav.action?.value?.trim() === valueToCompare
    );

    if (favoriteToDelete) {
      await deleteFavorite(favoriteToDelete.id);
      // 삭제 성공 여부 확인 (딜레이 후)
      setTimeout(() => {
          if (!get().favorites.find(f => f.id === favoriteToDelete.id)) {
              showEphemeralToast(locales[language]?.['즐겨찾기에서 삭제되었습니다.'] || "Removed from favorites.", "info");
          }
      }, 300);
    } else {
      if (favorites.length >= maxFavorites) {
        showEphemeralToast(locales[language]?.['최대 즐겨찾기 개수에 도달했습니다.'] || "Favorite limit reached.", "error");
        return;
      }
      if (!item.title || typeof item.title !== 'string' || !item.title.trim()) {
          console.warn("Cannot add favorite with empty title:", item);
          showEphemeralToast("Cannot add favorite with empty title.", "error");
          return;
      }
      const newFavorite = {
        icon: "🌟",
        title: item.title.trim(),
        description: item.description || "",
        action: { type: item.action.type, value: valueToCompare },
      };
      await addFavorite(newFavorite);
      // 추가 성공 여부 확인 (딜레이 후)
      setTimeout(() => {
          if (get().favorites.some(fav => fav.action.value === newFavorite.action.value && fav.action.type === newFavorite.action.type)) {
             showEphemeralToast(locales[language]?.['즐겨찾기에 추가되었습니다.'] || "Added to favorites.", "success");
          }
      }, 300);
    }
  },
});