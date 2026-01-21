// app/lib/api.js
const REMOTE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://210.114.17.65:8001";
const LOCAL_URL = "http://localhost:8001";

// 현재 설정된 Base URL을 가져오는 헬퍼 함수
function getBaseUrl() {
  // 클라이언트 사이드에서만 localStorage 확인
  if (typeof window !== 'undefined') {
    const useLocal = localStorage.getItem('useLocalFastApiUrl') === 'true';
    return useLocal ? LOCAL_URL : REMOTE_URL;
  }
  return REMOTE_URL;
}

export async function fetchConversations() {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/conversations`);
  if (!res.ok) throw new Error('Failed to fetch conversations');
  return res.json();
}

export async function fetchMessages({ queryKey, pageParam = 0 }) {
  const [_, conversationId] = queryKey;
  const baseUrl = getBaseUrl();
  // FastAPI의 페이지네이션 방식에 맞춰 수정
  const res = await fetch(`${baseUrl}/conversations/${conversationId}/messages?skip=${pageParam}&limit=15`);
  if (!res.ok) throw new Error('Failed to fetch messages');
  return res.json();
}