# CLT Chatbot (Hybrid Assistant)

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app). It's a feature-rich chatbot application designed to serve as a hybrid assistant, combining scenario-based logic with a powerful language model.

![Chatbot Demo](public/images/chat_simulator.png)

## ✨ Main Features

* **하이브리드 채팅 시스템**: 시나리오 기반의 정형화된 응답과 외부 LLM(Google Gemini 또는 Flowise)을 통한 유연한 자연어 응답을 결합하여 제공합니다.
* **실시간 대화**: Firebase Firestore를 사용하여 실시간으로 메시지를 주고받고, 모든 대화 기록을 저장합니다.
* **사용자 인증**: Google 계정을 통한 간편하고 안전한 로그인을 지원합니다.
* **대화 히스토리 및 검색**: 이전 대화 목록을 확인하고, 전체 대화 내용에서 키워드로 메시지를 검색할 수 있습니다.
* **시나리오 엔진**: 정해진 흐름에 따라 사용자와 상호작용하는 복잡한 시나리오를 생성하고 실행할 수 있습니다.
* **다국어 지원**: 한국어와 영어를 지원하며, 손쉽게 다른 언어를 추가할 수 있는 구조로 설계되었습니다.
* **사용자 맞춤 설정**: 라이트/다크 테마와 폰트 크기를 사용자가 직접 설정하고 저장할 수 있습니다.
* **푸시 알림**: 중요한 이벤트가 발생했을 때 사용자에게 토스트 메시지 및 알림 내역을 통해 알려줍니다.
* **관리자 설정**: 즐겨찾기 개수, LLM 공급자(Gemini/Flowise), Flowise API URL 등 챗봇의 주요 동작 설정을 관리자 페이지에서 변경할 수 있습니다.

## 🛠️ Tech Stack

