'use client';

import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../store/chatStore';
import styles from './ChatInput.module.css';

// --- 👇 [수정] AttachIcon을 MenuIcon으로 변경 ---
const MenuIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 6H20M4 12H20M4 18H20" stroke="var(--text-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
// --- 👆 [여기까지] ---

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
    const { 
        isLoading, 
        handleResponse,
        activePanel,
        scenarioPanel,
        currentScenarioNodeId,
        handleScenarioResponse,
        focusRequest,
        openScenarioModal
    } = useChatStore();
    
    const inputRef = useRef(null);
    const quickRepliesSlider = useDraggableScroll();

    const lastMessage = useChatStore(state => 
        state.activePanel === 'main' 
            ? state.messages[state.messages.length - 1] 
            : state.scenarioMessages[state.scenarioMessages.length - 1]
    );
    const currentBotMessageNode = lastMessage?.sender === 'bot' ? lastMessage.node : null;

    useEffect(() => {
        if (!isLoading) {
            inputRef.current?.focus();
        }
    }, [isLoading, focusRequest]);

    const handleSubmit = (e) => {
        e.preventDefault();
        const input = e.target.elements.userInput.value;
        if (!input.trim() || isLoading) return;

        console.log(`[ChatInput] Form submitted. Current activePanel is: '${activePanel}'`);

        if (activePanel === 'scenario') {
            handleScenarioResponse({
                scenarioId: scenarioPanel.scenarioId,
                currentNodeId: currentScenarioNodeId,
                userInput: input,
            });
        } else {
            handleResponse({ text: input });
        }
        e.target.reset();
    };
    
    const handleQuickReplyClick = (reply) => {
        if (activePanel === 'scenario') {
            handleScenarioResponse({ 
                scenarioId: scenarioPanel.scenarioId,
                currentNodeId: currentScenarioNodeId,
                sourceHandle: reply.value,
                userInput: reply.display
            });
        } else {
            handleResponse({ text: reply.display });
        }
    }
    
    return (
        <div className={styles.inputArea}>
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
                        {currentBotMessageNode.data.replies.map(reply => (
                            <button key={reply.value} className={styles.optionButton} onClick={() => handleQuickReplyClick(reply)} disabled={isLoading}>
                                {reply.display}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            
            <form className={styles.inputForm} onSubmit={handleSubmit}>
                <button type="button" className={styles.attachButton} onClick={openScenarioModal}>
                    {/* --- 👇 [수정] AttachIcon 대신 MenuIcon 사용 --- */}
                    <MenuIcon />
                    {/* --- 👆 [여기까지] --- */}
                </button>
                <input
                    ref={inputRef}
                    name="userInput"
                    className={styles.textInput}
                    placeholder={activePanel === 'scenario' ? '응답을 입력하세요...' : 'Ask about this Booking Master Page'}
                    autoComplete="off"
                    disabled={isLoading}
                />
            </form>
        </div>
    );
}