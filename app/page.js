"use client";

import { useChatStore } from "../app/store";
import Chat from "../app/components/Chat";
import Login from "../app/components/Login";
import HistoryPanel from "../app/components/HistoryPanel";
import ChatInput from "../app/components/ChatInput";
import ScenarioModal from "../app/components/ScenarioModal";
import Toast from "../app/components/Toast";
import styles from "./page.module.css";
import ConfirmModal from "../app/components/ConfirmModal";

export default function HomePage() {
  const {
    user,
    isScenarioPanelOpen,
    activePanel,
    setActivePanel,
    isHistoryPanelOpen,
    isScenarioModalOpen,
    confirmModal,
    closeConfirmModal,
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
        <div
          className={`${styles.chatLayout} ${
            isScenarioPanelOpen ? styles.scenarioOpen : ""
          }`}
        >
          <HistoryPanel />
          <div
            className={styles.contentAndInputWrapper}
            style={{ paddingLeft: isHistoryPanelOpen ? "320px" : "60px" }}
          >
            <div className={styles.panelsWrapper}>
              <div
                className={styles.mainContent}
                onClick={() => setActivePanel("main")}
              >
                <Chat />
              </div>
            </div>
            <ChatInput />
          </div>
          {isScenarioModalOpen && <ScenarioModal />}
        </div>
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
