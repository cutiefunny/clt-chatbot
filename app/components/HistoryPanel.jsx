"use client";
import dynamic from "next/dynamic";
import { useChatStore } from "../store";
import { useTranslations } from "../hooks/useTranslations";
import styles from "./HistoryPanel.module.css";
import ConversationItem from "./ConversationItem";
import MenuIcon from "./icons/MenuIcon";
import BellIcon from "./icons/BellIcon";
import SearchIcon from "./icons/SearchIcon";
import EditIcon from "./icons/EditIcon";
import ManualIcon from "./icons/ManualIcon";
import NoHistoryIcon from "./icons/NoHistoryIcon";

const ProfileModal = dynamic(() => import("./ProfileModal"));
const SearchModal = dynamic(() => import("./SearchModal"));
const DevBoardModal = dynamic(() => import("./DevBoardModal"));
const NotificationModal = dynamic(() => import("./NotificationModal"));
const ManualModal = dynamic(() => import("./ManualModal"));

export default function HistoryPanel() {
  const {
    user,
    conversations,
    loadConversation,
    createNewConversation,
    currentConversationId,
    deleteConversation,
    updateConversationTitle,
    pinConversation,
    isHistoryPanelOpen,
    toggleHistoryPanel,
    isSearchModalOpen,
    openSearchModal,
    isProfileModalOpen,
    openProfileModal,
    isDevBoardModalOpen,
    isNotificationModalOpen,
    openNotificationModal,
    hasUnreadNotifications,
    isManualModalOpen,
    openManualModal,
    scenariosForConversation,
    expandedConversationId,
    toggleConversationExpansion,
    handleScenarioItemClick,
    openConfirmModal,
    unreadScenarioSessions,
  } = useChatStore();
  const { t } = useTranslations();

  if (!user) return null;

  const handleDeleteRequest = (e, convoId) => {
    e.stopPropagation();
    openConfirmModal({
      title: "Alert",
      message: t("deleteConvoConfirm"),
      confirmText: "Delete",
      cancelText: "Cancel",
      onConfirm: () => deleteConversation(convoId),
      confirmVariant: "danger",
    });
  };

  return (
    <>
      {/* Global SVG gradient defs for hover fills */}
      <svg
        width="0"
        height="0"
        style={{ position: "absolute", width: 0, height: 0 }}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient
            id="spbIconGradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor="#3051ea" />
            <stop offset="100%" stopColor="#7f30c5" />
          </linearGradient>
        </defs>
      </svg>
      <div
        className={`${styles.historyPanel} ${
          isHistoryPanelOpen ? styles.open : styles.closed
        }`}
      >
        <button
          className={`${styles.toggleButton} ${
            !isHistoryPanelOpen ? styles.floatingToggleButton : ""
          }`}
          onClick={toggleHistoryPanel}
        >
          <MenuIcon />
        </button>
        {currentConversationId && (
          <button
            className={styles.newChatButton}
            onClick={createNewConversation}
          >
            <NewChatIcon />
          </button>
        )}
        <button className={styles.historyButton} onClick={toggleHistoryPanel}>
          <HistoryIcon />
        </button>

        <div className={styles.panelContentWrapper}>
          <div className={styles.header}>
            <div className={styles.headerTopRow}>
              <div className={styles.headerIconGroup}>
                <button
                  className={`${styles.iconButton} ${
                    hasUnreadNotifications ? styles.unread : ""
                  }`}
                  onClick={openNotificationModal}
                >
                  <BellIcon />
                </button>
                <button className={styles.iconButton} onClick={openSearchModal}>
                  <SearchIcon />
                </button>
              </div>
            </div>
            {currentConversationId && (
              <button
                className={styles.sidePanelButton}
                onClick={createNewConversation}
              >
                <EditIcon />
                <span className={styles.newChatText}>{t("newChat")}</span>
              </button>
            )}
          </div>

          <div className={styles.panelContent}>
            {currentConversationId === null && (
              <button
                className={styles.sidePanelButton}
                onClick={createNewConversation}
              >
                <EditIcon />
                <span className={styles.newChatText}>{t("newChat")}</span>
              </button>
            )}
            <span className={styles.commonText}>{t("History")}</span>
            <div className={styles.conversationList}>
              {conversations.length > 0 &&
                conversations.map((convo) => {
                  const scenarios = scenariosForConversation[convo.id] || [];
                  const hasUnread = scenarios.some((scenario) =>
                    unreadScenarioSessions.has(scenario.sessionId)
                  );

                  return (
                    <ConversationItem
                      key={convo.id}
                      convo={convo}
                      isActive={convo.id === currentConversationId}
                      onClick={loadConversation}
                      onDelete={handleDeleteRequest}
                      onUpdateTitle={updateConversationTitle}
                      onPin={pinConversation}
                      isExpanded={convo.id === expandedConversationId}
                      scenarios={scenarios}
                      onToggleExpand={toggleConversationExpansion}
                      onScenarioClick={handleScenarioItemClick}
                      unreadScenarioSessions={unreadScenarioSessions}
                      hasUnreadScenarios={hasUnread}
                    />
                  );
                })}
              {conversations.length === 0 && (
                <div className={styles.historyTileWrapper}>
                  <div className={styles.noHistoryBox}>
                    <NoHistoryIcon />
                    <span className={styles.noHistoryText}>
                      {t("noHistory")}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className={styles.footer}>
              <div className={styles.avatarWrapper} onClick={openProfileModal}>
                <img
                  src={user.photoURL}
                  alt="User Avatar"
                  className={styles.userAvatar}
                />
              </div>
              <button className={styles.iconButton} onClick={openManualModal}>
                <ManualIcon />
              </button>
            </div>
          </div>
        </div>
      </div>

      {isProfileModalOpen && <ProfileModal />}
      {isSearchModalOpen && <SearchModal />}
      {isDevBoardModalOpen && <DevBoardModal />}
      {isNotificationModalOpen && <NotificationModal />}
      {isManualModalOpen && <ManualModal />}
    </>
  );
}
