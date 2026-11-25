"use server";

import { inArray, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { inventory, notes } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { logEvent, requestCtx } from "@/lib/log";

/** 쪽지 여러 장 한 번에 삭제. 소원나무 쪽지는 단 사람에게 노트 1장씩 돌려줌 (건넨 쪽지는 이미 받은 사람 것이라 안 돌려줌) */
export async function deleteNotes(form: FormData) {
  await requireAdmin();
  const back = String(form.get("back") ?? "/admin/notes");
  const ids = form.getAll("ids").map(Number).filter(Number.isInteger);
  if (!ids.length) redirect(back);
  const removed = await db.transaction(async (tx) => {
    const rows = await tx.delete(notes).where(inArray(notes.id, ids)).returning({ id: notes.id, kind: notes.kind, authorId: notes.authorId });
    const refund = new Map<string, number>();
    for (const r of rows) if (r.kind === "tree") refund.set(r.authorId, (refund.get(r.authorId) ?? 0) + 1);
    for (const [userId, qty] of refund)
      await tx.insert(inventory).values({ userId, item: "note_sheet", qty })
        .onConflictDoUpdate({ target: [inventory.userId, inventory.item], set: { qty: sql`${inventory.qty} + ${qty}` } });
    return { notes: rows.length, tree: rows.filter((r) => r.kind === "tree").length };
  });
  await logEvent("admin.notes.deleted", { ids, ...removed }, requestCtx(await headers()));
  redirect(`${back}${back.includes("?") ? "&" : "?"}deleted=${removed.notes}&refunded=${removed.tree}`);
}
