'use client';
import styles from './LogoutModal.module.css';

export default function LogoutModal({ onClose, onConfirm }) {
    // 모달 외부 클릭 시 닫기
    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className={styles.modalOverlay} onClick={handleOverlayClick}>
            <div className={styles.modalContent}>
                <div className={styles.modalBody}>
                    <p>Are you sure you want to log out?</p>
                    <div className={styles.buttonGroup}>
                        <button onClick={onConfirm} className={styles.confirmButton}>Log Out</button>
                        <button onClick={onClose} className={styles.cancelButton}>Cancel</button>
                    </div>
                </div>
            </div>
        </div>
    );
}