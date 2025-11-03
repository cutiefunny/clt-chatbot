'use client';

import { useState, useEffect } from 'react';
// CSS 모듈 import는 제거합니다. (스타일을 동적으로 주입할 것이기 때문)
// import markdownStyles from '../../components/MarkdownRenderer.module.css'; 
import styles from './page.module.css';
import Link from 'next/link';

// 렌더러 테스트를 위한 기본 마크다운 텍스트
const sampleMarkdown = `
# 마크다운 렌더러 테스트

이 페이지는 렌더링 기능과 스타일을 실시간으로 테스트합니다.
아래 텍스트 영역의 내용을 수정하면 미리보기에 즉시 반영됩니다.

---

## 지원하는 기능

* **굵은 글씨:** **이 텍스트는 굵게 표시됩니다.**
* *기울임꼴:* *이 텍스트는 기울임꼴입니다.*
* \`인라인 코드\`: \`const message = "Hello World";\`
* [링크](https://www.google.com): [Google로 이동](https://www.google.com)
* 줄바꿈:
  이렇게 자동으로
  줄바꿈이 적용됩니다.

---

## 테이블 테스트

| 헤더 1 (왼쪽 정렬) | 헤더 2 (기본 정렬) | 헤더 3 (오른쪽 정렬) |
| :--- | --- | ---: |
| 셀 1-1 | 셀 1-2 | 1000 |
| 셀 2-1 | 셀 2-2 | 20 |
`;

// MarkdownRenderer.jsx의 formatMarkdown 함수 로직 (백슬래시 이스케이프 처리됨)
const defaultFunctionBody = `
  if (typeof text !== 'string') {
    text = String(text || '');
  }
  let escapedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  escapedText = escapedText.replace(
    /\\[([^\\]]+)\\]\\((https?:\\/\\/[^)]+)\\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  escapedText = escapedText.replace(/\\*\\*(?=\\S)(.+?[*_]*)(?=\\S)\\*\\*/g, '<strong>$1</strong>');
  escapedText = escapedText.replace(/\\*(?=\\S)(.+?[*_]*)(?=\\S)\\*/g, '<em>$1</em>');
  escapedText = escapedText.replace(/\\\`(.+?)\\\`/g, '<code>$1</code>');
  escapedText = escapedText.replace(/\\n/g, '<br />');
  const tableRegex = /(?:\\|(.+?)\\|[\\r\\n]+)(?:\\|([-: ]+)\\|[\\r\\n]+)((?:\\|.*\\|[\\r\\n]+)*)/g;
  escapedText = escapedText.replace(tableRegex, (match, headerRow, alignRow, bodyRows) => {
    const headers = headerRow.split('|').map(h => h.trim());
    const aligns = alignRow.split('|').map(a => a.trim());
    const bodies = bodyRows.trim().split('\\n').map(row => row.split('|').map(cell => cell.trim()));
    let tableHTML = '<table>';
    tableHTML += '<thead><tr>';
    headers.forEach((header, i) => {
      tableHTML += \`<th style="text-align: \${aligns[i] || 'left'}">\${header}</th>\`;
    });
    tableHTML += '</tr></thead>';
    tableHTML += '<tbody>';
    bodies.forEach(row => {
      tableHTML += '<tr>';
      row.forEach(cell => {
        tableHTML += \`<td>\${cell}</td>\`;
      });
      tableHTML += '</tr>';
    });
    tableHTML += '</tbody></table>';
    return tableHTML;
  });
  return escapedText;
`;

// --- 👇 [추가] MarkdownRenderer.module.css의 원본 내용 ---
// 동적 적용을 위해 클래스 이름을 `.dynamicMarkdownPreview`로 변경했습니다.
const defaultCssCode = `
/* app/components/MarkdownRenderer.module.css (수정됨) */
.dynamicMarkdownPreview {
  line-height: 1.6;
  word-wrap: break-word; /* 긴 텍스트 줄바꿈 */
}

.dynamicMarkdownPreview a {
  color: #4285f4; /* 링크 색상 */
  text-decoration: underline;
}

.dynamicMarkdownPreview strong {
  font-weight: 600; /* 굵게 */
}

.dynamicMarkdownPreview em {
  font-style: italic; /* 기울임 */
}

.dynamicMarkdownPreview code {
  font-family: var(--font-geist-mono), monospace;
  background-color: var(--button-hover-bg); /* 코드 배경 */
  padding: 2px 5px;
  border-radius: 4px;
  font-size: 0.9em;
  word-wrap: break-word; /* 코드 줄바꿈 */
}

/* <br> 태그로 인한 이중 간격 방지 */
.dynamicMarkdownPreview br {
  content: "";
  display: block;
  margin-bottom: 0;
}

/* 테이블 스타일 추가 */
.dynamicMarkdownPreview table {
  border-collapse: collapse;
  margin: 1em 0;
  width: auto;
  border: 1px solid #d8e0eb;
}

.dynamicMarkdownPreview th,
.dynamicMarkdownPreview td {
  border: 1px solid #d8e0eb;
  padding: 8px 12px;
}

.dynamicMarkdownPreview th {
  background-color: #f4f5fb;
  font-weight: 600;
}
`;
// --- 👆 [추가] ---

