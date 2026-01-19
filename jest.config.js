const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Next.js 앱의 경로 (일반적으로 현재 폴더)
  dir: './',
})

// Jest 커스텀 설정
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'], // 이 설정 때문에 위 파일이 꼭 필요합니다.
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    // jsconfig.json의 path alias 처리 (@/...)
    '^@/(.*)$': '<rootDir>/$1',
  },
}

module.exports = createJestConfig(customJestConfig)