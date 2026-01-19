import { Geist, Geist_Mono } from "next/font/google";
import ThemeApplier from './components/ThemeApplier';
import Toast from "./components/Toast"; // Toast 컴포넌트 import
import QueryProvider from "./QueryProvider";
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
  applicationName: "CLT-chatbot",
  title: {
    default: "CLT-chatbot",
    template: "CLT-chatbot",
  },
  description: "CLT-chatbot",
  keywords: ["development", "CLT", "chatbot", "software", "web", "app"],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CLT-chatbot",
    // startUpImage: [],
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: "CLT-chatbot",
    title: {
      default: "CLT-chatbot",
      template: "CLT-chatbot",
    },
    description: "CLT-chatbot",
  }
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#FFFFFF",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <QueryProvider>
        <ThemeApplier>
          <Toast />
          {children}
        </ThemeApplier>
        </QueryProvider>
      </body>
    </html>
  );
}

//디자인 merge 후 새롭게 push