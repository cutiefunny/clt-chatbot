/**
 * 발생한 오류 객체를 분석하여 다국어 처리를 위한 메시지 키를 반환합니다.
 * @param {Error} error - 발생한 오류 객체
 * @returns {string} - locales.js에서 사용할 메시지 키
 */
export function getErrorKey(error) {
    // 중앙 집중식 로깅
    console.error("An error occurred:", error); 

    // 네트워크 오류 (브라우저가 fetch 자체를 실패했을 때)
    if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
        return 'errorNetwork';
    }

    // 서버 응답 오류 (HTTP 상태 코드가 4xx, 5xx일 때)
    if (error.message.includes('Server error')) {
         return 'errorServer';
    }
    
    // 기타 예상치 못한 오류
    return 'errorUnexpected';
}