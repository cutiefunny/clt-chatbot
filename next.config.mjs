// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // 개발 편의를 위해 false (필요시 true)
  async rewrites() {
    return [
      {
        // 프론트엔드에서 /fastapi/... 로 요청하면
        source: '/fastapi/:path*',
        // 실제로는 외부 백엔드 URL로 연결됨 (CORS 해결)
        destination: 'http://202.20.84.65:8083/:path*',
      },
    ];
  },
};

export default nextConfig;