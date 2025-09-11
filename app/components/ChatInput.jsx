'use client';

import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../store';
import { useTranslations } from '../hooks/useTranslations';
import styles from './ChatInput.module.css';
import MenuIcon from './icons/MenuIcon';

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
        activeScenarioId,
        scenarioStates,
        handleScenarioResponse,
        focusRequest,
        openScenarioModal,
    } = useChatStore();
    
    const { t } = useTranslations();
    const inputRef = useRef(null);
    const quickRepliesSlider = useDraggableScroll();

    const activeScenario = activeScenarioId ? scenarioStates[activeScenarioId] : null;
    const scenarioMessages = activeScenario?.messages || [];
    const mainMessages = useChatStore(state => state.messages);

    const lastMessage = activePanel === 'main' 
            ? mainMessages[mainMessages.length - 1] 
            : scenarioMessages[scenarioMessages.length - 1];
    
    const currentBotMessageNode = lastMessage?.sender === 'bot' ? lastMessage.node : null;
    const currentScenarioNodeId = activeScenario?.state?.currentNodeId;

    useEffect(() => {
        if (!isLoading) {
            inputRef.current?.focus();
        }
    }, [isLoading, focusRequest, activePanel]);

    const handleSubmit = (e) => {
        e.preventDefault();
        const input = e.target.elements.userInput.value;
        if (!input.trim() || isLoading) return;

        if (activePanel === 'scenario') {
            handleScenarioResponse({
                scenarioId: activeScenarioId,
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
                scenarioId: activeScenarioId,
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
                    <MenuIcon />
                </button>
                <input
                    ref={inputRef}
                    name="userInput"
                    className={styles.textInput}
                    placeholder={activePanel === 'scenario' ? t('enterResponse') : t('askAboutService')}
                    autoComplete="off"
                    disabled={isLoading}
                />
            </form>
        </div>
    );
}