"use client";

import { useChatStore } from "../app/store";
import Chat from "../app/components/Chat";
import Login from "../app/components/Login";
import HistoryPanel from "../app/components/HistoryPanel";
import ChatInput from "../app/components/ChatInput";
import ScenarioModal from "../app/components/ScenarioModal";
import ScenarioChat from "../app/components/ScenarioChat";
import Toast from "../app/components/Toast";
import styles from "./page.module.css";
import ConfirmModal from "../app/components/ConfirmModal";
import DevStateDisplay from "../app/components/DevStateDisplay";

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
            {/* 메인 채팅 영역 */}
            <div
              className={styles.contentAndInputWrapper}
              style={{
                // --- 👇 [수정] paddingLeft만 동적으로 설정 ---
                paddingLeft: historyPanelWidth,
                // width는 flex-grow: 1에 의해 자동으로 계산되므로 제거
                // width: `calc(100% - ${historyPanelWidth})`,
                // --- 👆 [수정] ---
              }}
            >
              <Chat />
              <ChatInput />
            </div>
            {/* 시나리오 패널 영역 */}
            <div className={scenarioPanelClasses.join(" ")}>
              {/* ScenarioChat 컴포넌트를 여기에 렌더링 */}
              {activePanel === "scenario" && <ScenarioChat />}
            </div>
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
