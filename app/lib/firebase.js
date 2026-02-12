/**
 * @deprecated
 * Firestore 마이그레이션이 완료되어 Firebase/Firestore는 더 이상 사용하지 않습니다.
 * 이 파일은 과거 레거시 import가 남아있을 때의 빌드 실패를 막기 위한 스텁입니다.
 */

export const db = null;

const deprecated = (name) => {
  throw new Error(`[firebase.js] Deprecated API used: ${name}. Firestore has been removed.`);
};

export const serverTimestamp = () => deprecated("serverTimestamp");
export const deleteDoc = () => deprecated("deleteDoc");
export const doc = () => deprecated("doc");
export const getDoc = () => deprecated("getDoc");
export const setDoc = () => deprecated("setDoc");
export const updateDoc = () => deprecated("updateDoc");
export const limit = () => deprecated("limit");
export const startAfter = () => deprecated("startAfter");
export const collection = () => deprecated("collection");
export const addDoc = () => deprecated("addDoc");
export const getDocs = () => deprecated("getDocs");
export const writeBatch = () => deprecated("writeBatch");