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
          이 문서는 <strong>FastAPI</strong>로 마이그레이션된 백엔드 서버 API를 설명합니다.<br/>
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
            사용자의 메시지를 처리하고 AI 응답을 생성합니다.<br/>
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
                <code>limit</code>: 조회할 메시지 개수 (Default: 50)<br/>
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

    </div>
  );
}