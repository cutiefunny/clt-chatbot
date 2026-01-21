// app/admin/personal/page.js
"use client";

import { useState, useEffect } from "react";
import { useChatStore } from "../../store";
import styles from "../general/page.module.css"; // general의 CSS 재사용
import Link from "next/link";
import { useTranslations } from "../../hooks/useTranslations";
import ConfirmModal from "../../components/ConfirmModal"; 

export default function PersonalSettingsPage() {
  const {
    hideCompletedScenarios,
    hideDelayInHours,
    contentTruncateLimit,
    fontSizeDefault,
    isDevMode, 
    sendTextShortcutImmediately, 
    useFastApi, 
    // --- 👇 [추가] 스토어에서 가져오기 ---
    useLocalFastApiUrl,
    setLocalFastApiUrl,
    // --- 👆 [추가] ---
    savePersonalSettings, 
    showEphemeralToast,
    openConfirmModal,
    deleteAllConversations,
    confirmModal, 
    closeConfirmModal,
  } = useChatStore();
  
  const { t } = useTranslations();

  const [hideCompleted, setHideCompleted] = useState(false);
  const [delayHours, setDelayHours] = useState("0");
  const [truncateLimit, setTruncateLimit] = useState("");
  const [defaultSize, setDefaultSize] = useState("");
  const [devMode, setDevMode] = useState(false); 
  const [textShortcutAutoSend, setTextShortcutAutoSend] = useState(false); 
  const [fastApiEnabled, setFastApiEnabled] = useState(false); 
  // --- 👇 [추가] 로컬 상태 ---
  const [localFastApiEnabled, setLocalFastApiEnabled] = useState(false);
  // --- 👆 [추가] ---
  const [isLoading, setIsLoading] = useState(false);

  // 스토어의 현재 값으로 로컬 상태 초기화
  useEffect(() => {
    setHideCompleted(hideCompletedScenarios);
    if (hideDelayInHours !== null) setDelayHours(String(hideDelayInHours));
    if (contentTruncateLimit !== null)
      setTruncateLimit(String(contentTruncateLimit));
    if (fontSizeDefault) setDefaultSize(fontSizeDefault);
    setDevMode(isDevMode); 
    setTextShortcutAutoSend(sendTextShortcutImmediately);
    setFastApiEnabled(useFastApi);
    // --- 👇 [추가] 초기화 ---
    setLocalFastApiEnabled(useLocalFastApiUrl);
    // --- 👆 [추가] ---
  }, [
    hideCompletedScenarios,
    hideDelayInHours,
    contentTruncateLimit,
    fontSizeDefault,
    isDevMode, 
    sendTextShortcutImmediately,
    useFastApi,
    // --- 👇 [추가] 의존성 추가 ---
    useLocalFastApiUrl,
    // --- 👆 [추가] ---
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
      contentTruncateLimit: newTruncateLimit,
      isDevMode: devMode, 
      sendTextShortcutImmediately: textShortcutAutoSend,
      useFastApi: fastApiEnabled,
    };

    // --- 👇 [추가] 로컬 API 설정 저장 (Firestore가 아닌 LocalStorage/State에 저장) ---
    setLocalFastApiUrl(localFastApiEnabled);
    // --- 👆 [추가] ---

    const success = await savePersonalSettings(settings); // 개인 설정 저장 (Firestore)
    if (success) {
      showEphemeralToast("설정이 성공적으로 저장되었습니다.", "success");
    }
    setIsLoading(false);
  };
  
  const handleDeleteAllConvos = () => {
      console.log("[DEBUG] Delete All Conversations button clicked. Current isLoading:", isLoading);
      
      if (isLoading) {
          console.log("[DEBUG] Exit: isLoading is true. Blocking execution.");
          return; 
      }
      
      openConfirmModal({
          title: "경고",
          message: t('deleteAllConvosConfirm'), 
          confirmText: t('delete'), 
          cancelText: t('cancel'), 
          onConfirm: async () => {
              setIsLoading(true);
              await deleteAllConversations(); 
              setIsLoading(false);
          },
          confirmVariant: 'danger',
      });
      console.log("[DEBUG] openConfirmModal called successfully.");
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

        {/* FastAPI 사용 설정 */}
        <div className={styles.settingItem} style={{ border: '1px solid #806bf5', backgroundColor: 'rgba(128, 107, 245, 0.05)' }}>
          <label className={styles.settingLabel}>
            <h3 style={{ color: '#634ce2' }}>FastAPI 백엔드 사용 (Experimental)</h3>
            <p>
              활성화 시, 기존 Firebase 백엔드 대신 Vercel에 배포된 FastAPI 서버를 사용합니다.
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

        {/* --- 👇 [추가] Local FastAPI 설정 --- */}
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
        {/* --- 👆 [추가] --- */}

        {/* 텍스트 숏컷 즉시 전송 설정 */}
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

        {/* ... (나머지 UI 코드 동일) ... */}
        
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
              <h3>폰트 크기</h3>
              <p>
                'Large text' 모드 ON/OFF와 관계없이 적용될 폰트 크기입니다. (예: 16px,
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
        </div>

        {/* 저장 버튼 */}
        <button
          className={styles.saveButton}
          onClick={handleSave}
          disabled={isLoading}
        >
          {isLoading ? t('loading') : "설정 저장하기"}
        </button>
        
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