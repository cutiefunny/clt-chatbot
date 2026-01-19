// app/lib/api.js
const BASE_URL = "https://musclecat-api.vercel.app"; // FastAPI 주소

export async function fetchConversations() {
  const res = await fetch(`${BASE_URL}/conversations`);
  if (!res.ok) throw new Error('Failed to fetch conversations');
  return res.json();
}

export async function fetchMessages({ queryKey, pageParam = 0 }) {
  const [_, conversationId] = queryKey;
  // FastAPI의 페이지네이션 방식에 맞춰 수정 (예: skip/limit 또는 cursor)
  const res = await fetch(`${BASE_URL}/conversations/${conversationId}/messages?skip=${pageParam}&limit=15`);
  if (!res.ok) throw new Error('Failed to fetch messages');
  return res.json();
}