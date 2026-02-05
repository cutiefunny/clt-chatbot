// app/lib/utils.js
// 공통 유틸리티 함수들

/**
 * localStorage에서 userId를 가져옵니다.
 * 따옴표를 제거하고 trim 처리합니다.
 * @returns {string} userId 또는 빈 문자열
 */
export function getUserId() {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("userId");
    return stored ? stored.replace(/['"]+/g, '').trim() : "";
  }
  return "";
}

/**
 * URL이 포함된 텍스트에서 특정 URL을 확인하고 새 창으로 엽니다.
 * @param {string} text - 확인할 텍스트
 * @param {string} targetUrl - 찾을 대상 URL
 */
export function checkAndOpenUrl(text, targetUrl) {
  if (typeof text === 'string' && text.includes(targetUrl)) {
    if (typeof window !== 'undefined') {
      console.log(`[AutoOpen] Target URL detected. Opening: ${targetUrl}`);
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    }
  }
}

/**
 * 쿼리 파라미터 문자열을 생성합니다.
 * @param {Object} params - 파라미터 객체
 * @returns {string} 쿼리 문자열
 */
export function buildQueryString(params) {
  return Object.entries(params)
    .filter(([_, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
}

/**
 * 임시 ID를 생성합니다.
 * @param {string} prefix - 접두사 (기본값: "temp_")
 * @returns {string} 임시 ID
 */
export function generateTempId(prefix = "temp_") {
  return `${prefix}${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}
