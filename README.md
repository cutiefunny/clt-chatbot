CLT Chatbot (Hybrid Assistant)

![CLT Chatbot Hybrid Assistant](/images/hybrid-chatbot.jpg)

This is a Next.js project bootstrapped with create-next-app. It's a feature-rich chatbot application designed to serve as a hybrid assistant, combining scenario-based logic with a powerful language model.

✨ Main Features

하이브리드 채팅 시스템: 시나리오 기반의 정형화된 응답과 외부 LLM(Google Gemini 또는 Flowise)을 통한 유연한 자연어 응답을 결합하여 제공합니다.

실시간 대화: Firebase Firestore를 사용하여 실시간으로 메시지를 주고받고, 모든 대화 기록을 저장합니다.

사용자 인증: Google 계정을 통한 간편하고 안전한 로그인을 지원합니다.

대화 히스토리 및 검색: 이전 대화 목록을 확인하고, 전체 대화 내용에서 키워드로 메시지를 검색할 수 있습니다.

시나리오 엔진: 정해진 흐름에 따라 사용자와 상호작용하는 복잡한 시나리오를 생성하고 실행할 수 있습니다.

다국어 지원: 한국어와 영어를 지원하며, 손쉽게 다른 언어를 추가할 수 있는 구조로 설계되었습니다.

사용자 맞춤 설정: 라이트/다크 테마, 폰트 크기, 텍스트 숏컷 즉시 전송 여부 등을 사용자가 직접 설정하고 저장할 수 있습니다.

푸시 알림: 중요한 이벤트가 발생했을 때 사용자에게 토스트 메시지 및 알림 내역을 통해 알려줍니다.

관리자 설정: 즐겨찾기 개수, LLM 공급자(Gemini/Flowise), Flowise API URL 등 챗봇의 주요 동작 설정을 관리자 페이지에서 변경할 수 있습니다.

🛠️ Tech Stack

Framework: Next.js (App Router)

State Management: Zustand

Backend & Database: Firebase (Firestore, Authentication)

Generative AI: Google Gemini / Flowise (선택 가능)

Styling: CSS Modules, Tailwind CSS

Deployment: Vercel

📂 Project Structure

.
├── app/                  # Next.js App Router
│   ├── api/              # API routes (Backend logic)
│   ├── components/       # Reusable React components
│   ├── lib/              # Core logic (Firebase, LLM, Chatbot Engine, Node Handlers)
│   ├── hooks/            # Custom React Hooks
│   ├── store/            # Zustand state management slices
│   ├── admin/            # Admin pages (Scenario Editor, General/Personal Settings)
│   ├── apidocs/          # API Documentation page
│   └── ...
├── public/               # Static assets (images, fonts)
└── ...


app/api: 서버 사이드 로직을 처리하는 API 라우트가 위치합니다. 챗봇의 메시지 처리 및 시나리오 실행 요청을 담당합니다.

app/components: 채팅 UI, 모달, 패널 등 UI를 구성하는 컴포넌트들입니다.

app/lib:

chatbotEngine.js: 시나리오 탐색 및 실행 로직.

nodeHandlers.js: 각 노드 타입별 실행 핸들러.

llm.js / gemini.js: 외부 AI 모델 연동 로직.

firebase.js: Firebase 초기화 및 유틸리티.

app/store: Zustand를 사용한 전역 상태 관리 로직입니다. 기능별(slice)로 상태를 분리하여 관리합니다.

app/admin: 시나리오 메뉴 편집기(scenario-editor), 일반 설정(general), 개인 설정(personal) 등 관리자 및 사용자 설정 페이지들이 위치합니다.

🤖 Scenario Engine Guide

프로젝트의 핵심 기능 중 하나는 app/lib/chatbotEngine.js와 app/lib/nodeHandlers.js에 구현된 시나리오 엔진입니다. 이 엔진은 Firestore에 저장된 시나리오 정의를 기반으로 사용자와의 상호작용 흐름을 제어합니다.

시나리오 노드 타입

시나리오는 여러 종류의 '노드(Node)'를 연결하여 구성됩니다.

노드 타입

설명

message

사용자에게 단순 텍스트 메시지를 표시합니다.

slotfilling

사용자에게 질문을 하고, 입력받은 값을 특정 '슬롯(slot)'에 저장합니다. 유효성 검사를 지원합니다.

branch

사용자에게 선택지(버튼)를 제공하거나, 슬롯 값/조건에 따라 흐름을 분기합니다.

form

