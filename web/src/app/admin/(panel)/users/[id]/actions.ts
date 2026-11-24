"use server";

import { inArray, or, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { eventLog, greenLedger, inquiries, inventory, notes, orders, petalCatches, user } from "@/db/schema";
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
