'use client';

import { useState, useEffect } from 'react';
import styles from './page.module.css';
import Link from 'next/link';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// MarkdownRenderer.jsx의 CSS를 가져와서 TO-BE 패널에 적용합니다.
import markdownStyles from '../components/MarkdownRenderer.module.css';

import chatStyles from '../components/Chat.module.css';
import LogoIcon from '../components/icons/LogoIcon';

// --- 👇 [추가] 메인 챗 전용 마크다운 스타일 임포트 ---
import mainMarkdownStyles from '../components/MainChatMarkdown.module.css';
// --- 👆 [추가] ---

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

### H3 스타일 테스트
h3 태그는 메인 챗과 시나리오 챗에서 동일하게 보입니다.

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

// --- [수정] 시나리오 챗(기본) CSS 규칙 ---
const initialScenarioCssState = {
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
  h3: `  color: var(--Purple-03, #634de2);
  font-size: 14px;
  font-weight: 700;
  margin-bottom: -15px !important; 
  letter-spacing: -0.14px;`,
  p: `  /* 기본 p 스타일 (root에서 상속됨) */
  /* 메인 챗에서 이 스타일을 덮어씁니다. */`,
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
  /* margin-left: 200px; (ul에서 padding-left로 대체) */`,
  code: `  font-family: var(--font-geist-mono), monospace;
  background-color: var(--button-hover-bg); /* 코드 배경 */
  padding: 2px 5px;
  border-radius: 4px;
  font-size: 0.9em;
  word-wrap: break-word; /* 코드 줄바꿈 */`,
  table: `  border-collapse: collapse;
  min-width: 100%; /* 100% 너비를 최소로 보장 */
  table-layout: auto; /* 컬럼 너비가 내용에 따라 자동 조절되도록 */
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

// --- 👇 [추가] 메인 챗 전용 (덮어쓰기) CSS 규칙 ---
const initialMainChatCssState = {
  h1: `  color: #b22222; /* Firebrick - 예시용 빨간색 */
  font-size: 1.5rem; /* 메인 챗 H1은 더 크게 */
  border-bottom: 2px solid #b22222;
  margin-top: 1rem;
  margin-bottom: 0.5rem;`,
  h2: `  color: #4682b4; /* SteelBlue - 예시용 파란색 */
  font-size: 1.25rem;
  margin-top: 0.8rem;
  margin-bottom: 0.4rem;`,
  p: `  font-size: 1.05rem; /* 메인 챗 p 태그는 약간 크게 */
  color: #333;`,
  ul: `  margin-bottom: 0px;
  margin-top: -10px;
  /* react-markdown 기본 리스트 스타일 적용을 위해 추가 */
  list-style-type: disc;
  padding-left: 10px;`,
};
// --- 👆 [추가] ---

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
  // --- 👇 [수정] CSS 상태 분리 ---
  const [scenarioCssStyles, setScenarioCssStyles] = useState(initialScenarioCssState);
  const [mainChatCssStyles, setMainChatCssStyles] = useState(initialMainChatCssState);
  // --- 👆 [수정] ---
  const [isPreviewMainChat, setIsPreviewMainChat] = useState(false);
  
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

  // --- 👇 [수정] 두 CSS 상태를 모두 동적 스타일에 주입 ---
  useEffect(() => {
    const styleTag = document.getElementById(DYNAMIC_STYLE_ID);
    if (styleTag) {
      // 1. Build Scenario (Base) Styles
      const scenarioCssString = Object.entries(scenarioCssStyles)
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
        
      // 2. Build Main Chat (Override) Styles
      const mainChatCssString = Object.entries(mainChatCssStyles)
        .map(([key, value]) => {
          // Main chat styles are applied INSIDE the mainChatMarkdown wrapper
          // --- [수정] 덮어쓰는 값이 비어있지 않은 경우에만 규칙 생성 ---
          if (value && value.trim() !== '') {
            return `.${mainMarkdownStyles.mainChatMarkdown} ${key} {\n${value}\n}`;
          }
          return ''; // 값이 비어있으면 규칙 생성 안 함
        })
        .filter(Boolean) // 빈 문자열 제거
        .join('\n\n');

      // 3. Combine and inject
      styleTag.innerHTML = scenarioCssString + '\n\n' + mainChatCssString;
    }
  }, [scenarioCssStyles, mainChatCssStyles]); // 두 상태 모두에 의존
  // --- 👆 [수정] ---

  // --- 👇 [수정] CSS 규칙 업데이트 핸들러 (타입 분기) ---
  const handleCssRuleChange = (type, key, value) => {
    if (type === 'scenario') {
      setScenarioCssStyles(prev => ({ ...prev, [key]: value }));
    } else if (type === 'main') {
      setMainChatCssStyles(prev => ({ ...prev, [key]: value }));
    }
  };
  // --- 👆 [수정] ---

  return (
    <div className={styles.pageWrapper}>
      <header className={styles.header}>
        <h1>Markdown 렌더러 샌드박스</h1>
        <p>마크다운 입력(AS-IS)과 스타일(CSS)을 수정하여 실시간으로 렌더링 결과(TO-BE)를 확인합니다.</p>
        <Link href="/">← 챗봇으로 돌아가기</Link>
      </header>

      {/* --- [수정] 2열 레이아웃 --- */}
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

        {/* 2. 렌더링 결과 영역 (토글 기능 추가) */}
        <div className={styles.previewContainer}>
          {/* --- 👇 [추가] 헤더 및 토글 버튼 --- */}
          <div className={styles.previewHeader}>
            <h2>
              {isPreviewMainChat ? "TO-BE (Main Chat)" : "TO-BE (Scenario Chat)"}
            </h2>
            <button
              className={`${styles.toggleButton} ${isPreviewMainChat ? styles.active : ""}`}
              onClick={() => setIsPreviewMainChat(!isPreviewMainChat)}
            >
              {isPreviewMainChat ? "Showing Main Chat" : "Showing Scenario"}
            </button>
          </div>
          {/* --- 👆 [추가] --- */}
          
          <div className={styles.previewBox}>
            <div className={`${chatStyles.message} ${chatStyles.botMessage}`}>
              <div className={chatStyles.scenarioMessageContentWrapper}>
                <LogoIcon /> 
                <div className={chatStyles.messageContent}>
                  {/* --- 👇 [수정] 조건부 클래스 적용 --- */}
                  <div className={`${markdownStyles.markdownContent} ${
                      isPreviewMainChat ? mainMarkdownStyles.mainChatMarkdown : ""
                    }`}
                  >
                    <Markdown 
                      remarkPlugins={[remarkGfm]} 
                      components={markdownComponents}
                    >
                      {markdownInput}
                    </Markdown>
                  </div>
                  {/* --- 👆 [수정] --- */}
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* --- [수정] --- */}

        {/* 3. CSS 편집 영역 (하단 전체 너비) */}
        <div className={styles.cssEditorContainer}>
          {/* --- 👇 [수정] 헤더 텍스트 동적 변경 --- */}
          <h2>
            스타일시트 ({isPreviewMainChat ? "Main Chat (Overrides)" : "Scenario Chat (Base)"})
          </h2>
          {/* --- 👆 [수정] --- */}
          
          {/* --- 👇 [수정] CSS 편집기 조건부 렌더링 --- */}
          {!isPreviewMainChat ? (
            // Scenario CSS Editor
            <div className={styles.cssEditorGrid}>
              {Object.entries(scenarioCssStyles).map(([key, value]) => (
                <div key={key} className={styles.cssRuleEditor}>
                  <label className={styles.cssRuleLabel}>
                    {/* [수정] "및 Main" 문구 제거 */}
                    {key === 'root' ? `.${markdownStyles.markdownContent}` : 
                     key === 'tableWrapper' ? `.${markdownStyles.tableWrapper}` : 
                     `${key}`}
                  </label>
                  <textarea
                    className={`${styles.textarea} ${styles.codeArea} ${styles.cssRuleTextarea}`}
                    value={value}
                    onChange={(e) => handleCssRuleChange('scenario', key, e.target.value)}
                    spellCheck="false"
                  />
                </div>
              ))}
            </div>
          ) : (
            // Main Chat CSS Editor (Overrides)
            <div className={styles.cssEditorGrid}>
              {/* [수정] scenarioCssStyles의 키를 기준으로 순회 */}
              {Object.keys(scenarioCssStyles).map((key) => (
                <div key={key} className={styles.cssRuleEditor}>
                  <label className={styles.cssRuleLabel}>
                    {/* [수정] 라벨을 Main Chat 기준으로 표시 */}
                    {key === 'root' ? `.${mainMarkdownStyles.mainChatMarkdown}` : 
                     key === 'tableWrapper' ? `.${mainMarkdownStyles.mainChatMarkdown} .${markdownStyles.tableWrapper}` : 
                     `.${mainMarkdownStyles.mainChatMarkdown} ${key}`}
                  </label>
                  <textarea
                    className={`${styles.textarea} ${styles.codeArea} ${styles.cssRuleTextarea}`}
                    // [수정] 값은 mainChatCssStyles에서 가져오되, 없으면 빈 문자열
                    value={mainChatCssStyles[key] || ''} 
                    // [수정] onChange는 항상 'main' 상태를 변경
                    onChange={(e) => handleCssRuleChange('main', key, e.target.value)}
                    spellCheck="false"
                    // [수정] mainChatCssStyles에 값이 없으면 placeholder 표시
                    placeholder={
                      !mainChatCssStyles[key] 
                        ? `` 
                        : ''
                    }
                  />
                </div>
              ))}
            </div>
          )}
          {/* --- 👆 [수정] --- */}
        </div>
      </div>
    </div>
  );
}