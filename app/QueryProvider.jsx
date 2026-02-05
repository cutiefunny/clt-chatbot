// app/QueryProvider.jsx
'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { CACHE_DURATIONS } from './lib/constants';

export default function QueryProvider({ children }) {
  // useState를 사용하여 클라이언트별로 인스턴스가 하나만 생성되도록 보장합니다.
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // 창이 포커스될 때마다 데이터를 다시 불러오는 것을 방지 (원하는 대로 설정 가능)
        refetchOnWindowFocus: false, 
        // 데이터가 '상한(stale)' 것으로 간주되기 전까지의 시간 (예: 1분)
        staleTime: CACHE_DURATIONS.QUERY_STALE_TIME,
        retry: 1, // API 실패 시 재시도 횟수
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* 개발 모드에서만 보이는 디버깅 툴 */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}