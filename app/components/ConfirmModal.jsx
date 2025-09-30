"use client";
import styles from "./ConfirmModal.module.css";
import Modal from "./Modal";

export default function ConfirmModal({
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onClose,
  confirmVariant = "default",
}) {
  return (
    <Modal
      onClose={onClose}
      contentStyle={{ maxWidth: "400px", borderRadius: "14px" }}
    >
      <div className={styles.modalBody}>
        {title && <h3>{title}</h3>}
        <p>{message}</p>
        <div className={styles.buttonGroup}>
          <button onClick={onClose} className={styles.cancelButton}>
            {cancelText || "Cancel"}
          </button>
          <button
            onClick={onConfirm}
            className={`${styles.confirmButton} ${styles[confirmVariant]}`}
          >
            {confirmText || "Confirm"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
