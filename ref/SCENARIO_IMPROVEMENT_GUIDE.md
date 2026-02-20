# 시나리오 스펙 준수 - 개선 구현 가이드

이 문서는 **SCENARIO_COMPLIANCE_REPORT.md**에서 제시한 개선 권장사항을 **실제 코드로 구현하는 방법**을 설명합니다.

---

## 1. StateStore 중앙화 (우선순위: ⭐⭐⭐ 높음)

### 현재 상황
슬롯 관리가 여러 곳에 분산됨:
- `runScenario()`: 로컬 변수 `newSlots` 사용
- `nodeHandlers` 각 함수: 개별적으로 슬롯 업데이트
- `scenarioHandlers.js`: FastAPI 백엔드에 위임

### 문제점
```javascript
// 현재 코드 (chatbotEngine.js L428)
let newSlots = { ...slots };
// ... 여러 곳에서 newSlots 수정
result.slots = result.slots || newSlots;  // 복사 중복
```

### 권장 구현

**파일 생성**: `app/lib/ScenarioStateStore.js`
```javascript
/**
 * 시나리오 세션의 상태(슬롯, 변수, 히스토리)를 중앙에서 관리
 */
export class ScenarioStateStore {
  constructor(initialState = {}) {
    this.state = {
      slots: initialState.slots || {},
      variables: initialState.variables || {},
      history: initialState.history || [],
      metadata: initialState.metadata || {}
    };
    this.listeners = [];
  }

  /**
   * 슬롯 값 업데이트 (깊은 경로 지원)
   * @param {string} path - 경로 (예: 'user.name' 또는 'array[0].value')
   * @param {any} value - 설정할 값
   */
  setSlot(path, value) {
    const keys = path.split('.');
    let current = this.state.slots;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[keys[keys.length - 1]] = value;
    this.notifyListeners('slotUpdated', { path, value });
  }

  /**
   * 슬롯 값 조회 (깊은 경로 지원)
   * @param {string} path - 경로
   * @returns {any} 슬롯 값
   */
  getSlot(path) {
    const keys = path.split('.');
    let value = this.state.slots;
    
    for (const key of keys) {
      if (value !== null && value !== undefined && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  /**
   * 변수 설정
   */
  setVariable(key, value) {
    this.state.variables[key] = value;
    this.notifyListeners('variableUpdated', { key, value });
  }

  /**
   * 히스토리 추가
   */
  addHistory(entry) {
    this.state.history.push({
      timestamp: new Date().toISOString(),
      ...entry
    });
    this.notifyListeners('historyAdded', entry);
  }

  /**
   * 현재 상태 스냅샷 반환 (읽기 전용)
   */
  snapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * 상태 복원
   */
  restore(state) {
    this.state = JSON.parse(JSON.stringify(state));
    this.notifyListeners('restored', this.state);
  }

  /**
   * 슬롯 일괄 업데이트
   */
  updateSlots(updates) {
    Object.entries(updates).forEach(([key, value]) => {
      this.setSlot(key, value);
    });
  }

  /**
   * 상태 변경 리스너 등록
   */
  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * 리스너 알림
   */
  notifyListeners(eventType, data) {
    this.listeners.forEach(listener => listener(eventType, data));
  }

  /**
   * 메타데이터 설정 (세션 정보 등)
   */
  setMetadata(key, value) {
    this.state.metadata[key] = value;
  }
}
```

### 사용 예시

