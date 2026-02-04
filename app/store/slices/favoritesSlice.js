// app/store/slices/favoritesSlice.js

export const createFavoritesSlice = (set, get) => ({
  favorites: [],
  isFavoritesLoading: false,

  getQueryParams: () => {
    const userId = typeof window !== "undefined" 
      ? (localStorage.getItem("userId")?.replace(/['"]+/g, '') || "")
      : "";
    return `usr_id=${userId}&ten_id=1000&stg_id=DEV&sec_ofc_id=000025`;
  },

  // [나중 구현] 현재는 빈 함수로 두어 404 방지
  loadFavorites: async () => {
    console.log("[FavoritesSlice] loadFavorites is currently disabled.");
    return;
  },

  toggleFavorite: async (item) => {
    // 기능 활성화 시 구현 예정
    console.log("[FavoritesSlice] toggleFavorite is currently disabled.");
  },

  subscribeToFavorites: () => {},
  unsubscribeFavorites: () => {}
});