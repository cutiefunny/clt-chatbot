'use client';

import { useChatStore } from '../store';
import styles from './Toast.module.css';

const Toast = () => {
    const toast = useChatStore((state) => state.toast);
    const hideToast = useChatStore((state) => state.hideToast);
    const ephemeralToast = useChatStore((state) => state.ephemeralToast);
    const hideEphemeralToast = useChatStore((state) => state.hideEphemeralToast);

    if (ephemeralToast.visible) {
        return (
            <div className={`${styles.toast} ${styles[ephemeralToast.type]}`} onClick={hideEphemeralToast}>
                <p>{ephemeralToast.message}</p>
            </div>
        );
    }

    if (toast.visible) {
        return (
            <div className={`${styles.toast} ${styles[toast.type]}`} onClick={hideToast}>
                <p>{toast.message}</p>
            </div>
        );
    }

    return null;
};

export default Toast;