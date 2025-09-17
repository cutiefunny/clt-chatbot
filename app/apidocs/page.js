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
          이 문서는 FastAPI 백엔드 서버를 기반으로 한 챗봇 API를 설명합니다. Base URL: <code>/api/v1</code>
        </p>
      </header>

      {/* --- Authentication --- */}
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.post}`}>POST</span>
          <span className={styles.path}>/auth/login</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>Google 계정 로그인</h2>
          <p>Google OAuth ID 토큰을 사용하여 사용자를 인증하고, 서버 접근을 위한 JWT를 발급합니다.</p>
          <dl>
            <dt>요청 본문:</dt>
            <dd><pre>{`{
  "idToken": "string (Google ID Token)"
}`}</pre></dd>
            <dt>응답 (200 OK):</dt>
            <dd><pre>{`{
  "accessToken": "string (JWT)",
  "user": {
    "uid": "string",
    "displayName": "string",
    "email": "string",
    "photoURL": "string"
  }
}`}</pre></dd>
          </dl>
          
          <CollapsibleSection title="구현 가이드: 안전한 토큰 교환 방식">
              <h4>인증 흐름</h4>
              <ol className={styles.guideList}>
                  <li><strong>클라이언트: Google 로그인</strong><br/>
                      사용자가 프론트엔드에서 Google 로그인을 완료하면 Firebase Auth SDK로부터 <code>ID 토큰</code>을 받습니다.
                  </li>
                  <li><strong>클라이언트 → 서버: ID 토큰 전송</strong><br/>
                      클라이언트는 이 <code>ID 토큰</code>을 본문(body)에 담아 FastAPI의 <code>/auth/login</code> 엔드포인트로 POST 요청을 보냅니다.
                  </li>
                  <li><strong>서버: Google ID 토큰 검증</strong><br/>
                      FastAPI 서버는 수신한 <code>ID 토큰</code>이 유효한지 Google에 직접 확인합니다. (예: <code>google-auth</code> 라이브러리 사용)
                  </li>
                  <li><strong>서버: 사용자 조회 및 생성</strong><br/>
                      토큰 검증 후 얻은 사용자 정보(이메일, 이름 등)를 사용하여 데이터베이스에서 사용자를 조회하거나, 없는 경우 새로 생성합니다.
                  </li>
                  <li><strong>서버 → 클라이언트: 자체 Access Token 발급</strong><br/>
                      서버는 해당 사용자를 식별하는 내용(예: user_id)을 담아, 자체 비밀 키로 서명한 <strong>새로운 Access Token(JWT)</strong>을 생성하여 클라이언트에 반환합니다.
                  </li>
                   <li><strong>클라이언트: Access Token 저장</strong><br/>
                      클라이언트는 서버로부터 받은 이 Access Token을 로컬 스토리지나 쿠키와 같은 안전한 공간에 저장합니다.
                  </li>
                  <li><strong>이후 모든 요청: Access Token 사용</strong><br/>
                      클라이언트는 이후 모든 API 요청 시 HTTP 헤더에 <code>Authorization: Bearer YOUR_FASTAPI_TOKEN</code> 형식으로 Access Token을 담아 보냅니다. FastAPI 서버는 이 토큰의 유효성만 검증하여 사용자를 인증합니다.
                  </li>
              </ol>

              <h4>FastAPI 구현 예시 (Python)</h4>
              <pre>{`
# main.py
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel

# --- 설정 (실제로는 .env 파일에서 로드) ---
SECRET_KEY = "YOUR_SECRET_KEY" # FastAPI 서버만 아는 비밀 키
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

app = FastAPI()

class TokenData(BaseModel):
    user_id: str | None = None

