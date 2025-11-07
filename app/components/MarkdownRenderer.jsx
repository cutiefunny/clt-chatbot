import { useState } from "react";
import { useTranslations } from "../hooks/useTranslations";
import styles from "./MarkdownRenderer.module.css";
import { useChatStore } from "../store";
import ChevronDownIcon from "./icons/ChevronDownIcon";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function MarkdownRenderer({ content, renderAsMarkdown = true }) {
  const { t } = useTranslations();
  const [isExpanded, setIsExpanded] = useState(false);
  const LINE_LIMIT = useChatStore((state) => state.contentTruncateLimit);

  const markdownComponents = {
    table: ({ node: _node, ...props }) => (
      <div className={styles.tableWrapper}>
        <table {...props} />
      </div>
    ),
  };

  const safeContent = String(content || "");
  const lines = safeContent.split("\n");
  const needsTruncation = LINE_LIMIT > 0 && lines.length > LINE_LIMIT;

  const handleToggle = (e) => {
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
  };

  const truncatedText = needsTruncation
    ? `${lines.slice(0, LINE_LIMIT).join("\n")}...`
    : safeContent;

  const displayContent =
    !needsTruncation || isExpanded ? safeContent : truncatedText;

  return (
    <div className={styles.markdownContent}>
      {/* --- 👇 [수정] 조건부 렌더링 --- */}
      {renderAsMarkdown ? (
        <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {displayContent}
        </Markdown>
      ) : (
        <div style={{ whiteSpace: "pre-wrap", wordWrap: "break-word" }}>
          {displayContent}
        </div>
      )}
      {/* --- 👆 [수정] --- */}

      {needsTruncation && (
        <button onClick={handleToggle} className={styles.viewMoreButton}>
          {isExpanded ? t("viewLess") : t("viewMore")}
          <ChevronDownIcon isRotated={isExpanded} size={20} />
        </button>
      )}
    </div>
  );
}
