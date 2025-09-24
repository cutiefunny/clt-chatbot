'use client';

import { useState } from 'react';
import { useChatStore } from '../store';
import { useTranslations } from '../hooks/useTranslations';
import styles from './ProfileModal.module.css';
import LogoutModal from './LogoutModal';
import Modal from './Modal'; // Modal import
import CloseIcon from './icons/CloseIcon'; // CloseIcon import
import Link from 'next/link'; // Link 컴포넌트 import

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M13.3333 4L5.99999 11.3333L2.66666 8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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
            
            {/* --- 👇 [수정된 부분] --- */}
            <Link
              href="/apidocs"
              onClick={closeProfileModal}
              className={styles.logoutButton}
              style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
            >
              API 문서 보기
            </Link>
            {/* --- 👆 [여기까지] --- */}

            <button onClick={() => setIsLogoutModalOpen(true)} className={styles.logoutButton}>
              {t('logout')}
            </button>
          </div>
      </Modal>
      
      {isLogoutModalOpen && <LogoutModal onClose={() => setIsLogoutModalOpen(false)} onConfirm={handleLogoutConfirm} />}
    </>
  );
}