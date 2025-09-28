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
import EditIcon from "./icons/EditIcon";
import ManualIcon from "./icons/ManualIcon";
import NewChatIcon from "./icons/NewChatIcon";
import HistoryIcon from "./icons/HistoryIcon";
import ExpandIcon from "./icons/ExpandIcon";

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
    expandedConversationId,
    scenariosForConversation,
    toggleConversationExpansion,
    openScenarioPanel,
    openConfirmModal,
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
            <button
              className={styles.sidePanelButton}
              onClick={createNewConversation}
            >
              <NewChatIcon />
              <span className={styles.sidePanelButtonText}>{t("newChat")}</span>
            </button>
            <button className={styles.sidePanelButton}>
              <HistoryIcon />
              <span className={styles.sidePanelButtonText}>{t("History")}</span>
              {isHistoryPanelOpen && (
                <span className={styles.expandIconWrapper}>
                  <ExpandIcon />
                </span>
              )}
            </button>
          </div>

          <div className={styles.panelContent}>
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
                  onScenarioClick={openScenarioPanel}
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
