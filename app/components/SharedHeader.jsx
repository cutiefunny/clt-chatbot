"use client";

import HistoryPanel from "./HistoryPanel";
import ScenarioModal from "./ScenarioModal";
import DevStateDisplay from "./DevStateDisplay";
import MainAreaLayout from "./MainAreaLayout";
import CloseIcon from "./icons/CloseIcon";
import {
  postToParent,
  PARENT_ORIGIN,
  delayParentAnimationIfNeeded,
} from "../lib/parentMessaging";
import styles from "./SharedHeader.module.css";
import ScenarioExpandIcon from "./icons/ScenarioExpandIcon";

export default function SharedHeader({
  isInitializing,
  shouldHidePanel,
  historyPanelWidth,
  scenarioPanelClasses,
  activePanel,
  fontSize,
  setFontSize,
  theme,
  setTheme,
  isScenarioModalOpen,
  isDevMode,
}) {
  const headerClasses = [styles.chatHeader];

  if (isInitializing) {
    headerClasses.push(styles.full);
  } else if (shouldHidePanel) {
    headerClasses.push(styles.half);
  }

  const hideMainContent = isInitializing || shouldHidePanel;

  return (
    <div className={styles.chatContainer}>
      <div className={headerClasses.join(" ")}>
        <div className={styles.headerContent}>
          <span className={styles.headerTitle}>AI Chatbot</span>
          <button className={styles.headerButton}>
            <ScenarioExpandIcon />
          </button>
          <button
            className={styles.headerButton}
            onClick={async () => {
              console.log(
                `[Call Window Method] callChatbotClose to ${PARENT_ORIGIN}`
              );
              postToParent("callChatbotClose", { state: "close" });
              await delayParentAnimationIfNeeded();
            }}
          >
            <CloseIcon />
          </button>
        </div>
        <div className={styles.splashContainer}>aa</div>
      </div>
      <div className={styles.chatLayout}>
        {!shouldHidePanel && <HistoryPanel />}
        <MainAreaLayout
          historyPanelWidth={historyPanelWidth}
          scenarioPanelClasses={scenarioPanelClasses}
          activePanel={activePanel}
          hideMainContent={hideMainContent}
        />
      </div>
      {isScenarioModalOpen && <ScenarioModal />}
      {isDevMode && <DevStateDisplay />}
    </div>
  );
}
