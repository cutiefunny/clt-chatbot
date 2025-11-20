// app/components/MarkdownRenderer.jsx
import { useState } from "react";
import { useTranslations } from "../hooks/useTranslations";
import styles from "./MarkdownRenderer.module.css";
import { useChatStore } from "../store";
import ChevronDownIcon from "./icons/ChevronDownIcon";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openLinkThroughParent } from "../lib/parentMessaging";

export default function MarkdownRenderer({
  content,
  renderAsMarkdown = true,
  children,
  wrapperClassName,
}) {
  const { t } = useTranslations();
  const [isExpanded, setIsExpanded] = useState(false);
  const LINE_LIMIT = useChatStore((state) => state.contentTruncateLimit);

  const markdownComponents = {
    table: ({ node: _node, ...props }) => (
      <div className={styles.tableWrapper}>
        <table {...props} />
      </div>
    ),
    
    a: ({ node: _node, href, children, ...props }) => (
      <a
        href={href}
        {...props}
      >
        {children}
      </a>
    ),
  };

  const safeContent = String(content || "");

  // 1. '---' 구분자 확인
  const delimiterRegex = /\n\s*---\s*\n/;
  const match = delimiterRegex.exec(safeContent);
  const needsTruncationByDelimiter = match !== null;

  // 2. 기존 줄 수 제한 확인
  const lines = safeContent.split("\n");
  const needsTruncationByLine = LINE_LIMIT > 0 && lines.length > LINE_LIMIT;

  // 3. 최종 상태 결정
  let needsTruncation = false;
  let truncatedText = "";
  let fullContent = safeContent;

  if (needsTruncationByDelimiter) {
    const splitIndex = match.index;
    needsTruncation = true;
    truncatedText = safeContent.substring(0, splitIndex);
    fullContent = safeContent.replace(delimiterRegex, "\n\n");
  } else if (needsTruncationByLine) {
    needsTruncation = true;
    truncatedText = `${lines.slice(0, LINE_LIMIT).join("\n")}...`;
  }

  const displayContent = needsTruncation && !isExpanded ? truncatedText : fullContent;

  const handleToggle = (e) => {
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
  };

  return (
    <div className={`${styles.markdownContent} ${wrapperClassName || ""}`}>
      {renderAsMarkdown ? (
        <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {displayContent}
        </Markdown>
      ) : (
        <div style={{ whiteSpace: "pre-wrap", wordWrap: "break-word" }}>
          {displayContent}
        </div>
      )}

      {(!needsTruncation || isExpanded) && children}

      {needsTruncation && (
        <button onClick={handleToggle} className={styles.viewMoreButton}>
          {isExpanded ? t("viewLess") : t("viewMore")}
          <ChevronDownIcon isRotated={isExpanded} size={20} />
        </button>
      )}
    </div>
  );
}