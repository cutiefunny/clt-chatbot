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

  return (
    <div className={styles.chatContainer}>
      <div className={headerClasses.join(" ")}>
        <button
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
      <div className={styles.chatLayout}>
        {!shouldHidePanel && <HistoryPanel />}
        <MainAreaLayout
          historyPanelWidth={historyPanelWidth}
          scenarioPanelClasses={scenarioPanelClasses}
          activePanel={activePanel}
          fontSize={fontSize}
          setFontSize={setFontSize}
          theme={theme}
          setTheme={setTheme}
        />
      </div>
      {isScenarioModalOpen && <ScenarioModal />}
      {isDevMode && <DevStateDisplay />}
    </div>
  );
}

