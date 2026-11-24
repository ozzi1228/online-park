import type { Metadata, Viewport } from "next";
import { Gowun_Dodum } from "next/font/google";
import "./globals.css";

const gowun = Gowun_Dodum({ weight: "400", subsets: ["latin"], variable: "--font-gowun" });

export const metadata: Metadata = {
  title: "온라인 벚꽃놀이",
  description: "사람 많은 데 가지 말고, 온라인으로 벚꽃 구경해요.",
  // 링크 미리보기 이미지는 절대 주소가 필요 → 운영 주소 (도메인 바꾸면 SITE_URL)
  metadataBase: new URL(process.env.SITE_URL ?? "https://sakura-park-8660.japaneast.cloudapp.azure.com"),
  icons: { icon: [{ url: "/favicon-48.png", sizes: "48x48" }, { url: "/icon-192.png", sizes: "192x192" }], apple: "/apple-icon.png" },
  manifest: "/manifest.webmanifest",
  openGraph: { title: "온라인 벚꽃놀이", description: "사람 많은 데 가지 말고, 온라인으로 벚꽃 구경해요.", images: [{ url: "/og.png", width: 1200, height: 630 }], locale: "ko_KR", type: "website" },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export const viewport: Viewport = { themeColor: "#f7a8be", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${gowun.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