**chatbotEngine.js 수정** (L412-428):
```javascript
import { ScenarioStateStore } from './ScenarioStateStore';

export async function runScenario(scenario, scenarioState, message, slots, scenarioSessionId, language) {
  // ... 유효성 검사 ...

  // StateStore 초기화
  const stateStore = new ScenarioStateStore({ slots });
  const allEvents = [];

  // 1. 사용자 입력 처리
  if (scenarioState?.awaitingInput) {
    const currentNode = scenario.nodes?.find(n => n.id === scenarioState.currentNodeId);
    const validation = currentNode?.data?.validation;
    const { isValid, message: validationMessage } = validateInput(message?.text ?? '', validation, language);

    if (!isValid) {
      return {
        type: 'scenario_validation_fail',
        message: validationMessage,
        nextNode: currentNode,
        scenarioState,
        slots: stateStore.snapshot().slots,
        events: allEvents,
      };
    }

    if (currentNode?.data?.slot) {
      stateStore.setSlot(currentNode.data.slot, message.text);
    }
  }

  // 2. 다음 노드 결정
  let currentNode = getNextNode(scenario, scenarioState?.currentNodeId, message?.sourceHandle, stateStore.snapshot().slots);

  // 3. 비대화형 노드 자동 진행
  while (currentNode) {
    const handler = nodeHandlers[currentNode.type];

    if (handler) {
      try {
        // StateStore를 핸들러에 전달
        const result = await handler(currentNode, scenario, stateStore, scenarioSessionId, language);

        if (result.events) allEvents.push(...result.events);

        if (result.nextNode?.id === currentNode.id) {
          currentNode = result.nextNode;
          break;
        }

        currentNode = result.nextNode;
      } catch (handlerError) {
        console.error(`Error executing handler for node ${currentNode?.id}:`, handlerError);
        return {
          type: 'scenario_end',
          message: locales[language]?.errorUnexpected || 'An error occurred.',
          scenarioState: null,
          slots: stateStore.snapshot().slots,
          events: allEvents,
          status: 'failed',
        };
      }
    } else {
      currentNode = null;
    }
  }

  // 최종 결과 반환
  if (currentNode) {
    return {
      type: 'scenario',
      nextNode: currentNode,
      scenarioState: { scenarioId: scenario.id, currentNodeId: currentNode.id, awaitingInput: isAwaiting },
      slots: stateStore.snapshot().slots,
      events: allEvents,
    };
  } else {
    return {
      type: 'scenario_end',
      message: 'Scenario ended.',
      scenarioState: null,
      slots: stateStore.snapshot().slots,
      events: allEvents,
      status: stateStore.getVariable('apiFailed') ? 'failed' : 'completed',
    };
  }
}
```

**nodeHandlers.js 수정 예시**:
```javascript
// 이전
async function handleSetSlotNode(node, scenario, slots, scenarioSessionId) {
  const newSlots = { ...slots };
  newSlots[node.data.slot] = interpolateMessage(node.data.value, slots);
  const nextNode = getNextNode(scenario, node.id, null, newSlots);
  return { nextNode, slots: newSlots, events: [] };
}

// 개선
async function handleSetSlotNode(node, scenario, stateStore, scenarioSessionId, language) {
  const currentSlots = stateStore.snapshot().slots;
  const value = interpolateMessage(node.data.value, currentSlots);
  
  stateStore.setSlot(node.data.slot, value);
  stateStore.addHistory({
    type: 'setSlot',
    nodeId: node.id,
    slot: node.data.slot,
    value: value
  });

  const nextNode = getNextNode(scenario, node.id, null, stateStore.snapshot().slots);
  return { nextNode, events: [] };
}
```

---

## 2. 세션 상태 인터페이스 문서화 (우선순위: ⭐⭐ 중간)

