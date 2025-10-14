'use client';

import { useState, useEffect, useRef } from 'react';
import { useChatStore } from '../store';
import { useTranslations } from '../hooks/useTranslations';
import styles from './DevBoardModal.module.css';
import Modal from './Modal'; // Modal import

const TrashIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 6H5H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

export default function DevBoardModal() {
    const user = useChatStore((state) => state.user);
    const devMemos = useChatStore((state) => state.devMemos);
    const closeDevBoardModal = useChatStore((state) => state.closeDevBoardModal);
    const addDevMemo = useChatStore((state) => state.addDevMemo);
    const deleteDevMemo = useChatStore((state) => state.deleteDevMemo);
    
    const [newMemo, setNewMemo] = useState('');
    const memoListRef = useRef(null);
    const { t, language } = useTranslations();

    useEffect(() => {
        if (memoListRef.current) {
            memoListRef.current.scrollTop = memoListRef.current.scrollHeight;
        }
    }, [devMemos]);

    const handleAddMemo = (e) => {
        e.preventDefault();
        if (newMemo.trim()) {
            addDevMemo(newMemo.trim());
            setNewMemo('');
        }
    };

    return (
        <Modal title={t('devBoardTitle')} onClose={closeDevBoardModal} contentStyle={{ maxWidth: '500px', height: '70vh' }}>
            <div className={styles.modalContainer}>
                <div className={styles.memoList} ref={memoListRef}>
                    {devMemos.map(memo => (
                        <div key={memo.id} className={styles.memoItem}>
                            <div className={styles.memoHeader}>
                                <span className={styles.memoAuthor}>{memo.authorName}</span>
                                <span className={styles.memoTimestamp}>
                                    {new Date(memo.createdAt?.toDate()).toLocaleString(language)}
                                </span>
                            </div>
                            <p className={styles.memoText}>{memo.text}</p>
                            {user?.uid === memo.authorUid && (
                                <button className={styles.deleteButton} onClick={() => deleteDevMemo(memo.id)}>
                                    <TrashIcon />
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                <form className={styles.memoForm} onSubmit={handleAddMemo}>
                    <input
                        type="text"
                        value={newMemo}
                        onChange={(e) => setNewMemo(e.target.value)}
                        placeholder={t('enterMemo')}
                        className={styles.memoInput}
                    />
                    <button type="submit" className={styles.submitButton}>
                        {t('post')}
                    </button>
                </form>
            </div>
        </Modal>
    );
}