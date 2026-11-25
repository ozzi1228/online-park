"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { eventLog, greenLedger, inquiries, inventory, notes, orders, petalCatches, session, user } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { logEvent, requestCtx } from "@/lib/log";

/** 유저 완전 삭제: 계정·로그인 연결·세션과 그 사람의 모든 기록(비회원 시절 ID 포함)을 한 번에 지움. 되돌릴 수 없음 */
export async function deleteUser(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  if (!id) redirect("/admin/users");
  const linked = await db.select({ data: eventLog.data }).from(eventLog).where(sql`${eventLog.type} = 'guest.linked' and ${eventLog.userId} = ${id}`);
  const ids = [id, ...linked.map((l) => String((l.data as { guestId?: string }).guestId ?? "")).filter(Boolean)];
  const counts = await db.transaction(async (tx) => {
    const n = async (q: Promise<unknown[]>) => (await q).length;
    return {
      notes: await n(tx.delete(notes).where(or(inArray(notes.authorId, ids), inArray(notes.recipientId, ids))).returning({ id: notes.id })),
      ledger: await n(tx.delete(greenLedger).where(inArray(greenLedger.userId, ids)).returning({ id: greenLedger.id })),
      petals: await n(tx.delete(petalCatches).where(inArray(petalCatches.userId, ids)).returning({ id: petalCatches.id })),
      orders: await n(tx.delete(orders).where(inArray(orders.userId, ids)).returning({ id: orders.id })),
      items: await n(tx.delete(inventory).where(inArray(inventory.userId, ids)).returning({ id: inventory.userId })),
      inquiries: await n(tx.delete(inquiries).where(inArray(inquiries.userId, ids)).returning({ id: inquiries.id })),
      logs: await n(tx.delete(eventLog).where(inArray(eventLog.userId, ids)).returning({ id: eventLog.id })),
      users: await n(tx.delete(user).where(inArray(user.id, ids)).returning({ id: user.id })), // 세션·로그인 연결은 함께 지워짐(cascade)
    };
  });
  // 관리자 기록에는 누구를 지웠는지만 (지운 사람의 내용은 남기지 않음)
  await logEvent("admin.user.deleted", { userId: id, ...counts }, requestCtx(await headers()));
  redirect(`/admin/users?deleted=${encodeURIComponent(id.slice(0, 8))}`);
}

/** 소원나무 쪽지 하나만 삭제: 나무에서 떼고, 단 사람에게 노트 1장을 돌려줌 */
export async function deleteTreeNote(form: FormData) {
  await requireAdmin();
  const id = Number(form.get("noteId")), back = String(form.get("back") ?? "/admin/users");
  if (!Number.isInteger(id)) redirect(back);
  const removed = await db.transaction(async (tx) => {
    const [n] = await tx.delete(notes).where(and(eq(notes.id, id), eq(notes.kind, "tree"))).returning({ authorId: notes.authorId });
    if (!n) return null;
    await tx.insert(inventory).values({ userId: n.authorId, item: "note_sheet", qty: 1 })
      .onConflictDoUpdate({ target: [inventory.userId, inventory.item], set: { qty: sql`${inventory.qty} + 1` } });
    return n;
  });
  if (removed) await logEvent("admin.tree.note_deleted", { noteId: id, userId: removed.authorId, sheetsReturned: 1 }, requestCtx(await headers()));
  redirect(`${back}${back.includes("?") ? "&" : "?"}treeDeleted=1`);
}

/** 관리자가 그린 넣기(빼기는 음수). 원장에 admin_grant 로 남음 */
export async function grantGreen(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id") ?? ""), amount = Math.trunc(Number(form.get("amount"))), memo = String(form.get("memo") ?? "").trim().slice(0, 100);
  const back = `/admin/users/${encodeURIComponent(id)}`;
  if (!id || !Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1_000_000) redirect(`${back}?granted=bad`);
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.id, id));
  if (!u) redirect("/admin/users");
  await db.insert(greenLedger).values({ userId: id, amount, reason: "admin_grant", refId: randomUUID() });
  await logEvent("admin.green.granted", { userId: id, amount, memo }, requestCtx(await headers()));
  redirect(`${back}?granted=${amount}`);
}

/** 강제 로그아웃: 그 사람(비회원 시절 ID 포함)의 로그인 세션을 모두 지움. 공원에 있으면 30초 안에 첫 화면으로 나감 */
export async function forceLogout(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  if (!id) redirect("/admin/users");
  const n = (await db.delete(session).where(eq(session.userId, id)).returning({ id: session.id })).length;
  await logEvent("admin.user.logged_out", { userId: id, sessions: n }, requestCtx(await headers()));
  redirect(`/admin/users/${encodeURIComponent(id)}?loggedOut=${n}`);
}
