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
          이 문서는 <strong>FastAPI</strong>로 마이그레이션된 백엔드 서버 API 명세입니다.<br/>
          <strong>Base URL:</strong> <code>http://202.20.84.65:8083/api/v1</code><br/>
          <strong>Note:</strong> 모든 요청에는 시스템 식별을 위한 공통 파라미터가 포함되어야 합니다.
        </p>
      </header>

      {/* --- 공통 파라미터 안내 --- */}
      <section className={styles.commonParams}>
        <div className={`GlassEffect ${styles.infoBox}`}>
          <h3>🔑 공통 쿼리 파라미터 (Common Query Parameters)</h3>
          <ul>
            <li><code>usr_id</code>: 사용자 식별자 (예: musclecat)</li>
            <li><code>ten_id</code>: 테넌트 ID (기본값: 1000)</li>
            <li><code>stg_id</code>: 스테이지 ID (기본값: DEV)</li>
            <li><code>sec_ofc_id</code>: 보안 오피스 ID (기본값: 000025)</li>
          </ul>
        </div>
      </section>

      {/* ========== Chat ========== */}
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.post}`}>POST</span>
          <span className={styles.path}>/chat</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>메시지 전송 및 응답 생성</h2>
          <p>사용자의 메시지를 처리하고 AI 응답 또는 시나리오 이벤트를 생성합니다.</p>
          <dl>
            <dt>요청 본문 (Request Body):</dt>
            <dd><pre>{`{
  "usr_id": "string",              // 필수: 사용자 ID
  "conversation_id": "string",     // 선택: 기존 대화방 ID
  "scenario_session_id": "string", // 선택: 진행 중인 시나리오 세션 ID
  "content": "string",             // 사용자 입력 텍스트
  "language": "ko",                // 선택: ko | en
  "slots": { "key": "value" },     // 선택: 현재 시나리오 슬롯 상태
  "source_handle": "string"        // 선택: 시나리오 노드 핸들 ID
}`}</pre></dd>
            <dt>응답 (Response):</dt>
            <dd>
                <pre>{`{
  "type": "text" | "scenario" | "scenario_start" | "scenario_end",
  "content": "string",           // AI 답변 내용
  "events": [ ... ],             // 시나리오 제어 이벤트 목록
  "scenario_state": { ... },     // 현재 시나리오 진행 상태
  "slots": { ... },              // 업데이트된 슬롯 정보
  "nextNode": { ... }            // 다음 노드 정보
}`}</pre>
            </dd>
          </dl>
        </div>
      </section>

      {/* ========== Conversations ========== */}
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.get}`}>GET</span>
          <span className={styles.path}>/conversations</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>대화 목록 조회</h2>
          <p>사용자의 모든 대화방 목록을 최신순으로 조회합니다.</p>
          <dl>
            <dt>쿼리 파라미터 (Query Parameters):</dt>
            <dd>
              <code>usr_id</code>: 사용자 ID (필수)<br/>
              <code>offset</code>: 페이지네이션 오프셋 (기본값: 0)<br/>
              <code>limit</code>: 조회할 개수 (기본값: 50)
            </dd>
            <dt>응답 (200 OK):</dt>
            <dd><pre>{`[
  {
    "id": "uuid-string",
    "title": "string",
    "is_pinned": boolean,
    "created_at": "ISO-8601 string",
    "updated_at": "ISO-8601 string"
  }
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
          <h2>대화 생성</h2>
          <p>새로운 대화방을 생성합니다.</p>
          <dl>
            <dt>요청 본문 (Request Body):</dt>
            <dd><pre>{`{
  "title": "New Chat",      // 대화방 제목
  "usr_id": "string"        // 사용자 ID
}`}</pre></dd>
            <dt>응답 (200 OK):</dt>
            <dd><pre>{`{
  "id": "uuid-string",
  "title": "string",
  "is_pinned": false,
  "created_at": "ISO-8601 string",
  "updated_at": "ISO-8601 string"
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
          <p>특정 대화방의 정보와 메시지 내역을 조회합니다.</p>
          <dl>
            <dt>쿼리 파라미터:</dt>
            <dd>
              <code>usr_id</code>: 사용자 ID (필수)<br/>
              <code>skip</code>: 메시지 페이지네이션 오프셋 (기본값: 0)<br/>
              <code>limit</code>: 조회할 메시지 개수 (기본값: 15)
            </dd>
            <dt>응답 (200 OK):</dt>
            <dd><pre>{`{
  "id": "uuid-string",
  "title": "string",
  "is_pinned": boolean,
  "created_at": "ISO-8601 string",
  "updated_at": "ISO-8601 string",
  "messages": [
    {
      "id": "msg-uuid",
      "role": "user" | "assistant",
      "content": "string",
      "type": "text" | "scenario_bubble",
      "scenario_session_id": "string",
      "selected_option": "string",
      "feedback": "positive" | "negative",
      "created_at": "ISO-8601 string",
      "meta": { ... }
    }
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
          <h2>대화 수정</h2>
          <p>대화방의 제목 변경 또는 고정(Pin) 상태를 변경합니다.</p>
          <dl>
            <dt>요청 본문 (Request Body):</dt>
            <dd><pre>{`{
  "usr_id": "string",        // 필수
  "title": "새로운 제목",    // 선택
  "is_pinned": true          // 선택
}`}</pre></dd>
            <dt>응답 (200 OK):</dt>
            <dd>수정된 대화 객체</dd>
          </dl>
        </div>
      </section>

      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.delete}`}>DELETE</span>
          <span className={styles.path}>/conversations/{'{conversation_id}'}</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>대화 삭제</h2>
          <p>특정 대화방을 삭제합니다.</p>
          <dl>
            <dt>쿼리 파라미터:</dt>
            <dd><code>usr_id</code>: 사용자 ID (필수)</dd>
            <dt>응답 (200 OK):</dt>
            <dd><code>true</code></dd>
          </dl>
        </div>
      </section>

      {/* ========== Messages ========== */}
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.post}`}>POST</span>
          <span className={styles.path}>/conversations/{'{conversation_id}'}/messages</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>메시지 생성</h2>
          <p>대화방에 새 메시지를 저장합니다.</p>
          <dl>
            <dt>요청 본문 (Request Body):</dt>
            <dd><pre>{`{
  "role": "user" | "assistant",    // 메시지 발신자 역할
  "content": "string",             // 메시지 내용
  "type": "text" | "scenario_bubble",
  "scenario_session_id": "string", // 선택
  "meta": { ... },                 // 선택: 추가 메타데이터
  "usr_id": "string"               // 필수
}`}</pre></dd>
            <dt>응답 (200 OK):</dt>
            <dd>생성된 메시지 객체</dd>
          </dl>
        </div>
      </section>

      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.patch}`}>PATCH</span>
          <span className={styles.path}>/conversations/{'{conversation_id}'}/messages/{'{message_id}'}</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>메시지 업데이트</h2>
          <p>메시지의 피드백이나 선택된 옵션 정보를 업데이트합니다.</p>
          <dl>
            <dt>요청 본문 (Request Body):</dt>
            <dd><pre>{`{
  "usr_id": "string",                        // 필수
  "feedback": "positive" | "negative",       // 선택
  "selected_option": "string"                // 선택
}`}</pre></dd>
            <dt>응답 (200 OK):</dt>
            <dd>업데이트된 메시지 객체</dd>
          </dl>
        </div>
      </section>

      {/* ========== Scenarios ========== */}
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.get}`}>GET</span>
          <span className={styles.path}>/scenarios</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>시나리오 목록 조회</h2>
          <p>에디터 및 시스템에서 선택 가능한 전체 시나리오 정의를 반환합니다.</p>
          <dl>
            <dt>응답 (200 OK):</dt>
            <dd><pre>{`[
  {
    "id": "string",
    "scenario_id": "string",
    "title": "string",
    "description": "string",
    "version": "1.0",
    "nodes": [ ... ],
    "edges": [ ... ],
    "startNodeId": "string"
  }
]`}</pre></dd>
          </dl>
        </div>
      </section>

      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.get}`}>GET</span>
          <span className={styles.path}>/scenarios/{'{scenario_id}'}</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>시나리오 상세 조회</h2>
          <p>특정 시나리오의 전체 정의(노드, 엣지 등)를 반환합니다.</p>
          <dl>
            <dt>Path Parameter:</dt>
            <dd><code>scenario_id</code>: 시나리오 ID</dd>
            <dt>응답 (200 OK):</dt>
            <dd><pre>{`{
  "id": "string",
  "title": "string",
  "description": "string",
  "version": "1.0",
  "nodes": [
    {
      "id": "string",
      "type": "start" | "text" | "slotfilling" | "form" | "branch" | "api" | "end",
      "data": { ... }
    }
  ],
  "edges": [
    {
      "id": "string",
      "source": "string",
      "target": "string",
      "sourceHandle": "string",
      "targetHandle": "string"
    }
  ],
  "startNodeId": "string"
}`}</pre></dd>
          </dl>
        </div>
      </section>

      {/* ========== Scenario Sessions ========== */}
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.get}`}>GET</span>
          <span className={styles.path}>/conversations/{'{conversation_id}'}/scenario-sessions</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>시나리오 세션 목록 조회</h2>
          <p>특정 대화방 안에서 실행된 모든 시나리오 세션 이력을 조회합니다.</p>
          <dl>
            <dt>쿼리 파라미터:</dt>
            <dd><code>usr_id</code>: 사용자 ID (필수)</dd>
            <dt>응답 (200 OK):</dt>
            <dd><pre>{`[
  {
    "id": "session-uuid",
    "scenario_id": "string",
    "title": "string",
    "status": "in_progress" | "active" | "completed" | "failed",
    "state": {
      "scenarioId": "string",
      "currentNodeId": "string",
      "awaitingInput": boolean
    },
    "slots": { ... },
    "messages": [ ... ],
    "created_at": "ISO-8601 string",
    "updated_at": "ISO-8601 string"
  }
]`}</pre></dd>
          </dl>
        </div>
      </section>

      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.post}`}>POST</span>
          <span className={styles.path}>/conversations/{'{conversation_id}'}/scenario-sessions</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>시나리오 세션 생성</h2>
          <p>특정 대화 내에서 새로운 시나리오를 시작할 때 세션을 생성합니다.</p>
          <dl>
            <dt>요청 본문 (Request Body):</dt>
            <dd><pre>{`{
  "scenario_id": "string",         // 시작할 시나리오 ID
  "usr_id": "string",              // 사용자 ID
  "status": "in_progress",         // 초기 상태
  "current_node": "start",         // 시작 노드
  "variables": {}                  // 초기 변수/슬롯 데이터
}`}</pre></dd>
            <dt>응답 (200 OK):</dt>
            <dd><pre>{`{
  "id": "session-uuid",
  "scenario_id": "string",
  "status": "in_progress",
  "created_at": "ISO-8601 string"
}`}</pre></dd>
          </dl>
        </div>
      </section>

      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.patch}`}>PATCH</span>
          <span className={styles.path}>/scenario-sessions/{'{session_id}'}</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>시나리오 세션 업데이트</h2>
          <p>사용자의 선택이나 입력에 따라 시나리오의 현재 노드, 변수, 상태를 갱신합니다.</p>
          <dl>
            <dt>요청 본문 (Request Body):</dt>
            <dd><pre>{`{
  "usr_id": "string",              // 필수
  "state": {                       // 선택: 시나리오 진행 상태
    "scenarioId": "string",
    "currentNodeId": "string",
    "awaitingInput": boolean
  },
  "slots": { ... },                // 선택: 누적된 슬롯/변수 값
  "messages": [ ... ],             // 선택: 시나리오 내 메시지 목록
  "status": "active" | "completed" | "failed",  // 선택
  "updated_at": "ISO-8601 string"  // 선택
}`}</pre></dd>
            <dt>응답 (200 OK):</dt>
            <dd>업데이트된 세션 객체 또는 <code>null</code></dd>
          </dl>
        </div>
      </section>

      {/* ========== Shortcut (Categories) ========== */}
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.get}`}>GET</span>
          <span className={styles.path}>/shortcut</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>숏컷(카테고리) 조회</h2>
          <p>메인 입력창 상단의 숏컷 메뉴 구조를 조회합니다.</p>
          <dl>
            <dt>응답 (200 OK):</dt>
            <dd><pre>{`{
  "categories": [
    {
      "name": "카테고리명",
      "subCategories": [
        {
          "title": "서브카테고리명",
          "items": [
            {
              "title": "항목명",
              "description": "설명",
              "action": {
                "type": "scenario" | "text",
                "value": "시나리오ID 또는 텍스트"
              }
            }
          ]
        }
      ]
    }
  ]
}`}</pre></dd>
          </dl>
        </div>
      </section>

      {/* ========== Config ========== */}
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.get}`}>GET</span>
          <span className={styles.path}>/config/general</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>일반 설정 조회</h2>
          <p>전체 시스템에 적용되는 일반 설정을 조회합니다.</p>
          <dl>
            <dt>응답 (200 OK):</dt>
            <dd><pre>{`{
  "maxFavorites": 10,
  "dimUnfocusedPanels": true,
  "enableFavorites": true,
  "showHistoryOnGreeting": false,
  "mainInputPlaceholder": "string",
  "headerTitle": "AI Chatbot",
  "enableMainChatMarkdown": true,
  "showScenarioBubbles": true,
  "llmProvider": "gemini",
  "flowiseApiUrl": "string"
}`}</pre></dd>
          </dl>
        </div>
      </section>

      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.patch}`}>PATCH</span>
          <span className={styles.path}>/config/general</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>일반 설정 업데이트</h2>
          <p>전체 시스템에 적용되는 일반 설정을 업데이트합니다.</p>
          <dl>
            <dt>요청 본문 (Request Body):</dt>
            <dd><pre>{`{
  "maxFavorites": 10,
  "dimUnfocusedPanels": true,
  "enableFavorites": true,
  // ... 업데이트할 필드들
}`}</pre></dd>
            <dt>응답 (200 OK):</dt>
            <dd><code>true</code> 또는 <code>false</code></dd>
          </dl>
        </div>
      </section>

      {/* ========== User Settings ========== */}
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.get}`}>GET</span>
          <span className={styles.path}>/settings/{'{user_id}'}</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>사용자 개인 설정 조회</h2>
          <p>특정 사용자의 개인 설정을 조회합니다.</p>
          <dl>
            <dt>Path Parameter:</dt>
            <dd><code>user_id</code>: 사용자 ID</dd>
            <dt>응답 (200 OK):</dt>
            <dd><pre>{`{
  "fontSize": "default" | "small" | "large",
  "language": "ko" | "en",
  "theme": "light" | "dark",
  // ... 기타 개인 설정
}`}</pre></dd>
          </dl>
        </div>
      </section>

      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.patch}`}>PATCH</span>
          <span className={styles.path}>/settings/{'{user_id}'}</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>사용자 개인 설정 업데이트</h2>
          <p>특정 사용자의 개인 설정을 업데이트합니다.</p>
          <dl>
            <dt>요청 본문 (Request Body):</dt>
            <dd><pre>{`{
  "fontSize": "large",
  "language": "en",
  // ... 업데이트할 설정들
}`}</pre></dd>
            <dt>응답 (200 OK):</dt>
            <dd><code>true</code> 또는 <code>false</code></dd>
          </dl>
        </div>
      </section>

      {/* ========== Search ========== */}
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.get}`}>GET</span>
          <span className={styles.path}>/search/messages</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>메시지 검색</h2>
          <p>사용자의 모든 대화에서 특정 키워드를 포함한 메시지를 검색합니다.</p>
          <dl>
            <dt>쿼리 파라미터:</dt>
            <dd>
              <code>q</code>: 검색 키워드 (필수)<br/>
              <code>usr_id</code>: 사용자 ID (필수)
            </dd>
            <dt>응답 (200 OK):</dt>
            <dd><pre>{`[
  {
    "id": "conversation-uuid",
    "conversation_id": "uuid",
    "conversation_title": "string",
    "title": "string",
    "snippets": [
      "...매칭된 텍스트 조각...",
      "...또 다른 매칭 조각..."
    ],
    "matches": [ ... ]
  }
]`}</pre></dd>
          </dl>
        </div>
      </section>

      {/* ========== Users & Notifications ========== */}
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.get}`}>GET</span>
          <span className={styles.path}>/users/notifications</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>알림 목록 조회</h2>
          <p>사용자의 모든 알림을 조회합니다.</p>
          <dl>
            <dt>쿼리 파라미터:</dt>
            <dd>
              <code>usr_id</code>: 사용자 ID (필수)<br/>
              <code>ten_id</code>: 테넌트 ID<br/>
              <code>stg_id</code>: 스테이지 ID<br/>
              <code>sec_ofc_id</code>: 보안 오피스 ID
            </dd>
            <dt>응답 (200 OK):</dt>
            <dd><pre>{`[
  {
    "id": "notification-uuid",
    "title": "string",
    "message": "string",
    "is_read": boolean,
    "type": "info" | "warning" | "error",
    "created_at": "ISO-8601 string"
  }
]`}</pre></dd>
          </dl>
        </div>
      </section>

      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.patch}`}>PATCH</span>
          <span className={styles.path}>/users/notifications/{'{notification_id}'}</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>알림 읽음 처리</h2>
          <p>특정 알림을 읽음으로 표시합니다.</p>
          <dl>
            <dt>요청 본문 (Request Body):</dt>
            <dd><pre>{`{
  "is_read": true
}`}</pre></dd>
            <dt>응답 (200 OK):</dt>
            <dd>업데이트된 알림 객체</dd>
          </dl>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <p>
          <strong>Last Updated:</strong> 2026-02-04<br/>
          모든 API는 JSON 형식으로 데이터를 주고받습니다.<br/>
          인증이 필요한 경우 헤더에 토큰을 포함해야 할 수 있습니다.
        </p>
      </footer>

    </div>
  );
}