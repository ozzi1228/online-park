import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { account, catBonds, eventLog, greenLedger, notes, petalCatches, user } from "@/db/schema";
import { CAT_COATS } from "@/game/cat-brain";
import { effective, heartsOf } from "@/lib/cat-hearts";
import { getSettings } from "@/lib/settings";
import { NoteView } from "@/app/park/note";
import type { Strokes } from "@/lib/notes-shared";
import { eventLabel } from "@/lib/event-labels";
import { kst } from "@/lib/format";
import { PRESETS } from "@/game/presets";
import { DeleteTreeNoteButton, DeleteUserButton } from "./delete-button";
import { forceLogout, grantGreen, resetCat, setCatScore } from "./actions";

// 문의 대응용: 한 사람의 모든 것 (계정, 캐릭터, 그린, 운세꽃잎, 행동 타임라인)
export const instant = false; // 관리자 화면은 항상 요청 때 최신 데이터로

export default async function UserDetail({ params, searchParams }: PageProps<"/admin/users/[id]">) {
  await connection();
  const { id } = await params, q = await searchParams, treeDeleted = !!q.treeDeleted, granted = q.granted, loggedOut = q.loggedOut;
  const [u] = await db.select().from(user).where(eq(user.id, id));
  if (!u) notFound();
  // 비회원 시절 ID도 같이 (회원 전환 기록으로 연결)
  const linked = await db.select({ data: eventLog.data }).from(eventLog).where(sql`${eventLog.type} = 'guest.linked' and ${eventLog.userId} = ${id}`);
  const ids = [id, ...linked.map((l) => String((l.data as { guestId?: string }).guestId)).filter(Boolean)];
  const idMatch = or(...ids.map((x) => eq(eventLog.userId, x)));

  const [accounts, ledger, catches, timeline, noteRows, treeRows, bonds, { catBond: rules }] = await Promise.all([
    db.select({ providerId: account.providerId, createdAt: account.createdAt }).from(account).where(eq(account.userId, id)),
    db.select().from(greenLedger).where(eq(greenLedger.userId, id)).orderBy(desc(greenLedger.id)).limit(100),
    db.select().from(petalCatches).where(eq(petalCatches.userId, id)).orderBy(desc(petalCatches.id)).limit(30),
    db.select().from(eventLog).where(idMatch).orderBy(desc(eventLog.id)).limit(300),
    db.select().from(notes).where(and(ne(notes.kind, "tree"), or(eq(notes.authorId, id), eq(notes.recipientId, id)))).orderBy(desc(notes.id)).limit(12),
    db.select().from(notes).where(and(eq(notes.kind, "tree"), eq(notes.authorId, id))).orderBy(desc(notes.id)).limit(12),
    db.select().from(catBonds).where(eq(catBonds.userId, id)),
    getSettings(),
  ]);
  const balance = ledger.reduce((s, r) => s + r.amount, 0);
  const box = "rounded-2xl bg-white p-4 ring-1 ring-black/5";

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/users" className="text-sm opacity-60 hover:underline">← 유저 목록</Link>
      {treeDeleted && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-700">소원 쪽지를 삭제하고 노트 1장을 돌려줬어요</p>}
      {granted && <p role="status" className={`rounded-xl px-4 py-2 text-sm ${granted === "bad" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{granted === "bad" ? "그린 금액을 확인해 주세요 (0이 아닌 정수)" : `그린 ${granted}을(를) 반영했어요`}</p>}
      {loggedOut && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-700">로그인 세션 {loggedOut}개를 끊었어요 · 공원에 있었다면 30초 안에 첫 화면으로 나가요</p>}
      <h1 className="flex flex-wrap items-center gap-2 text-2xl">
        {u.nickname ?? "(캐릭터 미정)"}
        <span className={`rounded px-2 text-sm ${u.isAnonymous ? "bg-black/5" : "bg-sakura/20"}`}>{u.isAnonymous ? "비회원" : "회원"}</span>
        <span className="ml-auto flex gap-2">
          <form action={forceLogout}><input type="hidden" name="id" value={u.id} />
            <button className="rounded-full px-4 py-1.5 text-sm ring-1 ring-black/10 hover:bg-black/5">강제 로그아웃</button></form>
          <DeleteUserButton id={u.id} name={u.nickname ?? u.name} />
        </span>
      </h1>
      <section className="grid gap-3 md:grid-cols-3">
        <div className={`${box} text-sm`}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="opacity-60">ID</dt><dd className="break-all font-mono text-xs">{u.id}</dd>
            {ids.length > 1 && <><dt className="opacity-60">비회원 시절</dt><dd className="break-all font-mono text-xs">{ids.slice(1).join(", ")}</dd></>}
            <dt className="opacity-60">이름</dt><dd>{u.name}</dd>
            <dt className="opacity-60">이메일</dt><dd className="break-all">{u.isAnonymous ? "—" : u.email}</dd>
            <dt className="opacity-60">로그인</dt><dd>{accounts.map((a) => a.providerId).join(", ") || "—"}</dd>
            <dt className="opacity-60">가입</dt><dd>{kst(u.createdAt)}</dd>
            <dt className="opacity-60">캐릭터</dt><dd>{PRESETS.find((p) => p.id === u.characterPreset)?.name ?? "—"} {u.characterLockedAt && <span className="opacity-60">({kst(u.characterLockedAt)} 확정)</span>}</dd>
          </dl>
        </div>
        <div className={box}>
          <p className="text-xs opacity-60">보유 그린</p>
          <p className="text-2xl tabular-nums">{balance.toLocaleString("ko-KR")}</p>
          <form action={grantGreen} className="mt-2 flex gap-1 text-sm">
            <input type="hidden" name="id" value={u.id} />
            <input name="amount" type="number" step="1" required placeholder="+100 / -50" aria-label="넣을 그린 (빼려면 음수)" className="w-24 rounded-lg bg-cream px-2 py-1 ring-1 ring-black/10" />
            <input name="memo" placeholder="메모 (선택)" aria-label="메모" className="min-w-0 flex-1 rounded-lg bg-cream px-2 py-1 ring-1 ring-black/10" />
            <button className="rounded-full bg-sakura px-3 py-1 text-white">넣기</button>
          </form>
          <ul className="mt-2 max-h-48 overflow-y-auto text-xs">
            {ledger.map((r) => (
              <li key={r.id} className="flex justify-between border-t border-black/5 py-1">
                <span className="opacity-70">{kst(r.createdAt).slice(5, 16)} {r.reason}</span>
                <span className={`tabular-nums ${r.amount < 0 ? "text-red-600" : ""}`}>{r.amount > 0 ? "+" : ""}{r.amount}</span>
              </li>
            ))}
            {ledger.length === 0 && <li className="opacity-50">내역 없음</li>}
          </ul>
        </div>
        <div className={box}>
          <p className="text-xs opacity-60">운세꽃잎</p>
          <p className="text-2xl tabular-nums">{catches.length}<span className="text-sm opacity-60"> 번 (최근 30)</span></p>
          <ul className="mt-2 max-h-48 overflow-y-auto text-xs">
            {catches.map((c) => <li key={c.id} className="border-t border-black/5 py-1 opacity-70">{c.day} · 그날 {c.seq}번째 · {kst(c.createdAt).slice(11, 19)}</li>)}
          </ul>
        </div>
      </section>

      {treeRows.length > 0 && (
        <section className={box}>
          <h2 className="mb-2 font-bold">소원나무에 단 쪽지 <span className="text-sm font-normal opacity-60">최근 {treeRows.length}장 · 삭제하면 노트 1장을 돌려줘요</span></h2>
          <ul className="grid grid-cols-3 gap-3 md:grid-cols-6">
            {treeRows.map((nt) => (
              <li key={nt.id} className="flex flex-col items-center gap-1 text-xs">
                <NoteView strokes={nt.strokes as Strokes} className="w-full" />
                <span className="opacity-70">{nt.covered ? "가림 · " : ""}{kst(nt.createdAt).slice(5, 16)}</span>
                <DeleteTreeNoteButton noteId={nt.id} back={`/admin/users/${id}`} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {noteRows.length > 0 && (
        <section className={box}>
          <h2 className="mb-2 font-bold">주고받은 쪽지 <span className="text-sm font-normal opacity-60">최근 {noteRows.length}장</span></h2>
          <ul className="grid grid-cols-3 gap-3 md:grid-cols-6">
            {noteRows.map((nt) => (
              <li key={nt.id} className="flex flex-col items-center gap-1 text-xs">
                <NoteView strokes={nt.strokes as Strokes} className="w-full" />
                <span className="opacity-70">{nt.authorId === id ? "보냄 →" : `← ${nt.authorNickname ?? "?"}`} · {kst(nt.createdAt).slice(5, 16)}</span>
                {nt.authorId === id && nt.recipientId && <Link href={`/admin/users/${nt.recipientId}`} className="font-mono opacity-50 hover:underline">{nt.recipientId.slice(0, 8)}</Link>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="cats" className={box}>
        <h2 className="mb-2 flex flex-wrap items-center gap-2 font-bold">고양이 호감도 <span className="text-sm font-normal opacity-60">지금 값 = 저장값에서 안 만난 날만큼 뺀 값 · 사용자에겐 하트만 보여요</span>
          <span className="ml-auto flex gap-1 text-xs font-normal">
            <form action={resetCat}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="what" value="churu" /><button className="rounded-full px-3 py-1 ring-1 ring-black/10 hover:bg-black/5">츄르 대기 모두 풀기</button></form>
            <form action={resetCat}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="what" value="bond" /><button className="rounded-full px-3 py-1 text-red-600 ring-1 ring-red-200 hover:bg-red-50">고양이 기록 모두 초기화</button></form>
          </span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs opacity-60">
              <tr><th className="py-1 pr-3">고양이</th><th className="pr-3">지어 준 이름</th><th className="pr-3">호감도</th><th className="pr-3">하트</th><th className="pr-3">마지막으로 만남</th><th className="pr-3">츄르</th><th className="pr-3">질투</th><th className="pr-3">직접 정하기</th><th>초기화</th></tr>
            </thead>
            <tbody>
              {CAT_COATS.map((coat, cat) => {
                const b = bonds.find((x) => x.cat === cat), now = b ? effective(b, rules) : null;
                return (
                  <tr key={cat} className="border-t border-black/5">
                    <td className="py-1.5 pr-3">{coat}</td>
                    <td className="pr-3">{b?.name ?? <span className="opacity-40">—</span>}</td>
                    <td className="pr-3 tabular-nums">{now === null ? <span className="opacity-40">아직 안 만남</span> : <>{Math.round(now)}{b && Math.round(b.score) !== Math.round(now) && <span className="opacity-50"> (저장 {Math.round(b.score)})</span>}</>}</td>
                    <td className="pr-3 text-sakura-deep">{"♥".repeat(heartsOf(now ?? rules.start, rules))}<span className="opacity-30">{"♥".repeat(5 - heartsOf(now ?? rules.start, rules))}</span></td>
                    <td className="pr-3 text-xs opacity-70">{b ? kst(b.lastAt).slice(0, 16) : ""}</td>
                    <td className="pr-3 text-xs opacity-70">{b?.fedAt ? kst(b.fedAt).slice(5, 16) : ""}</td>
                    <td className="pr-3 text-xs opacity-70">{b?.jealousAt ? kst(b.jealousAt).slice(5, 16) : ""}</td>
                    <td>
                      <form action={setCatScore} className="flex gap-1">
                        <input type="hidden" name="id" value={u.id} /><input type="hidden" name="cat" value={cat} />
                        <input name="score" type="number" min={0} max={100} step={1} required defaultValue={now === null ? "" : Math.round(now)} aria-label={`${coat} 호감도`} className="w-16 rounded-lg bg-cream px-2 py-0.5 ring-1 ring-black/10" />
                        <button className="rounded-full px-2 text-xs ring-1 ring-black/10 hover:bg-black/5">저장</button>
                      </form>
                    </td>
                    <td>
                      {b && <span className="flex gap-1 text-xs">
                        {b.fedAt && <form action={resetCat}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="cat" value={cat} /><input type="hidden" name="what" value="churu" /><button className="rounded-full px-2 ring-1 ring-black/10 hover:bg-black/5">츄르 대기 풀기</button></form>}
                        <form action={resetCat}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="cat" value={cat} /><input type="hidden" name="what" value="bond" /><button className="rounded-full px-2 text-red-600 ring-1 ring-red-200 hover:bg-red-50">지우기</button></form>
                      </span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className={box}>
        <h2 className="mb-2 font-bold">타임라인 <span className="text-sm font-normal opacity-60">최근 {timeline.length}건</span></h2>
        <ol className="text-sm">
          {timeline.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-3 border-t border-black/5 py-1.5">
              <span className="w-36 shrink-0 tabular-nums opacity-60">{kst(e.at)}</span>
              <span className="w-40 shrink-0">{eventLabel(e.type)}</span>
              <span className="min-w-0 flex-1 break-all font-mono text-xs opacity-70">{Object.keys(e.data as object).length ? JSON.stringify(e.data) : ""}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
