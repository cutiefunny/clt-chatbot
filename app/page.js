'use client';

import { useChatStore } from '../app/store/chatStore';
import Chat from '../app/components/Chat';
import Login from '../app/components/Login';
import HistoryPanel from '../app/components/HistoryPanel';
import ChatInput from '../app/components/ChatInput'; // ChatInput 컴포넌트 import
import styles from './page.module.css';

export default function HomePage() {
  const { user } = useChatStore();

  return (
    <main className={styles.main}>
      {user ? (
        <div className={styles.chatLayout}>
          <HistoryPanel />
          <div className={styles.mainContent}>
            <Chat />
            <ChatInput />
          </div>
        </div>
      ) : (
        <Login />
      )}
    </main>
  );
}