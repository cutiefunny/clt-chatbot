# 🔴 시나리오 세션 저장 실패 원인 분석 및 해결책

**문제**: PATCH 요청 시 500 에러 - DB에 시나리오 세션이 없음  
**근본 원인**: 세션 생성 후 응답 처리 오류 또는 세션 저장 실패  
**상태**: ✅ 진단 코드 추가 완료

---

## 🔍 문제 분석

### 에러 흐름

```
1. openScenarioPanel() 호출
   ↓
2. POST /conversations/{id}/scenario-sessions (세션 생성)
   ↓
3. 응답에서 session_id 추출 ❌ 실패?
   ↓
4. PATCH /conversations/{id}/scenario-sessions/{session_id} (업데이트)
   ↓
5. 500 에러: 세션이 DB에 없음
```

### 가능한 원인 3가지

| # | 원인 | 증상 | 해결책 |
|---|------|------|--------|
| **1** | ❌ 세션 ID 추출 실패 | console에 ID가 안 보임 | Backend 응답 형식 확인 |
| **2** | ❌ 세션 생성 성공하지 못함 | POST 201 아님 | Backend 세션 생성 로직 확인 |
| **3** | ❌ conversationId 누락 | URL에 undefined 들어감 | Frontend 변수 스코프 확인 |

---

## 📊 개선된 진단 방법

### 이전 코드 문제

```javascript
// ❌ 문제점 1: ID 추출 검증 없음
const newScenarioSessionId = sessionData.id || sessionData.session_id;

// ❌ 문제점 2: 상세 에러 로그 없음
await fetch(...).then(r => {
  if (!r.ok) throw new Error(`Failed: ${r.status}`);  // 상태 코드만
});

// ❌ 문제점 3: URL 검증 없음
const patchUrl = `${FASTAPI_BASE_URL}/conversations/${conversationId}/...`
// conversationId가 undefined면 URL이 잘못됨
```

### 개선된 코드

```javascript
// ✅ 개선점 1: ID 추출 검증 추가
const newScenarioSessionId = sessionData?.id || sessionData?.session_id;

if (!newScenarioSessionId) {
  console.error('❌ Session ID 추출 실패. Response:', sessionData);
  throw new Error(`Failed to extract session ID from response`);
}

console.log('✅ 세션 생성 완료:', {
  sessionId: newScenarioSessionId,
  conversationId,
  scenarioId,
  response: sessionData,  // ← 전체 응답 기록
});

// ✅ 개선점 2: URL 검증 추가
if (!conversationId || !newScenarioSessionId) {
  console.error('❌ PATCH 파라미터 누락:', {
    conversationId,   // undefined 확인
    newScenarioSessionId,
  });
  throw new Error(`Missing parameters...`);
}

// ✅ 개선점 3: 상세 에러 정보
const errorText = await patchResponse.text();
console.error('❌ PATCH 실패:', {
  status: patchResponse.status,
  url: patchUrl,
  error: errorText,  // ← 백엔드 에러 메시지
});
```

---

## 🧪 진단 방법 (콘솔에서 즉시 확인)

### Step 1: 시나리오 시작

```javascript
// 브라우저 콘솔에서
store.getState().openScenarioPanel('test_scenario_id');
```

### Step 2: 콘솔 로그 확인

**✅ 정상 시 출력**:
```
✅ FastAPI에서 시나리오 세션 생성: {
  sessionId: "80563d10-5753-4b51-9448-9b7c90f0621d",
  conversationId: "c7209dae-3dc2-4ca8-963b-091e951bcc02",
  scenarioId: "test_scenario_id",
  response: {id: "80563d10-...", scenario_id: "test_scenario_id", ...}
}

🔄 세션 업데이트 중... {
  url: "http://202.20.84.65:8083/api/v1/conversations/c7209dae-.../scenario-sessions/80563d10-...",
  payload: {slots: {}, messages: [], state: {...}}
}

✅ 세션 업데이트 완료: {...}
```

**❌ 실패 시 출력**:
```
❌ Session ID 추출 실패. Response: {
  // sessionData 전체 내용 확인 가능
}

// 또는

❌ PATCH 업데이트 전 필수 파라미터 누락: {
  conversationId: undefined,  // ← 문제!
  newScenarioSessionId: "...",
}

// 또는

❌ PATCH 업데이트 실패: {
  status: 500,
  url: "http://202.20.84.65:8083/api/v1/conversations/c7209dae-.../scenario-sessions/80563d10-...",
  error: "..."  // ← Backend 에러 메시지
}
```

---

## 🔧 가능한 원인별 해결책

### 원인 1️⃣: Backend 응답 형식 오류

**증상**: `❌ Session ID 추출 실패` 로그

**Backend 응답이 이런 형식일 수 있음**:
```json
// ❌ 잘못된 형식 (id 필드 없음)
{
  "conversation_id": "...",
  "status": "active"
}

// ✅ 올바른 형식
{
  "id": "80563d10-...",  // ← id 필드 필수
  "session_id": "80563d10-...",  // 또는 이 필드
  "conversation_id": "c7209dae-...",
  "status": "active",
  ...
}
```

