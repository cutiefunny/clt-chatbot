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

export default function HomePage() {
  const {
    user,
    isHistoryPanelOpen,
    isScenarioModalOpen,
    confirmModal,
    closeConfirmModal,
    isDevMode,
    activePanel, // activePanel 상태 가져오기
    isScenarioPanelExpanded,
    theme,
    setTheme,
    fontSize,
    setFontSize,
  } = useChatStore();

  const handleConfirm = () => {
    if (confirmModal.onConfirm) {
      confirmModal.onConfirm();
    }
    closeConfirmModal();
  };

  // --- 👇 [수정] 히스토리 패널 너비 계산 로직 분리 ---
  const historyPanelWidth = isHistoryPanelOpen ? "320px" : "60px";
  // --- 👆 [수정] ---

  const scenarioPanelClasses = [styles.scenarioPanel];
  if (activePanel === "scenario") {
    scenarioPanelClasses.push(styles.scenarioPanelOpen);
    if (isScenarioPanelExpanded) {
      scenarioPanelClasses.push(styles.scenarioPanelExpanded);
    }
  }

  return (
    <main className={styles.main}>
      <Toast />
      {user ? (
        <>
          <div className={styles.chatLayout}>
            <HistoryPanel />
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
      ) : (
        <Login />
      )}
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