# Google ID 토큰 검증 및 자체 토큰 발급 로직 (login)
@app.post("/auth/login")
async def login_for_access_token(google_token: dict):
    # 1. google-auth 라이브러리로 google_token['idToken'] 검증
    # 2. 검증 성공 시 DB에서 사용자 조회/생성
    # 3. FastAPI 자체 Access Token 생성
    user_id = "some_user_id_from_db" # 예시
    access_token = create_access_token(
        data={"sub": user_id}, expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {"accessToken": access_token, "user": ...}

# 요청 시마다 토큰을 검증하여 현재 사용자를 가져오는 함수
async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        token_data = TokenData(user_id=user_id)
    except JWTError:
        raise credentials_exception
    # DB에서 user_id로 사용자 정보 조회
    # user = get_user_from_db(user_id=token_data.user_id)
    # if user is None:
    #     raise credentials_exception
    return user # 현재 사용자 객체 반환

# 보호된 엔드포인트 예시
@app.get("/users/me")
async def read_users_me(current_user: dict = Depends(get_current_user)):
    return current_user
              `}</pre>
          </CollapsibleSection>
        </div>
      </section>

      {/* --- Chat --- */}
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.post}`}>POST</span>
          <span className={styles.path}>/chat</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>챗 응답 생성</h2>
          <p>사용자 메시지를 받아 LLM 또는 시나리오 엔진을 통해 응답을 생성합니다. LLM 응답 시 스트리밍을 지원합니다.</p>
          <dl>
            <dt>헤더:</dt>
            <dd><code>Authorization: Bearer YOUR_ACCESS_TOKEN</code></dd>
            <dt>요청 본문:</dt>
            <dd><pre>{`{
  "conversationId": "string | null",
  "message": {
    "text": "string"
  },
  "language": "string ('ko' or 'en')"
}`}</pre></dd>
            <dt>응답 (200 OK):</dt>
            <dd>
              <p>LLM 응답의 경우 <strong>Streaming Text</strong>, 시나리오 응답의 경우 <strong>JSON 객체</strong>가 반환됩니다.</p>
            </dd>
          </dl>
        </div>
      </section>

      {/* --- Conversations List --- */}
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.get}`}>GET</span>
          <span className={styles.path}>/conversations</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>대화 목록 조회</h2>
          <p>사용자의 모든 대화 목록을 최신순으로 가져옵니다.</p>
          <dl>
            <dt>헤더:</dt>
            <dd><code>Authorization: Bearer YOUR_ACCESS_TOKEN</code></dd>
            <dt>응답 (200 OK):</dt>
            <dd><pre>{`[
  {
    "id": "string",
    "title": "string",
    "updated_at": "datetime"
  },
  ...
]`}</pre></dd>
          </dl>
        </div>
      </section>

      {/* --- Conversation Detail --- */}
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.get}`}>GET</span>
          <span className={styles.path}>/conversations/{'{conversation_id}'}</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>특정 대화 상세 조회</h2>
          <p>특정 대화의 메시지 기록을 페이지네이션으로 가져옵니다.</p>
          <dl>
            <dt>헤더:</dt>
            <dd><code>Authorization: Bearer YOUR_ACCESS_TOKEN</code></dd>
            <dt>경로 파라미터:</dt>
            <dd><code>conversation_id (string, required)</code></dd>
            <dt>쿼리 파라미터:</dt>
            <dd><code>limit (number, optional, default: 15)</code><br/><code>cursor (string, optional)</code></dd>
            <dt>응답 (200 OK):</dt>
            <dd><pre>{`{
  "messages": [
    {
      "id": "string",
      "sender": "user" | "bot",
      "text": "string",
      "created_at": "datetime"
    },
    ...
  ],
  "next_cursor": "string | null"
}`}</pre></dd>
          </dl>
        </div>
      </section>
      
      {/* --- Save Message --- */}
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.post}`}>POST</span>
          <span className={styles.path}>/conversations/messages</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>메시지 저장</h2>
          <p>
            메시지를 대화에 저장합니다. <code>conversationId</code>가 <code>null</code>이거나 제공되지 않은 경우, 새 대화를 생성하고 해당 대화에 메시지를 저장합니다.
          </p>
          <dl>
            <dt>헤더:</dt>
            <dd><code>Authorization: Bearer YOUR_ACCESS_TOKEN</code></dd>
            <dt>요청 본문:</dt>
            <dd><pre>{`{
  "conversationId": "string | null",
  "message": {
    "sender": "user" | "bot",
    "text": "string",
    "type": "string (optional)",
    "node": "object (optional)",
    "scenarios": "Array<string> (optional)"
  }
}`}</pre></dd>
            <dt>응답 (201 Created):</dt>
            <dd>
              <p>성공적으로 저장(또는 생성)된 후의 대화 ID와 메시지 정보를 반환합니다.</p>
              <pre>{`{
  "conversationId": "string (new or existing ID)",
  "message": {
    "id": "string",
    "sender": "user" | "bot",
    "text": "string",
    "created_at": "datetime"
    // ...
  }
}`}</pre>
            </dd>
          </dl>
        </div>
      </section>

      {/* --- Conversation Update --- */}
       <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.patch}`}>PATCH</span>
          <span className={styles.path}>/conversations/{'{conversation_id}'}</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>대화 제목 수정</h2>
          <p>특정 대화의 제목을 수정합니다.</p>
          <dl>
            <dt>헤더:</dt>
            <dd><code>Authorization: Bearer YOUR_ACCESS_TOKEN</code></dd>
            <dt>경로 파라미터:</dt>
            <dd><code>conversation_id (string, required)</code></dd>
            <dt>요청 본문:</dt>
            <dd><pre>{`{
  "title": "string (New Title)"
}`}</pre></dd>
            <dt>응답 (200 OK):</dt>
            <dd><pre>{`{
  "id": "string",
  "title": "string",
  "updated_at": "datetime"
}`}</pre></dd>
          </dl>
        </div>
      </section>

      {/* --- Conversation Delete --- */}
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.delete}`}>DELETE</span>
          <span className={styles.path}>/conversations/{'{conversation_id}'}</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>대화 삭제</h2>
          <p>특정 대화를 영구적으로 삭제합니다.</p>
          <dl>
             <dt>헤더:</dt>
            <dd><code>Authorization: Bearer YOUR_ACCESS_TOKEN</code></dd>
            <dt>경로 파라미터:</dt>
            <dd><code>conversation_id (string, required)</code></dd>
            <dt>응답 (204 No Content):</dt>
            <dd>성공 시 본문 없음</dd>
          </dl>
        </div>
      </section>

      {/* --- User Settings --- */}
       <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.get}`}>GET</span>
          <span className={styles.path}>/settings</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>사용자 설정 조회</h2>
          <p>현재 사용자의 테마, 폰트 크기, 언어 설정을 조회합니다.</p>
          <dl>
            <dt>헤더:</dt>
            <dd><code>Authorization: Bearer YOUR_ACCESS_TOKEN</code></dd>
            <dt>응답 (200 OK):</dt>
            <dd><pre>{`{
  "theme": "light" | "dark",
  "fontSize": "default" | "small",
  "language": "ko" | "en"
}`}</pre></dd>
          </dl>
        </div>
      </section>
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.patch}`}>PATCH</span>
          <span className={styles.path}>/settings</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>사용자 설정 수정</h2>
          <p>현재 사용자의 설정을 부분적으로 수정합니다.</p>
          <dl>
            <dt>헤더:</dt>
            <dd><code>Authorization: Bearer YOUR_ACCESS_TOKEN</code></dd>
             <dt>요청 본문 (수정할 필드만 포함):</dt>
            <dd><pre>{`{
  "theme": "dark",
  "fontSize": "small",
  "language": "en"
}`}</pre></dd>
            <dt>응답 (200 OK):</dt>
            <dd>수정된 전체 설정 객체</dd>
          </dl>
        </div>
      </section>
      
      {/* --- Notifications --- */}
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.get}`}>GET</span>
          <span className={styles.path}>/notifications</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>알림 목록 조회</h2>
          <p>사용자의 모든 알림을 최신순으로 가져옵니다.</p>
          <dl>
            <dt>헤더:</dt>
            <dd><code>Authorization: Bearer YOUR_ACCESS_TOKEN</code></dd>
            <dt>응답 (200 OK):</dt>
            <dd><pre>{`{
  "notifications": [
    {
      "id": "string",
      "message": "string",
      "type": "info" | "error" | "success",
      "read": "boolean",
      "created_at": "datetime"
    },
    ...
  ],
  "hasUnread": "boolean"
}`}</pre></dd>
          </dl>
        </div>
      </section>
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.patch}`}>PATCH</span>
          <span className={styles.path}>/notifications/{'{notification_id}'}/read</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>알림 읽음 처리</h2>
          <p>특정 알림을 읽음 상태로 변경합니다.</p>
          <dl>
            <dt>헤더:</dt>
            <dd><code>Authorization: Bearer YOUR_ACCESS_TOKEN</code></dd>
             <dt>경로 파라미터:</dt>
            <dd><code>notification_id (string, required)</code></dd>
            <dt>응답 (204 No Content):</dt>
            <dd>성공 시 본문 없음</dd>
          </dl>
        </div>
      </section>
      <section className={styles.endpoint}>
        <div className={styles.endpointHeader}>
          <span className={`${styles.method} ${styles.delete}`}>DELETE</span>
          <span className={styles.path}>/notifications/{'{notification_id}'}</span>
        </div>
        <div className={styles.endpointBody}>
          <h2>알림 삭제</h2>
          <p>특정 알림을 삭제합니다.</p>
          <dl>
            <dt>헤더:</dt>
            <dd><code>Authorization: Bearer YOUR_ACCESS_TOKEN</code></dd>
             <dt>경로 파라미터:</dt>
            <dd><code>notification_id (string, required)</code></dd>
            <dt>응답 (204 No Content):</dt>
            <dd>성공 시 본문 없음</dd>
          </dl>
        </div>
      </section>
    </div>
  );
}