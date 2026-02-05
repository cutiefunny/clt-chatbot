// app/components/Toast.jsx
"use client";

import React, { useEffect } from "react";
import { useChatStore } from "../store";
import { TOAST_DURATION } from "../lib/constants";
import styles from "./Toast.module.css";
import CheckCircle from "./icons/CheckCircle";
import CloseIcon from "./icons/CloseIcon";

const Toast = () => {
  // 스토어에서 toast 상태와 hide 함수를 가져옵니다.
  const toast = useChatStore((state) => state.toast);
  const hideEphemeralToast = useChatStore((state) => state.hideEphemeralToast);

  useEffect(() => {
    // toast 객체가 존재하고 visible 상태일 때만 타이머를 작동시킵니다.
    if (toast?.visible) {
      const timer = setTimeout(() => {
        hideEphemeralToast();
      }, TOAST_DURATION);
      return () => clearTimeout(timer);
    }
  }, [toast?.visible, hideEphemeralToast]);

  // toast가 없거나 visible이 false면 아무것도 렌더링하지 않습니다.
  if (!toast || !toast.visible) return null;

  return (
    <div
      className={`${styles.toastContainer} ${
        toast.type === "error" ? styles.error : styles.success
      } ${toast.visible ? styles.show : ""}`}
    >
      <div className={styles.icon}>
        {toast.type === "success" ? (
          <CheckCircle size={20} />
        ) : (
          <CloseIcon size={20} />
        )}
      </div>
      <div className={styles.message}>{toast.message}</div>
      <button className={styles.closeButton} onClick={hideEphemeralToast}>
        <CloseIcon size={16} />
      </button>
    </div>
  );
};

export default Toast;