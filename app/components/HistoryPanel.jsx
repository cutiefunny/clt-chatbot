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
  const user = useChatStore((state) => state.user);
  const conversations = useChatStore((state) => state.conversations);
  const loadConversation = useChatStore((state) => state.loadConversation);
  const createNewConversation = useChatStore(
    (state) => state.createNewConversation
  );
  const currentConversationId = useChatStore(
    (state) => state.currentConversationId
  );
  const deleteConversation = useChatStore((state) => state.deleteConversation);
  const updateConversationTitle = useChatStore(
    (state) => state.updateConversationTitle
  );
  const pinConversation = useChatStore((state) => state.pinConversation);
  const isHistoryPanelOpen = useChatStore((state) => state.isHistoryPanelOpen);
  const toggleHistoryPanel = useChatStore((state) => state.toggleHistoryPanel);
  const isSearchModalOpen = useChatStore((state) => state.isSearchModalOpen);
  const openSearchModal = useChatStore((state) => state.openSearchModal);
  const isProfileModalOpen = useChatStore((state) => state.isProfileModalOpen);
  const openProfileModal = useChatStore((state) => state.openProfileModal);
  const isDevBoardModalOpen = useChatStore(
    (state) => state.isDevBoardModalOpen
  );
  const isNotificationModalOpen = useChatStore(
    (state) => state.isNotificationModalOpen
  );
  const openNotificationModal = useChatStore(
    (state) => state.openNotificationModal
  );
  const hasUnreadNotifications = useChatStore(
    (state) => state.hasUnreadNotifications
  );
  const isManualModalOpen = useChatStore((state) => state.isManualModalOpen);
  const openManualModal = useChatStore((state) => state.openManualModal);
  const expandedConversationId = useChatStore(
    (state) => state.expandedConversationId
  );
  const scenariosForConversation = useChatStore(
    (state) => state.scenariosForConversation
  );
  const toggleConversationExpansion = useChatStore(
    (state) => state.toggleConversationExpansion
  );
  const handleScenarioItemClick = useChatStore(
    (state) => state.handleScenarioItemClick
  );
  const openConfirmModal = useChatStore((state) => state.openConfirmModal);
  const unreadScenarioSessions = useChatStore(
    (state) => state.unreadScenarioSessions
  );
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
            <button
              className={styles.sidePanelButton}
              onClick={createNewConversation}
            >
              <EditIcon />
              <span className={styles.newChatText}>{t("newChat")}</span>
            </button>
            <div className={styles.commonText}>{t("history")}</div>
            <div className={styles.conversationList}>
              {conversations.length > 0 &&
                conversations.map((convo) => (
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
