export const locales = {
  ko: {
    // General
    welcome: '안녕하세요!',
    hello: '안녕하세요',
    submit: '제출',
    cancel: '취소',
    logout: '로그아웃',
    loading: '로딩 중...',
    copied: '복사되었습니다!',

    // Error Messages
    errorNetwork: '네트워크 연결을 확인해주세요. 인터넷이 불안정한 것 같아요.',
    errorServer: '서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
    errorUnexpected: '예상치 못한 오류가 발생했습니다. 다시 시도해주세요.',

    // Validation Messages
    validationEmail: '유효한 이메일 주소를 입력해주세요.',
    validationPhone: '유효한 전화번호(XXX-XXXX-XXXX)를 입력해주세요.',
    validationFormat: '입력 형식이 올바르지 않습니다.',
    validationRegexError: '시나리오에 설정된 정규식이 올바르지 않습니다.',
    validationDateRange: (startDate, endDate) => `'${startDate}'와 '${endDate}' 사이의 날짜를 입력해주세요.`,
    validationDateAfter: '오늘 또는 미래의 날짜를 선택해야 합니다.',
    validationDateBefore: '오늘 또는 과거의 날짜를 선택해야 합니다.',

    //Manual
    manualTitle: '챗봇 사용 매뉴얼',
    manualContent: {
        ko: `
            <h3>주요 기능</h3>
            <ul>
                <li><strong>하이브리드 채팅:</strong> 시나리오 기반 응답과 AI를 통한 자연어 응답을 결합하여 제공합니다.</li>
                <li><strong>실시간 대화:</strong> 모든 대화 기록은 실시간으로 저장됩니다.</li>
                <li><strong>사용자 인증:</strong> Google 계정으로 간편하게 로그인할 수 있습니다.</li>
                <li><strong>대화 히스토리 및 검색:</strong> 이전 대화를 확인하고, 키워드로 메시지를 검색할 수 있습니다.</li>
                <li><strong>사용자 맞춤 설정:</strong> 라이트/다크 테마와 폰트 크기를 설정할 수 있습니다.</li>
            </ul>
            <h3>사용 방법</h3>
            <p>좌측 상단의 <strong>새로운 대화</strong> 버튼을 클릭하여 대화를 시작할 수 있습니다. 대화 입력창 좌측의 메뉴 아이콘을 클릭하여 시나리오를 직접 실행할 수도 있습니다.</p>
            <p>사용자 프로필 아이콘을 클릭하여 테마, 폰트 크기, 언어 등 다양한 설정을 변경해보세요.</p>
        `,
        en: `
            <h3>Main Features</h3>
            <ul>
                <li><strong>Hybrid Chat:</strong> Combines scenario-based responses with flexible natural language answers through AI.</li>
                <li><strong>Real-time Conversation:</strong> All conversation history is saved in real-time.</li>
                <li><strong>User Authentication:</strong> Easily log in with your Google account.</li>
                <li><strong>Conversation History & Search:</strong> Review past conversations and search for messages by keyword.</li>
                <li><strong>User Customization:</strong> You can set light/dark themes and font sizes.</li>
            </ul>
            <h3>How to Use</h3>
            <p>You can start a conversation by clicking the <strong>New Chat</strong> button in the top left. You can also run scenarios directly by clicking the menu icon to the left of the chat input field.</p>
            <p>Click the user profile icon to change various settings such as theme, font size, and language.</p>
        `
    },

    // Login
    loginPrompt: '계속하려면 로그인해주세요.',
    signInWithGoogle: 'Google 계정으로 로그인',

    // Logout Modal
    logoutConfirm: '정말로 로그아웃하시겠습니까?',

    // Chat
    initialBotMessage: '안녕하세요! 무엇을 도와드릴까요?',
    askAboutService: '서비스에 대해 질문해주세요.',
    scenarioResume: (scenarioId) => `'${scenarioId}' 시나리오 이어하기`,
    scenarioEnded: (scenarioId) => `'${scenarioId}' 시나리오가 종료되었습니다.`,
    scenarioStarted: (scenarioId) => `'${scenarioId}' 시나리오가 시작되었습니다.`,
    scenarioStatus: '상태:',
    statusActive: '진행 중',
    statusCompleted: '완료',
    statusFailed: '실패',
    statusGenerating: '생성 중...', // --- 👈 [추가]

    // Chat Input
    enterResponse: '응답을 입력하세요...',

    // History Panel
    newChat: '새로운 대화',
    deleteConvoConfirm: '정말로 이 대화를 삭제하시겠습니까?',
    noScenariosFound: '실행된 시나리오가 없습니다.',
    loadingScenarios: '시나리오 로딩 중...',
    pin: '고정',
    unpin: '고정 해제',
    rename: '이름 변경',
    delete: '삭제',

    // Profile Modal
    greeting: (displayName) => `안녕하세요 ${displayName} 님`,
    screenStyle: '화면 스타일',
    lightMode: '라이트 모드',
    darkMode: '다크 모드',
    fontSize: '글자 크기',
    fontSmall: '축소',
    fontDefault: '기본',
    languageSetting: '언어 설정',
    korean: '한국어',
    english: 'English',
    devBoard: '개발 보드',

    // Scenario Panel
    scenarioTitle: (scenarioId) => `시나리오: ${scenarioId}`,
    hide: '숨기기',
    end: '종료',
    select: '선택...',

    // Scenario Modal
    startScenario: '시나리오 시작하기',

    // Search Modal
    searchConversations: '대화 내용 검색...',
    searching: '검색 중...',
    noResults: '검색 결과가 없습니다.',

    // Dev Board
    devBoardTitle: '개발 보드',
    enterMemo: '메모를 입력하세요...',
    post: '작성',

    // Notifications
    notificationHistory: '알림 내역',
    noNotifications: '표시할 알림이 없습니다.',
    
    // API Messages
    scenarioListMessage: '실행할 시나리오를 선택해주세요.',
  },
  en: {
    // General
    welcome: 'Welcome!',
    hello: 'Hello',
    submit: 'Submit',
    cancel: 'Cancel',
    logout: 'Log Out',
    loading: 'Loading...',
    copied: 'Copied!',

    // Error Messages
    errorNetwork: 'Network error. Please check your internet connection.',
    errorServer: 'There was a problem with the server. Please try again later.',
    errorUnexpected: 'An unexpected error occurred. Please try again.',

    // Validation Messages
    validationEmail: 'Please enter a valid email address.',
    validationPhone: 'Please enter a valid phone number (e.g., XXX-XXXX-XXXX).',
    validationFormat: 'The input format is incorrect.',
    validationRegexError: 'The regular expression set in the scenario is invalid.',
    validationDateRange: (startDate, endDate) => `Please enter a date between ${startDate} and ${endDate}.`,
    validationDateAfter: 'You must select today or a future date.',
    validationDateBefore: 'You must select today or a past date.',

    //Manual
    manualTitle: 'Chatbot Manual',
    manualContent: {
        ko: `
            <h3>주요 기능</h3>
            <ul>
                <li><strong>하이브리드 채팅:</strong> 시나리오 기반 응답과 AI를 통한 자연어 응답을 결합하여 제공합니다.</li>
                <li><strong>실시간 대화:</strong> 모든 대화 기록은 실시간으로 저장됩니다.</li>
                <li><strong>사용자 인증:</strong> Google 계정으로 간편하게 로그인할 수 있습니다.</li>
                <li><strong>대화 히스토리 및 검색:</strong> 이전 대화를 확인하고, 키워드로 메시지를 검색할 수 있습니다.</li>
                <li><strong>사용자 맞춤 설정:</strong> 라이트/다크 테마와 폰트 크기를 설정할 수 있습니다.</li>
            </ul>
            <h3>사용 방법</h3>
            <p>좌측 상단의 <strong>새로운 대화</strong> 버튼을 클릭하여 대화를 시작할 수 있습니다. 대화 입력창 좌측의 메뉴 아이콘을 클릭하여 시나리오를 직접 실행할 수도 있습니다.</p>
            <p>사용자 프로필 아이콘을 클릭하여 테마, 폰트 크기, 언어 등 다양한 설정을 변경해보세요.</p>
        `,
        en: `
            <h3>Main Features</h3>
            <ul>
                <li><strong>Hybrid Chat:</strong> Combines scenario-based responses with flexible natural language answers through AI.</li>
                <li><strong>Real-time Conversation:</strong> All conversation history is saved in real-time.</li>
                <li><strong>User Authentication:</strong> Easily log in with your Google account.</li>
                <li><strong>Conversation History & Search:</strong> Review past conversations and search for messages by keyword.</li>
                <li><strong>User Customization:</strong> You can set light/dark themes and font sizes.</li>
            </ul>
            <h3>How to Use</h3>
            <p>You can start a conversation by clicking the <strong>New Chat</strong> button in the top left. You can also run scenarios directly by clicking the menu icon to the left of the chat input field.</p>
            <p>Click the user profile icon to change various settings such as theme, font size, and language.</p>
        `
    },

    // Login
    loginPrompt: 'Please log in to continue.',
    signInWithGoogle: 'Sign in with Google',

    // Logout Modal
    logoutConfirm: 'Are you sure you want to log out?',

    // Chat
    initialBotMessage: 'Hello! How can I help you?',
    askAboutService: 'Ask about this Booking Master Page',
    scenarioResume: (scenarioId) => `Resume '${scenarioId}' scenario`,
    scenarioEnded: (scenarioId) => `Scenario '${scenarioId}' has ended.`,
    scenarioStarted: (scenarioId) => `Scenario '${scenarioId}' has started.`,
    scenarioStatus: 'Status:',
    statusActive: 'In Progress',
    statusCompleted: 'Completed',
    statusFailed: 'Failed',
    statusGenerating: 'Generating...', // --- 👈 [추가]

    // Chat Input
    enterResponse: 'Enter your response...',

    // History Panel
    newChat: 'New Chat',
    deleteConvoConfirm: 'Are you sure you want to delete this conversation?',
    noScenariosFound: 'No scenarios were run.',
    loadingScenarios: 'Loading scenarios...',
    pin: 'Pin',
    unpin: 'Unpin',
    rename: 'Rename',
    delete: 'Delete',

    // Profile Modal
    greeting: (displayName) => `Hello, ${displayName}`,
    screenStyle: 'Screen Style',
    lightMode: 'Light Mode',
    darkMode: 'Dark Mode',
    fontSize: 'Font Size',
    fontSmall: 'Small',
    fontDefault: 'Default',
    languageSetting: 'Language',
    korean: '한국어',
    english: 'English',
    devBoard: 'Dev Board',

    // Scenario Panel
    scenarioTitle: (scenarioId) => `Scenario: ${scenarioId}`,
    hide: 'Hide',
    end: 'End',
    select: 'Select...',

    // Scenario Modal
    startScenario: 'Start a Scenario',
    
    // Search Modal
    searchConversations: 'Search conversations...',
    searching: 'Searching...',
    noResults: 'No results found.',

    // Dev Board
    devBoardTitle: 'Dev Board',
    enterMemo: 'Enter a memo...',
    post: 'Post',

    // Notifications
    notificationHistory: 'Notifications',
    noNotifications: 'No notifications to display.',

    // API Messages
    scenarioListMessage: 'Please select a scenario to run.',
  },
};