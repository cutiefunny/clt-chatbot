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