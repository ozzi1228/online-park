// 손글씨 쪽지: 노트 한 장을 써서(획 데이터) 다른 사람에게 건넴. 노트 차감과 저장을 한 번에.
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { inventory, notes, user } from "@/db/schema";

import { type Strokes } from "./notes-shared";

export { cleanStrokes, type Strokes } from "./notes-shared";

export type GiveResult = { ok: true; id: number; sheetsLeft: number } | { ok: false; reason: "no_sheet" | "no_recipient" | "self" };

export async function giveNote(authorId: string, recipientId: string, strokes: Strokes): Promise<GiveResult> {
  if (authorId === recipientId) return { ok: false, reason: "self" };
  const [to] = await db.select({ id: user.id, locked: user.characterLockedAt }).from(user).where(eq(user.id, recipientId));
  if (!to?.locked) return { ok: false, reason: "no_recipient" };
  const [me] = await db.select({ nickname: user.nickname }).from(user).where(eq(user.id, authorId));
  return db.transaction(async (tx) => {
    // 노트가 남아 있을 때만 한 장 차감 (동시에 눌러도 마이너스 불가)
    const [left] = await tx.update(inventory).set({ qty: sql`${inventory.qty} - 1` })
      .where(and(eq(inventory.userId, authorId), eq(inventory.item, "note_sheet"), gt(inventory.qty, 0)))
      .returning({ qty: inventory.qty });
    if (!left) return { ok: false, reason: "no_sheet" } as const;
    const [row] = await tx.insert(notes).values({ authorId, authorNickname: me?.nickname ?? null, recipientId, strokes }).returning({ id: notes.id });
    return { ok: true, id: row.id, sheetsLeft: left.qty } as const;
  });
}

export const inbox = (userId: string) =>
  db.select({ id: notes.id, from: notes.authorNickname, strokes: notes.strokes, readAt: notes.readAt, createdAt: notes.createdAt })
    .from(notes).where(eq(notes.recipientId, userId)).orderBy(desc(notes.id)).limit(50);

export async function unreadCount(userId: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(notes).where(and(eq(notes.recipientId, userId), isNull(notes.readAt)));
  return r?.n ?? 0;
}

export const markRead = (userId: string, id: number) =>
  db.update(notes).set({ readAt: new Date() }).where(and(eq(notes.id, id), eq(notes.recipientId, userId), isNull(notes.readAt)));
