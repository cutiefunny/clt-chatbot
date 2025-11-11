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

export default function MainAreaLayout({
  historyPanelWidth,
  scenarioPanelClasses,
  activePanel,
  hideMainContent = false,
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
      <div className={styles.contentAndInputWrapper}>
        {!hideMainContent && <Chat />}
        <ChatInput />
      </div>
      {activePanel === "scenario" && (
        <div className={scenarioPanelClasses.join(" ")}>
          <ScenarioChat />
        </div>
      )}
    </div>
  );
}
