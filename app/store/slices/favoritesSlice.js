// app/store/slices/favoritesSlice.js
import { API_DEFAULTS } from "../../lib/constants";
import { getUserId, buildQueryString } from "../../lib/utils";

export const createFavoritesSlice = (set, get) => ({
  favorites: [],
  isFavoritesLoading: false,

  getQueryParams: () => {
    const userId = getUserId();
    return buildQueryString({
      usr_id: userId,
      ten_id: API_DEFAULTS.TENANT_ID,
      stg_id: API_DEFAULTS.STAGE_ID,
      sec_ofc_id: API_DEFAULTS.SEC_OFC_ID
    });
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