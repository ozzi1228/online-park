import { connection } from "next/server";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { kst } from "@/lib/format";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const STATUS: Record<string, string> = { pending: "결제 중", paid: "완료", failed: "실패", canceled: "취소" };
const n = (v: unknown) => Number(v ?? 0);
const won = (v: number) => `${v.toLocaleString("ko-KR")}원`;

export const instant = false; // 관리자 화면은 항상 요청 때 최신 데이터로

export default async function Payments({ searchParams }: PageProps<"/admin/payments">) {
  await connection();
  const status = one((await searchParams).status);
  const KST_DAY = sql`(created_at at time zone 'Asia/Seoul')::date`;
  const [stats, byAmount, daily, rows, shop] = await Promise.all([
    db.execute(sql`select
        coalesce(sum(amount) filter (where status = 'paid' and ${KST_DAY} = (now() at time zone 'Asia/Seoul')::date), 0) today,
        coalesce(sum(amount) filter (where status = 'paid' and created_at > now() - interval '7 days'), 0) week,
        coalesce(sum(amount) filter (where status = 'paid' and created_at > now() - interval '30 days'), 0) last30,
        coalesce(sum(amount) filter (where status = 'paid'), 0) total,
        count(*) filter (where status = 'paid') paid, count(*) filter (where status = 'failed') failed,
        count(*) filter (where status = 'canceled') canceled, count(distinct user_id) filter (where status = 'paid') payers
      from orders`),
    db.execute(sql`select amount, count(*) c, sum(amount) s from orders where status = 'paid' group by amount order by amount`),
    db.execute(sql`select to_char(${KST_DAY}, 'MM-DD') d, sum(amount) s from orders where status = 'paid' and created_at > now() - interval '14 days' group by 1 order by 1`),
    db.select().from(orders).where(status ? eq(orders.status, status) : undefined).orderBy(desc(orders.createdAt)).limit(100),
    db.execute(sql`select reason, count(*) c, -sum(amount) s from green_ledger where reason like 'shop.%' or reason = 'fountain' group by reason`),
  ]);
  const st = stats[0] ?? {};
  const max = Math.max(1, ...daily.map((r) => n(r.s)));
  const box = "rounded-2xl bg-white p-4 ring-1 ring-black/5";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl">결제</h1>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["오늘 매출", won(n(st.today))], ["최근 7일", won(n(st.week))], ["최근 30일", won(n(st.last30))], ["누적", won(n(st.total))]].map(([l, v]) => (
          <div key={l} className={box}><p className="text-xs opacity-60">{l}</p><p className="mt-1 text-xl tabular-nums">{v}</p></div>
        ))}
      </section>
      <p className="text-sm opacity-70">완료 {n(st.paid)}건 · 결제한 사람 {n(st.payers)}명 · 실패 {n(st.failed)}건 · 취소 {n(st.canceled)}건</p>

      <div className="grid gap-4 md:grid-cols-2">
        <section className={box}>
          <h2 className="mb-2 font-bold">상품별</h2>
          {byAmount.length === 0 ? <p className="text-sm opacity-60">아직 결제가 없어요</p> : byAmount.map((r) => (
            <p key={String(r.amount)} className="flex justify-between border-t border-black/5 py-1.5 text-sm">
              <span>{n(r.amount).toLocaleString("ko-KR")}그린</span><span className="tabular-nums">{n(r.c)}건 · {won(n(r.s))}</span>
            </p>
          ))}
          <h2 className="mb-2 mt-4 font-bold">그린 사용 (매점·분수)</h2>
          {shop.length === 0 ? <p className="text-sm opacity-60">아직 구매가 없어요</p> : shop.map((r) => (
            <p key={String(r.reason)} className="flex justify-between border-t border-black/5 py-1.5 text-sm">
              <span>{r.reason === "shop.notebook" ? "벚꽃잎 노트" : r.reason === "shop.mat" ? "돗자리" : r.reason === "fountain" ? "분수 동전" : String(r.reason)}</span>
              <span className="tabular-nums">{n(r.c)}개 · {n(r.s).toLocaleString("ko-KR")}그린</span>
            </p>
          ))}
        </section>
        <section className={box}>
          <h2 className="mb-3 font-bold">최근 14일 매출</h2>
          {daily.length === 0 ? <p className="text-sm opacity-60">아직 기록이 없어요</p> : (
            <div className="flex h-36 items-end gap-1.5 overflow-x-auto">
              {daily.map((r) => (
                <div key={String(r.d)} className="flex min-w-9 flex-1 flex-col items-center gap-1" title={won(n(r.s))}>
                  <span className="text-[10px] tabular-nums">{(n(r.s) / 1000).toFixed(1)}k</span>
                  <div className="w-full rounded-t-md bg-sakura-deep" style={{ height: `${(n(r.s) / max) * 96}px` }} />
                  <span className="text-[11px] opacity-60">{String(r.d)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className={box}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="font-bold">주문 내역</h2>
          {["", "paid", "pending", "failed", "canceled"].map((s) => (
            <Link key={s} href={s ? `?status=${s}` : "?"} className={`rounded-full px-3 py-1 text-xs ${status === s ? "bg-sakura text-white" : "bg-black/5"}`}>{s ? STATUS[s] : "전체"}</Link>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs opacity-60"><tr><th className="p-2">주문 시각</th><th className="p-2">금액</th><th className="p-2">상태</th><th className="p-2">유저</th><th className="p-2">주문번호 · 사유</th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-t border-black/5 align-top">
                  <td className="whitespace-nowrap p-2 tabular-nums opacity-70">{kst(o.createdAt)}</td>
                  <td className="p-2 tabular-nums">{won(o.amount)}</td>
                  <td className="p-2"><span className={`rounded px-1.5 text-xs ${o.status === "paid" ? "bg-emerald-100" : o.status === "failed" ? "bg-red-100" : "bg-black/5"}`}>{STATUS[o.status] ?? o.status}</span></td>
                  <td className="p-2"><Link href={`/admin/users/${o.userId}`} className="font-mono text-xs hover:underline">{o.userId.slice(0, 10)}</Link></td>
                  <td className="break-all p-2 font-mono text-xs opacity-70">{o.id}{o.failMessage ? ` · ${o.failCode}: ${o.failMessage}` : ""}{o.method ? ` · ${o.method}` : ""}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center opacity-60">주문이 없어요</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
