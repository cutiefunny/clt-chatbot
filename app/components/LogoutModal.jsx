'use client';
import styles from './LogoutModal.module.css';
import Modal from './Modal'; // Modal import

export default function LogoutModal({ onClose, onConfirm }) {
    return (
        <Modal onClose={onClose} contentStyle={{ maxWidth: '320px', padding: '24px' }}>
            <div className={styles.modalBody}>
                <p>Are you sure you want to log out?</p>
                <div className={styles.buttonGroup}>
                    <button onClick={onConfirm} className={styles.confirmButton}>Log Out</button>
                    <button onClick={onClose} className={styles.cancelButton}>Cancel</button>
                </div>
            </div>
        </Modal>
    );
}