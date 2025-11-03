import { useState } from 'react';
import { useTranslations } from '../hooks/useTranslations';
import styles from './MarkdownRenderer.module.css';
// --- 👇 [수정] useChatStore 임포트 추가 ---
import { useChatStore } from '../store';
// --- 👆 [수정] ---

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
  if (typeof text !== 'string') {
    text = String(text || '');
  }

  // 1. 기본 HTML 이스케이프 (XSS 방지)
  let escapedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 2. 마크다운 -> HTML 변환
  // 링크: [text](url) (http/https만 허용)
  escapedText = escapedText.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  // 굵게: **text**
  escapedText = escapedText.replace(/\*\*(?=\S)(.+?[*_]*)(?=\S)\*\*/g, '<strong>$1</strong>');

  // 기울임: *text*
  escapedText = escapedText.replace(/\*(?=\S)(.+?[*_]*)(?=\S)\*/g, '<em>$1</em>');
  
  // 인라인 코드: `text`
  escapedText = escapedText.replace(/`(.+?)`/g, '<code>$1</code>');

  // 줄바꿈
  escapedText = escapedText.replace(/\n/g, '<br />');

  // 테이블 처리 (간단한 구현)
  const tableRegex = /(?:\|(.+?)\|[\r\n]+)(?:\|([-: ]+)\|[\r\n]+)((?:\|.*\|[\r\n]+)*)/g;
  escapedText = escapedText.replace(tableRegex, (match, headerRow, alignRow, bodyRows) => {
    const headers = headerRow.split('|').map(h => h.trim());
    const aligns = alignRow.split('|').map(a => a.trim());
    const bodies = bodyRows.trim().split('\n').map(row => row.split('|').map(cell => cell.trim()));

    let tableHTML = '<table>';
    // Render header
    tableHTML += '<thead><tr>';
    headers.forEach((header, i) => {
      tableHTML += `<th style="text-align: ${aligns[i] || 'left'}">${header}</th>`;
    });
    tableHTML += '</tr></thead>';
    // Render body
    tableHTML += '<tbody>';
    bodies.forEach(row => {
      tableHTML += '<tr>';
      row.forEach(cell => {
        tableHTML += `<td>${cell}</td>`;
      });
      tableHTML += '</tr>';
    });
    tableHTML += '</tbody></table>';

    return tableHTML;
  });

  return escapedText;
}

export default function MarkdownRenderer({ content }) {
  const { t } = useTranslations();
  const [isExpanded, setIsExpanded] = useState(false);
  // --- 👇 [수정] 스토어에서 contentTruncateLimit 가져오기 (줄 수 제한으로 사용) ---
  const LINE_LIMIT = useChatStore((state) => state.contentTruncateLimit);
  // --- 👆 [수정] ---

  // content가 문자열이 아니거나 null일 경우 빈 문자열로 처리
  const safeContent = String(content || '');

  // --- 👇 [수정] 글자 수(.length) 대신 줄 수(lines.length)로 확인 ---
  const lines = safeContent.split('\n');
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
            {t('viewLess')}
          </button>
        )}
      </div>
    );
  }

  // 2. 축약이 필요하고(needsTruncation true), 축소된 상태일 경우
  // --- 👇 [수정] 글자 수 자르기 -> 줄 수 자르기 ---
  // (예: 10줄) 근처의 공백에서 자르기
  const truncatedLines = lines.slice(0, LINE_LIMIT);
  let truncatedText = truncatedLines.join('\n');
  truncatedText += '...'; // 줄임표 추가
  // --- 👆 [수정] ---

  const htmlContent = formatMarkdown(truncatedText);

  return (
    <div className={styles.markdownContent}>
      <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
      <button onClick={handleToggle} className={styles.viewMoreButton}>
        {t('viewMore')}
      </button>
    </div>
  );
}