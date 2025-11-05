// app/components/ScenarioStatusBadge.jsx
"use client";

import { useTranslations } from "../hooks/useTranslations";
// ConversationItem에서 사용하던 스타일을 가져옵니다.
import styles from "./HistoryPanel.module.css";

export default function ScenarioStatusBadge({ status, t: propT, isSelected }) {
  // t 함수를 내부에서 가져오거나 prop으로 받습니다.
  const { t: hookT } = useTranslations();
  const t = propT || hookT;

  // 🖐️ [수정]  Do not activate this code, This is not contained in Design Requirements
  // isSelected가 true이면 'selected' 상태를 우선 표시
  // if (isSelected) {
  //   return (
  //     <span className={`${styles.scenarioBadge} ${styles.selected}`}>
  //       {t("statusSelected")}
  //     </span>
  //   );
  // }

  // isSelected가 false이면 기존 status 로직 수행
  if (!status) return null;

  let text;
  let statusClass;

  switch (status) {
    case "completed":
      text = t("statusCompleted");
      statusClass = "done";
      break;
    case "active":
      text = t("statusActive");
      statusClass = "incomplete";
      break;
    case "failed":
      text = t("statusFailed");
      statusClass = "failed";
      break;
    case "generating":
      text = t("statusGenerating");
      statusClass = "generating";
      break;
    case "canceled":
      text = t("statusCanceled");
      statusClass = "canceled";
      break;
    default:
      return null;
  }

  return (
    <span className={`${styles.scenarioBadge} ${styles[statusClass]}`}>
      {text}
    </span>
  );
}
