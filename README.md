# CLT Chatbot (Hybrid Assistant)

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app). It's a feature-rich chatbot application designed to serve as a hybrid assistant, combining scenario-based logic with a powerful language model.

![Chatbot Demo](public/images/chat_simulator.png)

## ✨ Main Features

* **하이브리드 채팅 시스템**: 시나리오 기반의 정형화된 응답과 Google Gemini LLM을 통한 유연한 자연어 응답을 결합하여 제공합니다.
* **실시간 대화**: Firebase Firestore를 사용하여 실시간으로 메시지를 주고받고, 모든 대화 기록을 저장합니다.
* **사용자 인증**: Google 계정을 통한 간편하고 안전한 로그인을 지원합니다.
* **대화 히스토리 및 검색**: 이전 대화 목록을 확인하고, 전체 대화 내용에서 키워드로 메시지를 검색할 수 있습니다.
* **시나리오 엔진**: 정해진 흐름에 따라 사용자와 상호작용하는 복잡한 시나리오를 생성하고 실행할 수 있습니다.
* **다국어 지원**: 한국어와 영어를 지원하며, 손쉽게 다른 언어를 추가할 수 있는 구조로 설계되었습니다.
* **사용자 맞춤 설정**: 라이트/다크 테마와 폰트 크기를 사용자가 직접 설정하고 저장할 수 있습니다.
* **푸시 알림**: 중요한 이벤트가 발생했을 때 사용자에게 토스트 메시지 및 알림 내역을 통해 알려줍니다.

## 🛠️ Tech Stack

