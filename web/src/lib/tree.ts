// 소원나무 쪽지 + 분수 동전. 노트·그린 차감은 항상 DB 트랜잭션 안에서.
import { randomUUID } from "node:crypto";
import { and, count, desc, eq, gt, gte, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { greenLedger, inventory, notes, user } from "@/db/schema";
import { onCanopy } from "@/game/park-map";
import type { Strokes } from "@/lib/notes-shared";
import { getSettings, kstDate } from "@/lib/settings";
import { fountainTargets, simulate } from "@/game/coin-sim";

type V3 = { x: number; y: number; z: number };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** 노트 n장 차감 (모자라면 false) */
async function takeSheets(tx: Tx, userId: string, n: number) {
  const [r] = await tx.update(inventory).set({ qty: sql`${inventory.qty} - ${n}` })
    .where(and(eq(inventory.userId, userId), eq(inventory.item, "note_sheet"), gte(inventory.qty, n))).returning({ qty: inventory.qty });
  return r ? r.qty : null;
}

/** 나무에 달린 쪽지. 가린 쪽지는 주인을 포함해 아무도 내용을 못 봄 (주인이 떼야 보임) */
export async function listTree(viewerId: string | null) {
  const { wishTree } = await getSettings();
  const rows = await db.select({
    id: notes.id, x: notes.posX, y: notes.posY, z: notes.posZ, covered: notes.covered,
    authorId: notes.authorId, from: notes.authorNickname, strokes: notes.strokes, createdAt: notes.createdAt,
  }).from(notes).where(eq(notes.kind, "tree")).orderBy(desc(notes.id)).limit(wishTree.maxVisible);
  return rows.map(({ authorId, strokes, ...r }) => {
    const mine = authorId === viewerId;
    return { ...r, mine, strokes: r.covered ? null : strokes };
  });
}

export type AttachResult = { ok: true; id: number; sheetsLeft: number } | { ok: false; reason: "no_sheet" | "bad_spot" | "daily_limit" };

export async function attachToTree(userId: string, strokes: Strokes, covered: boolean, pos: { x: number; y: number; z: number }): Promise<AttachResult> {
  if (![pos.x, pos.y, pos.z].every(Number.isFinite) || !onCanopy(pos.x, pos.y, pos.z)) return { ok: false, reason: "bad_spot" };
  const { wishTree } = await getSettings();
  const [{ n }] = await db.select({ n: count() }).from(notes)
    .where(and(eq(notes.authorId, userId), eq(notes.kind, "tree"), gt(notes.createdAt, new Date(Date.now() - 86_400_000))));
  if (n >= wishTree.notesPerUserDaily) return { ok: false, reason: "daily_limit" };
  const [me] = await db.select({ nickname: user.nickname }).from(user).where(eq(user.id, userId));
  return db.transaction(async (tx) => {
    const left = await takeSheets(tx, userId, covered ? 2 : 1); // 가리면 한 장 더
    if (left === null) return { ok: false, reason: "no_sheet" } as const;
    const [row] = await tx.insert(notes).values({
      authorId: userId, authorNickname: me?.nickname ?? null, strokes, kind: "tree", covered, posX: pos.x, posY: pos.y, posZ: pos.z,
    }).returning({ id: notes.id });
    return { ok: true, id: row.id, sheetsLeft: left } as const;
  });
}

/** 겹친 장 떼서 보기: 덮개 장은 찢어지고 쪽지는 공개 상태가 됨 */
export async function peel(userId: string, id: number) {
  const r = await db.update(notes).set({ covered: false })
    .where(and(eq(notes.id, id), eq(notes.authorId, userId), eq(notes.kind, "tree"), eq(notes.covered, true))).returning({ id: notes.id });
  return r.length > 0;
}

/** 내 쪽지 떼어 내기 (나무에서 없어짐, 노트는 돌려받지 않음) */
export async function removeNote(userId: string, id: number) {
  const r = await db.delete(notes).where(and(eq(notes.id, id), eq(notes.authorId, userId), eq(notes.kind, "tree"))).returning({ id: notes.id });
  return r.length > 0;
}

/** 가리기: 새 노트 한 장을 덮어 붙임 */
export async function recover(userId: string, id: number) {
  return db.transaction(async (tx) => {
    const [n] = await tx.select({ id: notes.id }).from(notes)
      .where(and(eq(notes.id, id), eq(notes.authorId, userId), eq(notes.kind, "tree"), eq(notes.covered, false)));
    if (!n) return { ok: false, reason: "not_found" } as const;
    const left = await takeSheets(tx, userId, 1);
    if (left === null) return { ok: false, reason: "no_sheet" } as const;
    await tx.update(notes).set({ covered: true }).where(eq(notes.id, id));
    return { ok: true, sheetsLeft: left } as const;
  });
}

/** 분수에 동전: 그린 차감 + 서버가 다시 계산한 결과로 보상 (사람별 잠금으로 동시에 눌러도 마이너스 불가)
 *  맨 위 접시에 들어가면 과녁 칸에 따라 그린을 줌. 하루 보상 합계는 관리자 한도까지 */
export async function tossCoin(userId: string, from: V3, vel: V3) {
  const { fountain: f } = await getSettings();
  const price = f.coinPrice;
  const shot = simulate(fountainTargets(), from, vel, { bull: f.bullPct / 100, mid: f.midPct / 100 });
  const want = shot.ring === "bull" ? f.rewardBull : shot.ring === "mid" ? f.rewardMid : shot.ring === "outer" ? f.rewardOuter : 0;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const [{ total }] = await tx.select({ total: sum(greenLedger.amount) }).from(greenLedger).where(eq(greenLedger.userId, userId));
    const balance = Number(total ?? 0);
    if (balance < price) return { ok: false, reason: "insufficient", balance } as const;
    await tx.insert(greenLedger).values({ userId, amount: -price, reason: "fountain", refId: randomUUID() });
    let reward = want;
    if (reward > 0 && f.rewardDailyCap > 0) {
      const since = new Date(`${kstDate()}T00:00:00+09:00`);
      const [{ got }] = await tx.select({ got: sum(greenLedger.amount) }).from(greenLedger)
        .where(and(eq(greenLedger.userId, userId), eq(greenLedger.reason, "fountain_reward"), gte(greenLedger.createdAt, since)));
      reward = Math.max(0, Math.min(reward, f.rewardDailyCap - Number(got ?? 0)));
    }
    if (reward > 0) await tx.insert(greenLedger).values({ userId, amount: reward, reason: "fountain_reward", refId: randomUUID() });
    return { ok: true, balance: balance - price + reward, price, shot, reward, capped: reward < want } as const;
  });
}
