import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ChatInput from '../app/components/ChatInput';
import { useChatStore } from '../app/store';
import { useCreateConversation } from '../app/hooks/useQueries';

// 👇 [핵심 수정] store/index.js 초기화를 통과하기 위해 onAuthStateChanged 추가
jest.mock('../app/lib/firebase', () => ({
  auth: {},
  db: {},
  onAuthStateChanged: jest.fn(() => jest.fn()), // 구독 해제 함수 반환
}));

// 필요한 모듈 모킹
jest.mock('../app/store');
jest.mock('../app/hooks/useQueries');
jest.mock('../app/hooks/useTranslations', () => ({
  useTranslations: () => ({ t: (key) => key }),
}));
// 아이콘 컴포넌트 모킹
jest.mock('../app/components/icons/StarIcon', () => () => <span data-testid="star-icon" />);

// fetch 모킹
global.fetch = jest.fn();

describe('ChatInput Component', () => {
  let mockHandleResponse;
  let mockLoadConversation;
  let mockMutateAsync;

  beforeEach(() => {
    mockHandleResponse = jest.fn();
    mockLoadConversation = jest.fn();
    mockMutateAsync = jest.fn();

    // Store 기본값 설정
    useChatStore.mockImplementation((selector) => selector({
      isLoading: false,
      handleResponse: mockHandleResponse,
      currentConversationId: null,
      loadConversation: mockLoadConversation,
      activePanel: 'main',
      scenarioStates: {},
      scenarioCategories: [],
      favorites: [],
      mainInputValue: '',
      setMainInputValue: jest.fn(),
      setShortcutMenuOpen: jest.fn(),
    }));

    // React Query Mutation 모킹
    useCreateConversation.mockReturnValue({
      mutateAsync: mockMutateAsync,
    });
  });

  it('대화방이 없을 때: 새 대화를 생성하고 메시지를 전송해야 한다', async () => {
    // 입력값 설정 시뮬레이션
    useChatStore.mockImplementation((selector) => selector({
      isLoading: false,
      handleResponse: mockHandleResponse,
      currentConversationId: null, // 대화방 없음
      loadConversation: mockLoadConversation,
      mainInputValue: 'Hello World',
      setMainInputValue: jest.fn(),
      scenarioStates: {},
      scenarioCategories: [],
      favorites: [],
    }));

    // Mutation 성공 시뮬레이션
    mockMutateAsync.mockResolvedValue({ id: 'new-chat-id', title: 'New Chat' });

    render(<ChatInput />);

    const sendButton = screen.getByText('Send');
    
    await act(async () => {
      fireEvent.click(sendButton);
    });

    expect(mockMutateAsync).toHaveBeenCalledWith('New Chat');
    expect(mockLoadConversation).toHaveBeenCalledWith('new-chat-id');
    expect(mockHandleResponse).toHaveBeenCalledWith({ text: 'Hello World' });
  });

  it('대화방이 있을 때: 대화 생성 없이 즉시 메시지를 전송해야 한다', async () => {
    useChatStore.mockImplementation((selector) => selector({
      isLoading: false,
      handleResponse: mockHandleResponse,
      currentConversationId: 'existing-id', // 이미 대화방 있음
      loadConversation: mockLoadConversation,
      mainInputValue: 'Hello again',
      setMainInputValue: jest.fn(),
      scenarioStates: {},
      scenarioCategories: [],
      favorites: [],
    }));

    render(<ChatInput />);

    const sendButton = screen.getByText('Send');
    fireEvent.click(sendButton);

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(mockHandleResponse).toHaveBeenCalledWith({ text: 'Hello again' });
  });
});