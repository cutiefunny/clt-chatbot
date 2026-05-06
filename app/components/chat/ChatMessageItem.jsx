// app/components/chat/ChatMessageItem.jsx
"use client";

import { useCallback } from "react";
import dynamic from "next/dynamic";
import { useChatStore } from "../../store";
import { useTranslations } from "../../hooks/useTranslations";
import { TARGET_AUTO_OPEN_URL, AUTO_OPEN_COMPLETE_MESSAGE, escapeRegExp } from "../../lib/constants";
import styles from "../Chat.module.css";
import mainMarkdownStyles from "../MainChatMarkdown.module.css";

import ScenarioBubble from "../ScenarioBubble";
import CheckCircle from "../icons/CheckCircle";
import LogoIcon from "../icons/LogoIcon";
import CopyIcon from "../icons/CopyIcon";
import MarkdownRenderer from "../MarkdownRenderer";

const ChartRenderer = dynamic(() => import("../ChartRenderer"), {
    loading: () => <p>Loading chart...</p>,
    ssr: false,
});

const tryParseJson = (text) => {
    try {
        if (typeof text === "string" && text.startsWith("{") && text.endsWith("}")) {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === "object") {
                return parsed;
            }
        }
    } catch (e) { }
    return null;
};

const MessageWithButtons = ({ msg }) => {
    const { text, id: messageId, isStreaming, chartData, sender } = msg;
    const { handleShortcutClick, scenarioCategories, selectedOptions } = useChatStore();
    const enableMainChatMarkdown = useChatStore((state) => state.enableMainChatMarkdown);
    const selectedOption = selectedOptions[messageId];

    const findShortcutByTitle = useCallback((title) => {
        if (!scenarioCategories) return null;
        for (const category of scenarioCategories) {
            for (const subCategory of category.subCategories) {
                const item = subCategory.items.find((i) => i.title === title);
                if (item) return item;
            }
        }
        return null;
    }, [scenarioCategories]);

    if (text === null || text === undefined) return null;

    const showLoadingGifForLoopback = typeof text === "string" && text.includes("Loop back to Supervisor");
    if (showLoadingGifForLoopback) {
        return (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                <span>init flow..</span>
                <img src="/images/Loading.gif" alt="Loading..." style={{ width: "60px", height: "45px", marginTop: "8px" }} />
            </div>
        );
    }

    const jsonContent = tryParseJson(text);
    if (jsonContent && jsonContent.next && jsonContent.instructions) {
        return (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                <span>{jsonContent.instructions}</span>
                <img src="/images/Loading.gif" alt="Loading..." style={{ width: "60px", height: "45px", marginTop: "8px" }} />
            </div>
        );
    }

    let processedText = text;

    if (sender === 'bot' && typeof processedText === "string" &&
        (processedText.includes('172.20.130.91') || processedText.includes('BPM_P1002'))) {

        const replacement = AUTO_OPEN_COMPLETE_MESSAGE;

        const escapedUrl = escapeRegExp(TARGET_AUTO_OPEN_URL);
        const flexibleUrlPattern = escapedUrl.replace(/&/g, '(&|&amp;)');
        const urlRegex = new RegExp(flexibleUrlPattern, 'g');

        processedText = processedText.replace(urlRegex, replacement);

        const escapedReplacement = escapeRegExp(replacement);
        const markdownWrapperRegex = new RegExp(`\\[.*?\\]\\(${escapedReplacement}\\)`, 'g');

        if (markdownWrapperRegex.test(processedText)) {
            processedText = processedText.replace(markdownWrapperRegex, replacement);
        }

        const nnTarget = `${replacement}NN`;
        if (processedText.includes(nnTarget)) {
            processedText = processedText.replaceAll(nnTarget, replacement);
        }
    }

    const regex = /\[BUTTON:(.+?)\]/g;
    const textParts = [];
    const buttonParts = [];
    let lastIndex = 0;
    let match;

    if (typeof processedText === "string") {
        while ((match = regex.exec(processedText)) !== null) {
            if (match.index > lastIndex) {
                textParts.push(processedText.substring(lastIndex, match.index));
            }
            buttonParts.push(match[1]);
            lastIndex = regex.lastIndex;
        }
        textParts.push(processedText.substring(lastIndex));
    } else {
        try {
            textParts.push(JSON.stringify(processedText));
        } catch (e) {
            textParts.push(String(processedText));
        }
    }

    const allTextContent = textParts.map(s => s.trim()).filter(Boolean).join("\n");

    return (
        <div>
            {chartData && (
                <ChartRenderer chartJsonString={chartData} />
            )}

            <MarkdownRenderer
                content={allTextContent}
                renderAsMarkdown={enableMainChatMarkdown}
                wrapperClassName={mainMarkdownStyles.mainChatMarkdown}
            />

            {buttonParts.map((buttonText, index) => {
                const shortcutItem = findShortcutByTitle(buttonText);
                const isSelected = selectedOption === buttonText;
                const isDimmed = selectedOption && !isSelected;

                if (shortcutItem) {
                    return (
                        <button
                            key={`button-${index}`}
                            className={`${styles.optionButton} ${isSelected ? styles.selected : ""} ${isDimmed ? styles.dimmed : ""}`}
                            style={{ margin: "4px 4px 4px 0", display: "block" }}
                            onClick={() => handleShortcutClick(shortcutItem, messageId)}
                            disabled={!!selectedOption}
                        >
                            {buttonText}
                        </button>
                    );
                }
                return <span key={`button-text-${index}`}>{`[BUTTON:${buttonText}]`}</span>;
            })}

            {isStreaming && (
                <img
                    src="/images/Loading.gif"
                    alt="Loading..."
                    style={{ width: "60px", height: "45px", marginLeft: "8px", verticalAlign: "middle" }}
                />
            )}
        </div>
    );
};

