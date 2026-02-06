// app/hooks/useQueries.js
import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { 
  fetchConversations, 
  fetchMessages, 
  createConversation, 
  deleteConversation, 
  updateConversation 
} from '../lib/api'; // ★ 반드시 api.js에서 함수를 가져와야 합니다.
import { useChatStore } from '../store'; // Zustand store 추가

// [대화 목록] 불러오기
export const useConversations = () => {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: ({ pageParam = 0 }) => fetchConversations(pageParam),
  });
};

// [메시지 목록] 무한 스크롤
export const useMessages = (conversationId) => {
  return useInfiniteQuery({
    queryKey: ['messages', conversationId],
    queryFn: ({ pageParam = 0 }) => fetchMessages({ queryKey: [null, conversationId], pageParam }),
    getNextPageParam: (lastPage, allPages) => {
      // 15개 미만이면 다음 페이지 없음
      return lastPage && lastPage.length === 15 ? allPages.length * 15 : undefined;
    },
    enabled: !!conversationId,
  });
};

// [대화 생성]
export const useCreateConversation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    // ★ 직접 fetch하지 않고 api.js의 함수 호출 (usr_id 자동 주입됨)
    mutationFn: (title) => createConversation(title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
};

// [대화 삭제]
export const useDeleteConversation = () => {
  const queryClient = useQueryClient();
  const deleteConversationById = useChatStore(state => state.deleteConversationById);
  
  return useMutation({
    mutationFn: async (conversationId) => {
      // Zustand store의 함수 호출 (메시지 초기화 등 처리)
      await deleteConversationById(conversationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
};

// [제목 수정]
export const useUpdateTitle = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }) => updateConversation(id, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
};

// [고정 토글]
export const usePinConversation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isPinned }) => updateConversation(id, { isPinned }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
};