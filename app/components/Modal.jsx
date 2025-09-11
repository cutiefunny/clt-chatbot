'use client';

import styles from './Modal.module.css';
import CloseIcon from './icons/CloseIcon';

export default function Modal({ title, onClose, children, contentStyle }) {
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={handleOverlayClick}>
      <div className={styles.modalContent} style={contentStyle}>
        {title && (
          <div className={styles.modalHeader}>
            <h2>{title}</h2>
            <button onClick={onClose} className={styles.closeButton}>
              <CloseIcon />
            </button>
          </div>
        )}
        <div className={styles.modalBody}>
          {children}
        </div>
      </div>
    </div>
  );
}