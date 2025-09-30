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
    openScenarioPanel,
    openConfirmModal,
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
            <button
              className={styles.sidePanelButton}
              onClick={createNewConversation}
              disabled={currentConversationId === null}
              aria-disabled={currentConversationId === null}
            >
              <NewChatIcon />
              <span>{t("newChat")}</span>
            </button>
          </div>

          <div className={styles.panelContent}>
            <span className={styles.commonText}>{t("History")}</span>
            <div className={styles.conversationList}>
              {conversations.length > 0 ? (
                conversations.map((convo) => (
                  <ConversationItem
                    key={convo.id}
                    convo={convo}
                    isActive={convo.id === currentConversationId}
                    onClick={loadConversation}
                    onDelete={handleDeleteRequest}
                    onUpdateTitle={updateConversationTitle}
                    onPin={pinConversation}
                    scenarios={scenariosForConversation[convo.id]}
                    onScenarioClick={openScenarioPanel}
                  />
                ))
              ) : (
                <div className={styles.historyTileWrapper}>
                  <div className={styles.noHistoryBox}>
                    <NoHistoryIcon />
                    {t("noHistory")}
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
