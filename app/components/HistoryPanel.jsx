"use client";
import { useChatStore } from "../store";
import { useTranslations } from "../hooks/useTranslations";
import styles from "./HistoryPanel.module.css";
import ProfileModal from "./ProfileModal";
import SearchModal from "./SearchModal";
import DevBoardModal from "./DevBoardModal";
import NotificationModal from "./NotificationModal";
import ManualModal from "./ManualModal";
import ConversationItem from "./ConversationItem";
import MenuIcon from "./icons/MenuIcon";
import BellIcon from "./icons/BellIcon";
import SearchIcon from "./icons/SearchIcon";
import ManualIcon from "./icons/ManualIcon";
import NewChatIcon from "./icons/NewChatIcon";
import NoHistoryIcon from "./icons/NoHistoryIcon";
import HistoryIcon from "./icons/HistoryIcon";
import EditIcon from "./icons/EditIcon";

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
    unreadScenarioSessions, // --- 争 [ｶ緋ｰ ]
  } = useChatStore();
  const { t } = useTranslations();

  if (!user) return null;

  const handleDeleteRequest = (e, convoId) => {
    e.stopPropagation();
    openConfirmModal({
      title: t("deleteConvoConfirm"),
      message: getConvoTitle(convoId),
      confirmText: "Delete",
      cancelText: "Cancel",
      onConfirm: () => deleteConversation(convoId),
      confirmVariant: "danger",
    });
  };

  function getConvoTitle(convoId) {
    return conversations.find((convo) => convo.id === convoId)?.title;
  }

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
        <button
          className={styles.newChatButton}
          onClick={createNewConversation}
        >
          <NewChatIcon />
        </button>
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
                className={styles.newChatButton}
                onClick={createNewConversation}
              >
                <EditIcon />
                <span className={styles.newChatText}>{t("newChat")}</span>
              </button>
            )}
          </div>

          <div className={styles.panelContent}>
            <span className={styles.commonText}>{t("History")}</span>
            <div className={styles.conversationList}>
              {conversations.map((convo) => (
                <ConversationItem
                  key={convo.id}
                  convo={convo}
                  isActive={convo.id === currentConversationId}
                  onClick={loadConversation}
                  onDelete={handleDeleteRequest}
                  onUpdateTitle={updateConversationTitle}
                  onPin={pinConversation}
                  isExpanded={convo.id === expandedConversationId}
                  scenarios={scenariosForConversation[convo.id]}
                  onToggleExpand={toggleConversationExpansion}
                  onScenarioClick={handleScenarioItemClick}
                  unreadScenarioSessions={unreadScenarioSessions} // --- 争 [ｶ緋ｰ ]
                />
              ))}
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