**해결책**: Backend에서 응답에 `id` 또는 `session_id` 필드 추가

```python
# FastAPI POST /conversations/{id}/scenario-sessions
@app.post(...)
async def create_scenario_session(conversation_id: str, request: CreateScenarioSessionRequest):
    session = create_session(...)
    return {
        "id": session.id,           # ✅ 필수!
        "session_id": session.id,   # ✅ 또는 이 필드
        "conversation_id": conversation_id,
        "status": "active",
        ...
    }
```

---

### 원인 2️⃣: conversationId 변수 누락

**증상**: `❌ PATCH 파라미터 누락: conversationId: undefined` 로그

**원인**: conversationId가 현재 함수 스코프에서 정의되지 않음

**현재 코드**:
```javascript
let conversationId = currentConversationId;  // 함수 시작에 정의됨

if (!conversationId) {
  const newConversationId = await get().createNewConversation(true);
  conversationId = newConversationId;  // ✅ 업데이트됨
}

// 여기서 conversationId 사용 - OK

// ... 하지만 중간에 async 작업이 많으면 문제 가능?
```

**해결책**: 변수 검증 추가 (이미 코드에 포함됨)

```javascript
// PATCH 전에 검증
if (!conversationId || !newScenarioSessionId) {
  console.error('파라미터 누락:', {conversationId, newScenarioSessionId});
  throw new Error(...);
}
```

---

### 원인 3️⃣: Backend 세션 생성 실패

**증상**: 콘솔에 `✅ 세션 생성` 로그는 있지만, PATCH에서 500 에러

**의미**: 응답은 반환했지만, DB에 실제로 저장되지 않음

**해결책**: Backend에서 세션 저장 로직 확인

```python
@app.post("/api/v1/conversations/{conversation_id}/scenario-sessions")
async def create_scenario_session(conversation_id: str, request: CreateScenarioSessionRequest):
    try:
        # 1. 대화 검증
        conversation = db.get_conversation(conversation_id)
        if not conversation:
            return {"error": "Conversation not found"}
        
        # 2. 시나리오 검증
        scenario = db.get_scenario(request.scenario_id)
        if not scenario:
            return {"error": "Scenario not found"}
        
        # 3. 세션 생성
        session = ScenarioSession(
            conversation_id=conversation_id,
            scenario_id=request.scenario_id,
            slots=request.slots or {},
            status="active"
        )
        
        # ✅ 4. DB에 저장 (중요!)
        db.add(session)
        db.commit()  # ← 이 줄이 있는가?
        
        # 5. 응답 반환
        return {
            "id": session.id,
            "conversation_id": conversation_id,
            "scenario_id": request.scenario_id,
            "status": "active"
        }
    except Exception as e:
        logger.error(f"Failed to create session: {e}")
        return {"error": str(e)}, 500
```

---

## 📋 체크리스트

### Frontend 진단 (✅ 완료)

- [x] 세션 ID 추출 검증 추가
- [x] conversationId 검증 추가
- [x] 상세 에러 로그 추가
- [x] PATCH URL 검증 추가

### Backend 검증 (🔴 필요)

- [ ] 세션 생성 응답에 `id` 필드 있는가?
- [ ] 세션이 DB에 실제로 저장되는가?
- [ ] PATCH 요청 시 세션 찾을 수 있는가?
- [ ] 에러 메시지가 상세한가?

---

## 🚀 다음 단계

### 1️⃣ 콘솔 로그 확인

```javascript
// 브라우저에서 시나리오 시작
store.getState().openScenarioPanel('test_scenario_id');

// 콘솔에서 로그 확인:
// - ✅ 세션 생성 성공했는가?
// - ✅ sessionId가 표시되는가?
// - ✅ 파라미터가 올바른가?
// - ❌ 어디서 실패하는가?
```

### 2️⃣ Backend 응답 확인

```javascript
// Network 탭에서 POST /scenario-sessions 응답 확인
// Response body를 보면:
{
  "id": "...",          // ← 있는가?
  "session_id": "...",  // ← 또는 이것?
}
```

### 3️⃣ Backend 로그 확인

Backend에서 다음 로그 추가:
```python
logger.info(f"Creating session for conversation: {conversation_id}")
logger.info(f"Session created: {session.id}")
logger.info(f"Session saved to DB: {db.query(ScenarioSession).filter_by(id=session.id).first()}")
```

---

## 📞 추가 지원

**Frontend 개선**: ✅ COMPLETE  
**Backend 검증**: 🔴 TO DO

다음 정보를 수집하면 빠르게 해결 가능:
1. 세션 생성 POST 응답의 전체 JSON
2. PATCH 요청의 500 에러 메시지 본문
3. Backend 로그 (세션 생성 ~ PATCH 요청 사이)
