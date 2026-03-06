// app/lib/api.js
import { API_DEFAULTS, MESSAGE_LIMIT } from './constants';
import { getUserId } from './utils';

const REMOTE_URL = "http://202.20.84.65:8083";
const API_PREFIX = "/api/v1";

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
 * 채팅 (Chat) 관련 API
 * ==============================================================================
 */

// 채팅 메시지 전송 및 AI 응답 생성
export async function sendChatMessage(payload) {
  const url = buildUrl(`/chat`);
  console.log('[sendChatMessage] Request payload:', payload);

  const res = await fetch(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error(`Failed to send chat message: ${res.status}`);

  const data = await res.json();
  console.log('[sendChatMessage] Response from server:', JSON.stringify(data, null, 2));
  console.log('[sendChatMessage] nextNode in response:', data.nextNode);

  return data;
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
    return data.messages.map(msg => {
      const baseMessage = {
        id: msg.id,
        sender: msg.role === "user" ? "user" : "bot",
        text: msg.content,
        createdAt: msg.created_at,
        selectedOption: msg.selected_option,
        feedback: msg.feedback
      };

      // 시나리오 세션이 연결된 메시지는 scenario_bubble로 표시
      if (msg.scenario_session_id) {
        baseMessage.type = "scenario_bubble";
        baseMessage.scenarioSessionId = msg.scenario_session_id;
      }

      return baseMessage;
    });
  }
  return [];
}

// 메시지 전송 (사용 중지 - /chat API가 메시지 저장을 처리함)
// 참고: 백엔드 /chat API가 이미 메시지를 저장하므로 이 함수는 사용되지 않음
// 피드백/옵션 업데이트는 updateMessage 사용
export async function createMessage(conversationId, messageData) {
  console.warn('[DEPRECATED] createMessage is deprecated. Backend /chat API handles message saving.');
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
      return {
        id: `temp_${Date.now()}`,
        ...payload,
        created_at: new Date().toISOString()
      };
    }

    if (!res.ok) throw new Error(`Failed to create message: ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error("[API] createMessage failed:", error);
    // 👈 네트워크 에러 등 발생 시에도 흐름 유지
    return {
      id: `temp_${Date.now()}`,
      ...payload,
      created_at: new Date().toISOString()
    };
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
  const url = buildUrl(`/builder/scenarios`);
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
  const url = buildUrl(`/builder/scenarios/${scenarioId}`);
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
    if (!res.ok) {
      // 404는 API가 없는 것이므로 조용히 처리
      if (res.status === 404) {
        return [];
      }
      console.warn(`[API] fetchScenarioSessions returned ${res.status}`);
      return [];
    }
    return await res.json();
  } catch (error) {
    // 네트워크 오류는 로그만 찍고 빈 배열 반환
    console.warn("[API] fetchScenarioSessions network error:", error.message);
    return [];
  }
}

export async function createScenarioSession(conversationId, scenarioId) {
  const url = buildUrl(`/conversations/${conversationId}/scenario-sessions`);
  const userId = getUserId();
  const body = {
    scenario_id: scenarioId,
    usr_id: userId,
    status: "active",
    current_node: "start",
    variables: {}
  };

  try {
    const res = await fetch(url, { method: "POST", headers: getHeaders(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Server responded with ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error("[API] createScenarioSession failed:", error);
    return { id: `temp_${Date.now()}`, scenario_id: scenarioId, status: "active" };
  }
}

export async function updateScenarioSession(sessionId, updates) {
  const url = buildUrl(`/scenario-sessions/${sessionId}`);
  const userId = getUserId();
  const payload = { usr_id: userId, ...updates };

  try {
    console.log(`[API] Updating session ${sessionId} with payload:`, payload);
    const res = await fetch(url, { method: "PATCH", headers: getHeaders(), body: JSON.stringify(payload) });
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[API] Failed to update session ${sessionId}: ${res.status}`, errorText);
      try {
        const errorJson = JSON.parse(errorText);
        console.error('[API] Error details:', errorJson);
      } catch (e) {
        console.error('[API] Error response (raw):', errorText);
      }
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
    if (!res.ok) {
      // 404는 백엔드 미구현이므로 에러 로그 출력 안 함
      if (res.status !== 404) {
        console.error("[API] fetchGeneralConfig failed:", res.status);
      }
      return null;
    }
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
      // 404는 백엔드 미구현이므로 에러 로그 출력 안 함
      if (res.status !== 404) {
        console.error("[API] updateGeneralConfig failed:", res.status);
      }
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
 * 검색 (Search) 관련 API
 * ==============================================================================
 */

