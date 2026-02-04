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

      {/* --- Chat --- */}
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
  "usr_id": "string",           // 필수: 사용자 ID
  "conversation_id": "string",   // 선택: 기존 대화방 ID
  "scenario_session_id": "string", // 선택: 진행 중인 시나리오 세션 ID
  "content": "string",           // 사용자 입력 텍스트
  "language": "ko",              // 선택: ko | en
  "slots": { "key": "value" },   // 선택: 현재 시나리오 슬롯 상태
  "source_handle": "string"      // 선택: 시나리오 노드 핸들 ID
}`}</pre></dd>
            <dt>응답 (Response):</dt>
            <dd>
                <p><strong>Case 1: 일반/시나리오 응답 (JSON)</strong></p>
                <pre>{`{
  "type": "text" | "scenario" | "scenario_start",
  "content": "string",           // AI 답변 내용
  "events": [ ... ],             // 시나리오 제어 이벤트 목록
  "scenario_state": { ... },     // 현재 시나리오 진행 상태
  "slots": { ... }               // 업데이트된 슬롯 정보
}`}</pre>
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
          <p>사용자의 모든 대화방 목록을 최신순으로 조회합니다.</p>
          <dl>
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
          <span className={`${styles.method} ${styles.get}`}>GET</span>
          <span className={styles.path}>/conversations/{'{conversation_id}'}/messages</span>
        </div>
        <div className={styles.endpointBody}>
          <h2 style={{ color: '#00e676' }}>대화 메시지 내역 조회 (New)</h2>
          <p>특정 대화방의 전체 메시지(User/Bot) 이력을 시간순으로 조회합니다.</p>
          <dl>
            <dt>응답 (200 OK):</dt>
            <dd><pre>{`[
  {
    "id": "msg-uuid",
    "role": "user" | "bot",
    "content": "string",
    "type": "text" | "scenario",
    "created_at": "ISO-8601 string",
    "metadata": { ... } // 시나리오 정보 등
  }
]`}</pre></dd>
          </dl>
        </div>
      </section>

      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.patch}`}>PATCH</span>
          <span className={`${styles.method} ${styles.delete}`}>DELETE</span>
          <span className={styles.path}>/conversations/{'{conversation_id}'}</span>
        </div>
        <div className={styles.endpointBody}>
          <h2 style={{ color: '#00e676' }}>대화 수정 및 삭제 (New)</h2>
          <p>대화방의 제목 변경, 고정(Pin) 상태 변경 또는 대화방을 삭제합니다.</p>
          <dl>
            <dt>PATCH Body:</dt>
            <dd><pre>{`{
  "title": "새로운 제목",
  "is_pinned": true
}`}</pre></dd>
          </dl>
        </div>
      </section>

      {/* --- Scenario Sessions --- */}
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.get}`}>GET</span>
          <span className={styles.path}>/conversations/{'{conversation_id}'}/scenario-sessions</span>
        </div>
        <div className={styles.endpointBody}>
          <h2 style={{ color: '#ffcc00' }}>대화 내 시나리오 세션 목록 조회</h2>
          <p>특정 대화방 안에서 실행된 모든 시나리오 세션 이력을 조회합니다.</p>
          <dl>
            <dt>Path Parameter:</dt>
            <dd><code>conversation_id</code>: 대화방 ID</dd>
            <dt>응답 (200 OK):</dt>
            <dd><pre>{`[
  {
    "id": "session-uuid",
    "scenario_id": "string",
    "title": "string",
    "status": "active" | "completed" | "failed",
    "created_at": "...",
    "updated_at": "..."
  }
]`}</pre></dd>
          </dl>
        </div>
      </section>
      {/* --- Scenario Sessions CUD (NEW) --- */}
<section className={styles.endpoint}>
  <div className={styles.endpointHeader}>
    <span className={`${styles.method} ${styles.post}`}>POST</span>
    <span className={styles.path}>/conversations/{'{conversation_id}'}/scenario-sessions</span>
  </div>
  <div className={styles.endpointBody}>
    <h2 style={{ color: '#00e676' }}>시나리오 세션 생성 (Create)</h2>
    <p>특정 대화 내에서 새로운 시나리오를 시작할 때 세션을 생성합니다.</p>
    <dl>
      <dt>Request Body:</dt>
      <dd><pre>{`{
  "scenario_id": "string",     // 시작할 시나리오 ID
  "usr_id": "string",          // 사용자 ID
  "status": "in_progress",     // 초기 상태
  "current_node": "start",     // 시작 노드
  "variables": {}              // 초기 변수/슬롯 데이터
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
    <h2 style={{ color: '#00e676' }}>시나리오 세션 업데이트 (Update)</h2>
    <p>사용자의 선택이나 입력에 따라 시나리오의 현재 노드, 변수, 상태를 갱신합니다.</p>
    <dl>
      <dt>Request Body:</dt>
      <dd><pre>{`{
  "usr_id": "string",
  "current_node": "string",    // 이동한 노드 ID
  "variables": { ... },        // 누적된 슬롯/변수 값
  "status": "completed" | "failed" | "in_progress"
}`}</pre></dd>
    </dl>
  </div>
</section>

<section className={styles.endpoint}>
  <div className={styles.endpointHeader}>
    <span className={`${styles.method} ${styles.delete}`}>DELETE</span>
    <span className={styles.path}>/scenario-sessions/{'{session_id}'}</span>
  </div>
  <div className={styles.endpointBody}>
    <h2 style={{ color: '#ff1744' }}>시나리오 세션 삭제 (Delete)</h2>
    <p>특정 시나리오 실행 이력을 삭제합니다.</p>
    <dl>
      <dt>Query Parameters:</dt>
      <dd><code>usr_id</code>: 사용자 식별자</dd>
    </dl>
  </div>
</section>

      {/* --- Shortcut --- */}
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.get}`}>GET</span>
          <span className={`${styles.method} ${styles.post}`}>POST</span>
          <span className={styles.path}>/shortcut</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>숏컷(카테고리) 관리</h2>
          <p>메인 입력창 상단의 숏컷 메뉴 구조를 조회하거나 저장합니다.</p>
          <dl>
            <dt>데이터 구조:</dt>
            <dd><pre>{`[
  {
    "name": "카테고리명",
    "subCategories": [
      {
        "title": "서브카테고리명",
        "items": [
          { "title": "항목명", "description": "설명", "action": { "type": "scenario", "value": "ID" } }
        ]
      }
    ]
  }
]`}</pre></dd>
          </dl>
        </div>
      </section>

      {/* --- Scenarios List --- */}
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.get}`}>GET</span>
          <span className={styles.path}>/scenarios</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>사용 가능 시나리오 목록 조회</h2>
          <p>에디터 및 시스템에서 선택 가능한 전체 시나리오 정의를 반환합니다.</p>
          <dl>
            <dt>응답 (200 OK):</dt>
            <dd><pre>{`[
  {
    "id": "DEV_1000_000025_1",
    "title": "도착일자 영향 분석",
    "description": "설명..."
  }
]`}</pre></dd>
          </dl>
        </div>
      </section>

    </div>
  );
}