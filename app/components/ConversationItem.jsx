'use client';
import { useState, useRef, useEffect } from 'react';
import { useTranslations } from '../hooks/useTranslations';
import styles from './HistoryPanel.module.css';
import ChevronDownIcon from './icons/ChevronDownIcon';
import KebabMenuIcon from './icons/KebabMenuIcon';
import PinIcon from './icons/PinIcon';

const CheckIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

const ScenarioStatusBadge = ({ status, t }) => {
    if (!status) return null;

    let text;
    let statusClass;

    switch (status) {
        case 'completed':
            text = t('statusCompleted');
            statusClass = 'done';
            break;
        case 'active':
            text = t('statusActive');
            statusClass = 'incomplete';
            break;
        case 'failed':
            text = t('statusFailed');
            statusClass = 'failed';
            break;
        case 'generating':
            text = t('statusGenerating');
            statusClass = 'generating';
            break;
        default:
            return null;
    }

    return <span className={`${styles.scenarioBadge} ${styles[statusClass]}`}>{text}</span>;
};

export default function ConversationItem({
    convo,
    isActive,
    onClick,
    onDelete,
    onUpdateTitle,
    onPin,
    isExpanded,
    scenarios,
    onToggleExpand,
    onScenarioClick,
    unreadScenarioSessions, // --- 👈 [추가]
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [title, setTitle] = useState(convo.title);
    const inputRef = useRef(null);
    const menuRef = useRef(null);
    const { t } = useTranslations();

    useEffect(() => {
        if (isEditing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [isEditing]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleUpdate = () => {
        if (title.trim() && title.trim() !== convo.title) {
            onUpdateTitle(convo.id, title.trim());
        }
        setIsEditing(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleUpdate();
        } else if (e.key === 'Escape') {
            setTitle(convo.title);
            setIsEditing(false);
        }
    };

    const handleRename = (e) => {
        e.stopPropagation();
        setIsEditing(true);
        setIsMenuOpen(false);
    };

    const handleDelete = (e) => {
        e.stopPropagation();
        onDelete(e, convo.id);
        setIsMenuOpen(false);
    };

    const handlePin = (e) => {
        e.stopPropagation();
        onPin(convo.id, !convo.pinned);
        setIsMenuOpen(false);
    };

    return (
        <>
            <div 
                className={`${styles.conversationItem} ${isActive ? styles.active : ''}`}
                onClick={() => !isEditing && onClick(convo.id)}
            >
                <div className={styles.convoMain}>
                    {convo.pinned && <span className={styles.pinIndicator}><PinIcon /></span>}
                    <button
                        className={styles.expandButton}
                        onClick={(e) => { e.stopPropagation(); onToggleExpand(convo.id); }}
                    >
                        <ChevronDownIcon style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                    </button>

                    {isEditing ? (
                         <input
                            ref={inputRef}
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onBlur={handleUpdate}
                            onKeyDown={handleKeyDown}
                            className={styles.titleInput}
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <span className={styles.convoTitle}>{convo.title || t('newChat')}</span>
                    )}
                </div>
                
                {isEditing ? (
                    <div className={styles.editConfirmButton}>
                        <button className={styles.actionButton} style={{opacity: 1}} onClick={(e) => { e.stopPropagation(); handleUpdate(); }}>
                            <CheckIcon />
                        </button>
                    </div>
                ) : (
                    <div className={styles.menuContainer} ref={menuRef}>
                        <button 
                            className={styles.menuButton} 
                            onClick={(e) => { e.stopPropagation(); setIsMenuOpen(!isMenuOpen); }}
                            data-open={isMenuOpen}
                        >
                            <KebabMenuIcon />
                        </button>
                        {isMenuOpen && (
                            <div className={styles.dropdownMenu}>
                                <button onClick={handlePin}>{convo.pinned ? t('unpin') : t('pin')}</button>
                                <button onClick={handleRename}>{t('rename')}</button>
                                <button onClick={handleDelete}>{t('delete')}</button>
                            </div>
                        )}
                    </div>
                )}
            </div>
            {isExpanded && (
                <div className={styles.scenarioSubList}>
                    {scenarios ? (
                        scenarios.length > 0 ? (
                            scenarios.map(scenario => {
                                // --- 👇 [수정] 읽지 않음 상태 확인 ---
                                const hasUnread = unreadScenarioSessions?.has(scenario.sessionId);
                                return (
                                <div
                                    key={scenario.sessionId}
                                    className={styles.scenarioItem}
                                    onClick={() => onScenarioClick(convo.id, scenario)}
                                >
                                    {/* --- 👇 [수정] 빨간 점 조건부 렌더링 --- */}
                                    {hasUnread && <div className={styles.unreadDot}></div>}
                                    <span className={styles.scenarioTitle}>{scenario.scenarioId}</span>
                                    <ScenarioStatusBadge status={scenario.status} t={t} />
                                </div>
                            )})
                        ) : (
                            <div className={styles.noScenarios}>{t('noScenariosFound')}</div>
                        )
                    ) : (
                        <div className={styles.noScenarios}>{t('loadingScenarios')}</div>
                    )}
                </div>
            )}
        </>
    );
};