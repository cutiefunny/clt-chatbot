'use client';

import { useState } from 'react';
import { useChatStore } from '../store/chatStore';
import { useTranslations } from '../hooks/useTranslations';
import styles from './ProfileModal.module.css';
import LogoutModal from './LogoutModal';

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M13.3333 4L5.99999 11.3333L2.66666 8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const CloseIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

export default function ProfileModal() {
  const {
    user,
    logout,
    theme,
    toggleTheme,
    fontSize,
    setFontSize,
    closeProfileModal,
    openDevBoardModal,
    language,
    setLanguage,
  } = useChatStore();
  const { t } = useTranslations();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const handleLogoutConfirm = () => {
      logout();
      setIsLogoutModalOpen(false);
      closeProfileModal();
  };
  
  const handleDevBoardClick = () => {
    openDevBoardModal();
    closeProfileModal(); 
  };
  
  const handleOverlayClick = (e) => {
      if (e.target === e.currentTarget) {
          closeProfileModal();
      }
  };

  if (!user) return null;

  return (
    <>
      <div className={styles.modalOverlay} onClick={handleOverlayClick}>
        <div className={styles.modalContent}>
          <button onClick={closeProfileModal} className={styles.closeButton}>
              <CloseIcon />
          </button>

          <div className={styles.userInfo}>
            <img src={user.photoURL} alt="User Avatar" className={styles.avatar} />
            <p className={styles.userName}>{t('greeting')(user.displayName)}</p>
            <p className={styles.userEmail}>{user.email}</p>
          </div>

          <div className={styles.settingsSection}>
            <h3 className={styles.sectionTitle}>{t('screenStyle')}</h3>
            <div className={styles.optionGroup}>
              <button
                className={`${styles.optionButton} ${theme === 'light' ? styles.active : ''}`}
                onClick={toggleTheme}
              >
                {theme === 'light' && <div className={styles.checkIcon}><CheckIcon /></div>}
                {t('lightMode')}
              </button>
              <button
                className={`${styles.optionButton} ${theme === 'dark' ? styles.active : ''}`}
                onClick={toggleTheme}
              >
                {theme === 'dark' && <div className={styles.checkIcon}><CheckIcon /></div>}
                {t('darkMode')}
              </button>
            </div>
          </div>

          <div className={styles.settingsSection}>
              <h3 className={styles.sectionTitle}>{t('fontSize')}</h3>
              <div className={styles.optionGroup}>
                  <button
                      className={`${styles.optionButton} ${fontSize === 'small' ? styles.active : ''}`}
                      onClick={() => setFontSize('small')}
                  >
                      {fontSize === 'small' && <div className={styles.checkIcon}><CheckIcon /></div>}
                      {t('fontSmall')}
                  </button>
                  <button
                      className={`${styles.optionButton} ${fontSize === 'default' ? styles.active : ''}`}
                      onClick={() => setFontSize('default')}
                  >
                      {fontSize === 'default' && <div className={styles.checkIcon}><CheckIcon /></div>}
                      {t('fontDefault')}
                  </button>
              </div>
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

          <button onClick={() => setIsLogoutModalOpen(true)} className={styles.logoutButton}>
            {t('logout')}
          </button>
        </div>
      </div>
      
      {isLogoutModalOpen && <LogoutModal onClose={() => setIsLogoutModalOpen(false)} onConfirm={handleLogoutConfirm} />}
    </>
  );
}