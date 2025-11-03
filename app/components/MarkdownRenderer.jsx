import styles from './MarkdownRenderer.module.css';

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
  const htmlContent = formatMarkdown(content);
  return (
    <div
      className={styles.markdownContent}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}