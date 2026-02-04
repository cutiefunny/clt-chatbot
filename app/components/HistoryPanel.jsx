// app/components/HistoryPanel.jsx
"use client";

import dynamic from "next/dynamic";
import {
  useConversations,
  useCreateConversation,
  useDeleteConversation,
  useUpdateTitle,
  usePinConversation,
} from "../hooks/useQueries";
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
const SearchModal = dynamic(() => import("./SearchModal"));
const DevBoardModal = dynamic(() => import("./DevBoardModal"));
const NotificationModal = dynamic(() => import("./NotificationModal"));
const ManualModal = dynamic(() => import("./ManualModal"));

export default function HistoryPanel() {
  const {
    user,
    loadConversation,
    currentConversationId,
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
    scenariosForConversation = {}, // 기본값 설정
    expandedConversationId,
    toggleConversationExpansion,
    handleScenarioItemClick,
    openConfirmModal,
    // 👇 [수정] 아래 Set 객체들이 undefined일 경우를 대비해 기본값(new Set()) 설정
    unreadScenarioSessions = new Set(),
    unreadConversations = new Set(),
    pendingResponses = new Set(),
    completedResponses = new Set(),
  } = useChatStore();
  
  const { t } = useTranslations();

  const { data: conversations = [], isLoading, isError } = useConversations();
  const createMutation = useCreateConversation();
  const deleteMutation = useDeleteConversation();
  const updateTitleMutation = useUpdateTitle();
  const pinMutation = usePinConversation();

  const handleCreate = () => {
    createMutation.mutate("New Chat", {
      onSuccess: (newConvo) => {
        if (newConvo && newConvo.id) {
          loadConversation(newConvo.id);
        }
      },
      onError: (error) => {
        console.error("Failed to create conversation:", error);
      },
    });
  };

  const handleDeleteRequest = (e, convoId) => {
    e.stopPropagation();
    openConfirmModal({
      title: "Alert",
      message: t("deleteConvoConfirm"),
      confirmText: "Delete",
      cancelText: "Cancel",
      onConfirm: () => {
        deleteMutation.mutate(convoId);
      },
      confirmVariant: "danger",
    });
  };

  const handleUpdateTitle = (id, newTitle) => {
    updateTitleMutation.mutate({ id, title: newTitle });
  };

  const handlePin = (id, isPinned) => {
    pinMutation.mutate({ id, isPinned });
  };

  if (isLoading) return <div className={styles.loadingState}>로딩 중...</div>;
  if (isError) return <div className={styles.errorState}>목록을 불러올 수 없습니다.</div>;

  if (!user) return null;

  return (
    <>
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <linearGradient id="spbIconGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3051ea" />
            <stop offset="100%" stopColor="#7f30c5" />
          </linearGradient>
        </defs>
      </svg>
      <div className={`${styles.historyPanel} ${isHistoryPanelOpen ? styles.open : styles.closed}`}>
        <button
          className={`${styles.toggleButton} ${!isHistoryPanelOpen ? styles.floatingToggleButton : ""}`}
          onClick={toggleHistoryPanel}
        >
          <MenuIcon />
        </button>

        <button className={styles.newChatButton} onClick={handleCreate}>
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
                  className={`${styles.iconButton} ${hasUnreadNotifications ? styles.unread : ""}`}
                  onClick={openNotificationModal}
                >
                  <BellIcon />
                </button>
                <button className={styles.iconButton} onClick={openSearchModal}>
                  <SearchIcon />
                </button>
              </div>
            </div>
          </div>

          <div className={styles.panelContent}>
            <button className={styles.sidePanelButton} onClick={handleCreate}>
              <EditIcon />
              <span className={styles.newChatText}>{t("newChat")}</span>
            </button>
            <span className={styles.commonText}>{t("History")}</span>
            
            <div className={styles.conversationList}>
              {conversations.length > 0 &&
                conversations.map((convo) => {
                  const scenarios = scenariosForConversation[convo.id] || [];
                  // 👇 [해결] 옵셔널 체이닝 및 기본값 보장으로 .has() 에러 방지
                  const hasUnread = unreadConversations?.has?.(convo.id) || false;
                  const isPending = pendingResponses?.has?.(convo.id) || false;
                  const hasCompleted = completedResponses?.has?.(convo.id) || false;

                  return (
                    <ConversationItem
                      key={convo.id}
                      convo={convo}
                      isActive={convo.id === currentConversationId}
                      onClick={loadConversation}
                      onDelete={handleDeleteRequest}
                      onUpdateTitle={handleUpdateTitle}
                      onPin={handlePin}
                      isExpanded={convo.id === expandedConversationId}
                      scenarios={scenarios}
                      onToggleExpand={toggleConversationExpansion}
                      onScenarioClick={handleScenarioItemClick}
                      unreadScenarioSessions={unreadScenarioSessions}
                      hasUnreadScenarios={hasUnread}
                      isPending={isPending}
                      hasCompletedResponse={hasCompleted}
                    />
                  );
                })}
              {conversations.length === 0 && (
                <div className={styles.historyTileWrapper}>
                  <div className={styles.noHistoryBox}>
                    <NoHistoryIcon />
                    <span className={styles.noHistoryText}>{t("noHistory")}</span>
                  </div>
                </div>
              )}
            </div>
            <div className={styles.footer}>
              <div className={styles.avatarWrapper} onClick={openProfileModal}>
                <img src={user.photoURL} alt="User Avatar" className={styles.userAvatar} />
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