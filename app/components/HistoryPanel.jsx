// app/components/HistoryPanel.jsx
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
import HistoryIcon from "./icons/HistoryIcon";
import NewChatIcon from "./icons/NewChatIcon";

const ProfileModal = dynamic(() => import("./ProfileModal"));
const NotificationModal = dynamic(() => import("./NotificationModal"));
const ManualModal = dynamic(() => import("./ManualModal"));
const SearchModal = dynamic(() => import("./SearchModal"));

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
    isProfileModalOpen,
    openProfileModal,
    isNotificationModalOpen,
    openNotificationModal,
    hasUnreadNotifications,
    isManualModalOpen,
    openManualModal,
    isSearchModalOpen,
    openSearchModal,
    scenariosForConversation,
    expandedConversationId,
    toggleConversationExpansion,
    handleScenarioItemClick,
    openConfirmModal,
    unreadScenarioSessions,
    unreadConversations,
    pendingResponses,
    // --- 👇 [추가] completedResponses 상태 가져오기 ---
    completedResponses,
    // --- 👆 [추가] ---
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
        className={`${styles.historyPanel} ${isHistoryPanelOpen ? styles.open : styles.closed
          }`}
      >
        <button
          className={`${styles.toggleButton} ${!isHistoryPanelOpen ? styles.floatingToggleButton : ""
            }`}
          onClick={toggleHistoryPanel}
        >
          <MenuIcon />
        </button>
        {/* --- 👇 [수정된 부분 시작] --- */}
        {/* currentConversationId가 null이 아닐 때만 (즉, 대화가 로드되었을 때만) 버튼 표시 */}
        {/* --- 👆 [수정된 부분 끝] --- */}
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
                  className={`${styles.iconButton} ${hasUnreadNotifications ? styles.unread : ""
                    }`}
                  onClick={openNotificationModal}
                >
                  <BellIcon />
                </button>
                <button className={styles.iconButton} onClick={openSearchModal} title={t("searchConversations")}>
                  <SearchIcon />
                </button>
              </div>
            </div>
          </div>

          <div className={styles.panelContent}>
            {/* currentConversationId가 null이 아닐 때만 (즉, 대화가 로드되었을 때만) 버튼 표시 */}
            <button
              className={styles.sidePanelButton}
              onClick={createNewConversation}
            >
              <EditIcon />
              <span className={styles.newChatText}>{t("newChat")}</span>
            </button>
            <span className={styles.commonText}>{t("History")}</span>
            <div className={styles.conversationList}>
              {conversations.length > 0 &&
                conversations.map((convo) => {
                  const scenarios = scenariosForConversation[convo.id];
                  const hasUnread = unreadConversations.has(convo.id);
                  const isPending = pendingResponses.has(convo.id);
                  // --- 👇 [추가] hasCompleted 계산 ---
                  const hasCompleted = completedResponses.has(convo.id);
                  // --- 👆 [추가] ---

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
                      isPending={isPending}
                      // --- 👇 [추가] hasCompletedResponse 프롭 전달 ---
                      hasCompletedResponse={hasCompleted}
                    // --- 👆 [추가] ---
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
      {isNotificationModalOpen && <NotificationModal />}
      {isManualModalOpen && <ManualModal />}
      {isSearchModalOpen && <SearchModal />}
    </>
  );
}