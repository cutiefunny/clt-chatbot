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
      <div className={styles.sharedHeader}>
        <div className={chatStyles.header}>
          <div className={chatStyles.headerButtons}>
            {/* 테마 및 폰트 크기 버튼 (기존 코드 유지) */}
            <div
              className={chatStyles.settingControl}
              style={{ display: "none" }}
            >
              <span className={chatStyles.settingLabel}>Large text</span>
              <label className={chatStyles.switch}>
                <input
                  type="checkbox"
                  checked={fontSize === "default"}
                  onChange={() =>
                    setFontSize(fontSize === "default" ? "small" : "default")
                  }
                />
                <span className={chatStyles.slider}></span>
              </label>
            </div>
            <div
              className={chatStyles.separator}
              style={{ display: "none" }}
            ></div>
            <div style={{ display: "none" }}>
              <button
                className={chatStyles.themeToggleButton}
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              >
                <MoonIcon />
              </button>
            </div>
            {/* 닫기 버튼 (기존 코드 유지) */}
            <button
              className={chatStyles.headerCloseButton}
              onClick={async () => {
                console.log(
                  `[Call Window Method] callChatbotClose to ${PARENT_ORIGIN}`
                );
                postToParent("callChatbotClose", { state: "close" });
                await delayParentAnimationIfNeeded();
              }}
            >
              <CloseIcon />
            </button>
          </div>
        </div>
      </div>
      <div className={styles.panelsWrapper}>
        <div className={styles.contentAndInputWrapper}>
          {/* --- 👇 [수정] 조건부 렌더링 --- */}
          {/* showInitialGreeting이 true이면 (메시지가 1개 이하) InitialGreeting 렌더링
            false이면 (메시지가 2개 이상) Chat (채팅 내역) 렌더링
          */}
          {showInitialGreeting ? <InitialGreeting /> : <Chat />}
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