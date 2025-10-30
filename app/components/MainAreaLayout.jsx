"use client";

import Chat from "./Chat";
import ChatInput from "./ChatInput";
import ScenarioChat from "./ScenarioChat";
import styles from "../page.module.css";
import chatStyles from "./Chat.module.css";
import MoonIcon from "./icons/MoonIcon";

export default function MainAreaLayout({
  historyPanelWidth,
  scenarioPanelClasses,
  activePanel,
  fontSize,
  setFontSize,
  theme,
  setTheme,
}) {
  return (
    <div
      className={styles.mainArea}
      style={{
        paddingLeft: historyPanelWidth,
      }}
    >
      <div className={styles.sharedHeader}>
        <div className={chatStyles.header}>
          <div className={chatStyles.headerButtons}>
            {/* 테마 및 폰트 크기 버튼 (현재 숨김 처리됨) */}
            <div
              className={chatStyles.settingControl}
              style={{ display: "none" }}
            >
              <span className={chatStyles.settingLabel}>Large text</span>
              <label className={chatStyles.switch}>
                <input
                  type="checkbox"
                  checked={fontSize === "default"}
                  onChange={() =>
                    setFontSize(fontSize === "default" ? "small" : "default")
                  }
                />
                <span className={chatStyles.slider}></span>
              </label>
            </div>
            <div
              className={chatStyles.separator}
              style={{ display: "none" }}
            ></div>
            <div style={{ display: "none" }}>
              <button
                className={chatStyles.themeToggleButton}
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              >
                <MoonIcon />
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className={styles.panelsWrapper}>
        <div className={styles.contentAndInputWrapper}>
          <Chat />
          <ChatInput />
        </div>
        <div className={scenarioPanelClasses.join(" ")}>
          {activePanel === "scenario" && <ScenarioChat />}
        </div>
      </div>
    </div>
  );
}
