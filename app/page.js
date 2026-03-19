// app/page.js
"use client";

import { useChatStore } from "../app/store";
import { useState, useEffect } from "react";
import Login from "../app/components/Login";
import Toast from "../app/components/Toast";
import styles from "./page.module.css";
import ConfirmModal from "../app/components/ConfirmModal";
import SharedHeader from "../app/components/SharedHeader";

export default function HomePage() {
  const user = useChatStore((state) => state.user);
  const isHistoryPanelOpen = useChatStore((state) => state.isHistoryPanelOpen);
  const isScenarioModalOpen = useChatStore((state) => state.isScenarioModalOpen);
  const confirmModal = useChatStore((state) => state.confirmModal);
  const closeConfirmModal = useChatStore((state) => state.closeConfirmModal);
  const isDevMode = useChatStore((state) => state.isDevMode);
  const activePanel = useChatStore((state) => state.activePanel);
  const isScenarioPanelExpanded = useChatStore((state) => state.isScenarioPanelExpanded);
  const theme = useChatStore((state) => state.theme);
  const setTheme = useChatStore((state) => state.setTheme);
  const fontSize = useChatStore((state) => state.fontSize);
  const setFontSize = useChatStore((state) => state.setFontSize);

  const handleConfirm = () => {
    if (confirmModal.onConfirm) {
      confirmModal.onConfirm();
    }
    closeConfirmModal();
  };

  const historyPanelWidth = isHistoryPanelOpen ? "320px" : "60px";

  const scenarioPanelClasses = [styles.scenarioPanel];
  if (activePanel === "scenario") {
    scenarioPanelClasses.push(styles.scenarioPanelOpen);
    if (isScenarioPanelExpanded) {
      scenarioPanelClasses.push(styles.scenarioPanelExpanded);
    }
  }

  return (
    <main className={styles.main}>
      <Toast />
      {!user ? (
        <Login />
      ) : (
        <SharedHeader
          isInitializing={false}
          shouldHidePanel={false}
          historyPanelWidth={historyPanelWidth}
          scenarioPanelClasses={scenarioPanelClasses}
          activePanel={activePanel}
          fontSize={fontSize}
          setFontSize={setFontSize}
          theme={theme}
          setTheme={setTheme}
          isScenarioModalOpen={isScenarioModalOpen}
          isDevMode={isDevMode}
        />
      )}
      {confirmModal.isOpen && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText={confirmModal.confirmText}
          cancelText={confirmModal.cancelText}
          onConfirm={handleConfirm}
          onClose={closeConfirmModal}
          confirmVariant={confirmModal.confirmVariant}
        />
      )}
    </main>
  );
}