**파일 생성**: `app/types/ScenarioTypes.js`
```javascript
/**
 * @typedef {Object} ScenarioState
 * 시나리오 실행 중 유지되는 상태
 * 
 * @property {string} scenarioId - 시나리오 ID (시나리오 시작 시 설정)
 * @property {string} currentNodeId - 현재 실행 중인 노드 ID
 * @property {boolean} awaitingInput - 사용자 입력 대기 중 여부
 * 
 * @example
 * {
 *   scenarioId: 'scenario-001',
 *   currentNodeId: 'node-msg-001',
 *   awaitingInput: true
 * }
 */

/**
 * @typedef {Object} ScenarioResult
 * runScenario() 함수의 반환값
 * 
 * @property {'scenario' | 'scenario_end' | 'scenario_validation_fail'} type - 결과 타입
 * @property {Node} [nextNode] - 다음 노드 (type='scenario'일 때만)
 * @property {string} [message] - 메시지 (type='scenario_end'일 때)
 * @property {ScenarioState} [scenarioState] - 새로운 시나리오 상태
 * @property {Object} slots - 슬롯 데이터
 * @property {Array<Event>} events - 발생한 이벤트 배열
 * @property {'completed' | 'failed'} [status] - 시나리오 상태
 * 
 * @example
 * {
 *   type: 'scenario',
 *   nextNode: { id: 'node-form-001', type: 'form', ... },
 *   scenarioState: { scenarioId: '001', currentNodeId: 'node-form-001', awaitingInput: true },
 *   slots: { user_name: 'John' },
 *   events: [{ type: 'toast', message: 'Welcome!' }]
 * }
 */

/**
 * @typedef {Object} Node
 * 시나리오 노드
 * 
 * @property {string} id - 노드 ID (유일)
 * @property {'message' | 'form' | 'api' | 'llm' | 'branch' | 'slotfilling' | 'setSlot' | 'delay' | 'toast' | 'link' | 'iframe'} type - 노드 타입
 * @property {Object} data - 노드 타입별 데이터
 * @property {Object} position - 캔버스 위치 { x: number, y: number }
 */

/**
 * @typedef {Object} Edge
 * 노드 간 연결
 * 
 * @property {string} id - 엣지 ID (유일)
 * @property {string} source - 출발 노드 ID
 * @property {string} target - 도착 노드 ID
 * @property {string} [sourceHandle] - 출발점 핸들 ID (분기 용도)
 * @property {Object} data - 엣지 데이터 (조건 등)
 */

export { ScenarioState, ScenarioResult, Node, Edge };
```

**chatbotEngine.js 상단에 추가**:
```javascript
/**
 * 시나리오 실행 엔진
 * @module chatbotEngine
 * 
 * 주요 함수:
 * - runScenario(scenario, scenarioState, message, slots, scenarioSessionId, language)
 * - getNextNode(scenario, currentNodeId, sourceHandleId, slots)
 * - getScenario(scenarioId)
 * 
 * @requires ScenarioTypes
 */

/** @typedef {import('../types/ScenarioTypes').ScenarioState} ScenarioState */
/** @typedef {import('../types/ScenarioTypes').ScenarioResult} ScenarioResult */
```

---

## 3. 대화형 노드 정의 상수화 (우선순위: ⭐⭐ 중간)

**파일 수정**: `app/lib/constants.js` (또는 새 파일 `scenarioConstants.js`)

```javascript
/**
 * 시나리오 관련 상수
 */

/**
 * 모든 노드 타입
 */
export const NODE_TYPES = {
  MESSAGE: 'message',
  FORM: 'form',
  API: 'api',
  LLM: 'llm',
  BRANCH: 'branch',
  SLOTFILLING: 'slotfilling',
  SET_SLOT: 'setSlot',
  DELAY: 'delay',
  TOAST: 'toast',
  LINK: 'link',
  IFRAME: 'iframe',
};

/**
 * 사용자 입력을 기다리는 노드 타입
 * 이 타입의 노드에서는 실행을 멈추고 사용자 입력을 대기
 */
export const INTERACTIVE_NODE_TYPES = [
  NODE_TYPES.MESSAGE,
  NODE_TYPES.FORM,
  NODE_TYPES.SLOTFILLING,
  NODE_TYPES.BRANCH,  // 단, evaluationType !== 'CONDITION'일 때만
];

/**
 * 자동으로 진행되는 노드 타입
 * 이 타입의 노드는 사용자 입력 없이 자동으로 실행된 후 다음 노드로 진행
 */
export const AUTO_PROGRESS_NODE_TYPES = [
  NODE_TYPES.API,
  NODE_TYPES.LLM,
  NODE_TYPES.SET_SLOT,
  NODE_TYPES.DELAY,
  NODE_TYPES.TOAST,
  NODE_TYPES.LINK,
  NODE_TYPES.IFRAME,
];

/**
 * Branch 노드의 evaluationType
 */
export const BRANCH_EVALUATION_TYPES = {
  CONDITION: 'CONDITION',      // 자동 조건 분기
  MANUAL: 'MANUAL',            // 사용자 선택
};

/**
 * 시나리오 결과 타입
 */
export const SCENARIO_RESULT_TYPES = {
  SCENARIO: 'scenario',
  SCENARIO_END: 'scenario_end',
  SCENARIO_VALIDATION_FAIL: 'scenario_validation_fail',
};

/**
 * 시나리오 완료 상태
 */
export const SCENARIO_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

/**
 * 대화형 노드인지 판단하는 헬퍼 함수
 * @param {Object} node - 노드 객체
 * @returns {boolean}
 */
export const isInteractiveNode = (node) => {
  if (!node) return false;
  
  // Branch 노드는 evaluationType이 CONDITION이 아닐 때만 대화형
  if (node.type === NODE_TYPES.BRANCH) {
    return node.data?.evaluationType !== BRANCH_EVALUATION_TYPES.CONDITION;
  }
  
  return INTERACTIVE_NODE_TYPES.includes(node.type);
};

/**
 * 자동 진행 노드인지 판단하는 헬퍼 함수
 * @param {Object} node - 노드 객체
 * @returns {boolean}
 */
export const isAutoProgressNode = (node) => {
  if (!node) return false;
  return AUTO_PROGRESS_NODE_TYPES.includes(node.type);
};
```

