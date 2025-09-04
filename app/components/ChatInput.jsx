'use client';

import { useEffect, useRef, useState } from 'react'; // useState를 import에 추가했습니다.
import { useChatStore } from '../store/chatStore';
import styles from './ChatInput.module.css';

// '+' 아이콘 SVG 컴포넌트
const AttachIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" stroke="#555" strokeWidth="1.5"/>
        <path d="M12 8V16" stroke="#555" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M8 12H16" stroke="#555" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
);

// 드래그 스크롤을 위한 커스텀 훅
const useDraggableScroll = () => {
    const ref = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);

    const onMouseDown = (e) => {
        setIsDragging(true);
        if (ref.current) {
            setStartX(e.pageX - ref.current.offsetLeft);
            setScrollLeft(ref.current.scrollLeft);
        }
    };
    const onMouseLeave = () => setIsDragging(false);
    const onMouseUp = () => setIsDragging(false);
    const onMouseMove = (e) => {
        if (!isDragging || !ref.current) return;
        e.preventDefault();
        const x = e.pageX - ref.current.offsetLeft;
        const walk = (x - startX) * 2;
        ref.current.scrollLeft = scrollLeft - walk;
    };
    return { ref, isDragging, onMouseDown, onMouseLeave, onMouseUp, onMouseMove };
};


export default function ChatInput() {
    const { messages, isLoading, handleResponse } = useChatStore();
    const inputRef = useRef(null);
    const quickRepliesSlider = useDraggableScroll();

    const lastMessage = messages[messages.length - 1];
    const currentBotMessageNode = lastMessage?.sender === 'bot' ? lastMessage.node : null;

    useEffect(() => {
        if (!isLoading && !currentBotMessageNode) {
            inputRef.current?.focus();
        }
    }, [isLoading, currentBotMessageNode]);

    const handleSubmit = (e) => {
        e.preventDefault();
        const input = e.target.elements.userInput.value;
        if (!input.trim() || isLoading) return;
        handleResponse({ text: input });
        e.target.reset();
    };

    return (
        <div className={styles.inputArea}>
            {/* 빠른 응답 버튼(Quick Replies) 렌더링 */}
            {(currentBotMessageNode?.data?.replies) && (
                <div className={styles.buttonRow}>
                    <div
                        ref={quickRepliesSlider.ref}
                        className={`${styles.quickRepliesContainer} ${quickRepliesSlider.isDragging ? styles.dragging : ''}`}
                        onMouseDown={quickRepliesSlider.onMouseDown}
                        onMouseLeave={quickRepliesSlider.onMouseLeave}
                        onMouseUp={quickRepliesSlider.onMouseUp}
                        onMouseMove={quickRepliesSlider.onMouseMove}
                    >
                        {currentBotMessageNode?.data?.replies?.map(reply => (
                        <button key={reply.value} className={styles.optionButton} onClick={() => handleResponse({ sourceHandle: reply.value, text: reply.display })} disabled={isLoading}>
                            {reply.display}
                        </button>
                        ))}
                    </div>
                </div>
            )}
            
            {/* 하단 입력 폼 */}
            <form className={styles.inputForm} onSubmit={handleSubmit}>
                <button type="button" className={styles.attachButton}>
                    <AttachIcon />
                </button>
                <input
                    ref={inputRef}
                    name="userInput"
                    className={styles.textInput}
                    placeholder="Ask about this Booking Master Page"
                    autoComplete="off"
                    disabled={isLoading}
                />
            </form>
        </div>
    );
}