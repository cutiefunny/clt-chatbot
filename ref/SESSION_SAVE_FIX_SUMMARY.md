# ✅ 시나리오 세션 저장 실패 진단 완료

**작성일**: 2026-02-20  
**상태**: 🟡 Frontend 진단 강화 완료 / 🔴 Backend 검증 필요  
**에러**: PATCH 500 - 세션이 DB에 없음

---

## 📊 현재 상태

### 문제
```
시나리오 시작 → 세션 생성 → PATCH 업데이트 → 500 에러
                                             (세션 없음)
```

### 근본 원인 분석

| 단계 | 가능한 원인 | 증상 | 상태 |
|------|-----------|------|------|
| **1. 세션 생성** | Response에 ID 없음 | ID 추출 실패 | ✅ 검증 추가 |
| **2. ID 추출** | sessionData.id 또는 session_id 필드 없음 | undefined | ✅ 검증 추가 |
| **3. 변수 스코프** | conversationId 누락 | URL 잘못됨 | ✅ 검증 추가 |
| **4. 세션 저장** | Backend DB 저장 실패 | 조회 불가 | 🔴 Backend 확인 필요 |

---

## 🔧 적용된 개선사항

### Frontend 강화 (✅ COMPLETE)

**파일**: `app/store/slices/scenarioHandlers.js`

#### 개선 1️⃣: 세션 ID 추출 검증

**Before**:
```javascript
const newScenarioSessionId = sessionData.id || sessionData.session_id;
console.log('세션 생성:', newScenarioSessionId);
```

**After**:
```javascript
const newScenarioSessionId = sessionData?.id || sessionData?.session_id;

if (!newScenarioSessionId) {
  console.error('❌ Session ID 추출 실패. Response:', JSON.stringify(sessionData));
  throw new Error(`Failed to extract session ID from response`);
}

console.log('✅ FastAPI에서 시나리오 세션 생성:', {
  sessionId: newScenarioSessionId,
  conversationId,
  scenarioId,
  response: sessionData,  // 전체 응답 기록
});
```

**효과**: 
- ✅ 세션 생성 실패 즉시 감지
- ✅ 응답 형식 문제 파악 가능
- ✅ Backend 응답 데이터 확인 가능

---

#### 개선 2️⃣: PATCH 파라미터 검증

**Before**:
```javascript
await fetch(`${FASTAPI_BASE_URL}/conversations/${conversationId}/scenario-sessions/${newScenarioSessionId}`, {
  method: "PATCH",
  ...
}).then(r => {
  if (!r.ok) throw new Error(`Failed to update session: ${r.status}`);
});
```

**After**:
```javascript
// 1. 파라미터 검증
if (!conversationId || !newScenarioSessionId) {
  console.error('❌ PATCH 파라미터 누락:', {
    conversationId,
    newScenarioSessionId,
    updatePayload,
  });
  throw new Error(`Missing parameters...`);
}

// 2. URL 검증
const patchUrl = `${FASTAPI_BASE_URL}/conversations/${conversationId}/scenario-sessions/${newScenarioSessionId}`;
console.log('🔄 세션 업데이트 중...', {
  url: patchUrl,
  payload: updatePayload,
});

// 3. 에러 상세 로그
const patchResponse = await fetch(patchUrl, {...});

if (!patchResponse.ok) {
  const errorText = await patchResponse.text();
  console.error('❌ PATCH 업데이트 실패:', {
    status: patchResponse.status,
    url: patchUrl,
    error: errorText,  // ← Backend 에러 메시지
  });
  throw new Error(`Failed to update session: ${patchResponse.status}`);
}

console.log('✅ 세션 업데이트 완료:', patchResult);
```

**효과**:
- ✅ undefined 파라미터 즉시 감지
- ✅ URL 구성 오류 감지
- ✅ Backend 에러 메시지 상세히 기록

---

#### 개선 3️⃣: 세션 삭제 에러 처리

**Before**:
```javascript
await fetch(deleteUrl, {...}).then(r => {
  if (!r.ok) throw new Error(`Failed to delete session: ${r.status}`);
});
```

**After**:
```javascript
const deleteUrl = `${FASTAPI_BASE_URL}/conversations/${conversationId}/scenario-sessions/${newScenarioSessionId}`;
console.log('🗑️ 실패한 세션 정리 중...', deleteUrl);

const deleteResponse = await fetch(deleteUrl, {...});

if (!deleteResponse.ok) {
  console.warn('⚠️ 세션 삭제 실패:', {
    status: deleteResponse.status,
    url: deleteUrl,
  });
} else {
  console.log('✅ 세션 정리 완료');
}
```

**효과**:
- ✅ 정리 과정 추적 가능
- ✅ 삭제 실패 시에도 계속 진행

---

## 🧪 즉시 테스트 방법

### 콘솔에서 확인