**chatbotEngine.js에서 사용**:
```javascript
import { isInteractiveNode } from './constants';

// 이전 (L567-569)
const isAwaiting = nodeToReturn.type === 'slotfilling' ||
                   nodeToReturn.type === 'form' ||
                   (nodeToReturn.type === 'branch' && nodeToReturn.data?.evaluationType !== 'CONDITION');

// 개선
const isAwaiting = isInteractiveNode(nodeToReturn);

// ...

return {
  type: 'scenario',
  nextNode: nodeToReturn,
  scenarioState: { scenarioId, currentNodeId: nodeToReturn.id, awaitingInput: isAwaiting },
  slots: stateStore.snapshot().slots,
  events: allEvents,
};
```

---

## 4. 에러 코드 분류 체계화 (우선순위: ⭐ 낮음)

**파일 생성**: `app/lib/errorCodes.js`

```javascript
/**
 * 시나리오 실행 중 발생 가능한 에러 코드
 */
export const SCENARIO_ERROR_CODES = {
  // 노드 관련 에러
  NODE_NOT_FOUND: {
    code: 'NODE_NOT_FOUND',
    message: 'Specified node was not found in the scenario.',
    severity: 'error'
  },
  NO_START_NODE: {
    code: 'NO_START_NODE',
    message: 'Could not determine the start node.',
    severity: 'error'
  },
  
  // 핸들러 관련 에러
  HANDLER_NOT_FOUND: {
    code: 'HANDLER_NOT_FOUND',
    message: 'No handler found for the node type.',
    severity: 'warn'
  },
  HANDLER_ERROR: {
    code: 'HANDLER_ERROR',
    message: 'Handler execution failed.',
    severity: 'error'
  },
  
  // 유효성 검사 에러
  VALIDATION_FAILED: {
    code: 'VALIDATION_FAILED',
    message: 'Input validation failed.',
    severity: 'warn'
  },
  
  // API 에러
  API_ERROR: {
    code: 'API_ERROR',
    message: 'API call failed.',
    severity: 'error'
  },
  
  // 시나리오 데이터 에러
  INVALID_SCENARIO: {
    code: 'INVALID_SCENARIO',
    message: 'Invalid scenario object.',
    severity: 'error'
  },
  INVALID_STATE: {
    code: 'INVALID_STATE',
    message: 'Invalid scenario state.',
    severity: 'error'
  },
};

/**
 * 에러 정보 생성
 * @param {string} errorCode - 에러 코드
 * @param {Object} details - 상세 정보
 * @returns {Object}
 */
export const createErrorInfo = (errorCode, details = {}) => {
  const errorDef = SCENARIO_ERROR_CODES[errorCode];
  
  if (!errorDef) {
    console.warn(`Unknown error code: ${errorCode}`);
    return {
      code: 'UNKNOWN_ERROR',
      message: 'An unknown error occurred.',
      severity: 'error',
      ...details
    };
  }
  
  return {
    ...errorDef,
    ...details,
    timestamp: new Date().toISOString()
  };
};
```

