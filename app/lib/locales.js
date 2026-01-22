export const locales = {
  ko: {
    // General
    welcome: "안녕하세요!",
    hello: "안녕하세요",
    submit: "제출",
    cancel: "취소",
    logout: "로그아웃",
    loading: "로딩 중...",
    copied: "복사되었습니다!",

    // Error Messages
    errorNetwork: "네트워크 연결을 확인해주세요. 인터넷이 불안정한 것 같아요.",
    errorApiRequest: "API 요청에 실패했습니다. 네트워크 연결을 확인하거나 관리자에게 문의해주세요.",
    errorServer:
      "서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.",
    errorLLMFail: "응답에 문제가 발생했습니다. 잠시 후 다시 시도해주세요.",
    errorUnexpected: "예상치 못한 오류가 발생했습니다. 다시 시도해주세요.",
    errorScenarioNotFound:
      "연결된 시나리오를 찾을 수 없습니다. 숏컷 목록 편집 페이지에서 해당 숏컷을 확인해주세요.",

    // Validation Messages
    validationEmail: "유효한 이메일 주소를 입력해주세요.",
    validationPhone: "유효한 전화번호(XXX-XXXX-XXXX)를 입력해주세요.",
    validationFormat: "입력 형식이 올바르지 않습니다.",
    validationRegexError: "시나리오에 설정된 정규식이 올바르지 않습니다.",
    validationDateRange: (startDate, endDate) =>
      `'${startDate}'와 '${endDate}' 사이의 날짜를 입력해주세요.`,
    validationDateAfter: "오늘 또는 미래의 날짜를 선택해야 합니다.",
    validationDateBefore: "오늘 또는 과거의 날짜를 선택해야 합니다.",

    //Manual
    manualTitle: "챗봇 상세 사용 매뉴얼",
    manualContent: {
      ko: `
        <div class="manual-section">
            <h3>1. 챗봇 개요</h3>
            <p>이 챗봇은 <strong>LLM(거대 언어 모델) 기반의 자연어 대화</strong>와 <strong>정해진 규칙에 따른 시나리오</strong>를 결합한 하이브리드 시스템입니다. 단순한 질의응답뿐만 아니라 복잡한 업무 프로세스 처리, 데이터 조회, 폼 입력 등을 대화형 인터페이스로 수행할 수 있습니다.</p>
        </div>

        <div class="manual-section">
            <h3>2. 핵심 기능</h3>
            <ul>
                <li><strong>하이브리드 대화 모드:</strong> 일상적인 대화는 AI가 자연스럽게 응답하며, 특정 업무는 시나리오 모드로 전환되어 정확한 절차를 안내합니다.</li>
                <li><strong>시나리오 숏컷 (메뉴):</strong> 입력창 좌측의 메뉴 버튼을 통해 자주 사용하는 기능을 즉시 실행할 수 있습니다.</li>
                <li><strong>즐겨찾기 패널:</strong> 자주 쓰는 숏컷을 즐겨찾기에 등록하여 메인 화면에서 빠르게 접근할 수 있습니다.</li>
                <li><strong>대화 히스토리 관리:</strong> 과거 대화 내용을 검색하거나, 중요 대화를 상단에 고정(Pin)하고, 제목을 변경하여 관리할 수 있습니다.</li>
                <li><strong>멀티태스킹 UI:</strong> 메인 채팅과 시나리오 패널이 분리되어 있어, 대화를 나누면서 동시에 업무 양식을 작성하거나 데이터를 조회할 수 있습니다.</li>
            </ul>
        </div>

        <div class="manual-section">
            <h3>3. 사용 가이드</h3>
            
            <h4>대화 시작하기</h4>
            <p>좌측 상단의 <strong>[새로운 대화]</strong> 버튼을 클릭하거나, 입력창에 바로 메시지를 입력하여 대화를 시작하세요. "예약 조회해줘"와 같이 자연어로 요청하면 적절한 시나리오를 추천받을 수 있습니다.</p>

            <h4>숏컷 메뉴 활용</h4>
            <p>입력창 왼쪽의 <strong>[+] 메뉴 아이콘</strong>을 클릭하면 카테고리별로 정리된 기능 목록이 나타납니다.</p>
            <ul>
                <li>원하는 기능을 클릭하면 해당 시나리오가 실행되거나 텍스트가 입력됩니다.</li>
                <li>각 항목 옆의 <strong>[별 모양 아이콘]</strong>을 클릭하면 즐겨찾기에 추가/제거할 수 있습니다.</li>
            </ul>

            <h4>시나리오 진행</h4>
            <p>시나리오가 시작되면 우측(또는 하단)에 전용 패널이 열립니다.</p>
            <ul>
                <li><strong>폼 입력:</strong> 텍스트, 날짜, 선택 박스 등 다양한 양식을 통해 정보를 입력합니다.</li>
                <li><strong>그리드 선택:</strong> 조회된 데이터 목록에서 원하는 항목을 클릭하여 상세 정보를 확인합니다.</li>
                <li><strong>엑셀 업로드:</strong> 대량의 데이터 입력이 필요한 경우 엑셀 파일을 업로드하여 처리할 수 있습니다.</li>
            </ul>
        </div>

        <div class="manual-section">
            <h3>4. 개인화 및 설정</h3>
            <p>우측 상단의 <strong>[프로필 아이콘]</strong>을 클릭하여 다양한 설정을 변경해보세요.</p>
            <ul>
                <li><strong>언어 설정:</strong> 한국어와 영어(English) 중 편한 언어를 선택하세요.</li>
                <li><strong>개인 설정:</strong>
                    <ul>
                        <li><strong>폰트 크기:</strong> 글자 크기를 조절하여 가독성을 높일 수 있습니다.</li>
                        <li><strong>테마 변경:</strong> 눈이 편안한 다크 모드나 깔끔한 라이트 모드를 선택할 수 있습니다.</li>
                        <li><strong>텍스트 숏컷 즉시 전송:</strong> 숏컷 클릭 시 입력창을 거치지 않고 바로 메시지를 전송하도록 설정할 수 있습니다.</li>
                        <li><strong>완료된 시나리오 숨김:</strong> 대화 목록을 깔끔하게 유지하기 위해 완료된 작업을 자동으로 숨길 수 있습니다.</li>
                    </ul>
                </li>
            </ul>
        </div>
        `,
      en: `
        <div class="manual-section">
            <h3>1. Overview</h3>
            <p>This chatbot is a hybrid system combining <strong>LLM-based natural language conversation</strong> with <strong>rule-based scenarios</strong>. It handles not only simple Q&A but also complex business processes, data retrieval, and form inputs through an interactive interface.</p>
        </div>

        <div class="manual-section">
            <h3>2. Key Features</h3>
            <ul>
                <li><strong>Hybrid Chat Mode:</strong> AI handles casual conversations naturally, while specific tasks switch to scenario mode for precise guidance.</li>
                <li><strong>Scenario Shortcuts:</strong> Access frequently used functions instantly via the menu button on the left of the input bar.</li>
                <li><strong>Favorites Panel:</strong> Pin your most-used shortcuts to the main screen for quick access.</li>
                <li><strong>History Management:</strong> Search past conversations, pin important chats to the top, and rename them for better organization.</li>
                <li><strong>Multitasking UI:</strong> The main chat and scenario panel are separated, allowing you to chat while simultaneously filling out forms or viewing data.</li>
            </ul>
        </div>

        <div class="manual-section">
            <h3>3. User Guide</h3>
            
            <h4>Starting a Conversation</h4>
            <p>Click the <strong>[New Chat]</strong> button in the top left or simply type a message to start. You can ask naturally, like "Check my reservation," and the bot will recommend the appropriate scenario.</p>

            <h4>Using Shortcuts</h4>
            <p>Click the <strong>[+] Menu Icon</strong> next to the input bar to see a categorized list of functions.</p>
            <ul>
                <li>Click an item to execute the scenario or input text.</li>
                <li>Click the <strong>[Star Icon]</strong> next to an item to add or remove it from your favorites.</li>
            </ul>

            <h4>Running Scenarios</h4>
            <p>When a scenario starts, a dedicated panel opens on the right (or bottom).</p>
            <ul>
                <li><strong>Forms:</strong> Input information using text fields, date pickers, dropdowns, etc.</li>
                <li><strong>Grid Selection:</strong> Click on rows in a data list to view details or proceed.</li>
                <li><strong>Excel Upload:</strong> Upload Excel files for bulk data processing when available.</li>
            </ul>
        </div>

        <div class="manual-section">
            <h3>4. Personalization & Settings</h3>
            <p>Click the <strong>[Profile Icon]</strong> in the top right to customize your experience.</p>
            <ul>
                <li><strong>Language:</strong> Choose between Korean and English.</li>
                <li><strong>Personal Settings:</strong>
                    <ul>
                        <li><strong>Font Size:</strong> Adjust text size for better readability.</li>
                        <li><strong>Theme:</strong> Switch between Dark Mode and Light Mode.</li>
                        <li><strong>Instant Text Shortcut:</strong> Toggle this to send text shortcuts immediately without editing in the input bar.</li>
                        <li><strong>Hide Completed Scenarios:</strong> Automatically hide finished tasks to keep your chat list clean.</li>
                    </ul>
                </li>
            </ul>
        </div>
        `,
    },

    // Login
    loginPrompt: "계속하려면 로그인해주세요.",
    signInWithGoogle: "Google 계정으로 로그인",
    signInWithTestId: "테스트 ID로 로그인",
    testIdPlaceholder: "테스트 ID 입력",
    loginMethodToggle: "또는",

    // Logout Modal
    logoutConfirm: "정말로 로그아웃하시겠습니까?",

    // Chat
    initialBotMessage: "안녕하세요! 무엇을 도와드릴까요?",
    askAboutService: "서비스에 대해 질문해주세요.",
    scenarioResume: (scenarioId) => `'${scenarioId}' 시나리오 이어하기`,
    scenarioEnded: (scenarioId) => `'${scenarioId}' 시나리오가 종료되었습니다.`,
    scenarioStarted: (scenarioId) =>
      `'${scenarioId}' 시나리오가 시작되었습니다.`,
    scenarioStatus: "상태:",
    statusActive: "진행 중",
    statusCompleted: "완료",
    statusFailed: "실패",
    statusGenerating: "생성 중...",
    statusRequesting: "요청 중...",
    statusCanceled: "취소됨",
    statusSelected: "선택됨",
    viewMore: "더 보기",
    viewLess: "간략히 보기",

    // Chat Input
    enterResponse: "응답을 입력하세요...",

    // History Panel
    history: "대화 내역",
    newChat: "새로운 대화",
    deleteConvoConfirm: "정말로 이 대화를 삭제하시겠습니까?",
    deleteAllConvos: "대화 목록 전체 삭제",
    deleteAllConvosConfirm: "모든 대화 기록(메시지, 시나리오 기록 포함)을 영구적으로 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.",
    deleteAllConvosSuccess: "모든 대화 기록이 성공적으로 삭제되었습니다.",
    noScenariosFound: "실행된 시나리오가 없습니다.",
    loadingScenarios: "시나리오 로딩 중...",
    noHistory: "생성된 채팅 내역이 없습니다.",
    pin: "고정",
    unpin: "고정 해제",
    rename: "이름 변경",
    delete: "삭제",

    // Profile Modal
    greeting: (displayName) => `안녕하세요 ${displayName} 님`,
    screenStyle: "화면 스타일",
    lightMode: "라이트 모드",
    darkMode: "다크 모드",
    fontSize: "글자 크기",
    fontSmall: "축소",
    fontDefault: "기본",
    languageSetting: "언어 설정",
    korean: "한국어",
    english: "English",
    devBoard: "개발 보드",

    // Scenario Panel
    scenarioTitle: (scenarioId) => `시나리오: ${scenarioId}`,
    hide: "숨기기",
    end: "종료",
    select: "선택...",

    // Scenario Modal
    startScenario: "시나리오 시작하기",

    // Search Modal
    searchConversations: "대화 내용 검색...",
    searching: "검색 중...",
    noResults: "검색 결과가 없습니다.",

    // Dev Board
    devBoardTitle: "개발 보드",
    enterMemo: "메모를 입력하세요...",
    post: "작성",

    // Notifications
    notificationHistory: "알림 내역",
    noNotifications: "표시할 알림이 없습니다.",

    // API Messages
    scenarioListMessage: "실행할 시나리오를 선택해주세요.",

    initialBotMessage: "무엇을 도와드릴까요?",
    initialGreetingTitle: "무엇을 도와드릴까요?",
    initialGreetingSubtitle: "자연어로 저에게 말해보세요. 예를 들어, '피드백 주기'.",
  },
  en: {
    // General
    welcome: "Welcome to",
    hello: "Hello",
    submit: "Submit",
    cancel: "Cancel",
    logout: "Log Out",
    loading: "Loading...",
    copied: "Copied!",

    // Error Messages
    errorApiRequest: "API request failed. Please check your network connection or contact an administrator.",
    errorNetwork: "Network error. Please check your internet connection.",
    errorServer: "There was a problem with the server. Please try again later.",
    errorLLMFail: "There was a problem with the response. Please try again later.",
    errorUnexpected: "An unexpected error occurred. Please try again.",
    errorScenarioNotFound:
      "The linked scenario could not be found. Please check the shortcut in the scenario menu edit page.",

    // Validation Messages
    validationEmail: "Please enter a valid email address.",
    validationPhone: "Please enter a valid phone number (e.g., XXX-XXXX-XXXX).",
    validationFormat: "The input format is incorrect.",
    validationRegexError:
      "The regular expression set in the scenario is invalid.",
    validationDateRange: (startDate, endDate) =>
      `Please enter a date between ${startDate} and ${endDate}.`,
    validationDateAfter: "You must select today or a future date.",
    validationDateBefore: "You must select today or a past date.",

    //Manual
    manualTitle: "Detailed User Manual",
    manualContent: {
      ko: `
        <div class="manual-section">
            <h3>1. 챗봇 개요</h3>
            <p>이 챗봇은 <strong>LLM(거대 언어 모델) 기반의 자연어 대화</strong>와 <strong>정해진 규칙에 따른 시나리오</strong>를 결합한 하이브리드 시스템입니다. 단순한 질의응답뿐만 아니라 복잡한 업무 프로세스 처리, 데이터 조회, 폼 입력 등을 대화형 인터페이스로 수행할 수 있습니다.</p>
        </div>

        <div class="manual-section">
            <h3>2. 핵심 기능</h3>
            <ul>
                <li><strong>하이브리드 대화 모드:</strong> 일상적인 대화는 AI가 자연스럽게 응답하며, 특정 업무는 시나리오 모드로 전환되어 정확한 절차를 안내합니다.</li>
                <li><strong>시나리오 숏컷 (메뉴):</strong> 입력창 좌측의 메뉴 버튼을 통해 자주 사용하는 기능을 즉시 실행할 수 있습니다.</li>
                <li><strong>즐겨찾기 패널:</strong> 자주 쓰는 숏컷을 즐겨찾기에 등록하여 메인 화면에서 빠르게 접근할 수 있습니다.</li>
                <li><strong>대화 히스토리 관리:</strong> 과거 대화 내용을 검색하거나, 중요 대화를 상단에 고정(Pin)하고, 제목을 변경하여 관리할 수 있습니다.</li>
                <li><strong>멀티태스킹 UI:</strong> 메인 채팅과 시나리오 패널이 분리되어 있어, 대화를 나누면서 동시에 업무 양식을 작성하거나 데이터를 조회할 수 있습니다.</li>
            </ul>
        </div>

        <div class="manual-section">
            <h3>3. 사용 가이드</h3>
            
            <h4>대화 시작하기</h4>
            <p>좌측 상단의 <strong>[새로운 대화]</strong> 버튼을 클릭하거나, 입력창에 바로 메시지를 입력하여 대화를 시작하세요. "예약 조회해줘"와 같이 자연어로 요청하면 적절한 시나리오를 추천받을 수 있습니다.</p>

            <h4>숏컷 메뉴 활용</h4>
            <p>입력창 왼쪽의 <strong>[+] 메뉴 아이콘</strong>을 클릭하면 카테고리별로 정리된 기능 목록이 나타납니다.</p>
            <ul>
                <li>원하는 기능을 클릭하면 해당 시나리오가 실행되거나 텍스트가 입력됩니다.</li>
                <li>각 항목 옆의 <strong>[별 모양 아이콘]</strong>을 클릭하면 즐겨찾기에 추가/제거할 수 있습니다.</li>
            </ul>

            <h4>시나리오 진행</h4>
            <p>시나리오가 시작되면 우측(또는 하단)에 전용 패널이 열립니다.</p>
            <ul>
                <li><strong>폼 입력:</strong> 텍스트, 날짜, 선택 박스 등 다양한 양식을 통해 정보를 입력합니다.</li>
                <li><strong>그리드 선택:</strong> 조회된 데이터 목록에서 원하는 항목을 클릭하여 상세 정보를 확인합니다.</li>
                <li><strong>엑셀 업로드:</strong> 대량의 데이터 입력이 필요한 경우 엑셀 파일을 업로드하여 처리할 수 있습니다.</li>
            </ul>
        </div>

        <div class="manual-section">
            <h3>4. 개인화 및 설정</h3>
            <p>우측 상단의 <strong>[프로필 아이콘]</strong>을 클릭하여 다양한 설정을 변경해보세요.</p>
            <ul>
                <li><strong>언어 설정:</strong> 한국어와 영어(English) 중 편한 언어를 선택하세요.</li>
                <li><strong>개인 설정:</strong>
                    <ul>
                        <li><strong>폰트 크기:</strong> 글자 크기를 조절하여 가독성을 높일 수 있습니다.</li>
                        <li><strong>테마 변경:</strong> 눈이 편안한 다크 모드나 깔끔한 라이트 모드를 선택할 수 있습니다.</li>
                        <li><strong>텍스트 숏컷 즉시 전송:</strong> 숏컷 클릭 시 입력창을 거치지 않고 바로 메시지를 전송하도록 설정할 수 있습니다.</li>
                        <li><strong>완료된 시나리오 숨김:</strong> 대화 목록을 깔끔하게 유지하기 위해 완료된 작업을 자동으로 숨길 수 있습니다.</li>
                    </ul>
                </li>
            </ul>
        </div>
        `,
      en: `
        <div class="manual-section">
            <h3>1. Overview</h3>
            <p>This chatbot is a hybrid system combining <strong>LLM-based natural language conversation</strong> with <strong>rule-based scenarios</strong>. It handles not only simple Q&A but also complex business processes, data retrieval, and form inputs through an interactive interface.</p>
        </div>

        <div class="manual-section">
            <h3>2. Key Features</h3>
            <ul>
                <li><strong>Hybrid Chat Mode:</strong> AI handles casual conversations naturally, while specific tasks switch to scenario mode for precise guidance.</li>
                <li><strong>Scenario Shortcuts:</strong> Access frequently used functions instantly via the menu button on the left of the input bar.</li>
                <li><strong>Favorites Panel:</strong> Pin your most-used shortcuts to the main screen for quick access.</li>
                <li><strong>History Management:</strong> Search past conversations, pin important chats to the top, and rename them for better organization.</li>
                <li><strong>Multitasking UI:</strong> The main chat and scenario panel are separated, allowing you to chat while simultaneously filling out forms or viewing data.</li>
            </ul>
        </div>

        <div class="manual-section">
            <h3>3. User Guide</h3>
            
            <h4>Starting a Conversation</h4>
            <p>Click the <strong>[New Chat]</strong> button in the top left or simply type a message to start. You can ask naturally, like "Check my reservation," and the bot will recommend the appropriate scenario.</p>

            <h4>Using Shortcuts</h4>
            <p>Click the <strong>[+] Menu Icon</strong> next to the input bar to see a categorized list of functions.</p>
            <ul>
                <li>Click an item to execute the scenario or input text.</li>
                <li>Click the <strong>[Star Icon]</strong> next to an item to add or remove it from your favorites.</li>
            </ul>

            <h4>Running Scenarios</h4>
            <p>When a scenario starts, a dedicated panel opens on the right (or bottom).</p>
            <ul>
                <li><strong>Forms:</strong> Input information using text fields, date pickers, dropdowns, etc.</li>
                <li><strong>Grid Selection:</strong> Click on rows in a data list to view details or proceed.</li>
                <li><strong>Excel Upload:</strong> Upload Excel files for bulk data processing when available.</li>
            </ul>
        </div>

        <div class="manual-section">
            <h3>4. Personalization & Settings</h3>
            <p>Click the <strong>[Profile Icon]</strong> in the top right to customize your experience.</p>
            <ul>
                <li><strong>Language:</strong> Choose between Korean and English.</li>
                <li><strong>Personal Settings:</strong>
                    <ul>
                        <li><strong>Font Size:</strong> Adjust text size for better readability.</li>
                        <li><strong>Theme:</strong> Switch between Dark Mode and Light Mode.</li>
                        <li><strong>Instant Text Shortcut:</strong> Toggle this to send text shortcuts immediately without editing in the input bar.</li>
                        <li><strong>Hide Completed Scenarios:</strong> Automatically hide finished tasks to keep your chat list clean.</li>
                    </ul>
                </li>
            </ul>
        </div>
        `,
    },

    // Login
    loginPrompt: "NX AI Chatbot",
    signInWithGoogle: "Sign in with Google",
    signInWithTestId: "Sign in with Test ID",
    testIdPlaceholder: "Enter Test ID",
    loginMethodToggle: "OR",

    // Logout Modal
    logoutConfirm: "Are you sure you want to log out?",

    // Chat
    initialBotMessage: "Hello! How can I help you?",
    askAboutService: "Ask about this Booking Master Page",
    scenarioResume: (scenarioId) => `Resume '${scenarioId}' scenario`,
    scenarioEnded: (scenarioId) => `Scenario '${scenarioId}' has ended.`,
    scenarioStarted: (scenarioId) => `Scenario '${scenarioId}' has started.`,
    scenarioStatus: "Status:",
    statusActive: "In Progress",
    statusCompleted: "Completed",
    statusFailed: "Failed",
    statusGenerating: "Generating...",
    statusRequesting: "Requesting...",
    statusCanceled: "Canceled",
    statusSelected: "Selected",
    viewMore: "View More",
    viewLess: "View Less",

    // Chat Input
    enterResponse: "Enter your response...",

    // History Panel
    history: "History",
    newChat: "New Chat",
    deleteConvoConfirm:
      "Are you sure you want to delete the conversation details?",
    deleteAllConvos: "Delete All Conversations",
    deleteAllConvosConfirm: "Are you sure you want to permanently delete ALL conversation history (including messages and scenarios)? This action cannot be undone.",
    deleteAllConvosSuccess: "All conversation history successfully deleted.",
    noScenariosFound: "No scenarios were run.",
    loadingScenarios: "Loading scenarios...",
    noHistory: "No chat history has been created.",
    pin: "Pin",
    unpin: "Unpin",
    rename: "Rename",
    delete: "Delete",

    // Profile Modal
    greeting: (displayName) => `Hello, ${displayName}`,
    screenStyle: "Screen Style",
    lightMode: "Light Mode",
    darkMode: "Dark Mode",
    fontSize: "Font Size",
    fontSmall: "Small",
    fontDefault: "Default",
    languageSetting: "Language",
    korean: "한국어",
    english: "English",
    devBoard: "Dev Board",

    // Scenario Panel
    scenarioTitle: (scenarioId) => `Scenario: ${scenarioId}`,
    hide: "Hide",
    end: "End",
    cancel: "Cancel",
    select: "Select...",

    // Scenario Modal
    startScenario: "Start a Scenario",

    // Search Modal
    searchConversations: "Search conversations...",
    searching: "Searching...",
    noResults: "No results found.",

    // Dev Board
    devBoardTitle: "Dev Board",
    enterMemo: "Enter a memo...",
    post: "Post",

    // Notifications
    notificationHistory: "Notifications",
    noNotifications: "No notifications to display.",

    // API Messages
    scenarioListMessage: "Please select a scenario to run.",

    initialBotMessage: "How can I guide you?",
    initialGreetingTitle: "How can I guide you?",
    initialGreetingSubtitle: "Talk to me naturally. For example, 'Give Feedback'."
  },
};