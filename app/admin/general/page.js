// app/admin/general/page.js
"use client";

import { useState, useEffect } from "react";
import { useChatStore } from "../../store";
import styles from "./page.module.css";
import Link from "next/link";

export default function GeneralSettingsPage() {
  const {
    maxFavorites,
    dimUnfocusedPanels,
    enableFavorites,
    showHistoryOnGreeting,
    mainInputPlaceholder,
    enableMainChatMarkdown,
    headerTitle,
    showScenarioBubbles,
    llmProvider,
    flowiseApiUrl,
    loadGeneralConfig,
    saveGeneralConfig,
    showEphemeralToast,
  } = useChatStore();

  const [limit, setLimit] = useState("");
  const [dimPanels, setDimPanels] = useState(true);
  const [favoritesEnabled, setFavoritesEnabled] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [provider, setProvider] = useState("gemini");
  const [apiUrl, setApiUrl] = useState("");
  const [placeholder, setPlaceholder] = useState("");
  const [markdownEnabled, setMarkdownEnabled] = useState(true);
  const [customHeaderTitle, setCustomHeaderTitle] = useState("");
  const [bubblesVisible, setBubblesVisible] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [apiUrlError, setApiUrlError] = useState("");

  useEffect(() => {
    loadGeneralConfig();
  }, [loadGeneralConfig]);

  useEffect(() => {
    if (maxFavorites !== null) setLimit(String(maxFavorites));
    setDimPanels(dimUnfocusedPanels);
    setFavoritesEnabled(enableFavorites);
    setShowHistory(showHistoryOnGreeting);
    setProvider(llmProvider);
    setApiUrl(flowiseApiUrl);
    setPlaceholder(mainInputPlaceholder || "");
    setMarkdownEnabled(enableMainChatMarkdown);
    setCustomHeaderTitle(headerTitle || "");
    setBubblesVisible(showScenarioBubbles);
  }, [
    maxFavorites,
    dimUnfocusedPanels,
    enableFavorites,
    showHistoryOnGreeting,
    mainInputPlaceholder,
    enableMainChatMarkdown,
    headerTitle,
    showScenarioBubbles,
    llmProvider,
    flowiseApiUrl,
  ]);

  const handleSave = async () => {
    setIsLoading(true);
    setApiUrlError("");
    const newLimit = parseInt(limit, 10);

    // 숫자 유효성 검사
    if (isNaN(newLimit) || newLimit < 0) {
      showEphemeralToast("유효한 숫자를 입력해주세요.", "error");
      setIsLoading(false);
      return;
    }

    if (provider === "flowise") {
      if (
        !apiUrl ||
        !(apiUrl.startsWith("http://") || apiUrl.startsWith("https://"))
      ) {
        setApiUrlError("유효한 URL 형식(http:// 또는 https://)으로 입력해주세요.");
        showEphemeralToast("Flowise API URL 형식이 올바르지 않습니다.", "error");
        setIsLoading(false);
        return;
      }
    }

    const settings = {
      maxFavorites: newLimit,
      dimUnfocusedPanels: dimPanels,
      enableFavorites: favoritesEnabled,
      showHistoryOnGreeting: showHistory,
      mainInputPlaceholder: placeholder,
      enableMainChatMarkdown: markdownEnabled,
      headerTitle: customHeaderTitle,
      showScenarioBubbles: bubblesVisible,
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
        {/* <div className={styles.settingGroup}>
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
                  onChange={(e) => {
                    setProvider(e.target.value);
                    setApiUrlError("");
                  }}
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
                {apiUrlError && (
                  <p
                    style={{
                      color: "red",
                      fontSize: "0.8rem",
                      marginTop: "4px",
                    }}
                  >
                    {apiUrlError}
                  </p>
                )}
              </label>
              <input
                id="flowise-url"
                type="text"
                value={apiUrl}
                onChange={(e) => {
                  setApiUrl(e.target.value);
                  setApiUrlError("");
                }}
                className={styles.settingInput}
                style={{
                  width: "100%",
                  textAlign: "left",
                  borderColor: apiUrlError ? "red" : undefined,
                }}
                placeholder="http://..."
              />
            </div>
          )}
        </div> */}

        <div className={styles.settingItem}>
          <label htmlFor="header-title" className={styles.settingLabel}>
            <h3>헤더 타이틀</h3>
            <p>
              상단 헤더에 표시될 서비스 이름을 설정합니다. (기본값: AI Chatbot)
            </p>
          </label>
          <input
            id="header-title"
            type="text"
            value={customHeaderTitle}
            onChange={(e) => setCustomHeaderTitle(e.target.value)}
            className={styles.settingInput}
            style={{
              width: "100%",
              textAlign: "left",
              maxWidth: "400px",
            }}
            placeholder="예: CLT 챗봇"
          />
        </div>

        {/* 메인 입력창 플레이스홀더 */}
        <div className={styles.settingItem}>
          <label htmlFor="main-placeholder" className={styles.settingLabel}>
            <h3>메인 입력창 문구</h3>
            <p>
              채팅 하단의 메인 입력창에 표시될 플레이스홀더 텍스트입니다. (기본값:
              askAboutService)
            </p>
          </label>
          <input
            id="main-placeholder"
            type="text"
            value={placeholder}
            onChange={(e) => setPlaceholder(e.target.value)}
            className={styles.settingInput}
            style={{
              width: "100%",
              textAlign: "left",
              maxWidth: "400px",
            }}
            placeholder="예: 서비스에 대해 질문해주세요."
          />
        </div>

        {/* --- 👇 [추가] 시나리오 버블 표시 설정 --- */}
        <div className={styles.settingItem}>
          <label className={styles.settingLabel}>
            <h3>시나리오 버블 표시</h3>
            <p>
              활성화 시, 시나리오가 시작될 때 메인 채팅창에 해당 시나리오로
              이동하는 버블을 표시합니다.
            </p>
          </label>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={bubblesVisible}
              onChange={(e) => setBubblesVisible(e.target.checked)}
            />
            <span className={styles.slider}></span>
          </label>
        </div>
        {/* --- 👆 [추가] --- */}

        {/* 메인 챗 마크다운 설정 */}
        <div className={styles.settingItem}>
          <label className={styles.settingLabel}>
            <h3>메인 챗 마크다운</h3>
            <p>
              활성화 시, 메인 채팅(좌측)의 봇 답변에 마크다운 서식을
              적용합니다.
            </p>
          </label>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={markdownEnabled}
              onChange={(e) => setMarkdownEnabled(e.target.checked)}
            />
            <span className={styles.slider}></span>
          </label>
        </div>

        {/* 즐겨찾기 기능 설정 */}
        {/* <div className={styles.settingItem}>
          <label className={styles.settingLabel}>
            <h3>즐겨찾기 기능</h3>
            <p>
              활성화 시, 숏컷 메뉴의 즐겨찾기(별) 아이콘과 메인 화면의 즐겨찾기
              패널을 활성화합니다.
            </p>
          </label>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={favoritesEnabled}
              onChange={(e) => setFavoritesEnabled(e.target.checked)}
            />
            <span className={styles.slider}></span>
          </label>
        </div> */}

        {/* 포커스 흐림 설정 */}
        {/* <div className={styles.settingItem}>
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
        </div> */}

        {/* 초기 화면 히스토리 패널 표시 */}
        {/* <div className={styles.settingItem}>
          <label className={styles.settingLabel}>
            <h3>초기 화면 히스토리 표시</h3>
            <p>
              활성화 시, 채팅 시작 전 초기 화면(Greeting)에서도 히스토리
              패널(사이드바)을 표시합니다.
            </p>
          </label>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={showHistory}
              onChange={(e) => setShowHistory(e.target.checked)}
            />
            <span className={styles.slider}></span>
          </label>
        </div> */}

        {/* 즐겨찾기 개수 설정 (기존 코드 유지) */}
        {/* <div className={styles.settingItem}>
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
        </div> */}

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