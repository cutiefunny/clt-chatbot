"use client";

import { useState, useEffect } from "react";
import { useChatStore } from "../../store";
import styles from "./page.module.css";
import Link from "next/link";

export default function GeneralSettingsPage() {
  const {
    maxFavorites,
    hideCompletedScenarios,
    hideDelayInHours,
    fontSizeDefault,
    fontSizeSmall,
    isDevMode, // --- 👈 [추가]
    loadGeneralConfig,
    saveGeneralConfig,
    showEphemeralToast,
  } = useChatStore();

  const [limit, setLimit] = useState("");
  const [hideCompleted, setHideCompleted] = useState(false);
  const [delayHours, setDelayHours] = useState("0");
  const [defaultSize, setDefaultSize] = useState("");
  const [smallSize, setSmallSize] = useState("");
  const [devMode, setDevMode] = useState(false); // --- 👈 [추가]
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadGeneralConfig();
  }, [loadGeneralConfig]);

  useEffect(() => {
    if (maxFavorites !== null) setLimit(String(maxFavorites));
    setHideCompleted(hideCompletedScenarios);
    if (hideDelayInHours !== null) setDelayHours(String(hideDelayInHours));
    if (fontSizeDefault) setDefaultSize(fontSizeDefault);
    if (fontSizeSmall) setSmallSize(fontSizeSmall);
    setDevMode(isDevMode); // --- 👈 [추가]
  }, [
    maxFavorites,
    hideCompletedScenarios,
    hideDelayInHours,
    fontSizeDefault,
    fontSizeSmall,
    isDevMode,
  ]);

  const handleSave = async () => {
    setIsLoading(true);
    const newLimit = parseInt(limit, 10);
    const newDelayHours = parseInt(delayHours, 10);

    if (
      isNaN(newLimit) ||
      newLimit < 0 ||
      isNaN(newDelayHours) ||
      newDelayHours < 0
    ) {
      showEphemeralToast("유효한 숫자를 입력해주세요.", "error");
      setIsLoading(false);
      return;
    }

    const settings = {
      maxFavorites: newLimit,
      hideCompletedScenarios: hideCompleted,
      hideDelayInHours: newDelayHours,
      fontSizeDefault: defaultSize,
      fontSizeSmall: smallSize,
      isDevMode: devMode, // --- 👈 [추가]
    };

    const success = await saveGeneralConfig(settings);
    if (success) {
      showEphemeralToast("설정이 성공적으로 저장되었습니다.", "success");
    } else {
      showEphemeralToast("저장에 실패했습니다.", "error");
    }
    setIsLoading(false);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>General Settings</h1>
        <p>챗봇의 전반적인 설정을 관리합니다.</p>
        <Link href="/" className={styles.backLink}>
          ← 챗봇으로 돌아가기
        </Link>
      </header>

      <main className={styles.editorContainer}>
        {/* --- 👇 [추가된 부분] --- */}
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
        {/* --- 👆 [여기까지] --- */}

        <div className={styles.settingItem}>
          <label htmlFor="max-favorites" className={styles.settingLabel}>
            <h3>최대 즐겨찾기 개수</h3>
            <p>
              사용자가 등록할 수 있는 즐겨찾기 버튼의 최대 개수를 설정합니다.
            </p>
          </label>
          <input
            id="max-favorites"
            type="number"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className={styles.settingInput}
            min="0"
          />
        </div>

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

        <div className={styles.settingGroup}>
          <div className={styles.settingItem}>
            <label htmlFor="font-size-default" className={styles.settingLabel}>
              <h3>기본 폰트 크기</h3>
              <p>
                'Large text' 모드가 ON일 때 적용될 폰트 크기입니다. (예: 16px,
                1rem)
              </p>
            </label>
            <input
              id="font-size-default"
              type="text"
              value={defaultSize}
              onChange={(e) => setDefaultSize(e.target.value)}
              className={styles.settingInput}
            />
          </div>
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
        </div>

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
