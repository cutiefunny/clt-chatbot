'use client';

import { useState, useEffect, useRef } from 'react';
import { useChatStore } from '../store/chatStore';
import styles from './DevBoardModal.module.css';

const CloseIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);
const TrashIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 6H5H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);


export default function DevBoardModal() {
    const {
        user,
        devMemos,
        closeDevBoardModal,
        addDevMemo,
        deleteDevMemo,
    } = useChatStore();
    const [newMemo, setNewMemo] = useState('');
    const memoListRef = useRef(null);

    useEffect(() => {
        // 새 메모가 추가되면 스크롤을 맨 아래로 이동
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
    
    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            closeDevBoardModal();
        }
    };

    return (
        <div className={styles.modalOverlay} onClick={handleOverlayClick}>
            <div className={styles.modalContent}>
                <div className={styles.modalHeader}>
                    <h2>Dev Board</h2>
                    <button onClick={closeDevBoardModal} className={styles.closeButton}>
                        <CloseIcon />
                    </button>
                </div>

                <div className={styles.memoList} ref={memoListRef}>
                    {devMemos.map(memo => (
                        <div key={memo.id} className={styles.memoItem}>
                            <div className={styles.memoHeader}>
                                <span className={styles.memoAuthor}>{memo.authorName}</span>
                                <span className={styles.memoTimestamp}>
                                    {new Date(memo.createdAt?.toDate()).toLocaleString()}
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
                        placeholder="메모를 입력하세요..."
                        className={styles.memoInput}
                    />
                    <button type="submit" className={styles.submitButton}>
                        작성
                    </button>
                </form>
            </div>
        </div>
    );
}