// 매점: 그린으로 노트·돗자리·츄르·낚싯대 구매. 잔액 확인과 차감을 사람별 잠금 안에서 → 동시에 눌러도 마이너스 불가.
import { randomUUID } from "node:crypto";
import { and, eq, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { greenLedger, inventory } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { MAT_COLORS, type MatColor } from "@/lib/mat-colors";

export const ITEMS = ["notebook", "mat", "churu", "rod"] as const;
export type Item = (typeof ITEMS)[number];

export async function myItems(userId: string) {
  const rows = await db.select().from(inventory).where(eq(inventory.userId, userId));
  const q = (k: string) => rows.find((r) => r.item === k)?.qty ?? 0;
  // 돗자리는 색마다 한 장씩 ("mat:파랑"). 예전에 산 건 "mat" 한 줄에 색(variant)이 적혀 있음
  const mats = MAT_COLORS.filter((c) => rows.some((r) => r.qty > 0 && (r.item === `mat:${c}` || (r.item === "mat" && (r.variant ?? "pink") === c))));
  return { noteSheets: q("note_sheet"), mat: mats.length > 0, mats, churu: q("churu"), rod: q("rod") }; // rod = 낚싯대 남은 횟수
}

/** 시작 선물 (츄르·낚싯대·노란 돗자리·노트): 사람마다 딱 한 번. 이미 있던 사람도 다음 접속 때 받음.
 *  받았다는 표시는 그린 장부의 0그린 줄(reason starter_kit, refId 유저) — (reason, refId) 유니크라 두 번 못 받음 */
export async function grantStarter(userId: string) {
  const { green: g } = await getSettings();
  return db.transaction(async (tx) => {
    const got = await tx.insert(greenLedger).values({ userId, amount: 0, reason: "starter_kit", refId: userId }).onConflictDoNothing().returning({ id: greenLedger.id });
    if (!got.length) return false;
    const add = [["churu", g.starterChuru], ["rod", g.starterRodUses], ["note_sheet", g.starterNoteSheets], ["mat:yellow", g.starterMat ? 1 : 0]] as const;
    for (const [item, qty] of add) {
      if (qty <= 0) continue;
      // 돗자리는 이미 있으면 그대로(한 색 한 장), 나머지는 더해 줌
      await tx.insert(inventory).values({ userId, item, qty })
        .onConflictDoUpdate({ target: [inventory.userId, inventory.item], set: { qty: item.startsWith("mat:") ? sql`greatest(${inventory.qty}, 1)` : sql`${inventory.qty} + ${qty}` } });
    }
    return true;
  });
}

export type BuyResult =
  | { ok: true; balance: number; items: Awaited<ReturnType<typeof myItems>>; price: number }
  | { ok: false; reason: "insufficient" | "owned"; balance: number };

export async function buy(userId: string, item: Item, color: MatColor = "pink"): Promise<BuyResult> {
  const { shop } = await getSettings();
  const price = item === "notebook" ? shop.notebookPrice : item === "churu" ? shop.churuPrice : item === "rod" ? shop.rodPrice : shop.matPrice;
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`); // 이 사람의 구매는 한 줄로 세움
    const [{ total }] = await tx.select({ total: sum(greenLedger.amount) }).from(greenLedger).where(eq(greenLedger.userId, userId));
    const balance = Number(total ?? 0);
    if (item === "mat") { // 같은 색은 한 장만
      const rows = await tx.select().from(inventory).where(and(eq(inventory.userId, userId), sql`${inventory.item} in ('mat', ${`mat:${color}`})`));
      if (rows.some((r) => r.qty > 0 && (r.item !== "mat" || (r.variant ?? "pink") === color))) return { ok: false, reason: "owned", balance } as const;
    }
    if (item === "rod") { // 낚싯대는 부러진 뒤에 새로
      const [r] = await tx.select().from(inventory).where(and(eq(inventory.userId, userId), eq(inventory.item, "rod")));
      if ((r?.qty ?? 0) > 0) return { ok: false, reason: "owned", balance } as const;
    }
    if (balance < price) return { ok: false, reason: "insufficient", balance } as const;
    await tx.insert(greenLedger).values({ userId, amount: -price, reason: `shop.${item}`, refId: randomUUID() });
    const key = item === "notebook" ? "note_sheet" : item === "churu" || item === "rod" ? item : `mat:${color}`;
    const add = item === "notebook" ? shop.notebookSheets : item === "churu" ? shop.churuPack : item === "rod" ? shop.rodUses : 1;
    await tx.insert(inventory).values({ userId, item: key, qty: add })
      .onConflictDoUpdate({ target: [inventory.userId, inventory.item], set: { qty: sql`${inventory.qty} + ${add}` } });
    return { ok: true, balance: balance - price } as const;
  });
  return result.ok ? { ...result, price, items: await myItems(userId) } : result;
}
