'use client';

import { useState, useEffect } from 'react';
import styles from './page.module.css';
import Link from 'next/link';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// MarkdownRenderer.jsx의 CSS를 가져와서 TO-BE 패널에 적용합니다.
import markdownStyles from '../components/MarkdownRenderer.module.css';

// 렌더러 테스트를 위한 기본 마크다운 텍스트
const sampleMarkdown = `
# AS-IS: 마크다운 입력
이곳에 마크다운 텍스트를 입력하면,
TO-BE 프리뷰에 **react-markdown** 라이브러리 렌더링 결과가 실시간으로 반영됩니다.


## TO-BE: 스타일 테스트
* *이탤릭체* (em)
* **굵은 글씨** (strong)
* \`인라인 코드\` (code)
* [링크](https://www.google.com) (a)

## 리스트 테스트
* 항목 1
* 항목 2
    * 중첩 항목 2.1


## GFM 테이블 테스트
| 헤더 1 | 헤더 2 | 헤더 3 |
| :--- | :---: | ---: |
| 셀 1-1 | 셀 1-2 | 1000 |
| 셀 2-1 | 셀 2-2 | 20 |
`;

// --- 👇 [수정] CSS 규칙을 객체로 분리하여 초기 상태 정의 ---
const initialCssState = {
  // .markdownContent (루트)
  root: `  line-height: 2.5;
  word-wrap: break-word; /* 긴 텍스트 줄바꿈 */
  max-width: 100%;
  min-width: 0;`,
  h1: `  color: var(--Purple-03, #634de2);
  font-size: 14px;
  font-weight: 700;
  line-height: 20px;
  letter-spacing: -0.14px;`,
  h2: `  color: var(--Gray-08, #282166);
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  letter-spacing: -0.14px;`,
  a: `  color: #4285f4; /* 링크 색상 */
  /* text-decoration: underline; */`,
  strong: `  font-weight: 600; /* 굵게 */`,
  em: `  font-style: normal;`,
  ul: `  margin-bottom: 0px;
  margin-top: -10px;
  list-style-type: disc;
  padding-left: 30px;`,
  li: `  margin-bottom: -10px;
  list-style-type: disc;`,
  code: `  font-family: var(--font-geist-mono), monospace;
  background-color: var(--button-hover-bg);
  padding: 2px 5px;
  border-radius: 4px;
  font-size: 0.9em;
  word-wrap: break-word;`,
  table: `  border-collapse: collapse;
  width: max-content;
  min-width: 100%;
  outline: 1px solid var(--panel-border-color);
  outline-offset: -1px;`,
  th: `  background-color: #f4f5fb;
  padding: 8px 10px;
  border: 1px solid #d8e0eb;
  min-width: 50px;
  max-width: 120px;
  color: var(--Gray-08, #282166);
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  letter-spacing: -0.18px;
  white-space: normal;
  word-break: break-word;`,
  td: `  padding: 8px 12px;
  border: 1px solid #d8e0eb;
  min-width: 50px;
  max-width: 120px;
  color: var(--Gray-08, #282166);
  font-size: 12px;
  font-weight: 400;
  line-height: 16px;
  letter-spacing: -0.18px;
  white-space: normal;
  word-break: break-word;`,
  // .tableWrapper (테이블 감싸는 div)
  tableWrapper: `  display: block;
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;`,
};
// --- 👆 [수정] ---

// 동적으로 주입할 <style> 태그의 고유 ID
const DYNAMIC_STYLE_ID = 'dynamic-markdown-renderer-style';

// MarkdownRenderer.jsx의 table 커스텀 로직을 가져옵니다.
const markdownComponents = {
  table: ({ node: _node, ...props }) => (
    // .tableWrapper 스타일은 CSS 주입을 통해 적용됩니다.
    <div className={markdownStyles.tableWrapper}>
      <table {...props} />
    </div>
  ),
};


