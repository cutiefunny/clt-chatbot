"use client";

import { useChatStore } from "../app/store";
import Chat from "../app/components/Chat";
import Login from "../app/components/Login";
import HistoryPanel from "../app/components/HistoryPanel";
import ChatInput from "../app/components/ChatInput";
import ScenarioModal from "../app/components/ScenarioModal";
// --- 👇 [수정] ScenarioChat 임포트 ---
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
    // --- 👇 [수정] activePanel 상태 가져오기 ---
    activePanel,
  } = useChatStore();

  const handleConfirm = () => {
    if (confirmModal.onConfirm) {
      confirmModal.onConfirm();
    }
    closeConfirmModal();
  };

  return (
    <main className={styles.main}>
      <Toast />
      {user ? (
        <>
          {/* --- 👇 [수정] chatLayout 구조 변경 --- */}
          <div className={styles.chatLayout}>
            <HistoryPanel />
            {/* 메인 채팅 영역 */}
            <div
              className={`${styles.contentAndInputWrapper} ${
                activePanel === "scenario" ? styles.mainPanelShiftedLeft : "" // 시나리오 열릴 때 왼쪽으로 이동하는 클래스 추가
              }`}
              style={{
                paddingLeft: isHistoryPanelOpen ? "320px" : "60px",
                // width 계산 방식 변경 (padding 대신)
                width: `calc(100% - ${isHistoryPanelOpen ? "320px" : "60px"})`, // HistoryPanel 너비 고려
              }}
            >
              <Chat />
              <ChatInput />
            </div>
            {/* 시나리오 패널 영역 */}
            <div
              className={`${styles.scenarioPanel} ${
                activePanel === "scenario" ? styles.scenarioPanelOpen : "" // 열림/닫힘 클래스 제어
              }`}
            >
              {/* ScenarioChat 컴포넌트를 여기에 렌더링 */}
              {activePanel === "scenario" && <ScenarioChat />}
            </div>
            {/* --- 👆 [수정] --- */}

            {isScenarioModalOpen && <ScenarioModal />}
          </div>
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