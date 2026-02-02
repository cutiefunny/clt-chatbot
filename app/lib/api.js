// app/lib/api.js

// [수정] 프록시 없이 직접 백엔드 주소 사용
// 백엔드 엔드포인트가 /api/v1 으로 시작한다고 가정 (로그 기반)
const REMOTE_URL = "http://202.20.84.65:8083";
const API_PREFIX = "/api/v1"; 

// 사용자 ID 가져오기 (따옴표 제거 등 안전 처리)
function getUserId() {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("userId");
    return stored ? stored.replace(/['"]+/g, '').trim() : "";
  }
  return "";
}

// 공통 헤더
function getHeaders() {
  return {
    "Content-Type": "application/json",
  };
}

// URL 생성 헬퍼 (단순 URL 결합)
function buildUrl(endpoint, params = {}) {
  // 예: http://202.20.84.65:8083/api/v1/conversations
  const fullUrl = `${REMOTE_URL}${API_PREFIX}${endpoint}`;
  const urlObj = new URL(fullUrl);
  
  // params에 있는 것만 쿼리 스트링에 추가 (usr_id 자동 추가 로직 제거됨)
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null) {
      urlObj.searchParams.append(key, params[key]);
    }
  });

  return urlObj.toString();
}

/**
 * ==============================================================================
 * 대화 (Conversation) 관련 API
 * ==============================================================================
 */

// [GET] 목록 조회 -> URL 쿼리에 usr_id 명시적 추가
export async function fetchConversations(offset = 0, limit = 50) {
  const userId = getUserId();
  const url = buildUrl(`/conversations`, { 
    offset, 
    limit, 
    usr_id: userId // GET 요청은 쿼리 파라미터 사용
  });
  
  const res = await fetch(url, { method: "GET", headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch conversations: ${res.status}`);
  return res.json();
}

// [POST] 생성 -> Body에만 usr_id 포함 (URL 파라미터 없음)
export async function createConversation(title) {
  // 쿼리 파라미터 없이 URL 생성
  const url = buildUrl(`/conversations`); 
  const userId = getUserId();

  const body = {
    title: title || "New Chat",
    usr_id: userId // Body에만 포함
  };

  const res = await fetch(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[createConversation] Error: ${res.status}`, errorText);
    throw new Error(`Failed to create conversation: ${res.status}`);
  }
  return res.json();
}

// [GET] 상세 조회 -> URL 쿼리에 usr_id 포함
export async function getConversation(conversationId) {
  const userId = getUserId();
  const url = buildUrl(`/conversations/${conversationId}`, { 
    usr_id: userId 
  });
  
  const res = await fetch(url, { method: "GET", headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to get conversation: ${res.status}`);
  return res.json();
}

// [PATCH] 수정 -> Body에만 usr_id 포함
export async function updateConversation(conversationId, { title, isPinned }) {
  const url = buildUrl(`/conversations/${conversationId}`);
  const userId = getUserId();
  
  const payload = { 
    usr_id: userId 
  };
  if (title !== undefined) payload.title = title;
  if (isPinned !== undefined) payload.is_pinned = isPinned;

  const res = await fetch(url, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update conversation: ${res.status}`);
  return res.json();
}

// [DELETE] 삭제 -> URL 쿼리에 usr_id 포함
export async function deleteConversation(conversationId) {
  const userId = getUserId();
  const url = buildUrl(`/conversations/${conversationId}`, { 
    usr_id: userId 
  });
  
  const res = await fetch(url, { method: "DELETE", headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to delete conversation: ${res.status}`);
  return true;
}

/**
 * ==============================================================================
 * 메시지 (Message) 관련 API
 * ==============================================================================
 */

// [GET] 메시지 목록 -> URL 쿼리에 usr_id 포함
export async function fetchMessages({ queryKey, pageParam = 0 }) {
  const [_, conversationId] = queryKey;
  if (!conversationId) return [];
  
  const userId = getUserId();
  const limit = 15;
  const url = buildUrl(`/conversations/${conversationId}/messages`, {
    skip: pageParam,
    limit: limit,
    usr_id: userId
  });

  const res = await fetch(url, { method: "GET", headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch messages: ${res.status}`);
  return res.json();
}

// [POST] 메시지 전송 -> Body에만 usr_id 포함
export async function createMessage(conversationId, messageData) {
  const url = buildUrl(`/conversations/${conversationId}/messages`);
  const userId = getUserId();

  const payload = {
    role: messageData.sender || "user",
    content: messageData.text || messageData.content || "",
    type: messageData.type,
    scenario_session_id: messageData.scenarioSessionId,
    meta: messageData.meta || {},
    usr_id: userId // Body에 추가
  };

  const res = await fetch(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`Failed to create message: ${res.status}`);
  return res.json();
}

// [PATCH] 메시지 수정 -> Body에만 usr_id 포함
export async function updateMessage(conversationId, messageId, updates) {
  const url = buildUrl(`/conversations/${conversationId}/messages/${messageId}`);
  const userId = getUserId();

  const payload = { 
    usr_id: userId 
  };
  if (updates.selectedOption !== undefined) payload.selectedOption = updates.selectedOption;
  if (updates.feedback !== undefined) payload.feedback = updates.feedback;

  const res = await fetch(url, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update message: ${res.status}`);
  return res.json();
}

// [GET] 시나리오 세션 -> URL 쿼리에 usr_id 포함
export async function fetchScenarioSessions(conversationId) {
  const userId = getUserId();
  const url = buildUrl(`/conversations/${conversationId}/scenario-sessions`, {
    usr_id: userId
  });
  
  const res = await fetch(url, { method: "GET", headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch scenario sessions: ${res.status}`);
  return res.json();
}