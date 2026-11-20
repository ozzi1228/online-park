import { connection } from "next/server";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { inquiries } from "@/db/schema";
import { kst } from "@/lib/format";
import { INQUIRY_CATEGORIES, INQUIRY_STATUS } from "@/lib/inquiry";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export const instant = false; // 관리자 화면은 항상 요청 때 최신 데이터로

export default async function Inquiries({ searchParams }: PageProps<"/admin/inquiries">) {
  await connection();
  const status = one((await searchParams).status) || "open";
  const rows = await db.select().from(inquiries).where(status === "all" ? undefined : eq(inquiries.status, status)).orderBy(desc(inquiries.id)).limit(100);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl">문의</h1>
      <div className="flex flex-wrap gap-2">
        {["open", "answered", "closed", "all"].map((s) => (
          <Link key={s} href={`?status=${s}`} className={`rounded-full px-3 py-1 text-sm ${status === s ? "bg-sakura text-white" : "bg-white ring-1 ring-black/10"}`}>{s === "all" ? "전체" : INQUIRY_STATUS[s]}</Link>
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((q) => (
          <li key={q.id}>
            <Link href={`/admin/inquiries/${q.id}`} className="block rounded-2xl bg-white px-4 py-3 text-sm ring-1 ring-black/5 hover:ring-sakura/50">
              <p className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded px-1.5 ${q.status === "open" ? "bg-amber-100" : q.status === "answered" ? "bg-emerald-100" : "bg-black/5"}`}>{INQUIRY_STATUS[q.status]}</span>
                <span>{INQUIRY_CATEGORIES[q.category as keyof typeof INQUIRY_CATEGORIES] ?? q.category}</span>
                <span className="font-bold">{q.nickname ?? "(닉네임 없음)"}</span>
                {q.isGuest && <span className="rounded bg-black/5 px-1">비회원</span>}
                <span className="ml-auto opacity-50">{kst(q.createdAt)}</span>
              </p>
              <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap">{q.content}</p>
            </Link>
          </li>
        ))}
        {rows.length === 0 && <li className="p-6 text-center text-sm opacity-60">문의가 없어요</li>}
      </ul>
    </div>
  );
}