```javascript
// 1. 시나리오 시작
store.getState().openScenarioPanel('test_scenario_id');

// 2. 콘솔 로그 확인
// 다음 중 어디서 실패하는지 확인:

// ✅ 성공 시:
"✅ FastAPI에서 시나리오 세션 생성: {sessionId: '80563d10-...', ...}"
"🔄 세션 업데이트 중... {url: 'http://...', payload: {...}}"
"✅ 세션 업데이트 완료: {...}"

// ❌ 실패 1: ID 추출 실패
"❌ Session ID 추출 실패. Response: {...}"

// ❌ 실패 2: 파라미터 누락
"❌ PATCH 파라미터 누락: {conversationId: undefined, ...}"

// ❌ 실패 3: Backend 에러
"❌ PATCH 업데이트 실패: {status: 500, url: '...', error: '...'}"
```

### Network 탭 확인

**POST** `/api/v1/conversations/{id}/scenario-sessions`
- Response: `{"id": "...", ...}` 확인
- 상태: 201 (Created) 확인

**PATCH** `/api/v1/conversations/{id}/scenario-sessions/{sessionId}`
- 요청 URL: 올바른 sessionId 포함?
- 요청 Body: 올바른 데이터?
- 응답: 500 에러 메시지 확인

---

## 🔍 Backend 검증 (다음 단계)

### Backend 담당자 확인 사항

#### 1️⃣ 세션 생성 응답 검증

```python
# POST /conversations/{conversation_id}/scenario-sessions

# ❌ 문제있는 응답
{
  "conversation_id": "c7209dae-...",
  "scenario_id": "...",
  "status": "active"
  # id 필드 없음!
}

# ✅ 올바른 응답
{
  "id": "80563d10-...",  # ← 필수!
  "session_id": "80563d10-...",  # ← 또는 이것
  "conversation_id": "c7209dae-...",
  "scenario_id": "...",
  "status": "active"
}
```

---

#### 2️⃣ 세션 저장 검증

```python
@app.post("/api/v1/conversations/{conversation_id}/scenario-sessions")
async def create_scenario_session(...):
    session = ScenarioSession(...)
    
    # ✅ DB에 저장하는가?
    db.add(session)
    db.commit()  # ← 이 줄 필수!
    db.refresh(session)  # ← 저장 후 ID 갱신
    
    return {..., "id": session.id}
```

---

#### 3️⃣ PATCH 요청 검증

```python
@app.patch("/api/v1/conversations/{conversation_id}/scenario-sessions/{session_id}")
async def update_scenario_session(conversation_id: str, session_id: str, request: UpdateRequest):
    # ✅ 세션 조회 가능한가?
    session = db.query(ScenarioSession).filter(
        ScenarioSession.id == session_id,
        ScenarioSession.conversation_id == conversation_id
    ).first()
    
    if not session:
        # ← 이게 500 에러 원인!
        raise HTTPException(status_code=404, detail="Session not found")
    
    # 업데이트 로직...
    return {...}
```

---

## 📋 디버깅 순서

### Phase 1: Frontend 진단 (✅ COMPLETE)

```
1. ✅ 세션 생성 응답 검증 코드 추가
2. ✅ ID 추출 검증 코드 추가
3. ✅ 파라미터 검증 코드 추가
4. ✅ 상세 에러 로그 추가
```

**다음**: 콘솔 로그 확인

---

### Phase 2: Backend 로그 수집 (🔴 TO DO)

```
1. 세션 생성 POST 응답 전체 JSON
2. PATCH 요청 500 에러 메시지
3. Backend 로그 (세션 생성 ~ PATCH 사이)
4. DB 조회: SELECT * FROM scenario_sessions WHERE id='80563d10-...'
```

---

### Phase 3: 문제 특정 및 해결

```
로그 분석 → 원인 파악 → Backend 수정 → 재테스트
```

---

## 📝 생성된 문서

| 문서 | 목적 |
|------|------|
| **SCENARIO_SESSION_SAVE_DEBUG.md** | 상세 진단 가이드 |
| **scenarioHandlers.js** | 개선된 코드 |

---

## 🎯 최종 체크리스트

### Frontend ✅
- [x] 세션 ID 추출 검증
- [x] 파라미터 검증
- [x] 상세 에러 로그
- [x] URL 검증

### Backend 🔴
- [ ] 응답에 ID 필드 있는가?
- [ ] 세션이 DB에 저장되는가?
- [ ] PATCH 시 세션 조회 가능한가?
- [ ] 에러 메시지 상세한가?

---

## 📞 다음 액션

1. **Now**: 콘솔에서 시나리오 시작 → 로그 확인
2. **Then**: Backend 담당자와 로그 분석
3. **Next**: Backend 수정 → 재테스트

---

**상태**: 🟢 Frontend 준비 완료 / 🔴 Backend 검증 대기
