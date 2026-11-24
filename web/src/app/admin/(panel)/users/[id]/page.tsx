import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { account, eventLog, greenLedger, notes, petalCatches, user } from "@/db/schema";
import { NoteView } from "@/app/park/note";
import type { Strokes } from "@/lib/notes-shared";
import { eventLabel } from "@/lib/event-labels";
import { kst } from "@/lib/format";
import { PRESETS } from "@/game/presets";
import { DeleteUserButton } from "./delete-button";

// 문의 대응용: 한 사람의 모든 것 (계정, 캐릭터, 그린, 운세꽃잎, 행동 타임라인)
export const instant = false; // 관리자 화면은 항상 요청 때 최신 데이터로

export default async function UserDetail({ params }: PageProps<"/admin/users/[id]">) {
  await connection();
  const { id } = await params;
  const [u] = await db.select().from(user).where(eq(user.id, id));
  if (!u) notFound();
  // 비회원 시절 ID도 같이 (회원 전환 기록으로 연결)
  const linked = await db.select({ data: eventLog.data }).from(eventLog).where(sql`${eventLog.type} = 'guest.linked' and ${eventLog.userId} = ${id}`);
  const ids = [id, ...linked.map((l) => String((l.data as { guestId?: string }).guestId)).filter(Boolean)];
  const idMatch = or(...ids.map((x) => eq(eventLog.userId, x)));

  const [accounts, ledger, catches, timeline, noteRows, treeRows] = await Promise.all([
    db.select({ providerId: account.providerId, createdAt: account.createdAt }).from(account).where(eq(account.userId, id)),
    db.select().from(greenLedger).where(eq(greenLedger.userId, id)).orderBy(desc(greenLedger.id)).limit(100),
    db.select().from(petalCatches).where(eq(petalCatches.userId, id)).orderBy(desc(petalCatches.id)).limit(30),
    db.select().from(eventLog).where(idMatch).orderBy(desc(eventLog.id)).limit(300),
    db.select().from(notes).where(and(ne(notes.kind, "tree"), or(eq(notes.authorId, id), eq(notes.recipientId, id)))).orderBy(desc(notes.id)).limit(12),
    db.select().from(notes).where(and(eq(notes.kind, "tree"), eq(notes.authorId, id))).orderBy(desc(notes.id)).limit(12),
  ]);
  const balance = ledger.reduce((s, r) => s + r.amount, 0);
  const box = "rounded-2xl bg-white p-4 ring-1 ring-black/5";

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/users" className="text-sm opacity-60 hover:underline">← 유저 목록</Link>
      <h1 className="flex flex-wrap items-center gap-2 text-2xl">
        {u.nickname ?? "(캐릭터 미정)"}
        <span className={`rounded px-2 text-sm ${u.isAnonymous ? "bg-black/5" : "bg-sakura/20"}`}>{u.isAnonymous ? "비회원" : "회원"}</span>
        <span className="ml-auto"><DeleteUserButton id={u.id} name={u.nickname ?? u.name} /></span>
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
          <h2 className="mb-2 font-bold">소원나무에 단 쪽지 <span className="text-sm font-normal opacity-60">최근 {treeRows.length}장</span></h2>
          <ul className="grid grid-cols-3 gap-3 md:grid-cols-6">
            {treeRows.map((nt) => (
              <li key={nt.id} className="flex flex-col items-center gap-1 text-xs">
                <NoteView strokes={nt.strokes as Strokes} className="w-full" />
                <span className="opacity-70">{nt.covered ? "가림 · " : ""}{kst(nt.createdAt).slice(5, 16)}</span>
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
