import Link from "next/link";
import { connection } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { eventLabel } from "@/lib/event-labels";
import { getSettings, kstDate } from "@/lib/settings";

const KST_DAY = sql`(at at time zone 'Asia/Seoul')::date`;
const n = (v: unknown) => Number(v ?? 0);
const fmt = (v: number) => v.toLocaleString("ko-KR");

export const instant = false; // 관리자 화면은 항상 요청 때 최신 데이터로

export default async function Dashboard() {
  await connection(); // "오늘"은 요청 시각 기준으로 계산
  const today = kstDate();
  const [visitors, daily, usage, signups, people, green, wish, live, settings] = await Promise.all([
    db.execute(sql`select is_guest, count(distinct user_id) c from event_log where type = 'park.enter' and ${KST_DAY} = ${today}::date group by is_guest`),
    db.execute(sql`select to_char(${KST_DAY}, 'MM-DD') d,
        count(distinct user_id) filter (where not is_guest) members, count(distinct user_id) filter (where is_guest) guests
      from event_log where type = 'park.enter' and at > now() - interval '14 days' group by 1 order by 1`),
    db.execute(sql`select type, count(*) filter (where ${KST_DAY} = ${today}::date) today, count(*) week
      from event_log where at > now() - interval '7 days' and type not like 'admin.%' group by type order by week desc limit 20`),
    db.execute(sql`select is_guest, count(*) c from event_log where type = 'user.created' and ${KST_DAY} = ${today}::date group by is_guest`),
    db.execute(sql`select count(*) filter (where not coalesce(is_anonymous, false)) members, count(*) filter (where is_anonymous) guests from "user"`),
    db.execute(sql`select coalesce(sum(amount) filter (where amount > 0), 0) issued, coalesce(-sum(amount) filter (where amount < 0), 0) spent,
        coalesce(sum(amount), 0) balance from green_ledger`),
    db.execute(sql`select caught from wish_petal_days where day = ${today}`),
    db.execute(sql`select count(distinct user_id) c from event_log where at > now() - interval '10 minutes'`),
    getSettings(),
  ]);
  const vis = { member: 0, guest: 0 }; for (const r of visitors) vis[r.is_guest ? "guest" : "member"] = n(r.c);
  const sig = { member: 0, guest: 0 }; for (const r of signups) sig[r.is_guest ? "guest" : "member"] = n(r.c);
  const max = Math.max(1, ...daily.map((r) => n(r.members) + n(r.guests)));
  const caught = n(wish[0]?.caught);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl">오늘 ({today})</h1>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="오늘 방문자" value={fmt(vis.member + vis.guest)} sub={`회원 ${fmt(vis.member)} · 비회원 ${fmt(vis.guest)}`} />
        <Stat label="최근 10분 활동" value={fmt(n(live[0]?.c))} sub="움직임이 기록된 사람" />
        <Stat label="오늘 가입" value={fmt(sig.member)} sub={`비회원 입장 ${fmt(sig.guest)}`} />
        <Stat label="소원꽃잎" value={`${fmt(caught)} / ${fmt(settings.wishPetal.dailyTotal)}`} sub={`남은 개수 ${fmt(Math.max(0, settings.wishPetal.dailyTotal - caught))}`} />
        <Stat label="전체 회원" value={fmt(n(people[0]?.members))} sub={`비회원 계정 ${fmt(n(people[0]?.guests))}`} />
        <Stat label="그린 지급 합계" value={fmt(n(green[0]?.issued))} sub="가입 보너스 + 충전" />
        <Stat label="그린 사용 합계" value={fmt(n(green[0]?.spent))} />
        <Stat label="유저 보유 그린" value={fmt(n(green[0]?.balance))} />
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
        <h2 className="mb-3 font-bold">최근 14일 방문자</h2>
        {daily.length === 0 ? <p className="text-sm opacity-60">아직 기록이 없어요</p> : (
          <div className="flex h-40 items-end gap-1.5 overflow-x-auto">
            {daily.map((r) => {
              const m = n(r.members), g = n(r.guests);
              return (
                <div key={String(r.d)} className="flex min-w-8 flex-1 flex-col items-center gap-1" title={`회원 ${m} · 비회원 ${g}`}>
                  <span className="text-[11px] tabular-nums">{m + g}</span>
                  <div className="flex w-full flex-col-reverse overflow-hidden rounded-t-md" style={{ height: `${((m + g) / max) * 100}px` }}>
                    <div className="bg-sakura-deep" style={{ height: `${(m / Math.max(1, m + g)) * 100}%` }} />
                    <div className="flex-1 bg-sakura/50" />
                  </div>
                  <span className="text-[11px] opacity-60">{String(r.d)}</span>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 flex gap-3 text-xs opacity-70"><span><i className="mr-1 inline-block size-2 rounded-sm bg-sakura-deep" />회원</span><span><i className="mr-1 inline-block size-2 rounded-sm bg-sakura/50" />비회원</span></p>
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
        <h2 className="mb-3 font-bold">기능 사용 (오늘 / 최근 7일)</h2>
        <table className="w-full text-sm">
          <tbody>
            {usage.map((r) => (
              <tr key={String(r.type)} className="border-t border-black/5">
                <td className="py-2"><Link href={`/admin/logs?type=${encodeURIComponent(String(r.type))}`} className="hover:underline">{eventLabel(String(r.type))}</Link></td>
                <td className="py-2 text-right tabular-nums">{fmt(n(r.today))}</td>
                <td className="w-24 py-2 text-right tabular-nums opacity-60">{fmt(n(r.week))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
      <p className="text-xs opacity-60">{label}</p>
      <p className="mt-1 text-2xl tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs opacity-60">{sub}</p>}
    </div>
  );
}
