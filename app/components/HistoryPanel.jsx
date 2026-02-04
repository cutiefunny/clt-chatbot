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
    loadInitialMessages, // chatSlice의 메시지 로드 함수
    selectConversation,   // conversationSlice의 선택 함수
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
    scenariosForConversation = {},
    expandedConversationId,
    toggleConversationExpansion,
    handleScenarioItemClick,
    openConfirmModal,
    unreadScenarioSessions = new Set(),
    unreadConversations = new Set(),
    pendingResponses = new Set(),
    completedResponses = new Set(),
  } = useChatStore();
  
  const { t } = useTranslations();

  // 대화 목록 가져오기
  const { data: conversations = [], isLoading, isError } = useConversations();
  const createMutation = useCreateConversation();
  const deleteMutation = useDeleteConversation();
  const updateTitleMutation = useUpdateTitle();
  const pinMutation = usePinConversation();

  const handleCreate = () => {
    createMutation.mutate("New Chat", {
      onSuccess: (newConvo) => {
        if (newConvo && newConvo.id) {
          // selectConversation이 있으면 사용, 없으면 직접 set 로직 수행
          if (selectConversation) {
            selectConversation(newConvo.id);
          } else {
            loadInitialMessages?.(newConvo.id);
          }
        }
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
              {Array.isArray(conversations) && conversations.length > 0 ? (
                conversations.map((convo) => {
                  // 👈 [에러 방지 핵심] convo 항목 자체가 유효한지 검사
                  if (!convo || typeof convo !== 'object' || !convo.id) return null;

                  const scenarios = scenariosForConversation[convo.id] || [];
                  const hasUnread = unreadConversations?.has?.(convo.id) || false;
                  const isPending = pendingResponses?.has?.(convo.id) || false;
                  const hasCompleted = completedResponses?.has?.(convo.id) || false;

                  return (
                    <ConversationItem
                      key={convo.id}
                      convo={convo}
                      isActive={convo.id === currentConversationId}
                      // selectConversation이 있으면 그것을, 없으면 loadInitialMessages를 바인딩
                      onClick={selectConversation || loadInitialMessages}
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
                })
              ) : (
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
                <img src={user.photoURL || "/images/avatar.png"} alt="User Avatar" className={styles.userAvatar} />
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