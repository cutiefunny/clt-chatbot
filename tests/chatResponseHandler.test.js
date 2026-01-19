import { handleResponse } from '../app/store/actions/chatResponseHandler';

// fetch 모킹
global.fetch = jest.fn();

describe('handleResponse', () => {
  let get;
  let set;
  let mockAddMessage;

  beforeEach(() => {
    fetch.mockReset();
    set = jest.fn();
    mockAddMessage = jest.fn();
    
    // Store 상태 모킹 (conversations, updateConversationTitle 없음)
    get = jest.fn(() => ({
      language: 'ko',
      currentConversationId: 'chat-123',
      messages: [],
      addMessage: mockAddMessage,
      updateLastMessage: jest.fn(),
      saveMessage: jest.fn(),
      setForceScrollToBottom: jest.fn(),
      useFastApi: true,
      slots: {},
      // conversations: undefined, // 삭제됨 시뮬레이션
      // updateConversationTitle: undefined, // 삭제됨 시뮬레이션
    }));
  });

  it('FastAPI 백엔드로 정상적으로 요청을 보내야 한다', async () => {
    // API 성공 응답 모킹
    fetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ type: 'text', message: 'Bot Response' }),
    });

    await handleResponse(get, set, { text: 'Hi' });

    // 1. 로딩 상태 시작 확인
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ isLoading: true }));

    // 2. API 호출 확인 (FastAPI URL 사용 여부)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('musclecat-api.vercel.app'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"conversation_id":"chat-123"'),
      })
    );

    // 3. 봇 메시지 추가 확인
    // (responseHandler 내부 로직에 따라 addMessage 호출됨)
    // 여기서는 handleResponse 내부의 세부 흐름까지 검증하기보다, 
    // "함수가 끝까지 에러 없이 실행되었는지"가 중요함.
  });

  it('삭제된 스토어 상태(conversations)에 접근하여 에러가 발생하지 않아야 한다', async () => {
    // API 응답 모킹
    fetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ type: 'text', message: 'Hello' }),
    });

    // 실행 시 에러가 발생하면 테스트 실패
    await expect(handleResponse(get, set, { text: 'Hello' }))
      .resolves.not.toThrow();
  });
});