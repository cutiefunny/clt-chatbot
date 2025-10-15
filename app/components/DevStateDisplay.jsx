"use client";

import { useChatStore } from "../store";
import styles from "./DevStateDisplay.module.css";

export default function DevStateDisplay() {
  const extractedSlots = useChatStore((state) => state.extractedSlots);

  // 슬롯 객체가 비어있으면 아무것도 렌더링하지 않습니다.
  if (Object.keys(extractedSlots).length === 0) {
    return null;
  }

  return (
    <div className={styles.stateContainer}>
      <h4 className={styles.title}>[Dev] Extracted Slots</h4>
      <pre className={styles.pre}>
        {JSON.stringify(extractedSlots, null, 2)}
      </pre>
    </div>
  );
}