// 대화 내 메시지 검색
export async function searchMessages(query, userId) {
  const finalUserId = userId || getUserId();
  const url = buildUrl(`/search/messages`, { q: query, usr_id: finalUserId });
  try {
    const res = await fetch(url, { method: "GET", headers: getHeaders() });
    if (!res.ok) return [];
    return await res.json();
  } catch (error) {
    console.error("[API] searchMessages failed:", error);
    return [];
  }
}

/**
 * ==============================================================================
 * 알림 (Notifications) 관련 API
 * ==============================================================================
 */

// 알림 목록 조회
export async function fetchNotifications() {
  const userId = getUserId();
  const url = buildUrl(`/users/notifications`, {
    usr_id: userId,
    ten_id: API_DEFAULTS.TENANT_ID,
    stg_id: API_DEFAULTS.STAGE_ID,
    sec_ofc_id: API_DEFAULTS.SEC_OFC_ID
  });
  try {
    const res = await fetch(url, { method: "GET", headers: getHeaders() });
    if (!res.ok) return [];
    return await res.json();
  } catch (error) {
    console.error("[API] fetchNotifications failed:", error);
    return [];
  }
}

// 알림 읽음 처리
export async function markNotificationAsRead(notificationId) {
  const url = buildUrl(`/users/notifications/${notificationId}`);
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({ is_read: true })
    });
    if (!res.ok) throw new Error(`Failed to mark notification as read: ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error("[API] markNotificationAsRead failed:", error);
    return null;
  }
}

/**
 * ==============================================================================
 * 대화 삭제 관련 API (FastAPI 통합)
 * ==============================================================================
 */

// 사용자의 모든 conversation 조회
export async function fetchAllConversationsForUser(userId) {
  const url = buildUrl(`/conversations`, { usr_id: userId, limit: 1000 });
  const res = await fetch(url, { method: "GET", headers: getHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch all conversations: ${res.status}`);
  const data = await res.json();
  // API가 배열을 직접 반환하거나 conversations 필드에 포함해서 반환
  return Array.isArray(data) ? data : (data.conversations || []);
}

// 특정 conversation의 모든 scenario-sessions 조회
export async function fetchScenarioSessionsForConversation(conversationId, userId) {
  const url = buildUrl(`/conversations/${conversationId}/scenario-sessions`, { usr_id: userId });
  const res = await fetch(url, { method: "GET", headers: getHeaders() });
  if (!res.ok) {
    console.warn(`Failed to fetch scenario sessions for conversation ${conversationId}: ${res.status}`);
    return [];
  }
  const data = await res.json();
  return data.scenario_sessions || [];
}

// 특정 conversation의 특정 scenario-session 삭제
export async function deleteScenarioSession(conversationId, sessionId, userId) {
  const url = buildUrl(`/conversations/${conversationId}/scenario-sessions/${sessionId}`, { usr_id: userId });
  const res = await fetch(url, { method: "DELETE", headers: getHeaders() });
  if (!res.ok) {
    console.warn(`Failed to delete scenario session ${sessionId}: ${res.status}`);
    return false;
  }
  return true;
}

// 특정 conversation 삭제
export async function deleteConversationFull(conversationId, userId) {
  const url = buildUrl(`/conversations/${conversationId}`, { usr_id: userId });
  const res = await fetch(url, { method: "DELETE", headers: getHeaders() });
  if (!res.ok) {
    console.warn(`Failed to delete conversation ${conversationId}: ${res.status}`);
    return false;
  }
  return true;
}