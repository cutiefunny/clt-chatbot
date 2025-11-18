// app/components/MarkdownRenderer.jsx
import { useState } from "react";
import { useTranslations } from "../hooks/useTranslations";
import styles from "./MarkdownRenderer.module.css";
import { useChatStore } from "../store";
import ChevronDownIcon from "./icons/ChevronDownIcon";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

// --- 👇 [수정] children prop 및 wrapperClassName prop 추가 ---
export default function MarkdownRenderer({
  content,
  renderAsMarkdown = true,
  children,
  wrapperClassName, // 이 prop을 추가합니다.
}) {
  // --- 👆 [수정] ---
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

  // --- 👇 [수정됨] '---' 구분자 및 줄 수 제한 로직 통합 (테이블 버그 수정) ---

  // 1. '---' 구분자 확인 (줄바꿈으로 둘러싸인 경우만 해당)
  const delimiterRegex = /\n\s*---\s*\n/; // 테이블 헤더( |---| )와 구분하기 위해 new-line으로 감싸진 '---'를 찾음
  const match = delimiterRegex.exec(safeContent);
  const needsTruncationByDelimiter = match !== null;

  // 2. 기존 줄 수 제한 확인
  const lines = safeContent.split("\n");
  const needsTruncationByLine = LINE_LIMIT > 0 && lines.length > LINE_LIMIT;

  // 3. 최종 상태 결정
  let needsTruncation = false;
  let truncatedText = "";
  let fullContent = safeContent; // 기본값은 원본 텍스트

  if (needsTruncationByDelimiter) {
    // '---'가 있으면, '---' 기준으로 자름
    const splitIndex = match.index; // '---' 시작 지점이 아닌, 매치된 패턴(\n---)의 시작 지점
    needsTruncation = true;
    truncatedText = safeContent.substring(0, splitIndex);
    
    // 확장 시 '---' 구분자(와 앞뒤 공백)를 줄바꿈 하나로 변경
    // (주의: replaceAll이 아닌 첫 번째 '---'만 replace)
    fullContent = safeContent.replace(delimiterRegex, "\n"); 
  } else if (needsTruncationByLine) {
    // '---'가 없고, 줄 수 제한에 걸리면 기존 로직대로 자름
    needsTruncation = true;
    truncatedText = `${lines.slice(0, LINE_LIMIT).join("\n")}...`;
    // fullContent는 원본(safeContent) 그대로 사용
  }

  // 표시할 내용 결정
  const displayContent = needsTruncation && !isExpanded ? truncatedText : fullContent;
  // --- 👆 [수정됨] ---

  const handleToggle = (e) => {
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
  };

  return (
    // --- 👇 [수정] className에 wrapperClassName을 추가합니다. ---
    <div className={`${styles.markdownContent} ${wrapperClassName || ""}`}>
      {/* --- 👆 [수정] --- */}
      {renderAsMarkdown ? (
        <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {displayContent}
        </Markdown>
      ) : (
        <div style={{ whiteSpace: "pre-wrap", wordWrap: "break-word" }}>
          {displayContent}
        </div>
      )}

      {/* "더 보기"가 필요 없거나, 확장된 상태일 때만 children(차트)을 렌더링 */}
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