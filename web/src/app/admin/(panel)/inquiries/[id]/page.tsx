import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { inquiries } from "@/db/schema";
import { kst } from "@/lib/format";
import { INQUIRY_CATEGORIES, INQUIRY_STATUS } from "@/lib/inquiry";
import { reply } from "../actions";

export const instant = false; // 관리자 화면은 항상 요청 때 최신 데이터로

export default async function InquiryDetail({ params, searchParams }: PageProps<"/admin/inquiries/[id]">) {
  await connection();
  const id = Number((await params).id), saved = (await searchParams).saved;
  if (!Number.isInteger(id)) notFound();
  const [q] = await db.select().from(inquiries).where(eq(inquiries.id, id));
  if (!q) notFound();
  const others = await db.select({ id: inquiries.id, status: inquiries.status, createdAt: inquiries.createdAt, content: inquiries.content })
    .from(inquiries).where(eq(inquiries.userId, q.userId)).orderBy(desc(inquiries.id)).limit(10);
  const box = "rounded-2xl bg-white p-4 ring-1 ring-black/5";

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/inquiries" className="text-sm opacity-60 hover:underline">← 문의 목록</Link>
      <h1 className="text-2xl">문의 #{q.id}</h1>
      <section className={`${box} text-sm`}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="opacity-60">보낸 사람</dt>
          <dd>{q.nickname ?? "—"} {q.isGuest && <span className="rounded bg-black/5 px-1 text-xs">비회원</span>} · <Link href={`/admin/users/${q.userId}`} className="font-mono text-xs hover:underline">{q.userId}</Link></dd>
          <dt className="opacity-60">답변 이메일</dt><dd className="break-all"><a href={`mailto:${q.email}`} className="underline">{q.email}</a></dd>
          <dt className="opacity-60">종류</dt><dd>{INQUIRY_CATEGORIES[q.category as keyof typeof INQUIRY_CATEGORIES] ?? q.category}</dd>
          <dt className="opacity-60">받은 시각</dt><dd>{kst(q.createdAt)}</dd>
          <dt className="opacity-60">상태</dt><dd>{INQUIRY_STATUS[q.status]}{q.repliedAt && ` · 답변 ${kst(q.repliedAt)}`}</dd>
        </dl>
        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-cream p-3">{q.content}</p>
      </section>

      <form action={reply} className={`${box} flex flex-col gap-3`}>
        <input type="hidden" name="id" value={q.id} />
        <label className="flex flex-col gap-1 text-sm">답변 (게임 안 &lsquo;내 문의&rsquo;에 보여요)
          <textarea name="reply" defaultValue={q.reply ?? ""} rows={6} className="rounded-xl bg-cream px-3 py-2 ring-1 ring-black/10" />
        </label>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select name="status" defaultValue={q.status === "open" ? "answered" : q.status} className="rounded-lg bg-cream px-3 py-2 ring-1 ring-black/10" aria-label="상태">
            <option value="answered">답변 완료</option><option value="open">답변 대기</option><option value="closed">종료</option>
          </select>
          <button className="rounded-full bg-sakura px-5 py-2 text-white">저장</button>
          {saved && <span role="status" className="text-emerald-600">저장했어요 ✓</span>}
          <span className="ml-auto text-xs opacity-50">이메일 자동 발송은 메일 서비스 연결 후 (지금은 위 주소로 직접 보내기)</span>
        </div>
      </form>

      {others.length > 1 && (
        <section className={box}>
          <h2 className="mb-2 font-bold">이 사람의 다른 문의</h2>
          <ul className="text-sm">
            {others.filter((o) => o.id !== q.id).map((o) => (
              <li key={o.id} className="border-t border-black/5 py-1.5">
                <Link href={`/admin/inquiries/${o.id}`} className="hover:underline">#{o.id} · {INQUIRY_STATUS[o.status]} · {kst(o.createdAt).slice(0, 16)} · {o.content.slice(0, 40)}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
