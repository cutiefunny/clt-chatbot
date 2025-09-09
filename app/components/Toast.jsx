'use client';

import { useChatStore } from '../store/chatStore';
import styles from './Toast.module.css';

const Toast = () => {
    const { toast, hideToast } = useChatStore();

    if (!toast.visible) {
        return null;
    }

    return (
        <div className={`${styles.toast} ${styles[toast.type]}`} onClick={hideToast}>
            <p>{toast.message}</p>
        </div>
    );
};

export default Toast;