import type { Metadata, Viewport } from "next";
import { Gowun_Dodum } from "next/font/google";
import "./globals.css";

const gowun = Gowun_Dodum({ weight: "400", subsets: ["latin"], variable: "--font-gowun" });

export const metadata: Metadata = {
  title: "온라인 벚꽃놀이",
  description: "사람 많은 데 가지 말고, 온라인으로 벚꽃 구경해요.",
  icons: { icon: "/logo.png" },
};

export const viewport: Viewport = { themeColor: "#f7a8be", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${gowun.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
