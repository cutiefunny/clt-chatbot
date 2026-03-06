"use client";

import { useState } from "react";
import { useChatStore } from "../store";
import { useTranslations } from "../hooks/useTranslations";
import { searchMessages } from "../lib/api";
import styles from "./SearchModal.module.css";
import Modal from "./Modal";

const SearchModal = () => {
    const { isSearchModalOpen, closeSearchModal, loadConversation, setScrollToMessageId, user } = useChatStore();
    const { t } = useTranslations();

    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    if (!isSearchModalOpen) return null;

    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        if (!query.trim()) return;

        setIsLoading(true);
        setHasSearched(true);
        try {
            const data = await searchMessages(query, user?.uid);
            setResults(data || []);
        } catch (error) {
            console.error("Search failed:", error);
            setResults([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleResultClick = async (result) => {
        const convoId = result.conversation_id || result.conversationId;
        const msgId = result.id || result.messageId || result.message_id;

        if (convoId) {
            await loadConversation(convoId);
            if (msgId) {
                // 약간의 지연 후 메시지로 스크롤 이동
                setTimeout(() => {
                    setScrollToMessageId(msgId);
                }, 300);
            }
            closeSearchModal();
        }
    };

    return (
        <Modal
            title={t("searchConversations")}
            onClose={closeSearchModal}
            contentStyle={{ maxWidth: "600px", minHeight: "300px" }}
        >
            <div className={styles.searchContainer}>
                <form className={styles.searchForm} onSubmit={handleSearch}>
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder={t("searchConversations")}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoFocus
                    />
                    <button type="submit" className={styles.searchButton} disabled={isLoading || !query.trim()}>
                        {isLoading ? "..." : (t("search") || "검색")}
                    </button>
                </form>

                {isLoading ? (
                    <div className={styles.loading}>{t("loading") || "검색 중..."}</div>
                ) : hasSearched && results.length === 0 ? (
                    <div className={styles.noResults}>{t("noResultsFound") || "검색 결과가 없습니다."}</div>
                ) : (
                    <ul className={styles.resultsList}>
                        {results.map((item, index) => {
                            // FastAPI 응답 구조에 맞게 데이터 추출
                            const itemId = item.id || item.message_id || index;
                            const title = item.conversation_title || item.title || "Conversation";
                            const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString() : "";
                            const content = item.content || item.text || "";

                            return (
                                <li key={itemId} className={styles.resultItem} onClick={() => handleResultClick(item)}>
                                    <div className={styles.resultHeader}>
                                        <span className={styles.convoTitle}>{title}</span>
                                        <span>{dateStr}</span>
                                    </div>
                                    <div className={styles.resultContent}>
                                        {content}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </Modal>
    );
};

export default SearchModal;
