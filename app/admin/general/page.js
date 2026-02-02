"use client";

import { useState, useEffect } from "react";
import { useChatStore } from "../../store"; // 토스트 메시지용
import styles from "./page.module.css";
import Link from "next/link";

// 이미지의 Curl에 명시된 Base URL
const API_BASE_URL = "http://202.20.84.65:8083";

export default function GeneralSettingsPage() {
  const { showEphemeralToast } = useChatStore();

  // --- State 관리 ---
  const [customHeaderTitle, setCustomHeaderTitle] = useState("");
  const [placeholder, setPlaceholder] = useState("");
  const [markdownEnabled, setMarkdownEnabled] = useState(true);
  
  // 이미지 명세에 show_scenario_bubbles가 없으므로 API 연동에서는 제외하고 UI 상태로만 남김(필요 시 제거 가능)
  const [bubblesVisible, setBubblesVisible] = useState(true); 

  const [isLoading, setIsLoading] = useState(false);

  // --- 1. 설정 불러오기 (GET) ---
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/config`, {
          method: "GET",
          headers: {
            "accept": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error("설정을 불러오는데 실패했습니다.");
        }

        const data = await response.json();

        // API 데이터 -> State 반영
        setCustomHeaderTitle(data.header_title || "");
        setPlaceholder(data.main_input_placeholder || "");
        
        // [중요] 명세 예시에 따라 "Y"이면 true, 그 외엔 false로 처리
        setMarkdownEnabled(data.enable_main_chat_markdown === "Y");

      } catch (error) {
        console.error("Config Load Error:", error);
        // showEphemeralToast("설정을 불러오지 못했습니다.", "error");
      }
    };

    fetchConfig();
  }, []);

  // --- 2. 설정 저장하기 (PUT) ---
  const handleSave = async () => {
    setIsLoading(true);

    // [중요] 이미지 명세에 맞춘 Payload 구성
    // 1. boolean -> "Y"/"N" 변환
    // 2. 명세에 없는 필드(show_scenario_bubbles)는 제외 (422 에러 방지)
    const payload = {
      header_title: customHeaderTitle,
      main_input_placeholder: placeholder,
      enable_main_chat_markdown: markdownEnabled ? "Y" : "N", 
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/config`, {
        method: "PUT", // 명세에 따라 PUT 사용
        headers: {
          "Content-Type": "application/json",
          "accept": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`저장 실패: ${errorText}`);
      }

      showEphemeralToast("설정이 성공적으로 저장되었습니다.", "success");
    } catch (error) {
      console.error("Config Save Error:", error);
      showEphemeralToast("설정 저장 중 오류가 발생했습니다.", "error");
    } finally {
      setIsLoading(false);
    }
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
        
        {/* 헤더 타이틀 설정 */}
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
              채팅 하단의 메인 입력창에 표시될 플레이스홀더 텍스트입니다.
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

        {/* 시나리오 버블 표시 설정 (API 미지원으로 UI만 유지) */}
        <div className={styles.settingItem}>
          <label className={styles.settingLabel}>
            <h3>시나리오 버블 표시</h3>
            <p>
              활성화 시, 시나리오가 시작될 때 메인 채팅창에 해당 시나리오로
              이동하는 버블을 표시합니다. (로컬 설정)
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