// app/admin/general/page.js
"use client";

import { useState, useEffect } from "react";
import { useChatStore } from "../../store";
import styles from "./page.module.css";
import Link from "next/link";

export default function GeneralSettingsPage() {
  const {
    maxFavorites,
    // --- ▼ 수정 ▼ ---
    dimUnfocusedPanels, // dimUnfocusedPanels 추가
    // --- ▲ 수정 ▲ ---
    llmProvider,
    flowiseApiUrl,
    loadGeneralConfig,
    saveGeneralConfig,
    showEphemeralToast,
  } = useChatStore();

  const [limit, setLimit] = useState("");
  // --- ▼ 수정 ▼ ---
  const [dimPanels, setDimPanels] = useState(true); // dimPanels 상태 추가
  // --- ▲ 수정 ▲ ---
  const [provider, setProvider] = useState("gemini");
  const [apiUrl, setApiUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [apiUrlError, setApiUrlError] = useState(''); 

  useEffect(() => {
    loadGeneralConfig();
  }, [loadGeneralConfig]);

  useEffect(() => {
    if (maxFavorites !== null) setLimit(String(maxFavorites));
    // --- ▼ 수정 ▼ ---
    setDimPanels(dimUnfocusedPanels); // 로드된 값으로 상태 설정
    // --- ▲ 수정 ▲ ---
    setProvider(llmProvider);
    setApiUrl(flowiseApiUrl);
  }, [
    maxFavorites,
    // --- ▼ 수정 ▼ ---
    dimUnfocusedPanels, // 의존성 배열에 추가
    // --- ▲ 수정 ▲ ---
    llmProvider,
    flowiseApiUrl,
  ]);

  const handleSave = async () => {
    setIsLoading(true);
    setApiUrlError(''); 
    const newLimit = parseInt(limit, 10);

    // 숫자 유효성 검사
    if (
      isNaN(newLimit) ||
      newLimit < 0
    ) {
      showEphemeralToast("유효한 숫자를 입력해주세요.", "error");
      setIsLoading(false);
      return;
    }

    if (provider === "flowise") {
      if (!apiUrl || !(apiUrl.startsWith('http://') || apiUrl.startsWith('https://'))) {
          setApiUrlError('유효한 URL 형식(http:// 또는 https://)으로 입력해주세요.');
          showEphemeralToast("Flowise API URL 형식이 올바르지 않습니다.", "error");
          setIsLoading(false);
          return;
      }
    }

    const settings = {
      maxFavorites: newLimit,
      // --- ▼ 수정 ▼ ---
      dimUnfocusedPanels: dimPanels, // 저장할 설정에 추가
      // --- ▲ 수정 ▲ ---
      llmProvider: provider,
      flowiseApiUrl: apiUrl, 
    };

    const success = await saveGeneralConfig(settings);
    if (success) {
      showEphemeralToast("설정이 성공적으로 저장되었습니다.", "success");
    } else {
      // saveGeneralConfig 내부에서 오류 토스트가 표시될 것임
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
        {/* LLM 공급자 설정 (기존 코드 유지) */}
        <div className={styles.settingGroup}>
          <div className={styles.settingItem}>
            <label className={styles.settingLabel}>
              <h3>LLM 공급자</h3>
              <p>챗봇의 자연어 응답을 생성할 LLM을 선택합니다.</p>
            </label>
            <div className={styles.radioGroup}>
              <label>
                <input
                  type="radio"
                  value="gemini"
                  checked={provider === "gemini"}
                  onChange={(e) => { setProvider(e.target.value); setApiUrlError(''); }} 
                />
                Gemini
              </label>
              <label>
                <input
                  type="radio"
                  value="flowise"
                  checked={provider === "flowise"}
                  onChange={(e) => setProvider(e.target.value)}
                />
                Flowise
              </label>
            </div>
          </div>
          {provider === "flowise" && (
            <div className={`${styles.settingItem} ${styles.subSettingItem}`}>
              <label htmlFor="flowise-url" className={styles.settingLabel}>
                <h4>Flowise API URL</h4>
                <p>사용할 Flowise 챗플로우의 API Endpoint URL을 입력합니다.</p>
                {apiUrlError && <p style={{ color: 'red', fontSize: '0.8rem', marginTop: '4px' }}>{apiUrlError}</p>}
              </label>
              <input
                id="flowise-url"
                type="text"
                value={apiUrl}
                onChange={(e) => { setApiUrl(e.target.value); setApiUrlError(''); }} 
                className={styles.settingInput}
                style={{ width: "100%", textAlign: "left", borderColor: apiUrlError ? 'red' : undefined }} 
                placeholder="http://..."
              />
            </div>
          )}
        </div>
        
        {/* --- ▼ 추가 ▼ --- */}
        {/* 포커스 흐림 설정 */}
        <div className={styles.settingItem}>
          <label className={styles.settingLabel}>
            <h3>포커스 잃은 창 흐리게</h3>
            <p>
              활성화 시, 메인 채팅과 시나리오 채팅 간 포커스 이동 시 비활성 창을
              흐리게(dimmed) 처리합니다.
            </p>
          </label>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={dimPanels}
              onChange={(e) => setDimPanels(e.target.checked)}
            />
            <span className={styles.slider}></span>
          </label>
        </div>
        {/* --- ▲ 추가 ▲ --- */}

        {/* 즐겨찾기 개수 설정 (기존 코드 유지) */}
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

        {/* 저장 버튼 (기존 코드 유지) */}
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