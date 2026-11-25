import { connection } from "next/server";
import Link from "next/link";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { catBonds, user } from "@/db/schema";
import { CAT_COATS } from "@/game/cat-brain";
import { effective, heartsOf } from "@/lib/cat-hearts";
import { getSettings } from "@/lib/settings";
import { kst } from "@/lib/format";

export const instant = false; // 관리자 화면은 항상 요청 때 최신 데이터로

/** 고양이별로: 만난 사람 수, 하트 분포, 평균, 가장 친한 사람들 (호감도는 지금 값 = 안 만난 날만큼 뺀 값) */
export default async function Cats() {
  await connection();
  const [rows, { catBond: r }] = await Promise.all([db.select().from(catBonds), getSettings()]);
  const ids = [...new Set(rows.map((b) => b.userId))];
  const names = new Map((ids.length ? await db.select({ id: user.id, nickname: user.nickname }).from(user).where(inArray(user.id, ids)) : []).map((u) => [u.id, u.nickname]));
  const box = "rounded-2xl bg-white p-4 ring-1 ring-black/5";
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl">고양이</h1>
        <p className="mt-1 text-sm opacity-60">사람마다 고양이마다 따로인 호감도 (0~100). 기준·오르내리는 양은 운영 설정 → 고양이 호감도에서 바꿔요. 한 사람 값은 유저 화면에서 직접 고칠 수 있어요.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {CAT_COATS.map((coat, cat) => {
          const list = rows.filter((b) => b.cat === cat).map((b) => ({ ...b, now: effective(b, r) })).sort((a, b) => b.now - a.now);
          const dist = [0, 1, 2, 3, 4, 5].map((h) => list.filter((b) => heartsOf(b.now, r) === h).length);
          const avg = list.length ? list.reduce((s, b) => s + b.now, 0) / list.length : 0;
          return (
            <section key={cat} className={box}>
              <h2 className="flex items-baseline gap-2 font-bold">{coat}
                <span className="text-sm font-normal opacity-60">만난 사람 {list.length}명 · 평균 {Math.round(avg)} · 이름 지어 준 사람 {list.filter((b) => b.name).length}명</span></h2>
              <p className="mt-1 flex gap-3 text-xs opacity-70">{dist.map((n, h) => <span key={h}>{h === 0 ? "하트 0" : "♥".repeat(h)} {n}</span>)}</p>
              <ol className="mt-2 text-sm">
                {list.slice(0, 10).map((b) => (
                  <li key={b.userId} className="flex gap-2 border-t border-black/5 py-1">
                    <span className="w-10 shrink-0 tabular-nums">{Math.round(b.now)}</span>
                    <Link href={`/admin/users/${b.userId}#cats`} className="min-w-0 flex-1 truncate hover:underline">{names.get(b.userId) ?? b.userId.slice(0, 8)}</Link>
                    <span className="truncate opacity-70">{b.name ? `“${b.name}”` : ""}</span>
                    <span className="shrink-0 text-xs opacity-50">{kst(b.lastAt).slice(5, 16)}</span>
                  </li>
                ))}
                {list.length === 0 && <li className="opacity-50">아직 만난 사람이 없어요</li>}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}
