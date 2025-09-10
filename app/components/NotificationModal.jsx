'use client';

import { useChatStore } from '../store/chatStore';
import styles from './NotificationModal.module.css';

const CloseIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

const NotificationModal = () => {
    // --- 👇 [수정] lastCheckedNotifications 상태 추가 ---
    const { toastHistory, isNotificationModalOpen, closeNotificationModal, lastCheckedNotifications } = useChatStore();

    if (!isNotificationModalOpen) {
        return null;
    }

    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            closeNotificationModal();
        }
    };

    return (
        <div className={styles.modalOverlay} onClick={handleOverlayClick}>
            <div className={styles.modalContent}>
                <div className={styles.modalHeader}>
                    <h2>알림 내역</h2>
                    <button onClick={closeNotificationModal} className={styles.closeButton}>
                        <CloseIcon />
                    </button>
                </div>
                <div className={styles.modalBody}>
                    {toastHistory.length === 0 ? (
                        <p className={styles.noNotifications}>표시할 알림이 없습니다.</p>
                    ) : (
                        <ul className={styles.notificationList}>
                            {/* --- 👇 [수정된 부분] --- */}
                            {toastHistory.map((toast) => {
                                const isNew = toast.createdAt?.toDate().getTime() > lastCheckedNotifications;
                                return (
                                    <li key={toast.id} className={`${styles.notificationItem} ${styles[toast.type]} ${isNew ? styles.newItem : ''}`}>
                                        <span className={styles.timestamp}>
                                            {toast.createdAt?.toDate().toLocaleString()}
                                        </span>
                                        <p className={styles.message}>{toast.message}</p>
                                    </li>
                                );
                            })}
                            {/* --- 👆 [여기까지] --- */}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NotificationModal;