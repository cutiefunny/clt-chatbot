// app/lib/logger.js
// 환경별 로깅 유틸리티

const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * 로그 레벨 설정
 * - 'all': 모든 로그 출력 (개발 중 디버깅용)
 * - 'errors_only': 에러만 출력 (프로덕션)
 * - 'none': 로그 비활성화
 */
const LOG_LEVEL = isDevelopment ? 'all' : 'errors_only';

/**
 * 로깅을 활성화할지 결정
 */
const shouldLog = (level) => {
  if (LOG_LEVEL === 'none') return false;
  if (LOG_LEVEL === 'errors_only') return level === 'error';
  return true; // 'all'
};

/**
 * Logger 유틸리티 객체
 */
export const logger = {
  /**
   * 일반 정보 로그
   * @param {string} message - 로그 메시지
   * @param {any} data - 추가 데이터 (선택사항)
   */
  log: (message, data = null) => {
    if (!shouldLog('log')) return;
    if (data !== null) {
      console.log(`[INFO] ${message}`, data);
    } else {
      console.log(`[INFO] ${message}`);
    }
  },

  /**
   * 경고 로그
   * @param {string} message - 경고 메시지
   * @param {any} data - 추가 데이터 (선택사항)
   */
  warn: (message, data = null) => {
    if (!shouldLog('warn')) return;
    if (data !== null) {
      console.warn(`[WARN] ${message}`, data);
    } else {
      console.warn(`[WARN] ${message}`);
    }
  },

  /**
   * 에러 로그
   * @param {string} message - 에러 메시지
   * @param {Error|any} error - 에러 객체 또는 데이터
   */
  error: (message, error = null) => {
    if (!shouldLog('error')) return;
    if (error instanceof Error) {
      console.error(`[ERROR] ${message}`, error.message, error.stack);
    } else if (error !== null) {
      console.error(`[ERROR] ${message}`, error);
    } else {
      console.error(`[ERROR] ${message}`);
    }
  },

  /**
   * 디버그 로그 (개발 중에만)
   * @param {string} message - 디버그 메시지
   * @param {any} data - 추가 데이터
   */
  debug: (message, data = null) => {
    if (!isDevelopment || !shouldLog('debug')) return;
    if (data !== null) {
      console.debug(`[DEBUG] ${message}`, data);
    } else {
      console.debug(`[DEBUG] ${message}`);
    }
  },

  /**
   * 그룹 로그 시작 (개발 중에만)
   * @param {string} label - 그룹 라벨
   */
  group: (label) => {
    if (!isDevelopment || !shouldLog('log')) return;
    console.group(`[GROUP] ${label}`);
  },

  /**
   * 그룹 로그 종료
   */
  groupEnd: () => {
    if (!isDevelopment || !shouldLog('log')) return;
    console.groupEnd();
  },

  /**
   * 테이블 형식으로 로그 출력
   * @param {any} data - 테이블 데이터
   */
  table: (data) => {
    if (!isDevelopment || !shouldLog('log')) return;
    console.table(data);
  },
};

export default logger;