* **Framework**: [Next.js](https://nextjs.org/)
* **State Management**: [Zustand](https://github.com/pmndrs/zustand)
* **Backend & Database**: [Firebase](https://firebase.google.com/) (Firestore, Authentication)
* **Generative AI**: [Google Gemini](https://ai.google.dev/) / [Flowise](https://flowiseai.com/) (선택 가능)
* **Styling**: CSS Modules, Tailwind CSS
* **Deployment**: [Vercel](https://vercel.com)

## 📂 Project Structure

. ├── app/ # Next.js App Router │ ├── api/ # API routes │ ├── components/ # React components │ ├── lib/ # Core logic (Firebase, LLM, Chatbot Engine) │ ├── store/ # Zustand state management slices │ └── admin/ # Admin pages (Scenario Editor, General Settings) │ └── ... ├── public/ # Static assets (images, fonts) └── ...


* **`app/api`**: 서버 사이드 로직을 처리하는 API 라우트가 위치합니다. 챗봇의 핵심 백엔드 로직이 이곳에 구현되어 있습니다.
* **`app/components`**: UI를 구성하는 재사용 가능한 React 컴포넌트들입니다.
* **`app/lib`**: Firebase 연동, LLM API 호출(`llm.js`), 시나리오 엔진(`chatbotEngine.js`, `nodeHandlers.js`) 등 핵심 비즈니스 로직을 포함합니다.
* **`app/store`**: Zustand를 사용한 전역 상태 관리 로직입니다. 기능별(slice)로 상태를 분리하여 관리합니다.
* **`app/admin`**: 시나리오 메뉴 편집기(`scenario-editor`), 일반 설정(`general`) 등 관리자 전용 페이지들이 위치합니다.
* **`public`**: 이미지, 아이콘 등 정적 파일들이 위치합니다.

## 🤖 Scenario Engine Guide

프로젝트의 핵심 기능 중 하나는 `app/lib/chatbotEngine.js`에 구현된 시나리오 엔진입니다. 이 엔진은 Firestore에 저장된 시나리오 정의를 기반으로 사용자와의 상호작용 흐름을 제어합니다.

### 시나리오 노드 타입

시나리오는 여러 종류의 '노드(Node)'를 연결하여 구성됩니다. 각 노드는 특정 기능을 수행합니다.

| 노드 타입   | 설명                                                                                                                                |
| :---------- | :---------------------------------------------------------------------------------------------------------------------------------- |
| `message`   | 사용자에게 단순 텍스트 메시지를 표시합니다.                                                                                    |
| `slotfilling` | 사용자에게 질문을 하고, 입력받은 값을 특정 '슬롯(slot)'에 저장합니다. 입력값에 대한 유효성 검사(정규식, 이메일 등)를 추가할 수 있습니다. |
| `branch`    | 사용자에게 여러 선택지(Quick Reply 버튼)를 제공하거나, 슬롯 값에 따라 조건부로 분기합니다.                                          |
| `form`      | 여러 입력 필드로 구성된 폼(Form)을 사용자에게 제시하고, 한 번에 여러 데이터를 입력받습니다.                                               |
| `api`       | 지정된 URL로 API 요청을 보내고, 응답 결과를 파싱하여 슬롯에 저장합니다. 성공/실패에 따라 분기할 수 있습니다.                              |
| `llm`       | Google Gemini 또는 Flowise와 같은 외부 언어 모델에 프롬프트를 전송하고, 생성된 텍스트 응답 및 추출된 슬롯 값을 저장합니다.                |
| `toast`     | 사용자 화면에 Toast 메시지를 띄워 상태 변경이나 알림을 전달합니다.                                                               |
| `iframe`    | 지정된 URL의 웹 페이지를 채팅창 내에 iFrame으로 렌더링합니다.                                                                  |
| `link`      | 사용자에게 클릭 가능한 링크를 제공합니다. 클릭 시 지정된 URL이 새 탭 또는 부모 창에서 열립니다.                                                   |
| `setSlot`   | 하나 이상의 슬롯 값을 직접 설정하거나 업데이트합니다. 값은 리터럴, 다른 슬롯 값 또는 이들의 조합으로 설정할 수 있습니다.                 |
| `delay`     | 지정된 시간(밀리초)만큼 시나리오 진행을 잠시 멈춥니다.                                                                         |

### 시나리오 실행 흐름

1.  **시나리오 트리거**: `findActionByTrigger` 함수는 사용자 입력(텍스트 또는 버튼 클릭)이 Firestore의 `shortcut` 컬렉션에 정의된 항목과 일치하는지 확인하여 연결된 시나리오 또는 커스텀 액션을 찾습니다 (`app/lib/chatbotEngine.js`).
2.  **시나리오 로드**: `getScenario` 함수는 Firestore의 `scenarios` 컬렉션에서 해당 시나리오의 노드와 엣지(연결선) 데이터를 가져옵니다.
3.  **노드 순회**: `runScenario` 함수가 현재 노드부터 시작하여 로직을 실행합니다. 각 노드 타입에 맞는 핸들러(`app/lib/nodeHandlers.js`)가 호출됩니다.
4.  **다음 노드 결정**: `getNextNode` 함수는 현재 노드의 실행 결과(사용자 입력, API 응답, 슬롯 값 조건 등)와 엣지 정보를 바탕으로 다음에 실행할 노드를 결정합니다.
5.  **상태 저장**: 시나리오 진행 상태(현재 노드 ID, 슬롯에 저장된 값 등)는 Firestore의 해당 대화 내 `scenario_sessions` 컬렉션에 실시간으로 기록됩니다.

### 새로운 시나리오 추가하기

1.  **시나리오 에디터 사용**: (가이드) 시나리오를 시각적으로 설계할 수 있는 외부 툴(예: React Flow 기반의 자체 에디터)을 사용하여 노드와 엣지를 구성합니다.
2.  **Firestore에 데이터 저장**: 설계된 시나리오의 JSON 데이터(`nodes`, `edges`, `version` 등 포함)를 Firestore의 `scenarios` 컬렉션에 새로운 문서로 추가합니다. 문서 ID가 `scenarioId`가 됩니다.
3.  **시나리오 메뉴에 등록 (선택 사항)**: 사용자가 입력창 좌측 메뉴를 통해 시나리오를 직접 시작하게 하려면, `/admin/scenario-editor` 페이지에서 메뉴 구조를 편집하여 해당 시나리오를 추가합니다. 여기서 `action` 타입을 `scenario`로, `value`를 `scenarioId`로 설정합니다.
4.  **트리거 문구 등록 (선택 사항)**: 사용자의 특정 입력 문구로 시나리오를 시작하게 하려면, `/admin/scenario-editor` 페이지에서 메뉴 아이템을 추가하고 `title`에 트리거 문구를 입력합니다. `action`은 위와 동일하게 설정합니다.
5.  **API 라우트 핸들러 추가 (필요시)**: 만약 특정 조건에서 프로그래매틱하게 시나리오를 시작해야 한다면 `app/api/chat/route.js`의 `actionHandlers`에 새로운 핸들러를 추가할 수 있습니다.

## 🚀 Getting Started

### Prerequisites

* Node.js (v18.18 or higher)
* Firebase Project
* Google Gemini API Key (Gemini 사용 시)
* Flowise Instance & API Endpoint URL (Flowise 사용 시)

### 1. Clone the repository

```bash
git clone [https://github.com/your-username/clt-chatbot.git](https://github.com/your-username/clt-chatbot.git)
cd clt-chatbot
2. Install dependencies
Bash

npm install
# or
yarn install
# or
pnpm install
3. Set up environment variables
Create a .env.local file in the root of the project and add the following environment variables.

코드 스니펫

# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Google Gemini API (if using Gemini)
GOOGLE_GEMINI_API_KEY=your_gemini_api_key

# Flowise API Endpoint (if using Flowise)
# This can also be configured via the admin UI (/admin/general)
NEXT_PUBLIC_FLOWISE_API_URL=your_flowise_endpoint_url

# Optional: Parent window origin for postMessage communication (if embedded)
NEXT_PUBLIC_PARENT_ORIGIN=http://localhost:3000
Note: NEXT_PUBLIC_FLOWISE_API_URL은 선택 사항입니다. 이 값을 설정하지 않으면 관리자 페이지(/admin/general)에서 설정해야 합니다. 관리자 설정이 우선 적용됩니다.

4. Run the development server
Bash

npm run dev
# or
yarn dev
# or
pnpm dev
Open http://localhost:3000 with your browser to see the result.

5. Configure LLM Provider (Optional)
기본 LLM 공급자는 Gemini입니다. Flowise를 사용하려면 챗봇에 로그인한 후, 프로필 메뉴를 통해 /admin/general 페이지로 이동하여 LLM 공급자를 Flowise로 변경하고 Flowise API URL을 입력한 후 저장하세요.

☁️ Deploy on Vercel
The easiest way to deploy your Next.js app is to use the Vercel Platform from the creators of Next.js.

Check out the Next.js deployment documentation for more details.


**주요 변경 사항:**

* **Main Features**: LLM 공급자 선택 기능 및 관리자 설정 기능 추가.
* **Tech Stack**: Generative AI 섹션에 Flowise 추가 및 선택 가능 명시.
* **Project Structure**: `app/admin` 디렉토리 설명 추가. `app/lib` 설명에 `llm.js` 언급 추가.
* **Scenario Node Types**: `llm`, `branch`, `setSlot`, `delay` 노드 설명 업데이트. `link` 타입 추가.
* **Scenario Execution Flow**: 트리거 방식 설명 업데이트 (`findActionByTrigger`, `shortcut` 컬렉션). `nodeHandlers.js` 언급 추가. 상태 저장 위치 명확화 (`scenario_sessions`).
* **New Scenario Addition**: 트리거 등록 방식을 관리자 페이지(`/admin/scenario-editor`) 사용으로 변경. `scenarioTriggers` 객체 대신 Firestore `shortcut` 컬렉션 사용 명시.
* **Prerequisites**: Flowise 관련 요구사항 추가.
* **Environment Variables**: `NEXT_PUBLIC_FLOWISE_API_URL` 추가 및 설명. `NEXT_PUBLIC_PARENT_ORIGIN` 추가.
* **Configure LLM Provider**: Flowise 사용 시 관리자 페이지 설정 안내 추가.