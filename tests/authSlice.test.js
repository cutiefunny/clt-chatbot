import { createAuthSlice } from '../app/store/slices/authSlice';

// Firebase 및 외부 의존성 모킹
jest.mock('../app/lib/firebase', () => ({
  collection: jest.fn(),
  getDocs: jest.fn(() => ({ forEach: jest.fn() })),
  doc: jest.fn(),
  getDoc: jest.fn(() => ({ exists: () => false, data: () => ({}) })),
  writeBatch: jest.fn(() => ({ update: jest.fn(), commit: jest.fn() })),
  signOut: jest.fn(),
}));

describe('AuthSlice', () => {
  let set;
  let get;
  let authSlice;
  let mockStore; // 👇 [핵심 수정] 안정적인 Mock 객체 보관용 변수

  beforeEach(() => {
    set = jest.fn();
    
    // 스토어 함수들을 미리 정의해두고 재사용합니다.
    mockStore = {
      db: {},
      auth: {},
      unsubscribeAll: jest.fn(),
      loadDevMemos: jest.fn(),
      subscribeToUnreadStatus: jest.fn(),
      subscribeToUnreadScenarioNotifications: jest.fn(),
      resetMessages: jest.fn(),
    };

    // get 호출 시 항상 같은 mockStore 객체를 반환합니다.
    get = jest.fn(() => mockStore);
    
    authSlice = createAuthSlice(set, get);
  });

  it('setUserAndLoadData 실행 시 삭제된 loadConversations를 호출하지 않아야 한다', async () => {
    const mockUser = { uid: 'test-user' };

    // 실행
    await authSlice.setUserAndLoadData(mockUser);

    // 1. user 설정 확인
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ 
      user: mockUser 
    }));

    // 2. useFastApi 설정 확인
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ 
      useFastApi: true 
    }));

    // 3. 다른 필수 로직 호출 확인 (이제 mockStore를 검사하므로 통과합니다)
    expect(mockStore.loadDevMemos).toHaveBeenCalled();
    
    // 4. (중요) 존재하지 않는 loadConversations가 호출되지 않았는지 간접 검증
    // 만약 코드에 get().loadConversations()가 있다면 
    // mockStore 객체에 해당 함수가 없으므로 에러가 발생하여 테스트가 실패합니다.
  });
});