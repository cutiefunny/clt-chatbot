// app/store/slices/favoritesSlice.js
import { fetchScenarioSessions } from "../../lib/api"; // 필요한 경우 추가

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export const createFavoritesSlice = (set, get) => ({
  favorites: [],
  isFavoritesLoading: false,

  // 공통 식별자 파라미터 생성 유틸리티
  getQueryParams: () => {
    const userId = get().getStoredUserId ? get().getStoredUserId() : (localStorage.getItem("userId")?.replace(/['"]+/g, '') || "");
    return `usr_id=${userId}&ten_id=1000&stg_id=DEV&sec_ofc_id=000025`;
  },

  /**
   * [수정] 즐겨찾기 목록 로드 (onSnapshot 대체)
   * GET /users/favorites
   */
  loadFavorites: async () => {
    set({ isFavoritesLoading: true });
    try {
      const response = await fetch(`${API_BASE_URL}/users/favorites?${get().getQueryParams()}`);
      if (response.ok) {
        const data = await response.json();
        set({ favorites: Array.isArray(data) ? data : [] });
      }
    } catch (error) {
      console.error("Error loading favorites:", error);
    } finally {
      set({ isFavoritesLoading: false });
    }
  },

  /**
   * [수정] 즐겨찾기 토글 (추가/삭제)
   * POST /users/favorites 또는 DELETE /users/favorites/{id}
   */
  toggleFavorite: async (item) => {
    const { favorites, showEphemeralToast } = get();
    const isFavorited = favorites.some(
      (fav) => fav.action.type === item.action.type && fav.action.value === item.action.value
    );

    try {
      if (isFavorited) {
        // 삭제 로직
        const target = favorites.find(
          (fav) => fav.action.type === item.action.type && fav.action.value === item.action.value
        );
        const response = await fetch(`${API_BASE_URL}/users/favorites/${target.id}?${get().getQueryParams()}`, {
          method: 'DELETE',
        });
        if (response.ok) {
          set({ favorites: favorites.filter((fav) => fav.id !== target.id) });
          showEphemeralToast("즐겨찾기에서 제거되었습니다.", "success");
        }
      } else {
        // 추가 로직
        const response = await fetch(`${API_BASE_URL}/users/favorites?${get().getQueryParams()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: item.title,
            description: item.description,
            action: item.action
          }),
        });
        if (response.ok) {
          const newFavorite = await response.json();
          set({ favorites: [...favorites, newFavorite] });
          showEphemeralToast("즐겨찾기에 추가되었습니다.", "success");
        }
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
      showEphemeralToast("즐겨찾기 업데이트에 실패했습니다.", "error");
    }
  },

  // 더 이상 사용하지 않는 리스너 함수는 빈 함수로 대체하여 오류 방지
  subscribeToFavorites: () => {
    console.log("[FavoritesSlice] Real-time subscription replaced by loadFavorites.");
    get().loadFavorites();
  },
  unsubscribeFavorites: () => {}
});