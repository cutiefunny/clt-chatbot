// app/components/MainAreaLayout.jsx
"use client";

import { useEffect } from "react";
import { useChatStore } from "../store";
import InitialGreeting from "./InitialGreeting";
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
  const messages = useChatStore((state) => state.messages);
  
  // --- 👇 [수정] SSE 관련 함수 구조 분해 할당 주석 처리 ---
  /*
  const { useFastApi, useLocalFastApiUrl, connectToSSE, disconnectSSE } = useChatStore();
  */
  // --- 👆 [수정] ---
  
  const showInitialGreeting = messages.length <= 1;

  // --- 👇 [수정] SSE 연결/해제 useEffect 주석 처리 ---
  /*
  useEffect(() => {
    // FastAPI 사용 설정이 켜져 있을 때만 연결 시도
    if (useFastApi) {
        connectToSSE();
    } else {
        disconnectSSE(); // 꺼지면 연결 해제
    }

    // 컴포넌트 언마운트 시 연결 해제
    return () => {
        disconnectSSE();
    };
  }, [useFastApi, useLocalFastApiUrl, connectToSSE, disconnectSSE]);
  */
  // --- 👆 [수정] ---

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
      <div
        className={scenarioPanelClasses.join(" ")}
        aria-hidden={activePanel !== "scenario"}
      >
        {activePanel === "scenario" && <ScenarioChat />}
      </div>
    </div>
  );
}