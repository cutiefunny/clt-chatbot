'use client';

import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../store';
import { useTranslations } from '../hooks/useTranslations';
import styles from './ChatInput.module.css';

const MenuIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 6H20M4 12H20M4 18H20" stroke="var(--text-color)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

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
        activeScenarioSessionId, // --- 👈 [수정] activeScenarioId -> activeScenarioSessionId
        scenarioStates,
        handleScenarioResponse,
        focusRequest,
        openScenarioModal,
    } = useChatStore();
    
    const { t } = useTranslations();
    const inputRef = useRef(null);
    const quickRepliesSlider = useDraggableScroll();

    // --- 👇 [수정] activeScenarioSessionId를 사용하여 현재 시나리오 상태 가져오기 ---
    const activeScenario = activeScenarioSessionId ? scenarioStates[activeScenarioSessionId] : null;
    const scenarioMessages = activeScenario?.messages || [];
    const mainMessages = useChatStore(state => state.messages);
    
    // --- 👇 [추가] 패널에 맞는 로딩 상태 결정 ---
    const isInputDisabled = activePanel === 'scenario' 
        ? activeScenario?.isLoading ?? false 
        : isLoading;

    const lastMessage = activePanel === 'main' 
            ? mainMessages[mainMessages.length - 1] 
            : scenarioMessages[scenarioMessages.length - 1];
    
    const currentBotMessageNode = lastMessage?.sender === 'bot' ? lastMessage.node : null;
    const currentScenarioNodeId = activeScenario?.state?.currentNodeId;

    useEffect(() => {
        if (!isInputDisabled) { // isInputDisabled 사용
            inputRef.current?.focus();
        }
    }, [isInputDisabled, focusRequest, activePanel]);

    const handleSubmit = (e) => {
        e.preventDefault();
        const input = e.target.elements.userInput.value;
        if (!input.trim() || isInputDisabled) return; // isInputDisabled 사용

        if (activePanel === 'scenario') {
            handleScenarioResponse({
                scenarioSessionId: activeScenarioSessionId, // --- 👈 [수정]
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
                scenarioSessionId: activeScenarioSessionId, // --- 👈 [수정]
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
            {/* --- 👇 [수정] isInputDisabled 사용 --- */}
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
                            <button key={reply.value} className={styles.optionButton} onClick={() => handleQuickReplyClick(reply)} disabled={isInputDisabled}>
                                {reply.display}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            
            <form className={styles.inputForm} onSubmit={handleSubmit}>
                <button type="button" className={styles.attachButton} onClick={openScenarioModal}>
                    <MenuIcon />
                </button>
                <input
                    ref={inputRef}
                    name="userInput"
                    className={styles.textInput}
                    placeholder={activePanel === 'scenario' ? t('enterResponse') : t('askAboutService')}
                    autoComplete="off"
                    disabled={isInputDisabled}
                />
            </form>
        </div>
    );
}