* **Framework**: [Next.js](https://nextjs.org/)
* **State Management**: [Zustand](https://github.com/pmndrs/zustand)
* **Backend & Database**: [Firebase](https://firebase.google.com/) (Firestore, Authentication)
* **Generative AI**: [Google Gemini](https://ai.google.dev/)
* **Styling**: CSS Modules, Tailwind CSS
* **Deployment**: [Vercel](https://vercel.com)

## 📂 Project Structure

.
├── app/                  # Next.js App Router
│   ├── api/              # API routes
│   ├── components/       # React components
│   ├── lib/              # Core logic (Firebase, Gemini, Chatbot Engine)
│   ├── store/            # Zustand state management slices
│   └── ...
├── public/               # Static assets (images, fonts)
└── ...


* **`app/api`**: 서버 사이드 로직을 처리하는 API 라우트가 위치합니다. 챗봇의 핵심 백엔드 로직이 이곳에 구현되어 있습니다.
* **`app/components`**: UI를 구성하는 재사용 가능한 React 컴포넌트들입니다.
* **`app/lib`**: Firebase, Gemini API 연동 및 시나리오를 처리하는 챗봇 엔진 등 핵심 비즈니스 로직을 포함합니다.
* **`app/store`**: Zustand를 사용한 전역 상태 관리 로직입니다. 기능별(slice)로 상태를 분리하여 관리합니다.
* **`public`**: 이미지, 아이콘 등 정적 파일들이 위치합니다.

## 🤖 Scenario Engine Guide

프로젝트의 핵심 기능 중 하나는 `app/lib/chatbotEngine.js`에 구현된 시나리오 엔진입니다. 이 엔진은 Firestore에 저장된 시나리오 정의를 기반으로 사용자와의 상호작용 흐름을 제어합니다.

### 시나리오 노드 타입

시나리오는 여러 종류의 '노드(Node)'를 연결하여 구성됩니다. 각 노드는 특정 기능을 수행합니다.

| 노드 타입 | 설명 |
| --- | --- |
| `message` | 사용자에게 단순 텍스트 메시지를 표시합니다. |
| `slotfilling` | 사용자에게 질문을 하고, 입력받은 값을 특정 '슬롯(slot)'에 저장합니다. 입력값에 대한 유효성 검사(정규식, 이메일 등)를 추가할 수 있습니다. |
| `branch` | 사용자에게 여러 선택지(Quick Reply 버튼)를 제공하고, 선택에 따라 다른 노드로 분기합니다. |
| `form` | 여러 입력 필드로 구성된 폼(Form)을 사용자에게 제시하고, 한 번에 여러 데이터를 입력받습니다. |
| `api` | 지정된 URL로 API 요청을 보내고, 응답 결과를 파싱하여 슬롯에 저장합니다. 성공/실패에 따라 분기할 수 있습니다. |
| `llm` | Google Gemini와 같은 외부 언어 모델에 프롬프트를 전송하고, 생성된 텍스트 응답을 슬롯에 저장합니다. |
| `toast` | 사용자 화면에 Toast 메시지를 띄워 상태 변경이나 알림을 전달합니다. |
| `iframe` | 지정된 URL의 웹 페이지를 채팅창 내에 iFrame으로 렌더링합니다. |

### 시나리오 실행 흐름

1.  **시나리오 트리거**: `findScenarioIdByTrigger` 함수는 사용자 입력에서 특정 키워드를 감지하여 연결된 시나리오를 실행합니다. (`app/lib/chatbotEngine.js`)
2.  **시나리오 로드**: `getScenario` 함수는 Firestore의 `scenarios` 컬렉션에서 해당 시나리오의 노드와 엣지(연결선) 데이터를 가져옵니다.
3.  **노드 순회**: `runScenario` 함수가 현재 노드부터 시작하여 로직을 실행합니다.
4.  **다음 노드 결정**: `getNextNode` 함수는 현재 노드의 실행 결과(사용자 입력, API 응답 등)와 엣지 정보를 바탕으로 다음에 실행할 노드를 결정합니다.
5.  **상태 저장**: 시나리오 진행 상태(현재 노드 ID, 슬롯에 저장된 값 등)는 Firestore의 `scenario_sessions` 컬렉션에 실시간으로 기록됩니다.

### 새로운 시나리오 추가하기

1.  **시나리오 에디터 사용**: (가이드) 시나리오를 시각적으로 설계할 수 있는 외부 툴(예: React Flow 기반의 자체 에디터)을 사용하여 노드와 엣지를 구성합니다.
2.  **Firestore에 데이터 저장**: 설계된 시나리오의 JSON 데이터를 Firestore의 `scenarios` 컬렉션에 새로운 문서로 추가합니다. 문서 ID가 `scenarioId`가 됩니다.
3.  **트리거 키워드 등록**: `app/lib/chatbotEngine.js`의 `scenarioTriggers` 객체에 새로운 시나리오를 실행시킬 키워드와 `scenarioId`를 추가합니다.

    ```javascript
    // app/lib/chatbotEngine.js
    export const scenarioTriggers = {
      "reservation": "선박 예약",
      "question": "faq-scenario",
      "welcome": "Welcome",
      "scenario list": "GET_SCENARIO_LIST",
      "새로운 시나리오": "new-scenario-id" // <--- 이와 같이 추가
    };
    ```

4.  **API 라우트 핸들러 추가 (필요시)**: 만약 단순 키워드 트리거가 아닌, 특정 조건에서 시나리오를 시작해야 한다면 `app/api/chat/route.js`의 `actionHandlers`에 새로운 핸들러를 추가할 수 있습니다.

## 🚀 Getting Started

### Prerequisites

* Node.js (v18.18 or higher)
* Firebase Project
* Google Gemini API Key

### 1. Clone the repository

```bash
git clone [https://github.com/your-username/clt-chatbot.git](https://github.com/your-username/clt-chatbot.git)
cd clt-chatbot
2. Install dependencies
Bash

npm install
# or
yarn install
3. Set up environment variables
Create a .env.local file in the root of the project and add the following environment variables.

# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Google Gemini API
GOOGLE_GEMINI_API_KEY=your_gemini_api_key
4. Run the development server
Bash

npm run dev
# or
yarn dev
Open http://localhost:3000 with your browser to see the result.

☁️ Deploy on Vercel
The easiest way to deploy your Next.js app is to use the Vercel Platform from the creators of Next.js.

Check out our Next.js deployment documentation for more details.