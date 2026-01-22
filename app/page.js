// app/page.js
"use client";

import { useChatStore } from "../app/store";
import { useState, useEffect } from "react";
import Login from "../app/components/Login";
import Toast from "../app/components/Toast";
import styles from "./page.module.css";
import ConfirmModal from "../app/components/ConfirmModal";
import SharedHeader from "../app/components/SharedHeader"; 

export default function HomePage() {
  // --- 👇 [수정] 스토어 셀렉터를 개별적으로 분리 ---
  const user = useChatStore((state) => state.user);
  const isHistoryPanelOpen = useChatStore((state) => state.isHistoryPanelOpen);
  const isScenarioModalOpen = useChatStore(
    (state) => state.isScenarioModalOpen
  );
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
  const currentConversationId = useChatStore(
    (state) => state.currentConversationId
  );
  const showHistoryOnGreeting = useChatStore(
    (state) => state.showHistoryOnGreeting
  ); // <-- [추가]
  const shortcutMenuOpen = useChatStore((state) => state.shortcutMenuOpen);
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

  // [추가] 설정값을 반영하여 패널을 숨길지 여부 결정
  const rawShouldHidePanel =
    !isHistoryPanelOpen &&
    !currentConversationId &&
    showInitialGreeting &&
    !shortcutMenuOpen;

  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    if (!rawShouldHidePanel && !isInitializing) {
      setHasInteracted(true);
    }
  }, [rawShouldHidePanel, isInitializing]);

  const shouldHidePanel = rawShouldHidePanel && !hasInteracted;

  // 히스토리 패널 너비 계산: 숨겨야 하면 0px, 아니면 상태에 따라 60px 또는 320px
  const historyPanelWidth = shouldHidePanel
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
      ) : (
        <SharedHeader
          isInitializing={isInitializing}
          shouldHidePanel={shouldHidePanel}
          historyPanelWidth={historyPanelWidth}
          scenarioPanelClasses={scenarioPanelClasses}
          activePanel={activePanel}
          fontSize={fontSize}
          setFontSize={setFontSize}
          theme={theme}
          setTheme={setTheme}
          isScenarioModalOpen={isScenarioModalOpen}
          isDevMode={isDevMode}
        />
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
