// app/hooks/useAutoScroll.js
import { useRef, useCallback, useEffect } from 'react';

/**
 * 채팅창의 자동 스크롤 기능을 관리하는 커스텀 훅
 * @param {Array} dependency - 스크롤 트리거가 될 의존성 배열 (보통 messages)
 * @param {boolean} isLoading - 로딩 상태 (로딩 중일 때 스크롤 조정 등 필요 시 사용)
 * @returns {Object} { scrollRef, scrollToBottom } - 컴포넌트에 연결할 ref와 핸들러
 */
export const useAutoScroll = (dependency = [], isLoading = false) => {
  const scrollRef = useRef(null);
  const wasAtBottomRef = useRef(true);

  // 현재 스크롤이 맨 아래(또는 근처)에 있는지 확인
  const updateWasAtBottom = useCallback(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    
    const { scrollHeight, clientHeight, scrollTop } = scrollContainer;
    const scrollableDistance = scrollHeight - clientHeight - scrollTop;
    
    // 100px 여유를 두어 판단
    wasAtBottomRef.current = scrollableDistance <= 100;
  }, []);

  // 스크롤 이벤트 리스너 등록
  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => updateWasAtBottom();
    scrollContainer.addEventListener('scroll', handleScroll);
    return () => {
        scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [updateWasAtBottom]);

  // 의존성(메시지) 변경 또는 DOM 변화 시 자동 스크롤
  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    const scrollToBottomIfNeeded = () => {
      if (wasAtBottomRef.current) {
        requestAnimationFrame(() => {
          if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
          }
        });
      }
    };

    // MutationObserver: 이미지 로딩, 스트리밍 등으로 인한 높이 변화 감지
    const observer = new MutationObserver(scrollToBottomIfNeeded);
    observer.observe(scrollContainer, { childList: true, subtree: true });
    
    // 의존성 변경 시 실행
    scrollToBottomIfNeeded();

    return () => observer.disconnect();
  }, [dependency, isLoading]);

  // ★ 중요: 강제 스크롤 함수 (외부에서 호출 가능하도록 정의 및 반환)
  const scrollToBottom = useCallback(() => {
      if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          wasAtBottomRef.current = true; // 강제로 맨 아래로 간주
      }
  }, []);

  // 반드시 객체로 반환
  return { scrollRef, scrollToBottom };
};