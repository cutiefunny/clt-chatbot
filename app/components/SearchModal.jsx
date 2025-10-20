'use client';

import { useState, useEffect } from 'react';
import { useChatStore } from '../store';
import { useTranslations } from '../hooks/useTranslations';
import styles from './SearchModal.module.css';
import Modal from './Modal'; // Modal import

const SearchIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M11 19C15.4183 19 19 15.4183 19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

const HighlightedText = ({ text, highlight }) => {
    // ... (기존과 동일)
};

export default function SearchModal() {
    const loadConversation = useChatStore((state) => state.loadConversation);
    const closeSearchModal = useChatStore((state) => state.closeSearchModal);
    const searchConversations = useChatStore((state) => state.searchConversations);
    const searchResults = useChatStore((state) => state.searchResults);
    const isSearching = useChatStore((state) => state.isSearching);
    
    const [query, setQuery] = useState('');
    const { t } = useTranslations();

    useEffect(() => {
        const handler = setTimeout(() => {
            searchConversations(query);
        }, 300);

        return () => clearTimeout(handler);
    }, [query, searchConversations]);

    const handleResultClick = (convoId) => {
        loadConversation(convoId);
        closeSearchModal();
    };

    return (
        <Modal onClose={closeSearchModal} contentStyle={{ maxWidth: '500px', alignSelf: 'flex-start', marginTop: '15vh' }}>
            <div className={styles.searchContainer}>
                <div className={styles.searchInputWrapper}>
                    <SearchIcon />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t('searchConversations')}
                        className={styles.searchInput}
                        autoFocus
                    />
                </div>
                <div className={styles.resultsContainer}>
                    {isSearching && <p className={styles.loadingText}>{t('searching')}</p>}
                    
                    {!isSearching && query.trim() && searchResults.length === 0 && (
                        <p className={styles.noResults}>{t('noResults')}</p>
                    )}

                    {!isSearching && searchResults.map(convo => (
                        <div
                            key={convo.id}
                            className={styles.resultItem}
                            onClick={() => handleResultClick(convo.id)}
                        >
                            <div className={styles.resultTitle}>{convo.title}</div>
                            {convo.snippets.map((snippet, index) => (
                                <p key={index} className={styles.snippet}>
                                    <HighlightedText text={snippet} highlight={query} />
                                </p>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </Modal>
    );
}