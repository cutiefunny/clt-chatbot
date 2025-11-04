import { useState } from "react";
import { useTranslations } from "../hooks/useTranslations";
import styles from "./MarkdownRenderer.module.css";
// --- 👇 [수정] useChatStore 임포트 추가 ---
import { useChatStore } from "../store";
// --- 👆 [수정] ---
import ChevronDownIcon from "./icons/ChevronDownIcon";

// --- 👇 [수정] const CONTENT_LIMIT = 200; 제거 ---
// const CONTENT_LIMIT = 200; // 글자 수 제한
// --- 👆 [수정] ---

/**
 * 간단한 마크다운 형식을 HTML로 변환합니다.
 * (XSS 방지를 위해 기본 HTML 태그는 이스케이프 처리합니다.)
 * @param {string} text - 마크다운 텍스트
 * @returns {string} - HTML 문자열
 */
function formatMarkdown(text) {
  // 1. 입력값이 문자열이 아니면 빈 문자열로 변환
  if (typeof text !== "string") {
    text = String(text || "");
  }

  // 2. 기본 HTML 이스케이프 (XSS 방지)
  let escapedText = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 3. 마크다운 -> HTML 변환 (블록 요소는 \n을 포함하여 변환)

  // 3-1. 테이블 처리 (간단한 구현)
  // Note: 테이블 처리 로직은 헤딩 처리보다 먼저 와야 안전하게 처리됩니다.
  const tableRegex =
    /(?:\|(.+?)\|[\r\n]+)(?:\|([-: ]+)\|[\r\n]+)((?:\|.*\|[\r\n]+)*)/g;
  escapedText = escapedText.replace(
    tableRegex,
    (match, headerRow, alignRow, bodyRows) => {
      // 테이블 관련 텍스트가 이미 이스케이프되었으므로, 다시 디코딩 후 처리
      const unescapedHeaderRow = headerRow
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");

      // 헤더 행 파싱
      const headers = unescapedHeaderRow.split("|").map((h) => h.trim());
      // 정렬 행 파싱
      const aligns = alignRow.split("|").map((a) => a.trim());
      // 본문 행 파싱 (빈 행 제거 및 셀 이스케이프 해제)
      const bodies = bodyRows
        .trim()
        .split("\n")
        .filter((row) => row.trim() !== "")
        .map((row) =>
          row
            .split("|")
            .map((cell) =>
              cell
                .trim()
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&amp;/g, "&")
            )
        );

      let tableHTML = "<table>";

      // 테이블 헤더 (thead) 렌더링
      tableHTML += "<thead><tr>";
      headers.forEach((header, i) => {
        // 정렬 정보(aligns[i])가 있으면 적용, 없으면 'left' 기본값
        const alignStyle =
          aligns[i] && aligns[i].includes(":")
            ? `text-align: ${
                aligns[i].trim().startsWith(":")
                  ? "left"
                  : aligns[i].trim().endsWith(":")
                  ? "right"
                  : "center"
              }`
            : "text-align: left";
        tableHTML += `<th style="${alignStyle}">${header}</th>`;
      });
      tableHTML += "</tr></thead>";

      // 테이블 본문 (tbody) 렌더링
      tableHTML += "<tbody>";
      bodies.forEach((row) => {
        tableHTML += "<tr>";
        // cells.length > 0 &&
        row.forEach((cell) => {
          tableHTML += `<td>${cell}</td>`;
        });
        tableHTML += "</tr>";
      });
      tableHTML += "</tbody></table>";

      // 테이블 블록은 주변의 줄바꿈 처리를 위해 \n을 유지하고 반환
      return "\n" + tableHTML + "\n";
    }
  );

  // 3-2. Heading 처리 (블록 요소이므로 앞뒤에 \n을 추가하여 줄바꿈 최적화 준비)
  escapedText = escapedText.replace(/^#\s(.+)/gm, "\n<h1>$1</h1>\n");
  escapedText = escapedText.replace(/^##\s(.+)/gm, "\n<h2>$1</h2>\n");

  // 3-3. 인라인 요소 처리

  // 링크: \[text\]\(url) (http/https만 허용)
  escapedText = escapedText.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  // 굵게: \*\*text\*\*
  // \S은 공백이 아닌 문자, (?=...)와 (?<!)는 전방/후방 탐색(lookahead/lookbehind)
  escapedText = escapedText.replace(
    /\*\*(?=\S)(.+?[*_]*)(?=\S)\*\*/g,
    "<strong>$1</strong>"
  );

  // 기울임: \*text\*
  escapedText = escapedText.replace(
    /\*(?=\S)(.+?[*_]*)(?=\S)\*/g,
    "<em>$1</em>"
  );

  // 인라인 코드: \`text\`
  escapedText = escapedText.replace(/\`(.+?)\`/g, "<code>$1</code>");

  // 3-4. 줄바꿈 최적화 및 최종 변환

  // 1. Heading이나 테이블 변환 후 발생할 수 있는 연속된 빈 줄을 단일 \n으로 만듦.
  escapedText = escapedText.replace(/\n{2,}/g, "\n");

  // 2. 일반 텍스트의 단일 줄바꿈만 <br />로 변환
  // 블록 요소 (<h1>, <table> 등) 사이의 \n은 HTML 렌더링에서 무시되므로,
  // 텍스트 단락 내에서만 <br />로 변환되어야 합니다.
  escapedText = escapedText.replace(/\n/g, "<br />");

  // 4. 최종 HTML 반환 (앞뒤에 남은 <br /> 제거)
  return escapedText
    .trim()
    .replace(/^(<br\s*\/?>)+/i, "")
    .replace(/(<br\s*\/?>)+$/i, "");
}

export default function MarkdownRenderer({ content }) {
  const { t } = useTranslations();
  const [isExpanded, setIsExpanded] = useState(false);
  // --- 👇 [수정] 스토어에서 contentTruncateLimit 가져오기 (줄 수 제한으로 사용) ---
  const LINE_LIMIT = useChatStore((state) => state.contentTruncateLimit);
  // --- 👆 [수정] ---

  // content가 문자열이 아니거나 null일 경우 빈 문자열로 처리
  const safeContent = String(content || "");

  // --- 👇 [수정] 글자 수(.length) 대신 줄 수(lines.length)로 확인 ---
  const lines = safeContent.split("\n");
  const needsTruncation = LINE_LIMIT > 0 && lines.length > LINE_LIMIT;
  // --- 👆 [수정] ---

  const handleToggle = (e) => {
    e.stopPropagation(); // 이벤트 버블링 방지
    setIsExpanded(!isExpanded);
  };

  // 1. 축약이 필요 없거나(needsTruncation false), 확장된 상태일 경우
  if (!needsTruncation || isExpanded) {
    const htmlContent = formatMarkdown(safeContent);
    return (
      <div className={styles.markdownContent}>
        <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
        {/* 확장된 상태에서는 "간략히 보기" 버튼 표시 */}
        {needsTruncation && (
          <button onClick={handleToggle} className={styles.viewMoreButton}>
            {t("viewLess")}
            <ChevronDownIcon isRotated size={20} />
          </button>
        )}
      </div>
    );
  }

  // 2. 축약이 필요하고(needsTruncation true), 축소된 상태일 경우
  // --- 👇 [수정] 글자 수 자르기 -> 줄 수 자르기 ---
  // (예: 10줄) 근처의 공백에서 자르기
  const truncatedLines = lines.slice(0, LINE_LIMIT);
  let truncatedText = truncatedLines.join("\n");
  truncatedText += "..."; // 줄임표 추가
  // --- 👆 [수정] ---

  const htmlContent = formatMarkdown(truncatedText);

  return (
    <div className={styles.markdownContent}>
      <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
      <button onClick={handleToggle} className={styles.viewMoreButton}>
        {t("viewMore")}
        <ChevronDownIcon size={20} />
      </button>
    </div>
  );
}
