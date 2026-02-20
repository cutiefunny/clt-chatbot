# FastAPI 명세 준수 개선 가이드

**작성일**: 2026-02-20  
**목표**: 현재 83% 준수율 → 95% 이상 달성  
**예상 작업량**: 8-10시간

---

## 🔧 Phase 1: Critical Fixes (1-2주)

### Fix 1: 세션 삭제 기능 추가

**파일**: `app/lib/api.js`  
**위치**: Line 480 이후 추가

**문제**: DELETE 엔드포인트 완전 미구현  
**영향**: 시나리오 세션이 DB에서 삭제되지 않음

```javascript
/**
 * ==============================================================================
 * 시나리오 세션 삭제 (추가)
 * ==============================================================================
 */

export async function deleteScenarioSession(conversationId, sessionId) {
  const userId = getUserId();
  const url = buildUrl(`/conversations/${conversationId}/scenario-sessions/${sessionId}`, { 
    usr_id: userId 
  });
  
  try {
    const res = await fetch(url, { 
      method: "DELETE", 
      headers: getHeaders() 
    });
    
    if (res.status === 204) {
      // 204 No Content - 성공
      console.log(`[API] Scenario session ${sessionId} deleted successfully`);
      return true;
    }
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to delete scenario session: ${res.status} - ${errorText}`);
    }
    
    // 200 응답인 경우 JSON 파싱
    const data = await res.json();
    console.log(`[API] Delete response:`, data);
    return true;
    
  } catch (error) {
    console.error("[API] deleteScenarioSession failed:", error);
    return false;
  }
}
```

**사용 예**:
```javascript
// scenarioSessionSlice.js에 추가
import { deleteScenarioSession } from '../../lib/api';

