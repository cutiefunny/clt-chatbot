import { render, screen } from '@testing-library/react';
import InitialGreeting from '../app/components/InitialGreeting';

// useTranslations 훅을 모킹하여 번역 기능을 테스트용으로 대체합니다.
jest.mock('../app/hooks/useTranslations', () => ({
  useTranslations: () => ({
    t: (key) => {
      const translations = {
        initialGreetingTitle: '무엇을 도와드릴까요?',
        initialGreetingSubtitle: '자연스럽게 대화를 시작해보세요.',
      };
      // 키에 해당하는 번역문이 있으면 반환하고, 없으면 키 자체를 반환
      return translations[key] || key;
    },
  }),
}));

// 로고 아이콘 등 내부 컴포넌트가 복잡하다면 모킹할 수 있지만, 
// 여기서는 SVG 컴포넌트라 렌더링에 문제가 없을 것으로 예상되어 그대로 둡니다.

describe('InitialGreeting Component', () => {
  it('제목과 부제목이 올바르게 렌더링되어야 한다', () => {
    render(<InitialGreeting />);

    // 모킹된 번역 텍스트가 화면에 있는지 확인
    const titleElement = screen.getByText('무엇을 도와드릴까요?');
    const subtitleElement = screen.getByText('자연스럽게 대화를 시작해보세요.');

    expect(titleElement).toBeInTheDocument();
    expect(subtitleElement).toBeInTheDocument();
  });
});