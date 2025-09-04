'use client';

import { useChatStore } from '../app/store/chatStore';
import Chat from '../app/components/Chat';
import Login from '../app/components/Login';
import HistoryPanel from '../app/components/HistoryPanel'; // HistoryPanel 컴포넌트 import
import styles from './page.module.css'; // page.module.css import

export default function HomePage() {
  const { user } = useChatStore();

  return (
    <main className={styles.main}>
      {user ? (
        <div className={styles.chatLayout}>
          <HistoryPanel />
          <Chat />
        </div>
      ) : (
        <Login />
      )}
    </main>
  );
}