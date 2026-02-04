// app/lib/api.js

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

// URL 생성 헬퍼
function buildUrl(endpoint, params = {}) {
  const fullUrl = `${REMOTE_URL}${API_PREFIX}${endpoint}`;
  const urlObj = new URL(fullUrl);
  
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

// 대화 목록 조회
export async function fetchConversations(offset = 0, limit = 50) {
  const userId = getUserId();
  const url = buildUrl(`/conversations`, { offset, limit, usr_id: userId });
  const res = await fetch(url, { method: "GET", headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch conversations: ${res.status}`);
  return res.json();
}

// 대화 생성
export async function createConversation(title) {
  const url = buildUrl(`/conversations`); 
  const userId = getUserId();
  const body = { title: title || "New Chat", usr_id: userId };
  const res = await fetch(url, { method: "POST", headers: getHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Failed to create conversation: ${res.status}`);
  return res.json();
}

// 대화 상세 조회
export async function getConversation(conversationId) {
  const userId = getUserId();
  const url = buildUrl(`/conversations/${conversationId}`, { usr_id: userId });
  const res = await fetch(url, { method: "GET", headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to get conversation: ${res.status}`);
  return res.json();
}

// 대화 수정
export async function updateConversation(conversationId, { title, isPinned }) {
  const url = buildUrl(`/conversations/${conversationId}`);
  const userId = getUserId();
  
  const payload = { usr_id: userId };
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

// 대화 삭제
export async function deleteConversation(conversationId) {
  const userId = getUserId();
  const url = buildUrl(`/conversations/${conversationId}`, { usr_id: userId });
  const res = await fetch(url, { method: "DELETE", headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to delete conversation: ${res.status}`);
  return true;
}

/**
 * ==============================================================================
 * 메시지 (Message) 관련 API
 * ==============================================================================
 */

// 메시지 목록 조회
export async function fetchMessages({ queryKey, pageParam = 0 }) {
  const [_, conversationId] = queryKey;
  if (!conversationId) return [];
  
  const userId = getUserId();
  const url = buildUrl(`/conversations/${conversationId}`, {
    skip: pageParam,
    limit: 15,
    usr_id: userId
  });

  const res = await fetch(url, { method: "GET", headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch messages: ${res.status}`);
  
  const data = await res.json();
  
  if (data && Array.isArray(data.messages)) {
    return data.messages.map(msg => ({
      id: msg.id,
      sender: msg.role === "user" ? "user" : "bot",
      text: msg.content,
      createdAt: msg.created_at,
      selectedOption: msg.selected_option,
      feedback: msg.feedback
    }));
  }
  return [];
}

// 메시지 전송
export async function createMessage(conversationId, messageData) {
  const url = buildUrl(`/conversations/${conversationId}/messages`);
  const userId = getUserId();
  const payload = {
    role: messageData.sender || "user",
    content: messageData.text || messageData.content || "",
    type: messageData.type,
    scenario_session_id: messageData.scenarioSessionId,
    meta: messageData.meta || {},
    usr_id: userId 
  };

  try {
    const res = await fetch(url, { 
      method: "POST", 
      headers: getHeaders(), 
      body: JSON.stringify(payload) 
    });

    if (res.status === 404) {
      // 👈 [방어] 백엔드에 API가 없는 경우 경고만 띄우고 가상의 응답 반환
      console.warn(`[API] POST /messages not found (404). Check backend routing.`);
      return { id: `temp_${Date.now()}`, ...payload };
    }

    if (!res.ok) throw new Error(`Failed to create message: ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error("[API] createMessage failed:", error);
    // 👈 네트워크 에러 등 발생 시에도 흐름 유지
    return { id: `temp_${Date.now()}`, ...payload };
  }
}

// 메시지 수정 (피드백/옵션 업데이트용 - 추가됨)
export async function updateMessage(conversationId, messageId, updates) {
  const url = buildUrl(`/conversations/${conversationId}/messages/${messageId}`);
  const userId = getUserId();

  const payload = { 
    usr_id: userId,
    ...updates 
  };

  const res = await fetch(url, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update message: ${res.status}`);
  return res.json();
}

/**
 * ==============================================================================
 * 시나리오 (Scenario) 관련 API
 * ==============================================================================
 */

export async function fetchScenarios() {
  const url = buildUrl(`/scenarios`);
  try {
    const res = await fetch(url, { method: "GET", headers: getHeaders() });
    if (!res.ok) return [];
    return await res.json();
  } catch (error) {
    console.error("[API] fetchScenarios failed:", error);
    return [];
  }
}

// 개별 시나리오 상세 조회
export async function fetchScenario(scenarioId) {
  const url = buildUrl(`/scenarios/${scenarioId}`);
  try {
    const res = await fetch(url, { method: "GET", headers: getHeaders() });
    if (!res.ok) throw new Error(`Scenario not found: ${scenarioId}`);
    return await res.json();
  } catch (error) {
    console.error("[API] fetchScenario failed:", error);
    throw error;
  }
}

// 숏컷(카테고리) 데이터 조회
export async function fetchShortcuts() {
  const url = buildUrl(`/shortcut`);
  try {
    const res = await fetch(url, { method: "GET", headers: getHeaders() });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error("[API] fetchShortcuts failed:", error);
    return null;
  }
}

export async function fetchScenarioSessions(conversationId) {
  const userId = getUserId();
  const url = buildUrl(`/conversations/${conversationId}/scenario-sessions`, { usr_id: userId });
  try {
    const res = await fetch(url, { method: "GET", headers: getHeaders() });
    if (!res.ok) return [];
    return await res.json();
  } catch (error) {
    console.error("[API] fetchScenarioSessions failed:", error);
    return [];
  }
}

export async function createScenarioSession(conversationId, scenarioId) {
  const url = buildUrl(`/conversations/${conversationId}/scenario-sessions`);
  const userId = getUserId();
  const body = {
    scenario_id: scenarioId,
    usr_id: userId,
    status: "in_progress",
    current_node: "start",
    variables: {}
  };

  try {
    const res = await fetch(url, { method: "POST", headers: getHeaders(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Server responded with ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error("[API] createScenarioSession failed:", error);
    return { id: `temp_${Date.now()}`, scenario_id: scenarioId, status: "in_progress" };
  }
}

export async function updateScenarioSession(sessionId, updates) {
  const url = buildUrl(`/scenario-sessions/${sessionId}`);
  const userId = getUserId();
  const payload = { usr_id: userId, ...updates };

  try {
    const res = await fetch(url, { method: "PATCH", headers: getHeaders(), body: JSON.stringify(payload) });
    if (!res.ok) {
      console.warn(`[API] Failed to update session ${sessionId}: ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (error) {
    console.error("[API] updateScenarioSession failed:", error);
    return null;
  }
}

/**
 * ==============================================================================
 * 설정 (Config/Settings) 관련 API
 * ==============================================================================
 */

// 일반 설정 조회
export async function fetchGeneralConfig() {
  const url = buildUrl(`/config/general`);
  try {
    const res = await fetch(url, { method: "GET", headers: getHeaders() });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error("[API] fetchGeneralConfig failed:", error);
    return null;
  }
}

// 일반 설정 업데이트
export async function updateGeneralConfig(settings) {
  const url = buildUrl(`/config/general`);
  try {
    const res = await fetch(url, { 
      method: "PATCH", 
      headers: getHeaders(), 
      body: JSON.stringify(settings) 
    });
    if (!res.ok) {
      console.warn(`[API] Failed to update general config: ${res.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[API] updateGeneralConfig failed:", error);
    return false;
  }
}

// 사용자 개인 설정 조회
export async function fetchUserSettings(userId) {
  const url = buildUrl(`/settings/${userId}`);
  try {
    const res = await fetch(url, { method: "GET", headers: getHeaders() });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error("[API] fetchUserSettings failed:", error);
    return null;
  }
}

// 사용자 개인 설정 업데이트
export async function updateUserSettings(userId, settings) {
  const url = buildUrl(`/settings/${userId}`);
  try {
    const res = await fetch(url, { 
      method: "PATCH", 
      headers: getHeaders(), 
      body: JSON.stringify(settings) 
    });
    if (!res.ok) {
      console.warn(`[API] Failed to update user settings: ${res.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[API] updateUserSettings failed:", error);
    return false;
  }
}

/**
 * ==============================================================================
 * 개발 게시판 (Dev Board) 관련 API
 * ==============================================================================
 */

// 개발 메모 목록 조회
export async function fetchDevMemos() {
  const url = buildUrl(`/dev-board`);
  try {
    const res = await fetch(url, { method: "GET", headers: getHeaders() });
    if (!res.ok) return [];
    return await res.json();
  } catch (error) {
    console.error("[API] fetchDevMemos failed:", error);
    return [];
  }
}

// 개발 메모 생성
export async function createDevMemo(memoData) {
  const url = buildUrl(`/dev-board`);
  try {
    const res = await fetch(url, { 
      method: "POST", 
      headers: getHeaders(), 
      body: JSON.stringify(memoData) 
    });
    if (!res.ok) throw new Error(`Failed to create dev memo: ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error("[API] createDevMemo failed:", error);
    return null;
  }
}

// 개발 메모 삭제
export async function deleteDevMemo(memoId) {
  const url = buildUrl(`/dev-board/${memoId}`);
  try {
    const res = await fetch(url, { method: "DELETE", headers: getHeaders() });
    if (!res.ok) throw new Error(`Failed to delete dev memo: ${res.status}`);
    return true;
  } catch (error) {
    console.error("[API] deleteDevMemo failed:", error);
    return false;
  }
}

/**
 * ==============================================================================
 * 검색 (Search) 관련 API
 * ==============================================================================
 */

// 대화 내 메시지 검색
export async function searchMessages(query) {
  const userId = getUserId();
  const url = buildUrl(`/search/messages`, { q: query, usr_id: userId });
  try {
    const res = await fetch(url, { method: "GET", headers: getHeaders() });
    if (!res.ok) return [];
    return await res.json();
  } catch (error) {
    console.error("[API] searchMessages failed:", error);
    return [];
  }
}