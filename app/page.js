// app/page.js
"use client";

import { useChatStore } from "../app/store";
import Login from "../app/components/Login";
import HistoryPanel from "../app/components/HistoryPanel";
import ScenarioModal from "../app/components/ScenarioModal";
import Toast from "../app/components/Toast";
import styles from "./page.module.css";
import ConfirmModal from "../app/components/ConfirmModal";
import DevStateDisplay from "../app/components/DevStateDisplay";
import MainAreaLayout from "../app/components/MainAreaLayout";
import SplashScreen from "../app/components/SplashScreen"; // <-- [추가]

export default function HomePage() {
  // --- 👇 [수정] 스토어 셀렉터를 개별적으로 분리하여 무한 루프 방지 ---
  const user = useChatStore((state) => state.user);
  const isHistoryPanelOpen = useChatStore((state) => state.isHistoryPanelOpen);
  const isScenarioModalOpen = useChatStore((state) => state.isScenarioModalOpen);
  const confirmModal = useChatStore((state) => state.confirmModal);
  const closeConfirmModal = useChatStore((state) => state.closeConfirmModal);
  const isDevMode = useChatStore((state) => state.isDevMode);
  const activePanel = useChatStore((state) => state.activePanel);
  const isScenarioPanelExpanded = useChatStore(
    (state) => state.isScenarioPanelExpanded
  );
  const theme = useChatStore((state) => state.theme);
  const setTheme = useChatStore((state) => state.setTheme);
  const fontSize = useChatStore((state) => state.fontSize);
  const setFontSize = useChatStore((state) => state.setFontSize);
  const isInitializing = useChatStore((state) => state.isInitializing);
  const setIsInitializing = useChatStore((state) => state.setIsInitializing);
  const messages = useChatStore((state) => state.messages);
  // --- 👆 [수정] ---

  const handleConfirm = () => {
    if (confirmModal.onConfirm) {
      confirmModal.onConfirm();
    }
    closeConfirmModal();
  };

  // --- 👇 [수정] HistoryPanel 표시 여부 및 너비 계산 ---
  // 초기 메시지("initial")만 있는지 확인
  const showInitialGreeting = messages.length <= 1;

  // 히스토리 패널 너비 계산: 초기 화면이면 0px, 아니면 상태에 따라 60px 또는 320px
  const historyPanelWidth = showInitialGreeting
    ? "0px"
    : isHistoryPanelOpen
    ? "320px"
    : "60px";
  // --- 👆 [수정] ---

  const scenarioPanelClasses = [styles.scenarioPanel];
  if (activePanel === "scenario") {
    scenarioPanelClasses.push(styles.scenarioPanelOpen);
    if (isScenarioPanelExpanded) {
      scenarioPanelClasses.push(styles.scenarioPanelExpanded);
    }
  }

  // --- 👇 [추가] 스플래시 애니메이션 종료 핸들러 ---
  const handleSplashAnimationEnd = () => {
    console.log("Splash animation finished. Setting isInitializing to false.");
    setIsInitializing(false); // 스토어 상태 변경
  };

  return (
    <main className={styles.main}>
      <Toast />
      {/* --- 👇 [수정] 렌더링 로직 변경 --- */}
      {!user ? (
        <Login />
      ) : isInitializing ? (
        // --- 👇 [수정] 89라인의 {" "} 제거 ---
        <SplashScreen onAnimationEnd={handleSplashAnimationEnd} />
      ) : (
        // --- 👆 [수정] ---
        <>
          <div className={styles.chatLayout}>
            {/* --- 👇 [수정] 초기 화면이 아닐 때만 HistoryPanel 렌더링 --- */}
            {!showInitialGreeting && <HistoryPanel />}
            {/* --- 👆 [수정] --- */}
            <MainAreaLayout
              historyPanelWidth={historyPanelWidth}
              scenarioPanelClasses={scenarioPanelClasses}
              activePanel={activePanel}
              fontSize={fontSize}
              setFontSize={setFontSize}
              theme={theme}
              setTheme={setTheme}
            />
          </div>
          {isScenarioModalOpen && <ScenarioModal />}
          {isDevMode && <DevStateDisplay />}
        </>
      )}
      {/* --- 👆 [수정] --- */}
      {confirmModal.isOpen && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText={confirmModal.confirmText}
          cancelText={confirmModal.cancelText}
          onConfirm={handleConfirm}
          onClose={closeConfirmModal}
          confirmVariant={confirmModal.confirmVariant}
        />
      )}
    </main>
  );
}