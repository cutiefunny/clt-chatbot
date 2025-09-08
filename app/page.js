'use client';

import { useChatStore } from '../app/store/chatStore';
import Chat from '../app/components/Chat';
import Login from '../app/components/Login';
import HistoryPanel from '../app/components/HistoryPanel';
import ChatInput from '../app/components/ChatInput';
import ScenarioChat from '../app/components/ScenarioChat';
import ScenarioModal from '../app/components/ScenarioModal';
import styles from './page.module.css';

export default function HomePage() {
  // --- 👇 [수정] isScenarioPanelOpen 상태 사용 ---
  const { user, isScenarioPanelOpen, activePanel, setActivePanel, isHistoryPanelOpen, isScenarioModalOpen } = useChatStore();
  // --- 👆 [여기까지] ---

  return (
    <main className={styles.main}>
      {user ? (
        // --- 👇 [수정] scenarioPanel.isOpen 대신 isScenarioPanelOpen 사용 ---
        <div className={`${styles.chatLayout} ${isScenarioPanelOpen ? styles.scenarioOpen : ''}`}>
          <HistoryPanel />
          <div
            className={styles.contentAndInputWrapper}
            style={{ paddingLeft: isHistoryPanelOpen ? '260px' : '60px' }} 
          >
            <div className={styles.panelsWrapper}>
              <div
                className={`${styles.mainContent} ${activePanel !== 'main' && isScenarioPanelOpen ? styles.inactivePanel : ''}`}
                onClick={() => setActivePanel('main')}
              >
                <Chat />
              </div>
              <div
                className={`${styles.scenarioContent} ${activePanel !== 'scenario' ? styles.inactivePanel : ''}`}
                onClick={() => setActivePanel('scenario')}
              >
                <ScenarioChat />
              </div>
            </div>
            <ChatInput />
          </div>
          {isScenarioModalOpen && <ScenarioModal />}
        </div>
      ) : (
        <Login />
      )}
    </main>
  );
}