'use client';

import { useState, useEffect } from 'react';
import styles from './page.module.css';
import Link from 'next/link';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// MarkdownRenderer.jsx의 CSS를 가져와서 TO-BE 패널에 적용합니다.
import markdownStyles from '../components/MarkdownRenderer.module.css';

// --- 👇 [수정] Chat.module.css와 LogoIcon을 import ---
import chatStyles from '../components/Chat.module.css';
import LogoIcon from '../components/icons/LogoIcon';
// --- 👆 [수정] ---

// 렌더러 테스트를 위한 기본 마크다운 텍스트
const sampleMarkdown = `
# AS-IS: 마크다운 입력
이곳에 마크다운 텍스트를 입력하면,
TO-BE 프리뷰에 **react-markdown** 라이브러리 렌더링 결과가 실시간으로 반영됩니다.

---

## TO-BE: 스타일 테스트
* *이탤릭체* (em)
* **굵은 글씨** (strong)
* \`인라인 코드\` (code)
* [링크](https://www.google.com) (a)

## 리스트 테스트
* 항목 1
* 항목 2
    * 중첩 항목 2.1

---

## GFM 테이블 테스트
| 헤더 1 | 헤더 2 | 헤더 3 |
| :--- | :---: | ---: |
| 셀 1-1 | 셀 1-2 | 1000 |
| 셀 2-1 | 셀 2-2 | 20 |

## 4열 테이블
| Menu / Program | Program Type | 주요 영향 | 비고 / 추가 고려사항 |
| :--- | :---: | :--- | :--- |
| Miscellaneous Revenue Invoice | UI | Credit Customer 정보(결제조건, 만기일) 조회 불가 | Rep Customer 조회 불가 |
| 항목 2 | UI | 내용 | ... |

## 5열 테이블
| Menu / Program | Program Type | 유형 | 주요 영향 | 비고 / 추가 고려사항 |
| :--- | :---: | :---: | :--- | :--- |
| Outstanding List | UI | Vendor 입력 시 대기 | Customer 조건에서 Vendor 입력 제한 필요 | ... |
| 항목 2 | API | 백엔드 | 테스트 | ... |
`;

// --- [유지] CSS 규칙을 객체로 분리하여 초기 상태 정의 ---
const initialCssState = {
  // .markdownContent (루트)
  root: `  line-height: 1.6;
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
  /* react-markdown 기본 리스트 스타일 적용을 위해 추가 */
  list-style-type: disc;
  padding-left: 30px;`,
  li: `  margin-bottom: -10px;
  /* 리스트 번호 붙이기 */
  list-style-type: disc;
  /* margin-left: 20px; (ul에서 padding-left로 대체) */`,
  code: `  font-family: var(--font-geist-mono), monospace;
  background-color: var(--button-hover-bg); /* 코드 배경 */
  padding: 2px 5px;
  border-radius: 4px;
  font-size: 0.9em;
  word-wrap: break-word; /* 코드 줄바꿈 */`,
  // --- 👇 [수정] ---
  table: `  border-collapse: collapse;
  min-width: 100%; /* 100% 너비를 최소로 보장 */
  table-layout: auto; /* 컬럼 너비가 내용에 따라 자동 조절되도록 */
  outline: 1px solid var(--panel-border-color);
  outline-offset: -1px;`,
  // --- 👆 [수정] ---
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
// --- [유지] ---

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
  const [cssStyles, setCssStyles] = useState(initialCssState);
  
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

  // --- [유지] cssStyles 객체가 변경될 때마다 <style> 태그 내용 업데이트 ---
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
  // --- [유지] ---

  // --- [유지] 개별 CSS 규칙을 업데이트하는 핸들러 ---
  const handleCssRuleChange = (key, value) => {
    setCssStyles(prev => ({
      ...prev,
      [key]: value,
    }));
  };
  // --- [유지] ---

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
        {/* --- 👇 [수정] 미리보기 패널을 실제 시나리오 구조와 동일하게 래핑 --- */}
        <div className={styles.previewContainer}>
          <h2>TO-BE (Preview)</h2>
          
          {/* 이 outer div는 page.module.css의 .previewBox 스타일(배경, 패딩 등)을 적용합니다.
          */}
          <div className={styles.previewBox}>
            {/* 이 inner div들은 Chat.module.css의 스타일을 적용하여
              실제 채팅 버블의 상속 스타일(폰트, 색상 등)을 시뮬레이션합니다.
            */}
            <div className={`${chatStyles.message} ${chatStyles.botMessage}`}>
              <div className={chatStyles.scenarioMessageContentWrapper}>
                <LogoIcon /> 
                <div className={chatStyles.messageContent}>
                  {/* MarkdownRenderer.jsx의 루트 <div>에 해당하는 클래스입니다.
                    동적 CSS가 이곳을 타겟합니다.
                  */}
                  <div className={markdownStyles.markdownContent}>
                    <Markdown 
                      remarkPlugins={[remarkGfm]} 
                      components={markdownComponents}
                    >
                      {markdownInput}
                    </Markdown>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* --- 👆 [수정] --- */}

        {/* 3. CSS 편집 영역 (하단 전체 너비) */}
        <div className={styles.cssEditorContainer}>
          <h2>
            스타일시트 (CSS)
          </h2>
          {/* --- [유지] 단일 textarea -> 분리된 textarea 그리드 --- */}
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
          {/* --- [유지] --- */}
        </div>
      </div>
    </div>
  );
}