export default function MarkdownTestPage() {
  const [markdownInput, setMarkdownInput] = useState(sampleMarkdown);
  // --- 👇 [수정] CSS 상태를 문자열 -> 객체로 변경 ---
  const [cssStyles, setCssStyles] = useState(initialCssState);
  // --- 👆 [수정] ---
  
  // --- [유지] CSS를 <head>에 주입하는 로직 (마운트/언마운트) ---
  useEffect(() => {
    let styleTag = document.getElementById(DYNAMIC_STYLE_ID);
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = DYNAMIC_STYLE_ID;
      document.head.appendChild(styleTag);
    }
    return () => {
      const tag = document.getElementById(DYNAMIC_STYLE_ID);
      if (tag) {
        tag.remove();
      }
    };
  }, []); // 마운트/언마운트 시 한 번만 실행

  // --- 👇 [수정] cssStyles 객체가 변경될 때마다 <style> 태그 내용 업데이트 ---
  useEffect(() => {
    const styleTag = document.getElementById(DYNAMIC_STYLE_ID);
    if (styleTag) {
      // cssStyles 객체로부터 전체 CSS 문자열 생성
      const fullCssString = Object.entries(cssStyles)
        .map(([key, value]) => {
          if (key === 'root') {
            // .markdownContent (루트 클래스)
            return `.${markdownStyles.markdownContent} {\n${value}\n}`;
          }
          if (key === 'tableWrapper') {
            // .tableWrapper (특수 클래스)
            return `.${markdownStyles.tableWrapper} {\n${value}\n}`;
          }
          // .markdownContent 내부의 태그
          return `.${markdownStyles.markdownContent} ${key} {\n${value}\n}`;
        })
        .join('\n\n');
        
      styleTag.innerHTML = fullCssString;
    }
  }, [cssStyles]);
  // --- 👆 [수정] ---

  // --- 👇 [추가] 개별 CSS 규칙을 업데이트하는 핸들러 ---
  const handleCssRuleChange = (key, value) => {
    setCssStyles(prev => ({
      ...prev,
      [key]: value,
    }));
  };
  // --- 👆 [추가] ---

  return (
    <div className={styles.pageWrapper}>
      <header className={styles.header}>
        <h1>Markdown 렌더러 샌드박스</h1>
        <p>마크다운 입력(AS-IS)과 스타일(CSS)을 수정하여 실시간으로 렌더링 결과(TO-BE)를 확인합니다.</p>
        <Link href="/">← 챗봇으로 돌아가기</Link>
      </header>

      {/* --- [유지] 레이아웃 --- */}
      <div className={styles.container}>
        {/* 1. 마크다운 입력 영역 */}
        <div className={styles.editorContainer}>
          <h2>AS-IS (Markdown Input)</h2>
          <textarea
            className={styles.textarea}
            value={markdownInput}
            onChange={(e) => setMarkdownInput(e.target.value)}
            spellCheck="false"
          />
        </div>

        {/* 2. 렌더링 결과 영역 */}
        <div className={styles.previewContainer}>
          <h2>TO-BE (Preview)</h2>
          <div
            className={`${styles.previewBox} ${markdownStyles.markdownContent}`} 
          >
            <Markdown 
              remarkPlugins={[remarkGfm]} 
              components={markdownComponents}
            >
              {markdownInput}
            </Markdown>
          </div>
        </div>

        {/* 3. CSS 편집 영역 (하단 전체 너비) */}
        <div className={styles.cssEditorContainer}>
          <h2>
            스타일시트 (CSS)
          </h2>
          {/* --- 👇 [수정] 단일 textarea -> 분리된 textarea 그리드 --- */}
          <div className={styles.cssEditorGrid}>
            {Object.entries(cssStyles).map(([key, value]) => (
              <div key={key} className={styles.cssRuleEditor}>
                <label className={styles.cssRuleLabel}>
                  {key === 'root' ? `.${markdownStyles.markdownContent}` : 
                   key === 'tableWrapper' ? `.${markdownStyles.tableWrapper}` : 
                   `${key}`}
                </label>
                <textarea
                  className={`${styles.textarea} ${styles.codeArea} ${styles.cssRuleTextarea}`}
                  value={value}
                  onChange={(e) => handleCssRuleChange(key, e.target.value)}
                  spellCheck="false"
                />
              </div>
            ))}
          </div>
          {/* --- 👆 [수정] --- */}
        </div>
      </div>
    </div>
  );
}