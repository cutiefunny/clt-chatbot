// app/admin/personal/page.js
"use client";

import { useState, useEffect } from "react";
import { useChatStore } from "../../store";
import styles from "../general/page.module.css"; // general의 CSS 재사용
import Link from "next/link";

export default function PersonalSettingsPage() {
  const {
    hideCompletedScenarios,
    hideDelayInHours,
    contentTruncateLimit,
    fontSizeDefault,
    // fontSizeSmall, // 제거
    isDevMode, 
    savePersonalSettings, 
    showEphemeralToast,
  } = useChatStore();

  const [hideCompleted, setHideCompleted] = useState(false);
  const [delayHours, setDelayHours] = useState("0");
  const [truncateLimit, setTruncateLimit] = useState("");
  const [defaultSize, setDefaultSize] = useState("");
  // const [smallSize, setSmallSize] = useState(""); // 제거
  const [devMode, setDevMode] = useState(false); 
  const [isLoading, setIsLoading] = useState(false);

  // 스토어의 현재 값으로 로컬 상태 초기화
  useEffect(() => {
    setHideCompleted(hideCompletedScenarios);
    if (hideDelayInHours !== null) setDelayHours(String(hideDelayInHours));
    if (contentTruncateLimit !== null)
      setTruncateLimit(String(contentTruncateLimit));
    if (fontSizeDefault) setDefaultSize(fontSizeDefault);
    // if (fontSizeSmall) setSmallSize(fontSizeSmall); // 제거
    setDevMode(isDevMode); 
  }, [
    hideCompletedScenarios,
    hideDelayInHours,
    contentTruncateLimit,
    fontSizeDefault,
    // fontSizeSmall, // 제거
    isDevMode, 
  ]);

  const handleSave = async () => {
    setIsLoading(true);
    const newDelayHours = parseInt(delayHours, 10);
    const newTruncateLimit = parseInt(truncateLimit, 10);

    // 숫자 유효성 검사
    if (
      isNaN(newDelayHours) ||
      newDelayHours < 0 ||
      isNaN(newTruncateLimit) ||
      newTruncateLimit < 0
    ) {
      showEphemeralToast("유효한 숫자를 입력해주세요.", "error");
      setIsLoading(false);
      return;
    }

    const settings = {
      hideCompletedScenarios: hideCompleted,
      hideDelayInHours: newDelayHours,
      fontSizeDefault: defaultSize,
      // fontSizeSmall: smallSize, // 제거
      contentTruncateLimit: newTruncateLimit,
      isDevMode: devMode, 
    };

    const success = await savePersonalSettings(settings); // 개인 설정 저장
    if (success) {
      showEphemeralToast("설정이 성공적으로 저장되었습니다.", "success");
    }
    setIsLoading(false);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>개인 설정</h1>
        <p>챗봇의 개인 맞춤형 설정을 관리합니다.</p>
        <Link href="/" className={styles.backLink}>
          ← 챗봇으로 돌아가기
        </Link>
      </header>

      <main className={styles.editorContainer}>
        {/* [추가] 개발자 모드 설정 */}
        <div className={styles.settingItem}>
          <label className={styles.settingLabel}>
            <h3>개발자 모드</h3>
            <p>
              활성화 시, 채팅 화면 우측 하단에 현재 추출된 변수(Slots) 상태를
              표시합니다.
            </p>
          </label>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={devMode}
              onChange={(e) => setDevMode(e.target.checked)}
            />
            <span className={styles.slider}></span>
          </label>
        </div>

        {/* 본문 줄임 줄 수 */}
        <div className={styles.settingItem}>
          <label htmlFor="truncate-limit" className={styles.settingLabel}>
            <h3>본문 줄임 줄 수</h3>
            <p>
              봇 답변이 설정된 줄 수를 초과하면 '더 보기' 버튼을 표시합니다.
              (0으로 설정 시 비활성화)
            </p>
          </label>
          <input
            id="truncate-limit"
            type="number"
            value={truncateLimit}
            onChange={(e) => setTruncateLimit(e.target.value)}
            className={styles.settingInput}
            min="0"
          />
        </div>

        {/* 완료된 시나리오 숨김 설정 */}
        <div
          className={`${styles.settingGroup} ${
            hideCompleted ? styles.active : ""
          }`}
        >
          <div className={styles.settingItem}>
            <label className={styles.settingLabel}>
              <h3>완료된 시나리오 숨김</h3>
              <p>
                대화 목록의 하위 메뉴에서 '완료' 상태인 시나리오를 숨깁니다.
              </p>
            </label>
            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={hideCompleted}
                onChange={(e) => setHideCompleted(e.target.checked)}
              />
              <span className={styles.slider}></span>
            </label>
          </div>
          {hideCompleted && (
            <div className={`${styles.settingItem} ${styles.subSettingItem}`}>
              <label htmlFor="hide-delay" className={styles.settingLabel}>
                <h4>숨김 지연 시간 (시간)</h4>
                <p>
                  완료된 시점을 기준으로, 설정된 시간 이후에 목록에서 숨깁니다.
                  (0으로 설정 시 즉시 숨김)
                </p>
              </label>
              <input
                id="hide-delay"
                type="number"
                value={delayHours}
                onChange={(e) => setDelayHours(e.target.value)}
                className={styles.settingInput}
                min="0"
              />
            </div>
          )}
        </div>

        {/* 폰트 크기 설정 */}
        <div className={styles.settingGroup}>
          <div className={styles.settingItem}>
            <label htmlFor="font-size-default" className={styles.settingLabel}>
              {/* --- 👇 [수정] 레이블 변경 --- */}
              <h3>폰트 크기</h3>
              <p>
                'Large text' 모드 ON/OFF와 관계없이 적용될 폰트 크기입니다. (예: 16px,
                1rem)
              </p>
              {/* --- 👆 [수정] --- */}
            </label>
            <input
              id="font-size-default"
              type="text"
              value={defaultSize}
              onChange={(e) => setDefaultSize(e.target.value)}
              className={styles.settingInput}
            />
          </div>
          {/* --- 👇 [제거] 축소 폰트 크기 섹션 --- */}
          {/*
          <div className={styles.settingItem}>
            <label htmlFor="font-size-small" className={styles.settingLabel}>
              <h3>축소 폰트 크기</h3>
              <p>
                'Large text' 모드가 OFF일 때 적용될 폰트 크기입니다. (예: 14px,
                0.9rem)
              </p>
            </label>
            <input
              id="font-size-small"
              type="text"
              value={smallSize}
              onChange={(e) => setSmallSize(e.target.value)}
              className={styles.settingInput}
            />
          </div>
          */}
          {/* --- 👆 [제거] --- */}
        </div>

        {/* 저장 버튼 */}
        <button
          className={styles.saveButton}
          onClick={handleSave}
          disabled={isLoading}
        >
          {isLoading ? "저장 중..." : "설정 저장하기"}
        </button>
      </main>
    </div>
  );
}