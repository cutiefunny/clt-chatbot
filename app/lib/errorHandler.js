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

/**
 * 공통 에러 처리 유틸리티
 * @param {string} context - 에러 발생 컨텍스트 (예: "Error loading conversations")
 * @param {Error} error - 에러 객체
 * @param {Object} options - 추가 옵션
 * @param {Function} options.onError - 에러 발생 시 실행할 콜백 함수
 * @param {boolean} options.showToast - 토스트 메시지 표시 여부
 * @param {Function} options.getStore - zustand store getter 함수
 */
export function handleError(context, error, options = {}) {
    const { onError, showToast = false, getStore } = options;
    
    // 에러 로깅
    console.error(`${context}:`, error);
    
    // 에러 콜백 실행
    if (onError && typeof onError === 'function') {
        onError(error);
    }
    
    // 토스트 메시지 표시
    if (showToast && getStore) {
        const errorKey = getErrorKey(error);
        getStore().showEphemeralToast(errorKey, 'error');
    }
    
    return error;
}

/**
 * async 함수를 try-catch로 감싸는 헬퍼
 * @param {Function} fn - 실행할 async 함수
 * @param {string} context - 에러 컨텍스트
 * @param {Object} options - handleError에 전달할 옵션
 * @returns {Function} - 래핑된 함수
 */
export function withErrorHandler(fn, context, options = {}) {
    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            handleError(context, error, options);
            throw error;
        }
    };
}