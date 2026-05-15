import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "건축물관리용품 요청·정산 | 동양미래대학교 시설관리팀",
  description: "동양미래대학교 사무처 시설관리팀 건축물관리용품 요청 및 정산 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