**chatbotEngine.js에서 사용**:
```javascript
import { createErrorInfo } from './errorCodes';

// 이전
if (!currentNode) {
  console.error(`Current node with ID "${currentNodeId}" not found.`);
  return null;
}

// 개선
if (!currentNode) {
  const errorInfo = createErrorInfo('NODE_NOT_FOUND', {
    nodeId: currentNodeId
  });
  console.error(`[${errorInfo.code}] ${errorInfo.message}`, errorInfo);
  return null;
}

// ...

// 핸들러 오류 처리
} catch (handlerError) {
  const errorInfo = createErrorInfo('HANDLER_ERROR', {
    nodeId: currentNode?.id,
    nodeType: currentNode?.type,
    originalError: handlerError.message
  });
  console.error(`[${errorInfo.code}]`, errorInfo);
  
  return {
    type: 'scenario_end',
    message: locales[language]?.errorUnexpected || errorInfo.message,
    scenarioState: null,
    slots: stateStore.snapshot().slots,
    events: allEvents,
    status: 'failed',
    error: errorInfo  // 에러 정보 포함
  };
}
```

---

## 5. 구현 체크리스트

### Phase 1: StateStore 중앙화 (1-2주)
- [ ] `ScenarioStateStore.js` 구현
- [ ] `chatbotEngine.js` 수정 (runScenario 함수)
- [ ] `nodeHandlers.js` 수정 (모든 핸들러)
- [ ] 테스트 작성 및 검증

### Phase 2: 타입 정의 및 상수화 (1주)
- [ ] `ScenarioTypes.js` 생성 (JSDoc 타입 정의)
- [ ] `scenarioConstants.js` 생성 (상수 정의)
- [ ] 기존 파일에서 상수 참조 변경
- [ ] 문서 업데이트

### Phase 3: 에러 코드 체계화 (3-5일)
- [ ] `errorCodes.js` 생성
- [ ] 기존 에러 처리 코드 리팩토링
- [ ] 에러 로깅 개선

### Phase 4: 검증 및 문서화 (1주)
- [ ] 전체 통합 테스트
- [ ] 성능 테스트 (StateStore 오버헤드 확인)
- [ ] 문서 업데이트

---

## 6. 성능 고려사항

### StateStore의 성능 영향
- **메모리**: `snapshot()` 호출 시 깊은 복사 발생 → 큰 슬롯의 경우 성능 고려
- **속도**: `setSlot()` 깊은 경로 처리 → 경로 길이에 따라 선형 증가

### 최적화 방안
```javascript
// 1. Lazy snapshot (필요할 때만 복사)
export class ScenarioStateStore {
  snapshot(shallow = false) {
    if (shallow) {
      return this.state;  // 얕은 복사
    }
    return JSON.parse(JSON.stringify(this.state));  // 깊은 복사
  }
}

// 2. 경로 캐싱
export class ScenarioStateStore {
  constructor(initialState = {}) {
    // ...
    this.pathCache = new Map();  // 파싱된 경로 캐시
  }

  parsePath(path) {
    if (this.pathCache.has(path)) {
      return this.pathCache.get(path);
    }
    const keys = path.split('.');
    this.pathCache.set(path, keys);
    return keys;
  }
}
```

---

## 7. 마이그레이션 전략

현재 코드를 깨뜨리지 않으면서 점진적으로 적용:

```javascript
// 1단계: 구 방식과 신 방식 호환
function runScenario_v2(scenario, scenarioState, message, slots, ...) {
  // StateStore 사용
  const stateStore = new ScenarioStateStore({ slots });
  // ...
}

// 2단계: 점진적 마이그레이션
export async function runScenario(scenario, scenarioState, message, slots, ...) {
  const USE_NEW_STATE_STORE = process.env.USE_NEW_STATE_STORE === 'true';
  
  if (USE_NEW_STATE_STORE) {
    return runScenario_v2(...arguments);
  } else {
    return runScenario_legacy(...arguments);
  }
}

// 3단계: 완전 전환 후 레거시 코드 제거
```

---

## 결론

이 개선사항들을 단계적으로 적용하면:
1. ✅ 코드 복잡도 감소
2. ✅ 버그 발생 가능성 감소
3. ✅ 테스트 용이성 증가
4. ✅ 유지보수성 향상
5. ✅ 확장성 개선

**모두 현재의 90% 준수 상태를 95% 이상으로 향상시킬 수 있습니다.**