여러 입력 필드(텍스트, 날짜, 드롭박스 등)로 구성된 폼을 제시하여 데이터를 한 번에 입력받습니다.

api

외부 API 요청을 보내고 응답을 파싱하여 슬롯에 저장합니다. 성공/실패 분기가 가능합니다.

llm

Gemini 또는 Flowise에 프롬프트를 전송하고, 생성된 응답 및 추출된 정보를 저장합니다.

toast

사용자 화면에 알림(Toast) 메시지를 띄웁니다.

iframe

지정된 URL의 웹 페이지를 채팅창 내에 iFrame으로 렌더링합니다.

link

클릭 시 새 탭이나 부모 창에서 열리는 링크를 제공합니다.

setSlot

하나 이상의 슬롯 값을 직접 설정하거나 연산하여 업데이트합니다.

delay

지정된 시간(ms)만큼 시나리오 진행을 잠시 멈춥니다.

시나리오 실행 흐름

시나리오 트리거: 사용자가 메뉴 숏컷을 클릭하거나 특정 텍스트를 입력하면, chatbotEngine.js가 Firestore의 shortcut 컬렉션을 조회하여 연결된 시나리오 ID를 찾습니다.

시나리오 로드: Firestore의 scenarios 컬렉션에서 해당 시나리오의 노드와 엣지 데이터를 로드합니다.

노드 순회 및 실행: runScenario 함수가 시작 노드부터 순차적으로 실행합니다. 각 노드는 nodeHandlers.js에 정의된 핸들러에 의해 처리됩니다.

다음 노드 결정: getNextNode 함수가 현재 노드의 결과(사용자 입력, 버튼 선택, 조건문 등)와 엣지 연결 정보를 바탕으로 다음 노드를 결정합니다.

상태 저장: 시나리오의 진행 상태(현재 노드, 슬롯 값)는 Firestore의 scenario_sessions 컬렉션에 실시간으로 동기화됩니다.

새로운 시나리오 추가 방법

시나리오 데이터 생성: 별도의 시나리오 에디터 툴을 통해 노드와 엣지를 구성하고 JSON 데이터를 생성합니다.

Firestore 저장: 생성된 데이터를 Firestore scenarios 컬렉션에 문서로 저장합니다.

메뉴 등록: 챗봇 내 /admin/scenario-editor 페이지에서 시나리오 카테고리 및 아이템을 추가하고, action 타입을 scenario, 값을 scenarioId로 설정하여 메뉴에 등록합니다.

🚀 Getting Started

Prerequisites

Node.js (v18.18 or higher)

Firebase Project (Firestore, Auth)

Google Gemini API Key (Gemini 사용 시)

Flowise Instance & API Endpoint (Flowise 사용 시)

1. Clone the repository

git clone [https://github.com/your-username/clt-chatbot.git](https://github.com/your-username/clt-chatbot.git)
cd clt-chatbot


2. Install dependencies

npm install
# or
yarn install
# or
pnpm install


3. Set up environment variables

프로젝트 루트에 .env.local 파일을 생성하고 다음 변수들을 설정하세요.

# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Google Gemini API (Default LLM)
GOOGLE_GEMINI_API_KEY=your_gemini_api_key

# Flowise API Endpoint (Optional, if using Flowise)
# Can also be configured via Admin UI (/admin/general)
NEXT_PUBLIC_FLOWISE_API_URL=your_flowise_endpoint_url

# Optional: Parent window origin for postMessage communication (if embedded)
NEXT_PUBLIC_PARENT_ORIGIN=http://localhost:3000


Note: NEXT_PUBLIC_FLOWISE_API_URL은 선택 사항입니다. 환경 변수에 없더라도 관리자 페이지(/admin/general)에서 설정할 수 있으며, 관리자 페이지의 설정이 우선 적용됩니다.

4. Run the development server

npm run dev
# or
yarn dev
# or
pnpm dev


브라우저에서 http://localhost:3000을 열어 확인하세요.

5. Configure LLM Provider (Optional)

기본 LLM은 Gemini로 설정되어 있습니다. Flowise를 사용하려면:

앱에 로그인합니다.

헤더의 설정(⚙️) 아이콘을 클릭하여 /admin/general 페이지로 이동합니다.

LLM 공급자를 Flowise로 변경하고 API URL을 입력한 뒤 저장합니다.

☁️ Deploy on Vercel

The easiest way to deploy your Next.js app is to use the Vercel Platform from the creators of Next.js.

Check out the Next.js deployment documentation for more details.