deleteScenarioSlice: async (sessionId) => {
  const { currentConversationId } = get();
  const success = await deleteScenarioSession(currentConversationId, sessionId);
  
  if (success) {
    get().unsubscribeFromScenarioSession(sessionId);
  } else {
    const { language, showEphemeralToast } = get();
    showEphemeralToast(
      locales[language]?.['ERROR_DELETE_SESSION'] || 'Failed to delete session',
      'error'
    );
  }
}
```

---

### Fix 2: 테넌트/스테이지 정보 자동 추가

**파일**: `app/lib/api.js`  
**위치**: Line 14-28 (buildUrl 함수 수정)  
**문제**: 멀티테넌트 환경에서 데이터 격리 실패

**현재 코드**:
```javascript
function buildUrl(endpoint, params = {}) {
  const fullUrl = `${REMOTE_URL}${API_PREFIX}${endpoint}`;
  const urlObj = new URL(fullUrl);
  
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null) {
      urlObj.searchParams.append(key, params[key]);
    }
  });

  return urlObj.toString();
}
```

**개선된 코드**:
```javascript
function buildUrl(endpoint, params = {}) {
  const fullUrl = `${REMOTE_URL}${API_PREFIX}${endpoint}`;
  const urlObj = new URL(fullUrl);
  
  // 멀티테넌트 정보는 모든 요청에 포함 (옵션 또는 명시적 오버라이드 제외)
  const defaultTenantParams = {
    ten_id: API_DEFAULTS.TENANT_ID,
    stg_id: API_DEFAULTS.STAGE_ID,
    sec_ofc_id: API_DEFAULTS.SEC_OFC_ID,
  };
  
  // 사용자 파라미터로 기본값 오버라이드
  const finalParams = { ...defaultTenantParams, ...params };
  
  Object.keys(finalParams).forEach(key => {
    if (finalParams[key] !== undefined && finalParams[key] !== null) {
      urlObj.searchParams.append(key, finalParams[key]);
    }
  });

  return urlObj.toString();
}
```

**영향 받는 함수** (자동으로 개선됨):
- `fetchConversations()` ✅
- `getConversation()` ✅
- `deleteConversation()` ✅
- `fetchScenarioSessions()` ✅
- `deleteScenarioSession()` (새로 추가됨) ✅

**검증**:
```javascript
// 테스트 코드
const url = buildUrl('/conversations', { usr_id: 'user123' });
console.log(url);
// 출력: http://202.20.84.65:8083/api/v1/conversations?ten_id=1000&stg_id=DEV&sec_ofc_id=000025&usr_id=user123
```

---

### Fix 3: 초기 슬롯 설정 지원

**파일**: `app/lib/api.js`  
**위치**: Line 294-309 (createScenarioSession 함수 수정)  
**문제**: `slots` 파라미터 미전송

**현재 코드**:
```javascript
export async function createScenarioSession(conversationId, scenarioId) {
  const url = buildUrl(`/conversations/${conversationId}/scenario-sessions`);
  const userId = getUserId();
  const body = {
    scenario_id: scenarioId,
    usr_id: userId,
    status: "active",
    current_node: "start",
    variables: {}
  };

  try {
    const res = await fetch(url, { method: "POST", headers: getHeaders(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Server responded with ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error("[API] createScenarioSession failed:", error);
    return { id: `temp_${Date.now()}`, scenario_id: scenarioId, status: "active" };
  }
}
```

**개선된 코드**:
```javascript
export async function createScenarioSession(conversationId, scenarioId, initialSlots = {}) {
  const url = buildUrl(`/conversations/${conversationId}/scenario-sessions`);
  const userId = getUserId();
  
  const body = {
    scenario_id: scenarioId,
    usr_id: userId,
    slots: initialSlots,
    // ✅ 선택 필드 포함
    initial_context: {}
  };

  try {
    console.log(`[API] Creating scenario session with slots:`, initialSlots);
    const res = await fetch(url, { 
      method: "POST", 
      headers: getHeaders(), 
      body: JSON.stringify(body) 
    });
    
    if (!res.ok) throw new Error(`Server responded with ${res.status}`);
    
    const data = await res.json();
    console.log(`[API] Scenario session created:`, data);
    return data;
    
  } catch (error) {
    console.error("[API] createScenarioSession failed:", error);
    return { 
      id: `temp_${Date.now()}`, 
      scenario_id: scenarioId, 
      status: "active",
      slots: initialSlots
    };
  }
}
```

**사용 예**:
```javascript
// scenarioHandlers.js에서
const sessionResponse = await createScenarioSession(
  conversationId,
  scenarioId,
  initialSlots  // ✅ 초기 슬롯 전달
);
```

---

## 🟡 Phase 2: Medium Priority (2-3주)

### Improvement 1: 슬롯 업데이트 지원

**파일**: `app/store/slices/scenarioSessionSlice.js`  
**위치**: Line 145-155 (endScenario 함수 수정)

**현재 코드**:
```javascript
body: JSON.stringify({
  usr_id: user.uid,
  status: status,
  state: null
})
```

**개선된 코드**:
```javascript
const sessionState = get().scenarioStates[scenarioSessionId];

body: JSON.stringify({
  usr_id: user.uid,
  status: status,
  state: null,
  slots: sessionState?.slots || {},  // ✅ 현재 슬롯 상태 전송
  messages: sessionState?.messages || []  // ✅ 메시지 히스토리
})
```

---

### Improvement 2: 204 No Content 응답 처리

**파일**: `app/lib/api.js`  
**영향**: deleteConversation, deleteScenarioSession

**예시 (deleteConversation)**:
```javascript
export async function deleteConversation(conversationId) {
  const userId = getUserId();
  const url = buildUrl(`/conversations/${conversationId}`, { usr_id: userId });
  
  try {
    const res = await fetch(url, { method: "DELETE", headers: getHeaders() });
    
    // ✅ 204 No Content 처리
    if (res.status === 204) {
      console.log(`[API] Conversation ${conversationId} deleted`);
      return true;
    }
    
    if (!res.ok) {
      throw new Error(`Failed to delete conversation: ${res.status}`);
    }
    
    // 200 응답인 경우만 JSON 파싱
    return await res.json();
    
  } catch (error) {
    console.error("[API] deleteConversation failed:", error);
    return null;
  }
}
```

---

### Improvement 3: 명시적 에러 메시지

**파일**: `app/lib/api.js`  
**적용 대상**: 모든 API 함수

**패턴**:
```javascript
export async function fetchConversations(offset = 0, limit = 50) {
  const userId = getUserId();
  const url = buildUrl(`/conversations`, { offset, limit, usr_id: userId });
  
  try {
    const res = await fetch(url, { method: "GET", headers: getHeaders() });
    
    // ✅ 상태별 에러 메시지
    if (res.status === 422) {
      const errorData = await res.json();
      console.error("[API] Validation error:", errorData.detail);
      throw new Error(`Invalid parameters: ${JSON.stringify(errorData.detail)}`);
    }
    
    if (res.status === 404) {
      throw new Error(`Conversations not found for user ${userId}`);
    }
    
    if (!res.ok) {
      throw new Error(`Failed to fetch conversations: ${res.status}`);
    }
    
    return res.json();
    
  } catch (error) {
    console.error("[API] fetchConversations failed:", error);
    throw error;  // 상위에서 처리할 수 있도록 전파
  }
}
```

---

## ✅ Phase 3: Enhancement (3-4주)

### Enhancement 1: 요청 재시도 로직

**파일**: `app/lib/api.js`  
**위치**: Line 30 이후 추가

```javascript
/**
 * 지수 백오프를 사용한 재시도 로직
 * @param {Function} fetchFn - 실행할 fetch 함수
 * @param {number} maxRetries - 최대 재시도 횟수 (기본값: 3)
 * @param {number} initialDelay - 초기 지연 시간(ms, 기본값: 1000)
 */
async function fetchWithRetry(fetchFn, maxRetries = 3, initialDelay = 1000) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchFn();
    } catch (error) {
      lastError = error;
      
      // 마지막 재시도 또는 재시도 불가능한 에러
      if (attempt === maxRetries || !isRetryableError(error)) {
        break;
      }
      
      const delay = initialDelay * Math.pow(2, attempt);
      console.warn(`[API] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms:`, error.message);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

function isRetryableError(error) {
  // 네트워크 에러나 5xx 서버 에러만 재시도
  return error instanceof TypeError || 
         error.message.includes('5');  // HTTP 5xx
}
```

**사용 예**:
```javascript
export async function fetchConversations(offset = 0, limit = 50) {
  const userId = getUserId();
  
  return fetchWithRetry(() => {
    const url = buildUrl(`/conversations`, { offset, limit, usr_id: userId });
    return fetch(url, { method: "GET", headers: getHeaders() })
      .then(res => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      });
  });
}
```

---

### Enhancement 2: 응답 스키마 검증

**파일**: `app/lib/api.js`  
**위치**: Line 50 이후 추가

```javascript
/**
 * API 응답 유효성 검사
 */
const RESPONSE_SCHEMAS = {
  ConversationSummary: {
    id: 'string',
    usr_id: 'string',
    is_pinned: 'boolean',
    created_at: 'string',
    updated_at: 'string'
  },
  ConversationContent: {
    id: 'string',
    messages: 'array'
  }
};

function validateResponse(data, schemaName) {
  const schema = RESPONSE_SCHEMAS[schemaName];
  if (!schema) return true;  // 스키마가 없으면 검증 스킵
  
  for (const [key, type] of Object.entries(schema)) {
    if (!(key in data)) {
      console.warn(`[API] Response validation: missing field "${key}" in ${schemaName}`);
    }
    
    if (typeof data[key] !== type) {
      console.warn(
        `[API] Response validation: field "${key}" has type "${typeof data[key]}", ` +
        `expected "${type}"`
      );
    }
  }
  
  return true;
}
```

**사용 예**:
```javascript
export async function fetchConversations(...) {
  const data = await res.json();
  
  if (Array.isArray(data)) {
    data.forEach(item => validateResponse(item, 'ConversationSummary'));
  }
  
  return data;
}
```

---

## 📋 구현 체크리스트

### Phase 1: Critical (1-2주)
- [ ] Fix 1: `deleteScenarioSession()` 함수 추가
  - [ ] api.js에 함수 구현
  - [ ] scenarioSessionSlice.js에서 호출
  - [ ] 테스트: 세션 삭제 후 DB 확인
  
- [ ] Fix 2: 테넌트/스테이지 자동 추가
  - [ ] buildUrl() 함수 수정
  - [ ] 기존 함수들 검증
  - [ ] 테스트: URL 쿼리 파라미터 확인
  
- [ ] Fix 3: 초기 슬롯 설정 지원
  - [ ] createScenarioSession() 함수 수정
  - [ ] scenarioHandlers.js에서 슬롯 전달
  - [ ] 테스트: 초기값으로 시작하는지 확인

### Phase 2: Medium (2-3주)
- [ ] Improvement 1: 슬롯 업데이트 지원
  - [ ] scenarioSessionSlice.js 수정
  - [ ] 테스트: 세션 종료 후 슬롯 저장 확인
  
- [ ] Improvement 2: 204 응답 처리
  - [ ] deleteConversation() 수정
  - [ ] deleteScenarioSession() 수정
  - [ ] 테스트: 삭제 후 응답 처리 확인
  
- [ ] Improvement 3: 에러 메시지
  - [ ] 모든 함수에 상태별 에러 처리 추가
  - [ ] 테스트: 각 에러 상황별 메시지 확인

### Phase 3: Enhancement (3-4주)
- [ ] Enhancement 1: 요청 재시도
  - [ ] fetchWithRetry() 구현
  - [ ] 모든 함수에 적용
  - [ ] 테스트: 네트워크 오류 시 재시도 확인
  
- [ ] Enhancement 2: 응답 검증
  - [ ] 스키마 정의
  - [ ] 검증 함수 추가
  - [ ] 테스트: 유효하지 않은 응답 처리

---

## 🧪 테스트 가이드

### Unit Test 예시
```javascript
// __tests__/api.test.js

describe('API Spec Compliance', () => {
  describe('Tenant/Stage Parameters', () => {
    test('should include ten_id, stg_id, sec_ofc_id in all requests', async () => {
      const url = buildUrl('/conversations', { usr_id: 'test' });
      
      expect(url).toContain('ten_id=1000');
      expect(url).toContain('stg_id=DEV');
      expect(url).toContain('sec_ofc_id=000025');
    });
  });
  
  describe('Delete Scenario Session', () => {
    test('should call DELETE endpoint correctly', async () => {
      const result = await deleteScenarioSession('conv123', 'sess456');
      
      expect(result).toBe(true);
      // 서버 DB 확인
    });
  });
  
  describe('Initial Slots', () => {
    test('should accept initial slots on session creation', async () => {
      const session = await createScenarioSession(
        'conv123', 
        'scn456',
        { name: 'John', age: 30 }
      );
      
      expect(session.slots).toEqual({ name: 'John', age: 30 });
    });
  });
});
```

### Manual Testing
```javascript
// 1. 테넌트 정보 확인
const conversations = await fetchConversations();
// Network 탭에서 URL 확인:
// /api/v1/conversations?ten_id=1000&stg_id=DEV&sec_ofc_id=000025&usr_id=...

// 2. 세션 삭제 확인
await deleteScenarioSession('conv123', 'sess456');
// 응답: 204 No Content 또는 200 {}

// 3. 초기 슬롯 확인
const session = await createScenarioSession('conv123', 'scn456', { name: 'Test' });
console.log(session.slots); // { name: 'Test' }
```

---

## 📊 준수율 개선 예상

| Phase | 개선 항목 | 준수율 | 누적 |
|-------|---------|--------|------|
| 현재 | 기본 구현 | 83% | 83% |
| Phase 1 | Critical Fixes 3개 | +8% | 91% |
| Phase 2 | Medium Priority 3개 | +3% | 94% |
| Phase 3 | Enhancement 2개 | +1% | 95% |

---

## 🎯 최종 목표

**목표 준수율**: 95% 이상  
**목표 달성 예상**: 4주 이내  
**우선순위**: Phase 1 → Phase 2 → Phase 3

**Phase 1 완료 후 기대 효과**:
- ✅ 멀티테넌트 데이터 격리 완벽
- ✅ 세션 삭제 기능 정상 작동
- ✅ 초기 슬롯 설정 가능
