import { render, screen, fireEvent } from '@testing-library/react';
import HistoryPanel from '../app/components/HistoryPanel';
import { useChatStore } from '../app/store';
import {
  useConversations,
  useCreateConversation,
  useDeleteConversation,
  useUpdateTitle,
  usePinConversation,
} from '../app/hooks/useQueries';

// 1. React Query Hooks 모킹
jest.mock('../app/hooks/useQueries', () => ({
  useConversations: jest.fn(),
  useCreateConversation: jest.fn(),
  useDeleteConversation: jest.fn(),
  useUpdateTitle: jest.fn(),
  usePinConversation: jest.fn(),
}));

// 2. Zustand Store 모킹
jest.mock('../app/store', () => ({
  useChatStore: jest.fn(),
}));

// 3. 번역 훅 모킹
jest.mock('../app/hooks/useTranslations', () => ({
  useTranslations: () => ({ t: (key) => key }),
}));

// 4. ConversationItem 모킹 (핵심 수정 부분: 가짜 이벤트 전달)
jest.mock('../app/components/ConversationItem', () => (props) => (
  <div data-testid="conversation-item">
    <span>{props.convo.title}</span>
    <button 
      onClick={() => 
        // 👇 실제 클릭 시 e.stopPropagation()이 호출되므로, 가짜 함수를 전달해야 합니다.
        props.onDelete({ stopPropagation: jest.fn() }, props.convo.id)
      }
    >
      Delete
    </button>
  </div>
));

describe('HistoryPanel Component', () => {
  const mockLoadConversation = jest.fn();
  const mockOpenConfirmModal = jest.fn();

  beforeEach(() => {
    // Store 기본값 설정
    useChatStore.mockReturnValue({
      user: { uid: 'test-user', photoURL: '/test.png' },
      loadConversation: mockLoadConversation,
      currentConversationId: null,
      openConfirmModal: mockOpenConfirmModal,
      isHistoryPanelOpen: true,
      toggleHistoryPanel: jest.fn(),
      scenariosForConversation: {},
      unreadConversations: new Set(),
      unreadScenarioSessions: new Set(),
      pendingResponses: new Set(),
      completedResponses: new Set(),
    });

    // React Query 기본값 설정
    useConversations.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    useCreateConversation.mockReturnValue({ mutate: jest.fn() });
    useDeleteConversation.mockReturnValue({ mutate: jest.fn() });
    useUpdateTitle.mockReturnValue({ mutate: jest.fn() });
    usePinConversation.mockReturnValue({ mutate: jest.fn() });
  });

  it('대화 목록을 렌더링해야 한다', () => {
    useConversations.mockReturnValue({
      data: [
        { id: '1', title: 'Chat 1' },
        { id: '2', title: 'Chat 2' },
      ],
      isLoading: false,
    });

    render(<HistoryPanel />);

    expect(screen.getByText('Chat 1')).toBeInTheDocument();
    expect(screen.getByText('Chat 2')).toBeInTheDocument();
  });

  it('새 대화 버튼 클릭 시 createMutation을 호출해야 한다', () => {
    const mutateMock = jest.fn();
    useCreateConversation.mockReturnValue({ mutate: mutateMock });

    render(<HistoryPanel />);

    // 화면의 "newChat" 텍스트가 있는 버튼 클릭
    const listCreateBtn = screen.getByText('newChat');
    fireEvent.click(listCreateBtn);

    expect(mutateMock).toHaveBeenCalledWith('New Chat', expect.any(Object));
  });

  it('삭제 버튼 클릭 시 확인 모달을 열어야 한다', () => {
    useConversations.mockReturnValue({
      data: [{ id: '1', title: 'Chat 1' }],
      isLoading: false,
    });

    render(<HistoryPanel />);

    // 모킹된 ConversationItem의 Delete 버튼 클릭
    const deleteBtn = screen.getByText('Delete');
    fireEvent.click(deleteBtn);

    expect(mockOpenConfirmModal).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmVariant: 'danger',
      })
    );
  });
});