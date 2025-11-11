// app/components/MainAreaLayout.jsx
"use client";

// --- 👇 [추가] ---
import { useChatStore } from "../store";
import InitialGreeting from "./InitialGreeting";
// --- 👆 [추가] ---
import Chat from "./Chat";
import ChatInput from "./ChatInput";
import ScenarioChat from "./ScenarioChat";
import styles from "../page.module.css";
import chatStyles from "./Chat.module.css";
import MoonIcon from "./icons/MoonIcon";
import CloseIcon from "./icons/CloseIcon";
import {
  postToParent,
  PARENT_ORIGIN,
  delayParentAnimationIfNeeded,
} from "../lib/parentMessaging";

export default function MainAreaLayout({
  historyPanelWidth,
  scenarioPanelClasses,
  activePanel,
  fontSize,
  setFontSize,
  theme,
  setTheme,
}) {
  // --- 👇 [추가] ---
  const messages = useChatStore((state) => state.messages);
  // 초기 메시지("initial")만 있는지 확인
  const showInitialGreeting = messages.length <= 1;
  // --- 👆 [추가] ---

  return (
    <div
      className={styles.mainArea}
      style={{
        paddingLeft: historyPanelWidth,
      }}
    >
      <div className={styles.panelsWrapper}>
        <div className={styles.contentAndInputWrapper}>
          {/* --- 👇 [수정] 조건부 렌더링 --- */}
          {/* showInitialGreeting이 true이면 (메시지가 1개 이하) InitialGreeting 렌더링
            false이면 (메시지가 2개 이상) Chat (채팅 내역) 렌더링
          */}
          {/* {showInitialGreeting ? <InitialGreeting /> : <Chat />} */}
          <Chat />
          {/* ChatInput은 항상 렌더링 (Chat.jsx 내부에서 이동) */}
          <ChatInput />
          {/* --- 👆 [수정] --- */}
        </div>
        <div className={scenarioPanelClasses.join(" ")}>
          {activePanel === "scenario" && <ScenarioChat />}
        </div>
      </div>
    </div>
  );
}
