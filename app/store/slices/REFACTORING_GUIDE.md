# scenarioSlice 리팩토링 문서

## 개요
`scenarioSlice.js`의 책임을 4개의 전문화된 모듈로 분산하여 유지보수성과 확장성을 향상시켰습니다.

## 분산된 모듈 구조

### 1. **scenarioStateSlice.js** - 기본 상태 정의
책임: 기본 상태 초기화 및 간단한 상태 업데이트

**상태:**
- `scenarioStates`: 시나리오 세션별 상태 관리
- `activeScenarioSessionId`: 현재 활성 시나리오 세션 ID
- `activeScenarioSessions`: 활성 세션 ID 리스트
- `scenarioCategories`: 시나리오 카테고리 목록
- `availableScenarios`: 사용 가능한 시나리오 맵
- `unsubscribeScenariosMap`: 구독 해제 함수 맵

**함수:**
- `setScenarioSlots(sessionId, newSlots)`: 특정 세션의 슬롯 업데이트

---

### 2. **scenarioAPI.js** - FastAPI 호출 관련
책임: 백엔드 API 통신

**함수:**
- `loadAvailableScenarios()`: FastAPI에서 사용 가능한 시나리오 목록 로드
- `loadScenarioCategories()`: FastAPI에서 시나리오 카테고리 로드
- `saveScenarioCategories(newCategories)`: 시나리오 카테고리 저장

**특징:**
- 다양한 API 응답 형식 처리 (배열, 객체, dictionary)
- 자동 에러 핸들링 및 사용자 알림

---

### 3. **scenarioSessionSlice.js** - 세션 관리
책임: 시나리오 세션의 생명주기 관리

**함수:**
- `subscribeToScenarioSession(sessionId)`: 세션 상태 폴링 시작
- `unsubscribeFromScenarioSession(sessionId)`: 세션 구독 해제
- `unsubscribeAllScenarioListeners()`: 모든 구독 해제
- `endScenario(scenarioSessionId, status)`: 시나리오 종료

**특징:**
- 5초 폴링 방식으로 세션 상태 동기화
- 자동 정리(cleanup) 기능

---

### 4. **scenarioHandlers.js** - 이벤트 핸들링
책임: 시나리오 상호작용 및 이벤트 처리

**함수:**
- `openScenarioPanel(scenarioId, initialSlots)`: 시나리오 패널 열기
- `handleScenarioResponse(payload)`: 시나리오 진행 처리
- `continueScenarioIfNeeded(lastNode, scenarioSessionId)`: 자동 진행
- `setScenarioSelectedOption(scenarioSessionId, messageNodeId, selectedValue)`: 사용자 선택 저장

**특징:**
- 여러 후보 페이로드 시도를 통한 견고한 통신
- 자동 진행(auto-continue) 로직
- 상세한 에러 핸들링

---

### 5. **scenarioSlice.js** (수정됨) - 통합 파일
책임: 모든 분산 모듈을 하나로 통합

```javascript
export const createScenarioSlice = (set, get) => ({
  ...createScenarioStateSlice(set, get),
  ...createScenarioAPISlice(set, get),
  ...createScenarioSessionSlice(set, get),
  ...createScenarioHandlersSlice(set, get),
});
```

---

## 파일 위치
```
app/store/slices/
├── scenarioSlice.js              (통합 파일 - 13줄)
├── scenarioStateSlice.js         (상태 정의 - ~30줄)
├── scenarioAPI.js                (API 호출 - ~160줄)
├── scenarioSessionSlice.js       (세션 관리 - ~150줄)
└── scenarioHandlers.js           (이벤트 처리 - ~750줄)
```

---

## 마이그레이션 가이드

### 기존 코드 (리팩토링 전)
```javascript
import { createScenarioSlice } from "scenarioSlice";
// 모든 함수가 scenarioSlice에 포함됨
```

### 새 코드 (리팩토링 후)
```javascript
import { createScenarioSlice } from "scenarioSlice";
// 사용 방식은 동일 - API 자동 병합됨
```

**변경 없음**: 외부 사용 코드는 변경할 필요 없습니다. 통합 파일에서 모든 함수를 자동으로 제공합니다.

---

## 장점

| 측면 | 개선사항 |
|------|---------|
| **가독성** | 각 파일이 단일 책임에만 집중 |
| **유지보수** | 특정 기능 수정 시 해당 파일만 관리 |
| **재사용성** | 필요한 모듈만 별도로 import 가능 |
| **테스트** | 각 모듈을 독립적으로 테스트 가능 |
| **확장성** | 새로운 기능 추가 시 체계적 추가 가능 |

---

## 각 모듈의 주요 특징

### scenarioStateSlice.js
- 최소한의 로직으로 상태 정의
- `setScenarioSlots` 같은 간단한 상태 변경만 처리

### scenarioAPI.js
- FastAPI 통신에만 집중
- 다양한 응답 형식 대응
- 에러 처리 및 사용자 알림 포함

### scenarioSessionSlice.js
- 세션의 생명주기 관리
- 자동 정리 및 구독 해제
- 상태 동기화 로직

### scenarioHandlers.js
- 복잡한 이벤트 처리 로직
- 사용자와의 상호작용 관리
- 백엔드와의 동기화