export default function ChatMessageItem({ msg, isStreaming, copiedMessageId, handleCopy }) {
    const { t } = useTranslations();
    const selectedOptions = useChatStore((state) => state.selectedOptions);
    const setSelectedOption = useChatStore((state) => state.setSelectedOption);
    const openScenarioPanel = useChatStore((state) => state.openScenarioPanel);
    const showScenarioBubbles = useChatStore((state) => state.showScenarioBubbles);

    if (msg.id === "initial") return null;

    if (msg.type === "scenario_bubble" || msg.type === "scenario_message") {
        if (!showScenarioBubbles) {
            return null;
        }
        return (
            <ScenarioBubble
                key={msg.id || msg.scenarioSessionId}
                scenarioSessionId={msg.scenarioSessionId}
                messageData={msg}
            />
        );
    } else {
        const selectedOption = selectedOptions[msg.id];
        const isBotMessage = msg.sender === "bot";
        const hasRichContent =
            isBotMessage &&
            ((Array.isArray(msg.scenarios) && msg.scenarios.length > 0) ||
                msg.hasRichContent === true ||
                msg.contentLayout === "rich" ||
                msg.containsRichContent === true ||
                msg.type === "rich_content" ||
                (Array.isArray(msg.contentBlocks) && msg.contentBlocks.length > 0) ||
                (Array.isArray(msg.attachments) && msg.attachments.length > 0) ||
                msg.chartData);
        const richContentMinWidthRaw = msg.minWidth ?? msg.contentMinWidth ?? msg.richContentMinWidth;
        const shouldApplyMinWidth =
            richContentMinWidthRaw !== null &&
            richContentMinWidthRaw !== undefined &&
            richContentMinWidthRaw !== "";
        const resolvedMinWidth = shouldApplyMinWidth
            ? typeof richContentMinWidthRaw === "number"
                ? `${richContentMinWidthRaw}px`
                : richContentMinWidthRaw
            : undefined;
        const messageClassName = [
            "GlassEffect",
            styles.message,
            isBotMessage ? styles.botMessage : styles.userMessage,
            isBotMessage && hasRichContent ? styles.botMessageRichContent : "",
        ].filter(Boolean).join(" ");

        const messageInlineStyle =
            isBotMessage && hasRichContent && shouldApplyMinWidth && resolvedMinWidth
                ? { minWidth: resolvedMinWidth }
                : undefined;

        return (
            <div
                className={`${styles.messageRow} ${msg.sender === "user" ? styles.userRow : ""}`}
                data-message-id={msg.id}
            >
                <div className={messageClassName} style={messageInlineStyle}>
                    {copiedMessageId === msg.id && (
                        <div className={styles.copyFeedback}>{t("copied")}</div>
                    )}
                    <div className={styles.messageContentWrapper}>
                        {msg.sender === "bot" && <img src="/images/avatar.png" alt="Bot" className={styles.avatar} />}
                        <div className={styles.messageContent}>
                            <MessageWithButtons msg={msg} />
                            {msg.sender === "bot" && msg.scenarios && (
                                <div className={styles.scenarioList}>
                                    {msg.scenarios.map((scenario) => {
                                        const scenarioId = typeof scenario === 'object' ? scenario.id : scenario;
                                        const scenarioName = typeof scenario === 'object' ? scenario.name : scenario;
                                        const isSelected = selectedOption === scenarioName;
                                        const isDimmed = selectedOption && !isSelected;
                                        return (
                                            <button
                                                key={scenarioId}
                                                className={`${styles.optionButton} ${isSelected ? styles.selected : ""} ${isDimmed ? styles.dimmed : ""}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedOption(msg.id, scenarioName);
                                                    openScenarioPanel(scenarioId);
                                                }}
                                                disabled={!!selectedOption}
                                            >
                                                <span className={styles.optionButtonText}>{scenarioName}</span>
                                                <CheckCircle />
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                    {msg.sender === "bot" && msg.text && !isStreaming && (
                        <div className={styles.messageActionArea}>
                            <button
                                className={styles.actionButton}
                                onClick={() => handleCopy(msg.text, msg.id)}
                            >
                                <CopyIcon />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }
}
