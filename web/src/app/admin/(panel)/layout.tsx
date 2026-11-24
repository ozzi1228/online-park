import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { logout } from "../login/actions";

export const instant = false; // 관리자 화면은 항상 요청 때 최신 데이터로

const NAV = [
  ["/admin", "대시보드"],
  ["/admin/logs", "로그"],
  ["/admin/users", "유저"],
  ["/admin/inquiries", "문의"],
  ["/admin/payments", "결제"],
  ["/admin/settings", "운영 설정"],
  ["/admin/content", "안내 문구"],
  ["/admin/fortunes", "운세 문구"],
  ["/admin/preview", "시간 미리보기"],
] as const;

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return (
    <div className="flex min-h-dvh flex-col bg-[#fbf7f5] text-[#4a3540]">
      <header className="sticky top-0 z-10 border-b border-sakura/20 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2">
          <span className="mr-2 shrink-0 font-bold text-sakura-deep">🌸 관리자</span>
          <nav className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="shrink-0 rounded-full px-3 py-1.5 text-sm hover:bg-sakura/15">{label}</Link>
            ))}
          </nav>
          <form action={logout} className="shrink-0 border-l border-sakura/20 pl-3"><button className="text-sm opacity-60 hover:opacity-100">로그아웃</button></form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
