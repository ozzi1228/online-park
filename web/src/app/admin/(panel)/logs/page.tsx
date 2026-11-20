import { connection } from "next/server";
import Link from "next/link";
import { and, desc, eq, gte, like, lt, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { eventLog } from "@/db/schema";
import { eventLabel } from "@/lib/event-labels";
import { kst } from "@/lib/format";

const PAGE = 50;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export const instant = false; // 관리자 화면은 항상 요청 때 최신 데이터로

export default async function Logs({ searchParams }: PageProps<"/admin/logs">) {
  await connection();
  const q = await searchParams;
  const type = one(q.type), user = one(q.user).trim(), who = one(q.who), from = one(q.from), to = one(q.to);
  const page = Math.max(1, Number(one(q.page)) || 1);

  const where: SQL[] = [];
  if (type) where.push(eq(eventLog.type, type));
  if (user) where.push(like(eventLog.userId, `%${user.replace(/[%_]/g, "")}%`));
  if (who === "member") where.push(eq(eventLog.isGuest, false));
  if (who === "guest") where.push(eq(eventLog.isGuest, true));
  // 날짜는 한국 시각 기준
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) where.push(gte(eventLog.at, new Date(`${from}T00:00:00+09:00`)));
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) where.push(lt(eventLog.at, new Date(new Date(`${to}T00:00:00+09:00`).getTime() + 86_400_000)));

  const [rows, types] = await Promise.all([
    db.select().from(eventLog).where(where.length ? and(...where) : undefined).orderBy(desc(eventLog.id)).limit(PAGE + 1).offset((page - 1) * PAGE),
    db.execute(sql`select distinct type from event_log order by type`),
  ]);
  const more = rows.length > PAGE;
  const link = (p: number) => `?${new URLSearchParams({ ...(type && { type }), ...(user && { user }), ...(who && { who }), ...(from && { from }), ...(to && { to }), page: String(p) })}`;
  const field = "rounded-lg bg-white px-3 py-2 ring-1 ring-black/10";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl">로그</h1>
      <form className="grid grid-cols-2 gap-2 text-sm md:grid-cols-6">
        <select name="type" defaultValue={type} className={`${field} col-span-2`} aria-label="종류">
          <option value="">모든 종류</option>
          {types.map((t) => <option key={String(t.type)} value={String(t.type)}>{eventLabel(String(t.type))}</option>)}
        </select>
        <input name="user" defaultValue={user} placeholder="유저 ID" className={field} aria-label="유저 ID" />
        <select name="who" defaultValue={who} className={field} aria-label="회원 구분">
          <option value="">회원·비회원</option><option value="member">회원만</option><option value="guest">비회원만</option>
        </select>
        <input name="from" type="date" defaultValue={from} className={field} aria-label="시작 날짜" />
        <input name="to" type="date" defaultValue={to} className={field} aria-label="끝 날짜" />
        <button className="col-span-2 rounded-full bg-sakura py-2 text-white md:col-span-6 md:w-32 md:justify-self-end">검색</button>
      </form>

      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-black/5">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-sakura/10 text-left text-xs">
            <tr><th className="p-2">시각 (KST)</th><th className="p-2">종류</th><th className="p-2">유저</th><th className="p-2">내용</th><th className="p-2">IP</th></tr>
          </thead>
          <tbody>
            {rows.slice(0, PAGE).map((r) => (
              <tr key={r.id} className="border-t border-black/5 align-top">
                <td className="whitespace-nowrap p-2 tabular-nums opacity-70">{kst(r.at)}</td>
                <td className="whitespace-nowrap p-2">{eventLabel(r.type)}</td>
                <td className="p-2">
                  {r.userId ? <Link href={`/admin/users/${r.userId}`} className="font-mono text-xs hover:underline">{r.userId.slice(0, 10)}</Link> : "—"}
                  {r.isGuest && <span className="ml-1 rounded bg-black/5 px-1 text-[10px]">비회원</span>}
                </td>
                <td className="max-w-md break-all p-2 font-mono text-xs opacity-80">{Object.keys(r.data as object).length ? JSON.stringify(r.data) : ""}</td>
                <td className="p-2 font-mono text-[10px] opacity-50">{r.ipHash?.slice(0, 8) ?? ""}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center opacity-60">조건에 맞는 기록이 없어요</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between text-sm">
        {page > 1 ? <Link href={link(page - 1)} className="hover:underline">← 최신</Link> : <span />}
        <span className="opacity-60">{page}쪽</span>
        {more ? <Link href={link(page + 1)} className="hover:underline">이전 기록 →</Link> : <span />}
      </div>
    </div>
  );
}
