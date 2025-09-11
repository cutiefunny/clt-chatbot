'use client';

import { useChatStore } from '../store';
import styles from './SettingsModal.module.css';
import Modal from './Modal'; // Modal import

export default function SettingsModal({ onClose }) {
    const { theme, toggleTheme } = useChatStore();

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
        </Modal>
    );
}