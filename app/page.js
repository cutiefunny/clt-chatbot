'use client';

import dynamic from 'next/dynamic';
import { useChatStore } from '../app/store';
import Chat from '../app/components/Chat';
import Login from '../app/components/Login';
import HistoryPanel from '../app/components/HistoryPanel';
import ChatInput from '../app/components/ChatInput';
import Toast from '../app/components/Toast';
import styles from './page.module.css';

const ScenarioModal = dynamic(() => import('../app/components/ScenarioModal'));
const ConfirmModal = dynamic(() => import('../app/components/ConfirmModal'));

export default function HomePage() {
  const user = useChatStore((state) => state.user);
  const isHistoryPanelOpen = useChatStore((state) => state.isHistoryPanelOpen);
  const isScenarioModalOpen = useChatStore((state) => state.isScenarioModalOpen);
  const confirmModal = useChatStore((state) => state.confirmModal);
  const closeConfirmModal = useChatStore((state) => state.closeConfirmModal);

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
        <div className={styles.chatLayout}>
          <HistoryPanel />
          <div
            className={styles.contentAndInputWrapper}
            style={{ paddingLeft: isHistoryPanelOpen ? '260px' : '60px' }} 
          >
            <Chat />
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