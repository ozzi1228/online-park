// 매점: 그린으로 노트·돗자리 구매. 잔액 확인과 차감을 사람별 잠금 안에서 → 동시에 눌러도 마이너스 불가.
import { randomUUID } from "node:crypto";
import { and, eq, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { greenLedger, inventory } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { MAT_COLORS, type MatColor } from "@/lib/mat-colors";

export const ITEMS = ["notebook", "mat"] as const;
export type Item = (typeof ITEMS)[number];

export async function myItems(userId: string) {
  const rows = await db.select().from(inventory).where(eq(inventory.userId, userId));
  const q = (k: string) => rows.find((r) => r.item === k)?.qty ?? 0;
  // 돗자리는 색마다 한 장씩 ("mat:파랑"). 예전에 산 건 "mat" 한 줄에 색(variant)이 적혀 있음
  const mats = MAT_COLORS.filter((c) => rows.some((r) => r.qty > 0 && (r.item === `mat:${c}` || (r.item === "mat" && (r.variant ?? "pink") === c))));
  return { noteSheets: q("note_sheet"), mat: mats.length > 0, mats };
}

export type BuyResult =
  | { ok: true; balance: number; items: Awaited<ReturnType<typeof myItems>>; price: number }
  | { ok: false; reason: "insufficient" | "owned"; balance: number };

export async function buy(userId: string, item: Item, color: MatColor = "pink"): Promise<BuyResult> {
  const { shop } = await getSettings();
  const price = item === "notebook" ? shop.notebookPrice : shop.matPrice;
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`); // 이 사람의 구매는 한 줄로 세움
    const [{ total }] = await tx.select({ total: sum(greenLedger.amount) }).from(greenLedger).where(eq(greenLedger.userId, userId));
    const balance = Number(total ?? 0);
    if (item === "mat") { // 같은 색은 한 장만
      const rows = await tx.select().from(inventory).where(and(eq(inventory.userId, userId), sql`${inventory.item} in ('mat', ${`mat:${color}`})`));
      if (rows.some((r) => r.qty > 0 && (r.item !== "mat" || (r.variant ?? "pink") === color))) return { ok: false, reason: "owned", balance } as const;
    }
    if (balance < price) return { ok: false, reason: "insufficient", balance } as const;
    await tx.insert(greenLedger).values({ userId, amount: -price, reason: `shop.${item}`, refId: randomUUID() });
    const key = item === "notebook" ? "note_sheet" : `mat:${color}`, add = item === "notebook" ? shop.notebookSheets : 1;
    await tx.insert(inventory).values({ userId, item: key, qty: add })
      .onConflictDoUpdate({ target: [inventory.userId, inventory.item], set: { qty: sql`${inventory.qty} + ${add}` } });
    return { ok: true, balance: balance - price } as const;
  });
  return result.ok ? { ...result, price, items: await myItems(userId) } : result;
}
