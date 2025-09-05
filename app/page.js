'use client';

import { useChatStore } from '../app/store/chatStore';
import Chat from '../app/components/Chat';
import Login from '../app/components/Login';
import HistoryPanel from '../app/components/HistoryPanel';
import ChatInput from '../app/components/ChatInput';
import ScenarioChat from '../app/components/ScenarioChat';
import styles from './page.module.css';

export default function HomePage() {
  const { user, scenarioPanel, activePanel, setActivePanel, isHistoryPanelOpen } = useChatStore();

  return (
    <main className={styles.main}>
      {user ? (
        // --- 👇 [수정] scenarioPanel.isOpen 상태에 따라 클래스 동적 할당 ---
        <div className={`${styles.chatLayout} ${scenarioPanel.isOpen ? styles.scenarioOpen : ''}`}>
          <HistoryPanel />
          <div
            className={styles.contentAndInputWrapper}
            style={{ marginLeft: isHistoryPanelOpen ? '260px' : '60px' }}
          >
            <div className={styles.panelsWrapper}>
              <div
                className={`${styles.mainContent} ${activePanel !== 'main' && scenarioPanel.isOpen ? styles.inactivePanel : ''}`}
                onClick={() => setActivePanel('main')}
              >
                <Chat />
              </div>
              {/* --- 👇 [수정] 조건부 렌더링 제거하고 항상 렌더링 --- */}
              <div
                className={`${styles.scenarioContent} ${activePanel !== 'scenario' ? styles.inactivePanel : ''}`}
                onClick={() => setActivePanel('scenario')}
              >
                <ScenarioChat />
              </div>
              {/* --- 👆 [여기까지] --- */}
            </div>
            <ChatInput />
          </div>
        </div>
      ) : (
        <Login />
      )}
    </main>
  );
}