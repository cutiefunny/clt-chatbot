'use client';

import { useChatStore } from '../store';
import styles from './SettingsModal.module.css';
import Modal from './Modal';

export default function SettingsModal({ onClose }) {
    const theme = useChatStore((state) => state.theme);
    const toggleTheme = useChatStore((state) => state.toggleTheme);
    
    // --- 👇 [추가] 스토어에서 상태와 액션 가져오기 ---
    const useLocalFastApiUrl = useChatStore((state) => state.useLocalFastApiUrl);
    const toggleLocalFastApiUrl = useChatStore((state) => state.toggleLocalFastApiUrl);
    // --- 👆 [추가] ---

    return (
        <Modal title="Settings" onClose={onClose} contentStyle={{ maxWidth: '400px' }}>
            <div className={styles.settingItem}>
                <span>Dark Mode</span>
                <label className={styles.switch}>
                    <input
                        type="checkbox"
                        checked={theme === 'dark'}
                        onChange={toggleTheme}
                    />
                    <span className={styles.slider}></span>
                </label>
            </div>

            {/* --- 👇 [추가] Local FastAPI 토글 버튼 --- */}
            <div className={styles.settingItem} style={{ marginTop: '15px', borderTop: '1px solid #eee', paddingTop: '15px' }}>
                <span style={{ fontSize: '14px', fontWeight: '500' }}>
                    FastAPI Local Mode
                    <br/>
                    <span style={{ fontSize: '11px', color: '#888', fontWeight: 'normal' }}>
                        (Use localhost:8001)
                    </span>
                </span>
                <label className={styles.switch}>
                    <input
                        type="checkbox"
                        checked={useLocalFastApiUrl}
                        onChange={toggleLocalFastApiUrl}
                    />
                    <span className={styles.slider}></span>
                </label>
            </div>
            {/* --- 👆 [추가] --- */}
        </Modal>
    );
}