// app/hooks/useAutoScroll.js
import { useRef, useCallback, useEffect } from 'react';

/**
 * 채팅창의 자동 스크롤 기능을 관리하는 커스텀 훅
 * @param {Array} dependency - 스크롤 트리거가 될 의존성 배열 (보통 messages)
 * @param {boolean} isLoading - 로딩 상태 (로딩 중일 때 스크롤 조정 등 필요 시 사용)
 * @returns {Object} { scrollRef, scrollToBottom, enableSmoothScroll } - 컴포넌트 연결 객체
 */
export const useAutoScroll = (dependency = [], isLoading = false) => {
  const scrollRef = useRef(null);
  const wasAtBottomRef = useRef(true);
  // --- 👇 [추가] 다음 자동 스크롤 시 부드러운 모션을 적용할지 여부 ---
  const shouldSmoothScrollRef = useRef(false);
  // --- 👆 [추가] ---

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
            // --- 👇 [수정] 플래그에 따라 스크롤 동작 결정 ---
            const behavior = shouldSmoothScrollRef.current ? "smooth" : "auto";
            shouldSmoothScrollRef.current = false; // 사용 후 초기화
            
            scrollContainer.scrollTo({
                top: scrollContainer.scrollHeight,
                behavior: behavior
            });
            // --- 👆 [수정] ---
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
  // --- 👇 [수정] behavior 인자 추가 ---
  const scrollToBottom = useCallback((behavior = "auto") => {
      if (scrollRef.current) {
          scrollRef.current.scrollTo({
              top: scrollRef.current.scrollHeight,
              behavior: behavior
          });
          wasAtBottomRef.current = true; // 강제로 맨 아래로 간주
      }
  }, []);
  // --- 👆 [수정] ---

  // --- 👇 [추가] 다음 업데이트 시 부드러운 스크롤을 활성화하는 함수 ---
  const enableSmoothScroll = useCallback(() => {
      shouldSmoothScrollRef.current = true;
  }, []);
  // --- 👆 [추가] ---

  // 반드시 객체로 반환
  return { scrollRef, scrollToBottom, enableSmoothScroll };
};