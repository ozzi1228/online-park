import Link from "next/link";

/** 안내 문구 메뉴 안의 탭: 안내소·운세 문구 / 화면 글자·안내 멘트 (첫 화면·캐릭터 고르기·결제 결과 포함) */
export function TextTabs({ now }: { now: "content" | "messages" }) {
  const tab = (href: string, on: boolean, label: string) => (
    <Link href={href} className={`rounded-full px-4 py-1.5 text-sm ${on ? "bg-sakura text-white" : "bg-white ring-1 ring-black/10 hover:bg-sakura/10"}`}>{label}</Link>
  );
  return (
    <nav className="flex gap-2">
      {tab("/admin/content", now === "content", "안내소·운세 문구")}
      {tab("/admin/messages", now === "messages", "화면 글자·안내 멘트")}
    </nav>
  );
}
