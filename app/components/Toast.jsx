'use client';

import { useChatStore } from '../store';
import styles from './Toast.module.css';

const Toast = () => {
    // --- 👇 [수정] 휘발성 토스트 상태와 함수 추가 ---
    const { toast, hideToast, ephemeralToast, hideEphemeralToast } = useChatStore();

    // --- 👇 [수정] 휘발성 토스트를 우선적으로 렌더링 ---
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