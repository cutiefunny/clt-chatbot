'use client';
import { useState } from 'react';
import styles from './page.module.css';

// 접힘/펼침 상태를 관리하기 위한 간단한 컴포넌트
const CollapsibleSection = ({ title, children }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={styles.collapsibleSection}>
      <button onClick={() => setIsOpen(!isOpen)} className={styles.collapsibleHeader}>
        {isOpen ? '[-]' : '[+]'} {title}
      </button>
      {isOpen && (
        <div className={styles.collapsibleContent}>
          {children}
        </div>
      )}
    </div>
  );
};


export default function ApiDocsPage() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>CLT Chatbot API Documentation</h1>
        <p>
          이 문서는 <strong>FastAPI</strong>로 마이그레이션된 백엔드 서버 API를 설명합니다.<br />
          <strong>Note:</strong> 현재 개발 버전은 <u>인증(Authentication)이 비활성화</u>되어 있어 토큰 없이 호출 가능합니다.
        </p>
      </header>

      {/* --- Chat --- */}
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.post}`}>POST</span>
          <span className={styles.path}>/chat</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>메시지 전송 및 응답 생성</h2>
          <p>
            사용자의 메시지를 처리하고 AI 응답을 생성합니다.<br />
            LLM 응답의 경우 <strong>Streaming Response</strong>가 반환될 수 있습니다.
          </p>
          <dl>
            <dt>Content-Type:</dt>
            <dd><code>application/json</code></dd>
            <dt>요청 본문 (Request Body):</dt>
            <dd><pre>{`{
  "conversation_id": "string (Optional)", // 기존 대화에 이어서 말할 경우
  "content": "string",                    // 사용자 입력 메시지
  "language": "ko" | "en",                // (Optional) 기본값 'ko'
  "slots": {                              // (Optional) 현재 시나리오 슬롯 상태
    "key": "value"
  }
}`}</pre></dd>
            <dt>응답 (Response):</dt>
            <dd>
              <p><strong>Case 1: 일반/시나리오 응답 (JSON)</strong></p>
              <pre>{`{
  "type": "text" | "scenario",
  "message": "string",
  "slots": { ... },
  "next_node": { ... } // 시나리오 진행 시
}`}</pre>
              <p><strong>Case 2: LLM 스트리밍 (Server-Sent Events)</strong></p>
              <pre>{`data: {"type": "token", "content": "안녕"}\n\n...`}</pre>
            </dd>
          </dl>
        </div>
      </section>

      {/* --- Conversations --- */}
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.get}`}>GET</span>
          <span className={styles.path}>/conversations</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>대화 목록 조회</h2>
          <p>저장된 모든 대화방 목록을 최신순으로 반환합니다.</p>
          <dl>
            <dt>응답 (200 OK):</dt>
            <dd><pre>{`[
  {
    "id": "uuid-string",
    "title": "string",
    "is_pinned": boolean,
    "created_at": "2024-05-20T10:00:00Z",
    "updated_at": "2024-05-20T10:30:00Z"
  },
  ...
]`}</pre></dd>
          </dl>
        </div>
      </section>

      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.post}`}>POST</span>
          <span className={styles.path}>/conversations</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>새 대화방 생성</h2>
          <p>새로운 대화 세션을 생성합니다.</p>
          <dl>
            <dt>요청 본문:</dt>
            <dd><pre>{`{
  "title": "string (Optional)" // 생략 시 'New Chat' 등 기본값 적용
}`}</pre></dd>
            <dt>응답 (201 Created):</dt>
            <dd><pre>{`{
  "id": "new-uuid-string",
  "title": "New Chat",
  "created_at": "...",
  "updated_at": "..."
}`}</pre></dd>
          </dl>
        </div>
      </section>

      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.get}`}>GET</span>
          <span className={styles.path}>/conversations/{'{conversation_id}'}</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>대화 상세 조회</h2>
          <p>특정 대화방의 메시지 기록을 조회합니다.</p>
          <dl>
            <dt>Path Parameter:</dt>
            <dd><code>conversation_id</code>: 조회할 대화방 ID</dd>
            <dt>Query Parameters:</dt>
            <dd>
              <code>limit</code>: 조회할 메시지 개수 (Default: 50)<br />
              <code>offset</code>: 페이징 처리를 위한 오프셋
            </dd>
            <dt>응답 (200 OK):</dt>
            <dd><pre>{`{
  "id": "uuid-string",
  "messages": [
    {
      "id": "msg-uuid",
      "role": "user" | "assistant",
      "content": "string",
      "created_at": "..."
    },
    ...
  ]
}`}</pre></dd>
          </dl>
        </div>
      </section>

      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.patch}`}>PATCH</span>
          <span className={styles.path}>/conversations/{'{conversation_id}'}</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>대화 정보 수정</h2>
          <p>대화방의 제목을 변경하거나 고정(Pin) 상태를 변경합니다.</p>
          <dl>
            <dt>요청 본문:</dt>
            <dd><pre>{`{
  "title": "변경된 제목",    // (Optional)
  "is_pinned": true       // (Optional)
}`}</pre></dd>
            <dt>응답 (200 OK):</dt>
            <dd>수정된 대화방 객체 반환</dd>
          </dl>
        </div>
      </section>

      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.delete}`}>DELETE</span>
          <span className={styles.path}>/conversations/{'{conversation_id}'}</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>대화방 삭제</h2>
          <p>특정 대화방과 관련된 모든 메시지 및 시나리오 기록을 영구 삭제합니다.</p>
          <dl>
            <dt>응답 (204 No Content):</dt>
            <dd>본문 없음</dd>
          </dl>
        </div>
      </section>

      {/* --- Scenarios --- */}
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.get}`}>GET</span>
          <span className={styles.path}>/scenarios</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>시나리오 목록 조회</h2>
          <p>사용 가능한 시나리오 목록 및 카테고리 정보를 반환합니다.</p>
          <dl>
            <dt>응답 (200 OK):</dt>
            <dd><pre>{`[
  {
    "category": "인사",
    "items": [
      { "id": "greeting", "title": "기본 인사", "description": "..." },
      ...
    ]
  },
  ...
]`}</pre></dd>
          </dl>
        </div>
      </section>

      {/* --- Search --- */}
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.get}`}>GET</span>
          <span className={styles.path}>/search/messages</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>전체 메시지 검색</h2>
          <p>모든 대화 내역에서 특정 키워드가 포함된 메시지를 검색합니다.</p>
          <dl>
            <dt>Query Parameters:</dt>
            <dd>
              <code>q</code>: 검색어 (필수)<br />
              <code>usr_id</code>: 사용자 ID (필수)
            </dd>
            <dt>응답 (200 OK):</dt>
            <dd><pre>{`[
  {
    "id": "message-uuid",
    "conversation_id": "uuid-string",
    "conversation_title": "string",
    "role": "user" | "assistant",
    "content": "string",
    "created_at": "2024-05-20T10:00:00Z"
  },
  ...
]`}</pre></dd>
          </dl>
        </div>
      </section>

      {/* --- 추가 요청: Scenario Sessions --- */}
      <section style={{ marginTop: '40px', paddingTop: '20px', borderTop: '2px solid #ddd' }}>
        <h1 style={{ fontSize: '1.8em', marginBottom: '20px' }}>
          📋 추가 요청: Scenario Sessions 관리 API
        </h1>
        <p style={{ fontSize: '1.1em', color: '#555', marginBottom: '30px' }}>
          다음은 <strong>Firebase에서 FastAPI로의 마이그레이션</strong>을 완료하기 위해
          백엔드에서 구현이 필요한 시나리오 세션 관리 엔드포인트입니다.
        </p>

        {/* GET /scenarios/categories */}
        <section className={styles.endpoint}>
          <div className={styles.endpointHeader}>
            <span className={`${styles.method} ${styles.get}`}>GET</span>
            <span className={styles.path}>/scenarios/categories</span>
          </div>
          <div className={styles.endpointBody}>
            <h2>숏컷 카테고리 목록 조회</h2>
            <p>
              채팅 입력창 좌측에 표시되는 숏컷 카테고리 메뉴 구조를 조회합니다.<br />
              테넌트별, 스테이지별로 다른 메뉴 구조를 반환할 수 있습니다.
            </p>
            <dl>
              <dt>Query Parameters:</dt>
              <dd>
                <code>ten_id</code> (string, optional): 테넌트 ID (기본값: "1000")<br />
                <code>stg_id</code> (string, optional): 스테이지 ID (기본값: "DEV")<br />
                <code>sec_ofc_id</code> (string, optional): 부서/오피스 ID (기본값: "000025")
              </dd>
              <dt>응답 (200 OK) - Dictionary&lt;string, Array of CategoryResponse&gt;:</dt>
              <dd><pre>{`{
  "key1": [
    {
      "id": "category-001",
      "name": "자주 찾는 서비스",
      "order": 1,
      "subCategories": [
        {
          "title": "기본 문의",
          "items": [
            {
              "title": "요금 조회",
              "description": "현재 요금을 조회합니다",
              "action": {
                "type": "scenario",
                "value": "charge_inquiry"
              }
            },
            ...
          ]
        },
        ...
      ]
    },
    ...
  ]
}`}</pre></dd>
              <dt>에러 응답 (422 Validation Error):</dt>
              <dd><pre>{`{
  "detail": [
    {
      "loc": ["query", "ten_id"],
      "msg": "value is not a valid string",
      "type": "type_error.string"
    }
  ]
}`}</pre></dd>
            </dl>
          </div>
        </section>

        {/* PUT /scenarios/categories */}
        <section className={styles.endpoint}>
          <div className={styles.endpointHeader}>
            <span className={`${styles.method} ${styles.put}`}>PUT</span>
            <span className={styles.path}>/scenarios/categories</span>
          </div>
          <div className={styles.endpointBody}>
            <h2>숏컷 카테고리 저장</h2>
            <p>
              채팅 입력창 좌측의 숏컷 카테고리 메뉴 구조를 업데이트합니다.<br />
              기존 데이터는 완전히 대체됩니다. (Upsert)
            </p>
            <dl>
              <dt>Content-Type:</dt>
              <dd><code>application/json</code></dd>
              <dt>요청 본문 (Request Body) - ShortCutInsertRequest:</dt>
              <dd><pre>{`{
  "categories": [
    {
      "id": "category-001",
      "name": "자주 찾는 서비스",
      "order": 1,
      "subCategories": [
        {
          "title": "기본 문의",
          "items": [
            {
              "title": "요금 조회",
              "description": "현재 요금을 조회합니다",
              "action": {
                "type": "scenario",
                "value": "charge_inquiry"
              }
            },
            ...
          ]
        },
        ...
      ]
    },
    ...
  ]
}`}</pre></dd>
              <dt>응답 (200 OK):</dt>
              <dd><pre>{`{
  "success": true,
  "message": "숏컷 카테고리가 저장되었습니다",
  "saved_at": "2024-05-20T10:30:00Z"
}`}</pre></dd>
              <dt>에러 응답 (422 Validation Error):</dt>
              <dd><pre>{`{
  "detail": [
    {
      "loc": ["body", "categories"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}`}</pre></dd>
            </dl>
          </div>
        </section>

        {/* GET /scenarios/categories */}
        <section className={styles.endpoint}>
          <div className={styles.endpointHeader}>
            <span className={`${styles.method} ${styles.get}`}>GET</span>
            <span className={styles.path}>/scenarios/categories</span>
          </div>
          <div className={styles.endpointBody}>
            <h2>숏컷 카테고리 목록 조회</h2>
            <p>
              채팅 입력창 좌측에 표시되는 숏컷 카테고리 메뉴 구조를 조회합니다.<br />
              테넌트별, 스테이지별로 다른 메뉴 구조를 반환할 수 있습니다.
            </p>
            <dl>
              <dt>Query Parameters:</dt>
              <dd>
                <code>ten_id</code> (string, optional): 테넌트 ID (기본값: "1000")<br />
                <code>stg_id</code> (string, optional): 스테이지 ID (기본값: "DEV")<br />
                <code>sec_ofc_id</code> (string, optional): 부서/오피스 ID (기본값: "000025")
              </dd>
              <dt>응답 (200 OK) - Dictionary&lt;string, Array of CategoryResponse&gt;:</dt>
              <dd><pre>{`{
  "key1": [
    {
      "id": "category-001",
      "name": "자주 찾는 서비스",
      "order": 1,
      "subCategories": [
        {
          "title": "기본 문의",
          "items": [
            {
              "title": "요금 조회",
              "description": "현재 요금을 조회합니다",
              "action": {
                "type": "scenario",
                "value": "charge_inquiry"
              }
            },
            ...
          ]
        },
        ...
      ]
    },
    ...
  ]
}`}</pre></dd>
              <dt>에러 응답 (422 Validation Error):</dt>
              <dd><pre>{`{
  "detail": [
    {
      "loc": ["query", "ten_id"],
      "msg": "value is not a valid string",
      "type": "type_error.string"
    }
  ]
}`}</pre></dd>
            </dl>
          </div>
        </section>

        {/* PUT /scenarios/categories */}
        <section className={styles.endpoint}>
          <div className={styles.endpointHeader}>
            <span className={`${styles.method} ${styles.put}`}>PUT</span>
            <span className={styles.path}>/scenarios/categories</span>
          </div>
          <div className={styles.endpointBody}>
            <h2>숏컷 카테고리 저장</h2>
            <p>
              채팅 입력창 좌측의 숏컷 카테고리 메뉴 구조를 업데이트합니다.<br />
              기존 데이터는 완전히 대체됩니다. (Upsert)
            </p>
            <dl>
              <dt>Content-Type:</dt>
              <dd><code>application/json</code></dd>
              <dt>요청 본문 (Request Body) - ShortCutInsertRequest:</dt>
              <dd><pre>{`{
  "categories": [
    {
      "id": "category-001",
      "name": "자주 찾는 서비스",
      "order": 1,
      "subCategories": [
        {
          "title": "기본 문의",
          "items": [
            {
              "title": "요금 조회",
              "description": "현재 요금을 조회합니다",
              "action": {
                "type": "scenario",
                "value": "charge_inquiry"
              }
            },
            ...
          ]
        },
        ...
      ]
    },
    ...
  ]
}`}</pre></dd>
              <dt>응답 (200 OK):</dt>
              <dd><pre>{`{
  "success": true,
  "message": "숏컷 카테고리가 저장되었습니다",
  "saved_at": "2024-05-20T10:30:00Z"
}`}</pre></dd>
              <dt>에러 응답 (422 Validation Error):</dt>
              <dd><pre>{`{
  "detail": [
    {
      "loc": ["body", "categories"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}`}</pre></dd>
            </dl>
          </div>
        </section>

        {/* GET /shortcut */}
        <section className={styles.endpoint}>
          <div className={styles.endpointHeader}>
            <span className={`${styles.method} ${styles.get}`}>GET</span>
            <span className={styles.path}>/shortcut</span>
          </div>
          <div className={styles.endpointBody}>
            <h2>저장된 숏컷 목록 조회</h2>
            <p>
              숏컷(바로가기) 목록을 조회합니다.<br />
              테넌트별, 스테이지별로 다른 숏컷 목록을 반환할 수 있습니다.
            </p>
            <dl>
              <dt>Query Parameters:</dt>
              <dd>
                <code>ten_id</code> (string, optional): 테넌트 ID (기본값: "1000")<br />
                <code>stg_id</code> (string, optional): 스테이지 ID (기본값: "DEV")<br />
                <code>sec_ofc_id</code> (string, optional): 부서/오피스 ID (기본값: "000025")
              </dd>
              <dt>응답 (200 OK) - Array of ShortcutResponse:</dt>
              <dd><pre>{`[
  {
    "id": "shortcut-001",
    "name": "자주 찾는 서비스",
    "order": 1,
    "subCategories": [
      {
        "title": "기본 문의",
        "items": [
          {
            "title": "요금 조회",
            "description": "현재 요금을 조회합니다",
            "action": {
              "type": "scenario",
              "value": "charge_inquiry"
            }
          },
          ...
        ]
      },
      ...
    ]
  },
  ...
]`}</pre></dd>
              <dt>에러 응답 (422 Validation Error):</dt>
              <dd><pre>{`{
  "detail": [
    {
      "loc": ["query", "ten_id"],
      "msg": "value is not a valid string",
      "type": "type_error.string"
    }
  ]
}`}</pre></dd>
            </dl>
          </div>
        </section>

        {/* PUT /shortcut */}
        <section className={styles.endpoint}>
          <div className={styles.endpointHeader}>
            <span className={`${styles.method} {{styles.put}}`}>PUT</span>
            <span className={styles.path}>/shortcut</span>
          </div>
          <div className={styles.endpointBody}>
            <h2>저장된 숏컷 목록 저장</h2>
            <p>
              숏컷(바로가기) 목록을 업데이트합니다.<br />
              기존 데이터는 완전히 대체됩니다. (Upsert)
            </p>
            <dl>
              <dt>Content-Type:</dt>
              <dd><code>application/json</code></dd>
              <dt>요청 본문 (Request Body) - ShortcutPutRequest:</dt>
              <dd><pre>{`{
  "ten_id": "1000",
  "stg_id": "DEV",
  "sec_ofc_id": "000025",
  "categories": [
    {
      "name": "자주 찾는 서비스",
      "subCategories": [
        {
          "title": "기본 문의",
          "items": [
            {
              "title": "요금 조회",
              "description": "현재 요금을 조회합니다",
              "action": {
                "type": "scenario",
                "value": "charge_inquiry"
              }
            },
            ...
          ]
        },
        ...
      ]
    },
    ...
  ]
}`}</pre></dd>
              <dt>응답 (200 OK):</dt>
              <dd><pre>{`{
  "success": true,
  "message": "숏컷이 저장되었습니다",
  "saved_at": "2024-05-20T10:30:00Z"
}`}</pre></dd>
              <dt>에러 응답 (422 Validation Error):</dt>
              <dd><pre>{`{
  "detail": [
    {
      "loc": ["body", "categories"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}`}</pre></dd>
            </dl>
          </div>
        </section>

        {/* PATCH /scenarios/{scenario_id}/last-used */}
        <section className={styles.endpoint}>
          <div className={styles.endpointHeader}>
            <span className={`${styles.method} ${styles.patch}`}>PATCH</span>
            <span className={styles.path}>/scenarios/{'{scenario_id}'}/last-used</span>
          </div>
          <div className={styles.endpointBody}>
            <h2>시나리오 마지막 사용 시간 업데이트</h2>
            <p>특정 시나리오의 마지막 사용 시간을 업데이트합니다. (분석/통계용)</p>
            <dl>
              <dt>Path Parameter:</dt>
              <dd><code>scenario_id</code>: 업데이트할 시나리오 ID</dd>
              <dt>응답 (200 OK):</dt>
              <dd><pre>{`{
  "id": "scenario_id",
  "last_used_at": "2024-05-20T10:30:00Z"
}`}</pre></dd>
            </dl>
          </div>
        </section>

        {/* POST /conversations/{conversation_id}/scenario-sessions */}
        <section className={styles.endpoint}>
          <div className={styles.endpointHeader}>
            <span className={`${styles.method} ${styles.post}`}>POST</span>
            <span className={styles.path}>/conversations/{'{conversation_id}'}/scenario-sessions</span>
          </div>
          <div className={styles.endpointBody}>
            <h2>시나리오 세션 생성</h2>
            <p>
              새로운 시나리오 세션을 생성합니다.
              (Firestore <code>addDoc(scenarioSessions)</code> 대체)
            </p>
            <dl>
              <dt>Path Parameter:</dt>
              <dd><code>conversation_id</code>: 대화방 ID</dd>
              <dt>요청 본문:</dt>
              <dd><pre>{`{
  "scenario_id": "string",           // 실행할 시나리오 ID
  "slots": {                         // (Optional) 초기 슬롯 데이터
    "key": "value",
    "user_name": "홍길동"
  },
  "initial_context": {}              // (Optional) 추가 컨텍스트
}`}</pre></dd>
              <dt>응답 (201 Created):</dt>
              <dd><pre>{`{
  "id": "session-uuid",
  "conversation_id": "conv-uuid",
  "scenario_id": "greeting",
  "status": "starting",
  "slots": { "user_name": "홍길동" },
  "messages": [],
  "state": null,
  "created_at": "2024-05-20T10:00:00Z",
  "updated_at": "2024-05-20T10:00:00Z"
}`}</pre></dd>
            </dl>
          </div>
        </section>

        {/* GET /conversations/{conversation_id}/scenario-sessions/{session_id} */}
        <section className={styles.endpoint}>
          <div className={styles.endpointHeader}>
            <span className={`${styles.method} ${styles.get}`}>GET</span>
            <span className={styles.path}>/conversations/{'{conversation_id}'}/scenario-sessions/{'{session_id}'}</span>
          </div>
          <div className={styles.endpointBody}>
            <h2>시나리오 세션 조회</h2>
            <p>특정 시나리오 세션의 현재 상태를 조회합니다. (폴링/실시간 동기화용)</p>
            <dl>
              <dt>Path Parameters:</dt>
              <dd>
                <code>conversation_id</code>: 대화방 ID<br />
                <code>session_id</code>: 시나리오 세션 ID
              </dd>
              <dt>응답 (200 OK):</dt>
              <dd><pre>{`{
  "id": "session-uuid",
  "conversation_id": "conv-uuid",
  "scenario_id": "greeting",
  "status": "active" | "completed" | "failed" | "cancelled",
  "slots": { "user_name": "홍길동", "email": "..." },
  "messages": [
    {
      "id": "msg-uuid",
      "sender": "bot" | "user",
      "node": { ... },
      "text": "string (Optional)",
      "selected_option": "string (Optional)"
    },
    ...
  ],
  "state": {
    "scenario_id": "greeting",
    "current_node_id": "node-123",
    "awaiting_input": true
  },
  "created_at": "2024-05-20T10:00:00Z",
  "updated_at": "2024-05-20T10:30:00Z"
}`}</pre></dd>
            </dl>
          </div>
        </section>

        {/* PATCH /conversations/{conversation_id}/scenario-sessions/{session_id} */}
        <section className={styles.endpoint}>
          <div className={styles.endpointHeader}>
            <span className={`${styles.method} ${styles.patch}`}>PATCH</span>
            <span className={styles.path}>/conversations/{'{conversation_id}'}/scenario-sessions/{'{session_id}'}</span>
          </div>
          <div className={styles.endpointBody}>
            <h2>시나리오 세션 업데이트</h2>
            <p>
              시나리오 세션의 상태, 슬롯, 메시지, 상태를 업데이트합니다.
              (Firestore <code>updateDoc(sessionRef)</code> 대체)
            </p>
            <dl>
              <dt>Path Parameters:</dt>
              <dd>
                <code>conversation_id</code>: 대화방 ID<br />
                <code>session_id</code>: 시나리오 세션 ID
              </dd>
              <dt>요청 본문 (모두 Optional):</dt>
              <dd><pre>{`{
  "status": "active" | "completed" | "failed",
  "slots": {                         // 슬롯 업데이트 (병합)
    "user_name": "김철수"
  },
  "messages": [                      // 메시지 배열 (전체 교체)
    {
      "id": "msg-uuid",
      "sender": "bot" | "user",
      "node": { ... },
      "text": "string (Optional)",
      "selected_option": "string (Optional)"
    },
    ...
  ],
  "state": {                         // 상태 정보 업데이트
    "scenario_id": "greeting",
    "current_node_id": "node-456",
    "awaiting_input": false
  }
}`}</pre></dd>
              <dt>응답 (200 OK):</dt>
              <dd>업데이트된 시나리오 세션 객체 전체 반환 (GET 응답과 동일)</dd>
            </dl>
          </div>
        </section>

        {/* DELETE /conversations/{conversation_id}/scenario-sessions/{session_id} */}
        <section className={styles.endpoint}>
          <div className={styles.endpointHeader}>
            <span className={`${styles.method} ${styles.delete}`}>DELETE</span>
            <span className={styles.path}>/conversations/{'{conversation_id}'}/scenario-sessions/{'{session_id}'}</span>
          </div>
          <div className={styles.endpointBody}>
            <h2>시나리오 세션 삭제</h2>
            <p>
              특정 시나리오 세션을 삭제합니다.
              실패한 세션 정리나 사용자 취소 시 사용.
              (Firestore <code>deleteDoc(sessionRef)</code> 대체)
            </p>
            <dl>
              <dt>Path Parameters:</dt>
              <dd>
                <code>conversation_id</code>: 대화방 ID<br />
                <code>session_id</code>: 시나리오 세션 ID
              </dd>
              <dt>응답 (204 No Content):</dt>
              <dd>본문 없음</dd>
              <dt>대체 응답 (200 OK):</dt>
              <dd><pre>{`{
  "success": true,
  "message": "Scenario session deleted successfully",
  "deleted_session_id": "session-uuid"
}`}</pre></dd>
            </dl>
          </div>
        </section>

        {/* 추가 정보 */}
        <section style={{ marginTop: '40px', padding: '20px', backgroundColor: '#f0f4f8', borderLeft: '4px solid #0066cc' }}>
          <h3>📌 구현 시 고려사항</h3>
          <ul>
            <li>
              <strong>실시간 동기화:</strong>
              현재 코드에서 Firebase의 <code>onSnapshot</code>을 사용 중입니다.
              마이그레이션 전략:
              <ul>
                <li><strong>폴링 방식:</strong> GET 엔드포인트를 1-2초 간격으로 호출 (간단함, 부하 증가)</li>
                <li><strong>WebSocket:</strong> 실시간 양방향 통신 (복잡함, 최적화)</li>
                <li><strong>Server-Sent Events (SSE):</strong> 단방향 스트리밍 (중간 수준)</li>
              </ul>
            </li>
            <li>
              <strong>Timestamp 처리:</strong>
              모든 응답의 <code>created_at</code>, <code>updated_at</code>은 서버 시간 사용 (UTC ISO 8601 형식)
            </li>
            <li>
              <strong>에러 응답:</strong>
              일관된 에러 형식 필요:
              <pre>{`{
  "error": "error_code",
  "message": "사용자 친화적 메시지",
  "details": {}
}`}</pre>
            </li>
            <li>
              <strong>권한 검증:</strong>
              현재 인증 비활성화 상태이지만, 향후 각 엔드포인트에서
              사용자가 해당 리소스에 접근 권한이 있는지 검증 필요
            </li>
            <li>
              <strong>데이터 베이스 스키마:</strong>
              <code>scenario_sessions</code> 테이블 구조:
              <pre>{`CREATE TABLE scenario_sessions (
  id UUID PRIMARY KEY,
  conversation_id UUID FOREIGN KEY,
  scenario_id VARCHAR,
  status VARCHAR,
  slots JSONB,
  messages JSONB,
  state JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);`}</pre>
            </li>
          </ul>
        </section>
      </section>

    </div>
  );
}