// 동적으로 주입할 <style> 태그의 고유 ID
const DYNAMIC_STYLE_ID = 'dynamic-markdown-renderer-style';

export default function MarkdownTestPage() {
  const [markdownInput, setMarkdownInput] = useState(sampleMarkdown);
  const [functionCode, setFunctionCode] = useState(defaultFunctionBody);
  // --- 👇 [추가] CSS 코드 상태 ---
  const [cssCode, setCssCode] = useState(defaultCssCode);
  // --- 👆 [추가] ---
  
  const [renderedHtml, setRenderedHtml] = useState('');
  const [functionError, setFunctionError] = useState(null);

  // JS 렌더링 함수 로직 (이전과 동일)
  useEffect(() => {
    try {
      const formatFn = new Function('text', functionCode);
      const html = formatFn(markdownInput);
      setRenderedHtml(html);
      setFunctionError(null);
    } catch (error) {
      console.error("Markdown function error:", error);
      setFunctionError(error.message);
    }
  }, [markdownInput, functionCode]);

  // --- 👇 [추가] CSS를 <head>에 주입하는 로직 ---
  useEffect(() => {
    // 1. 컴포넌트 마운트 시 <style> 태그 생성
    let styleTag = document.getElementById(DYNAMIC_STYLE_ID);
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = DYNAMIC_STYLE_ID;
      document.head.appendChild(styleTag);
    }

    // 2. 컴포넌트 언마운트 시 <style> 태그 제거
    return () => {
      const tag = document.getElementById(DYNAMIC_STYLE_ID);
      if (tag) {
        tag.remove();
      }
    };
  }, []); // 마운트/언마운트 시 한 번만 실행

  // 3. cssCode가 변경될 때마다 <style> 태그 내용 업데이트
  useEffect(() => {
    const styleTag = document.getElementById(DYNAMIC_STYLE_ID);
    if (styleTag) {
      styleTag.innerHTML = cssCode;
    }
  }, [cssCode]);
  // --- 👆 [추가] ---

  return (
    <div className={styles.pageWrapper}>
      <header className={styles.header}>
        <h1>Markdown 렌더러 샌드박스</h1>
        <p>마크다운 입력, 렌더링 함수(JS), 스타일(CSS)을 수정하여 실시간으로 결과를 확인합니다.</p>
        <Link href="/">← 챗봇으로 돌아가기</Link>
      </header>

      {functionError && (
        <div className={styles.errorBox}>
          <strong>함수 오류:</strong> {functionError}
        </div>
      )}

      {/* --- 👇 [수정] 2x2 그리드 레이아웃으로 변경 --- */}
      <div className={styles.container}>
        {/* 1. 마크다운 입력 영역 */}
        <div className={styles.editorContainer}>
          <h2>입력 (Markdown)</h2>
          <textarea
            className={styles.textarea}
            value={markdownInput}
            onChange={(e) => setMarkdownInput(e.target.value)}
            spellCheck="false"
          />
        </div>

        {/* 2. 렌더링 결과 영역 */}
        <div className={styles.previewContainer}>
          <h2>미리보기 (HTML)</h2>
          <div
            className={`${styles.previewBox} dynamicMarkdownPreview`} // CSS 모듈 대신 정적 클래스 사용
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        </div>

        {/* 3. 렌더링 함수 편집 영역 */}
        <div className={styles.editorContainer}>
          <h2>
            <code>formatMarkdown(text)</code> 함수 본문 (JavaScript)
          </h2>
          <textarea
            className={`${styles.textarea} ${styles.codeArea} ${functionError ? styles.hasError : ''}`}
            value={functionCode}
            onChange={(e) => setFunctionCode(e.target.value)}
            spellCheck="false"
          />
        </div>

        {/* 4. CSS 편집 영역 */}
        <div className={styles.editorContainer}>
          <h2>
            스타일시트 (CSS)
          </h2>
          <textarea
            className={`${styles.textarea} ${styles.codeArea}`}
            value={cssCode}
            onChange={(e) => setCssCode(e.target.value)}
            spellCheck="false"
          />
        </div>
      </div>
      {/* --- 👆 [수정] --- */}
    </div>
  );
}