import { Geist, Geist_Mono } from "next/font/google";
import ThemeApplier from './components/ThemeApplier';
import Toast from "./components/Toast"; // Toast 컴포넌트 import
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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeApplier>
          <Toast />
          {children}
        </ThemeApplier>
      </body>
    </html>
  );
}