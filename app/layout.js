import { Geist, Geist_Mono } from "next/font/google";
import ThemeApplier from './components/ThemeApplier';
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "CLT Chatbot",
  description: "CLT Chatbot",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      {/* 👇 폰트 클래스와 기본 클래스를 body에 직접 적용합니다. */}
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* 👇 ThemeApplier는 이제 children만 감싸는 역할만 합니다. */}
        <ThemeApplier>
          {children}
        </ThemeApplier>
      </body>
    </html>
  );
}