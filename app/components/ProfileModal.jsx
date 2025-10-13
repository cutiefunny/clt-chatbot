'use client';

import { useChatStore } from '../store';
import { useTranslations } from '../hooks/useTranslations';
import styles from './ProfileModal.module.css';
import Modal from './Modal';
import CloseIcon from './icons/CloseIcon';
import Link from 'next/link';

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M13.3333 4L5.99999 11.3333L2.66666 8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default function ProfileModal() {
  const {
    user,
    logout,
    closeProfileModal,
    openDevBoardModal,
    language,
    setLanguage,
    openConfirmModal, // --- 👈 [추가]
  } = useChatStore();
  const { t } = useTranslations();

  // --- 👇 [수정된 부분] ---
  const handleLogoutRequest = () => {
    openConfirmModal({
      title: 'Log Out',
      message: t('logoutConfirm'),
      confirmText: 'Log Out',
      cancelText: 'Cancel',
      onConfirm: () => {
        logout();
        closeProfileModal();
      },
      confirmVariant: 'danger',
    });
  };
  // --- 👆 [여기까지] ---
  
  const handleDevBoardClick = () => {
    openDevBoardModal();
    closeProfileModal(); 
  };

  if (!user) return null;

  return (
    <>
      <Modal onClose={closeProfileModal} contentStyle={{ maxWidth: '340px', padding: '24px' }}>
          <button onClick={closeProfileModal} className={styles.closeButton}>
              <CloseIcon />
          </button>
          
          <div className={styles.modalBody}>
            <div className={styles.userInfo}>
              <img src={user.photoURL} alt="User Avatar" className={styles.avatar} />
              <p className={styles.userName}>{t('greeting')(user.displayName)}</p>
              <p className={styles.userEmail}>{user.email}</p>
            </div>
            
            <div className={styles.settingsSection}>
                <h3 className={styles.sectionTitle}>{t('languageSetting')}</h3>
                <div className={styles.optionGroup}>
                    <button
                        className={`${styles.optionButton} ${language === 'ko' ? styles.active : ''}`}
                        onClick={() => setLanguage('ko')}
                    >
                        {language === 'ko' && <div className={styles.checkIcon}><CheckIcon /></div>}
                        {t('korean')}
                    </button>
                    <button
                        className={`${styles.optionButton} ${language === 'en' ? styles.active : ''}`}
                        onClick={() => setLanguage('en')}
                    >
                        {language === 'en' && <div className={styles.checkIcon}><CheckIcon /></div>}
                        {t('english')}
                    </button>
                </div>
            </div>

            <button onClick={handleDevBoardClick} className={styles.logoutButton}>
              {t('devBoard')}
            </button>

            <Link
              href="/apidocs"
              onClick={closeProfileModal}
              className={styles.logoutButton}
              style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
            >
              API 문서 보기
            </Link>

            <Link
              href="/admin/scenario-editor"
              onClick={closeProfileModal}
              className={styles.logoutButton}
              style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
            >
              시나리오 메뉴 편집
            </Link>

            <Link
              href="/admin/general"
              onClick={closeProfileModal}
              className={styles.logoutButton}
              style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
            >
              일반 설정
            </Link>

            <button onClick={handleLogoutRequest} className={styles.logoutButton}>
              {t('logout')}
            </button>
          </div>
      </Modal>
    </>
  );
}