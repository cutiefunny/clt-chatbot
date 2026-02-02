"use client";

import { useState, useEffect } from "react";
import { useChatStore } from "../../store";
import styles from "../general/page.module.css";
import Link from "next/link";
import { useTranslations } from "../../hooks/useTranslations";
import ConfirmModal from "../../components/ConfirmModal";

// API Base URL (필요시 환경변수 처리)
const API_BASE_URL = "http://202.20.84.65:8083";

export default function PersonalSettingsPage() {
  const {
    // 스토어 상태 (클라이언트 전용 설정 및 초기값용)
    hideCompletedScenarios,
    hideDelayInHours,
    sendTextShortcutImmediately,
    useFastApi,
    useLocalFastApiUrl,
    
    // 액션
    setFastApiEnabled: setStoreFastApiEnabled, // 스토어 액션 이름 가정 (없다면 set({ useFastApi: val }))
    setLocalFastApiUrl,
    setTextShortcutImmediately, // 스토어 액션 가정
    showEphemeralToast,
    openConfirmModal,
    deleteAllConversations, // 이 함수도 내부적으로 API 호출로 변경되어야 함
    confirmModal,
    closeConfirmModal,
    
    // Firestore 저장 함수 제거 -> API 직접 호출로 대체
  } = useChatStore();

  const { t } = useTranslations();

  // --- Local State ---
  const [hideCompleted, setHideCompleted] = useState(false);
  const [delayHours, setDelayHours] = useState("0");
  const [truncateLimit, setTruncateLimit] = useState("");
  const [defaultSize, setDefaultSize] = useState("");
  const [devMode, setDevMode] = useState(false);
  const [textShortcutAutoSend, setTextShortcutAutoSend] = useState(false);
  
  // 연결 설정 (Client Side Only)
  const [fastApiEnabled, setFastApiEnabled] = useState(false);
  const [localFastApiEnabled, setLocalFastApiEnabled] = useState(false);
  
  // API 유지를 위한 데이터 (화면엔 없지만 PUT에 필요한 필드)
  const [savedLanguage, setSavedLanguage] = useState("en");
  const [savedTheme, setSavedTheme] = useState("system");

  const [isLoading, setIsLoading] = useState(false);

  // 1. 초기 로드: 스토어 값 + API 값 병합
  useEffect(() => {
    // 클라이언트 전용 설정은 스토어에서 가져옴
    setHideCompleted(hideCompletedScenarios);
    if (hideDelayInHours !== null) setDelayHours(String(hideDelayInHours));
    setTextShortcutAutoSend(sendTextShortcutImmediately);
    setFastApiEnabled(useFastApi);
    setLocalFastApiEnabled(useLocalFastApiUrl);

    // 백엔드 설정은 API에서 가져옴
    const fetchPersonalConfig = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/prim/config`, {
          method: "GET",
          headers: { "accept": "application/json" },
        });

        if (response.ok) {
          const data = await response.json();
          
          // API 데이터 매핑
          if (data.content_truncate_limit !== undefined) setTruncateLimit(String(data.content_truncate_limit));
          if (data.font_size_default !== undefined) setDefaultSize(String(data.font_size_default));
          
          // Boolean 처리 ("Y"/"N")
          setDevMode(data.is_dev_mode === "Y");

          // Hidden Fields 저장 (PUT용)
          if (data.language) setSavedLanguage(data.language);
          if (data.theme) setSavedTheme(data.theme);
        }
      } catch (error) {
        console.error("Failed to load personal config:", error);
        // API 로드 실패 시 스토어 기본값 사용 등 폴백 로직 가능
      }
    };

    fetchPersonalConfig();
  }, [
    hideCompletedScenarios,
    hideDelayInHours,
    sendTextShortcutImmediately,
    useFastApi,
    useLocalFastApiUrl
  ]);

  // 2. 저장 핸들러
  const handleSave = async () => {
    setIsLoading(true);

    // 숫자 유효성 검사
    const newDelayHours = parseInt(delayHours, 10);
    const newTruncateLimit = parseInt(truncateLimit, 10);
    const newFontSize = parseInt(defaultSize, 10); // API가 int를 원하므로 변환

    if (isNaN(newDelayHours) || newDelayHours < 0 || isNaN(newTruncateLimit) || newTruncateLimit < 0) {
      showEphemeralToast("유효한 숫자를 입력해주세요.", "error");
      setIsLoading(false);
      return;
    }

    try {
      // (1) 클라이언트 사이드 설정은 스토어에 저장 (연결 방식 등)
      // useChatStore의 setState를 통해 업데이트한다고 가정
      // 실제 구현에 따라 스토어 업데이트 함수를 호출해야 합니다.
      useChatStore.setState({ 
        useFastApi: fastApiEnabled,
        useLocalFastApiUrl: localFastApiEnabled,
        sendTextShortcutImmediately: textShortcutAutoSend,
        hideCompletedScenarios: hideCompleted, // API 미지원이므로 로컬에만 저장
        hideDelayInHours: newDelayHours        // API 미지원이므로 로컬에만 저장
      });

      // (2) 백엔드 설정 저장 (PUT)
      const payload = {
        content_truncate_limit: newTruncateLimit,
        font_size_default: isNaN(newFontSize) ? 16 : newFontSize, // 기본값 안전장치
        is_dev_mode: devMode ? "Y" : "N",
        language: savedLanguage, // GET에서 받아온 값 유지
        theme: savedTheme        // GET에서 받아온 값 유지
      };

      const response = await fetch(`${API_BASE_URL}/api/v1/prim/config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "accept": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`서버 저장 실패: ${errorText}`);
      }

      showEphemeralToast("설정이 성공적으로 저장되었습니다.", "success");

    } catch (error) {
      console.error("Settings Save Error:", error);
      showEphemeralToast("설정 저장 중 오류가 발생했습니다.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAllConvos = () => {
    if (isLoading) return;

    openConfirmModal({
      title: "경고",
      message: t('deleteAllConvosConfirm'),
      confirmText: t('delete'),
      cancelText: t('cancel'),
      onConfirm: async () => {
        setIsLoading(true);
        // 주의: deleteAllConversations 스토어 함수 내부도 API 호출로 변경되었는지 확인 필요
        await deleteAllConversations(); 
        setIsLoading(false);
      },
      confirmVariant: 'danger',
    });
  };

  const handleConfirm = () => {
    if (confirmModal.onConfirm) {
      confirmModal.onConfirm();
    }
    closeConfirmModal();
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
        {/* 개발자 모드 설정 */}
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

        {/* FastAPI 사용 설정 (클라이언트 전용) */}
        <div className={styles.settingItem} style={{ border: '1px solid #806bf5', backgroundColor: 'rgba(128, 107, 245, 0.05)' }}>
          <label className={styles.settingLabel}>
            <h3 style={{ color: '#634ce2' }}>FastAPI 백엔드 사용 (Experimental)</h3>
            <p>
              활성화 시, 기존 Firebase 백엔드 대신 FastAPI 서버를 사용합니다.
            </p>
          </label>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={fastApiEnabled}
              onChange={(e) => setFastApiEnabled(e.target.checked)}
            />
            <span className={styles.slider}></span>
          </label>
        </div>

        {/* Local FastAPI 설정 (클라이언트 전용) */}
        {fastApiEnabled && (
          <div className={styles.settingItem} style={{ borderLeft: '3px solid #806bf5', marginLeft: '10px', backgroundColor: 'rgba(128, 107, 245, 0.02)' }}>
            <label className={styles.settingLabel}>
              <h3>FastAPI 로컬 모드</h3>
              <p>
                활성화 시, 원격 서버 대신 <code>localhost:8001</code>을 API 서버로 사용합니다.
              </p>
            </label>
            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={localFastApiEnabled}
                onChange={(e) => setLocalFastApiEnabled(e.target.checked)}
              />
              <span className={styles.slider}></span>
            </label>
          </div>
        )}

        {/* 텍스트 숏컷 즉시 전송 설정 (현재 API 미지원 -> 로컬 저장) */}
        <div className={styles.settingItem}>
          <label className={styles.settingLabel}>
            <h3>텍스트 숏컷 즉시 전송</h3>
            <p>
              활성화 시, 텍스트 숏컷을 클릭하면 입력창에 채우지 않고 즉시 메시지를 전송합니다.
            </p>
          </label>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={textShortcutAutoSend}
              onChange={(e) => setTextShortcutAutoSend(e.target.checked)}
            />
            <span className={styles.slider}></span>
          </label>
        </div>

        {/* 본문 줄임 줄 수 (API 연동) */}
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

        {/* 완료된 시나리오 숨김 설정 (현재 API 미지원 -> 로컬 저장) */}
        <div className={`${styles.settingGroup} ${hideCompleted ? styles.active : ""}`}>
          <div className={styles.settingItem}>
            <label className={styles.settingLabel}>
              <h3>완료된 시나리오 숨김</h3>
              <p>
                대화 목록의 하위 메뉴에서 '완료' 상태인 시나리오를 숨깁니다. (로컬 설정)
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

        {/* 폰트 크기 설정 (API 연동) */}
        <div className={styles.settingGroup}>
          <div className={styles.settingItem}>
            <label htmlFor="font-size-default" className={styles.settingLabel}>
              <h3>폰트 크기 (px)</h3>
              <p>
                'Large text' 모드 ON/OFF와 관계없이 적용될 폰트 크기입니다. (숫자만 입력)
              </p>
            </label>
            <input
              id="font-size-default"
              type="number"
              value={defaultSize}
              onChange={(e) => setDefaultSize(e.target.value)}
              className={styles.settingInput}
              placeholder="16"
            />
          </div>
        </div>

        {/* 저장 버튼 */}
        <button
          className={styles.saveButton}
          onClick={handleSave}
          disabled={isLoading}
        >
          {isLoading ? t('loading') : "설정 저장하기"}
        </button>

        {/* 대화 삭제 버튼 */}
        <button
          className={styles.saveButton}
          style={{ backgroundColor: '#e74c3c', marginTop: '30px' }}
          onClick={handleDeleteAllConvos}
          disabled={isLoading}
        >
          {isLoading ? t('loading') : t('deleteAllConvos')}
        </button>
      </main>

      {confirmModal.isOpen && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText={confirmModal.confirmText}
          onConfirm={handleConfirm}
          onClose={closeConfirmModal}
          confirmVariant={confirmModal.confirmVariant}
          cancelText={confirmModal.cancelText}
        />
      )}
    </div>
  );
}