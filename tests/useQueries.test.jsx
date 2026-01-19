import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useConversations,
  useCreateConversation,
  useDeleteConversation,
  useUpdateTitle,
  usePinConversation,
  useMessages
} from '../app/hooks/useQueries';

// API 모킹
global.fetch = jest.fn();

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    },
  });
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('React Query Hooks', () => {
  beforeEach(() => {
    fetch.mockReset();
  });

  // 1. 대화 목록 조회
  it('useConversations가 데이터를 성공적으로 불러와야 한다', async () => {
    const mockData = [{ id: '1', title: 'Test Chat' }];
    fetch.mockResolvedValueOnce({ ok: true, json: async () => mockData });

    const { result } = renderHook(() => useConversations(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
  });

  // 2. 대화 생성 (수정됨: waitFor 적용)
  it('useCreateConversation이 성공적으로 대화를 생성해야 한다', async () => {
    const newConvo = { id: '2', title: 'New Chat' };
    fetch.mockResolvedValueOnce({ ok: true, json: async () => newConvo });

    const { result } = renderHook(() => useCreateConversation(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync('New Chat');
    });

    // 상태 업데이트를 기다립니다.
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(newConvo);
  });

  // 3. 대화 삭제 (수정됨: waitFor 적용)
  it('useDeleteConversation이 성공적으로 대화를 삭제해야 한다', async () => {
    fetch.mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() => useDeleteConversation(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync('123');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  // 4. 제목 수정 (수정됨: waitFor 적용)
  it('useUpdateTitle이 성공적으로 제목을 수정해야 한다', async () => {
    fetch.mockResolvedValueOnce({ ok: true });
    const { result } = renderHook(() => useUpdateTitle(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ id: '123', title: 'New' });
    });
    
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  // 5. 고정 토글 (수정됨: waitFor 적용)
  it('usePinConversation이 성공적으로 고정 상태를 변경해야 한다', async () => {
    fetch.mockResolvedValueOnce({ ok: true });
    const { result } = renderHook(() => usePinConversation(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ id: '123', isPinned: true });
    });
    
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  // 6. 메시지 조회
  it('useMessages가 메시지를 불러와야 한다', async () => {
    const mockMessages = [{ id: 'msg1', text: 'Hi' }];
    fetch.mockResolvedValueOnce({ ok: true, json: async () => mockMessages });

    const { result } = renderHook(() => useMessages('chat1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data.pages[0]).toEqual(mockMessages);
  });
});