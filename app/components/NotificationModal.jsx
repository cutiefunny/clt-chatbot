'use client';

import { useChatStore } from '../store';
import { useTranslations } from '../hooks/useTranslations';
import styles from './NotificationModal.module.css';

const CloseIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

const TrashIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 6H5H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

const NotificationModal = () => {
    const { 
        toastHistory, 
        isNotificationModalOpen, 
        closeNotificationModal, 
        deleteNotification,
        markNotificationAsRead // --- 👈 [추가]
    } = useChatStore();
    const { t, language } = useTranslations();

    if (!isNotificationModalOpen) {
        return null;
    }

    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            closeNotificationModal();
        }
    };
    
    const handleDelete = (e, id) => {
        e.stopPropagation();
        deleteNotification(id);
    };

    // --- 👇 [추가] 알림 클릭 시 읽음 처리 ---
    const handleNotificationClick = (id) => {
        markNotificationAsRead(id);
    };

    return (
        <div className={styles.modalOverlay} onClick={handleOverlayClick}>
            <div className={styles.modalContent}>
                <div className={styles.modalHeader}>
                    <h2>{t('notificationHistory')}</h2>
                    <button onClick={closeNotificationModal} className={styles.closeButton}>
                        <CloseIcon />
                    </button>
                </div>
                <div className={styles.modalBody}>
                    {toastHistory.length === 0 ? (
                        <p className={styles.noNotifications}>{t('noNotifications')}</p>
                    ) : (
                        <ul className={styles.notificationList}>
                            {toastHistory.map((toast) => {
                                // --- 👇 [수정] newItem 대신 unreadItem 클래스 사용 ---
                                return (
                                    <li 
                                        key={toast.id} 
                                        className={`${styles.notificationItem} ${styles[toast.type]} ${!toast.read ? styles.unreadItem : ''}`}
                                        onClick={() => handleNotificationClick(toast.id)}
                                    >
                                        <button className={styles.deleteButton} onClick={(e) => handleDelete(e, toast.id)}>
                                            <TrashIcon />
                                        </button>
                                        <span className={styles.timestamp}>
                                            {toast.createdAt?.toDate().toLocaleString(language)}
                                        </span>
                                        <p className={styles.message}>{toast.message}</p>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NotificationModal;