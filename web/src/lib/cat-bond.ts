// 고양이 호감도: 사람 × 고양이마다 0~100. 계산은 숫자로, 사람에게는 하트 개수만 보냄.
// 오래 안 만나면 깎이는 건 매일 돌리지 않고, 읽을 때 "마지막으로 만난 뒤 지난 날"만큼 빼서 계산함.
import { and, eq, inArray, max, sql } from "drizzle-orm";
import { db } from "@/db";
import { catBonds, inventory } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { CAT_LOOKS } from "@/game/cat-brain";
import { clamp, effective, heartsOf } from "@/lib/cat-hearts";
import { signForRealtime } from "@/lib/realtime-sign";

type Row = typeof catBonds.$inferSelect;
export const isCat = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < CAT_LOOKS;

/** 내 고양이들: 하트 개수·지어 준 이름 (숫자는 안 보냄) */
export async function myBonds(userId: string) {
  const { catBond: r } = await getSettings();
  const rows = await db.select().from(catBonds).where(eq(catBonds.userId, userId));
  return {
    rules: { nameHearts: r.nameHearts, petStayHearts: r.petStayHearts },
    cats: Array.from({ length: CAT_LOOKS }, (_, cat) => {
      const row = rows.find((x) => x.cat === cat);
      return { cat, hearts: heartsOf(effective(row, r), r), name: row?.name ?? null };
    }),
  };
}

/** 호감도 저장: 고양이를 만난 것(쓰다듬기·이름 짓기 등)이라 '마지막으로 만난 때'도 지금으로 → 안 만난 날 계산이 다시 시작 */
async function save(userId: string, cat: number, score: number, set: Partial<Row> = {}) {
  const v = { score: clamp(score), lastAt: new Date(), ...set };
  await db.insert(catBonds).values({ userId, cat, ...v }).onConflictDoUpdate({ target: [catBonds.userId, catBonds.cat], set: v });
}

export type PetOutcome = "flee" | "content" | "rub";

/** 쓰다듬기: 하트가 모자라면 도망(싫어하는 사이면 조금 깎임), 넉넉하면 가만히, 아주 친하면 고로롱+부비부비 */
export async function pet(userId: string, cat: number): Promise<{ outcome: PetOutcome; hearts: number; gained: boolean }> {
  const { catBond: r } = await getSettings();
  const [row] = await db.select().from(catBonds).where(and(eq(catBonds.userId, userId), eq(catBonds.cat, cat)));
  let score = effective(row, r);
  const hearts = heartsOf(score, r);
  if (hearts < r.petStayHearts) {
    if (score < r.dislikeBelow) score = clamp(score - r.dislikePenalty); // 싫어하는 사이에 만지려 하면 조금 깎임
    await save(userId, cat, score);
    return { outcome: "flee", hearts: heartsOf(score, r), gained: false };
  }
  const outcome: PetOutcome = score >= r.purrAt ? "rub" : "content";
  const gained = !row?.pettedAt || Date.now() - row.pettedAt.getTime() >= r.petGainMin * 60_000;
  if (gained) score = clamp(score + r.petGain);
  await save(userId, cat, score, gained ? { pettedAt: new Date() } : {});
  return { outcome, hearts: heartsOf(score, r), gained };
}

/** 부르기: 이름을 지어 줬고 하트가 넉넉한 고양이만. 올지 말지(확률)는 여기서 굴리고, 결과를 서명해서 실시간 서버에 넘김
 *  (실시간 서버는 그 순간 부른 사람들 중 온다고 나온 사람끼리 호감도를 비교해 가장 높은 사람에게 보냄) */
export async function callCat(userId: string, cat: number) {
  const { catBond: r } = await getSettings();
  const [row] = await db.select().from(catBonds).where(and(eq(catBonds.userId, userId), eq(catBonds.cat, cat)));
  const score = effective(row, r);
  if (!row?.name || heartsOf(score, r) < r.nameHearts) return { ok: false, reason: "not_close" } as const;
  const wait = row.calledAt ? r.callCooldownSec * 1000 - (Date.now() - row.calledAt.getTime()) : 0;
  if (wait > 0) return { ok: false, reason: "cooldown", waitSec: Math.ceil(wait / 1000) } as const;
  const comes = Math.random() * 100 < score * r.callMaxPct / 100;
  await db.update(catBonds).set({ calledAt: new Date() }).where(and(eq(catBonds.userId, userId), eq(catBonds.cat, cat)));
  const ticket = signForRealtime({ kind: "catCall", uid: userId, cat, score, comes, exp: Date.now() + 15_000 });
  return { ok: true, comes, ticket } as const;
}

/** 질투: 내가 다른 고양이를 챙기는 걸 본(가까이 있던) 정든 고양이들은 호감도가 조금 깎임. 깎인 고양이 번호를 돌려줌 */
async function jealousy(userId: string, cat: number, saw: number[]) {
  const { catBond: r } = await getSettings();
  const others = [...new Set(saw.filter((c) => isCat(c) && c !== cat))];
  if (!others.length || r.jealousLoss <= 0) return [];
  const rows = await db.select().from(catBonds).where(and(eq(catBonds.userId, userId), inArray(catBonds.cat, others)));
  const out: number[] = [];
  for (const row of rows) {
    const score = effective(row, r);
    if (score < r.jealousMin || (row.jealousAt && Date.now() - row.jealousAt.getTime() < r.jealousCooldownMin * 60_000)) continue;
    await save(userId, row.cat, score - r.jealousLoss, { jealousAt: new Date() });
    out.push(row.cat);
  }
  return out;
}

/** 츄르 주기: 츄르 1개를 쓰고 호감도가 오름. 같은 고양이에게는 관리자 설정 간격(기본 10분)에 하나, 한 번 먹은 고양이는 잠깐 배불러함(누가 줬든). saw = 가까이서 본 다른 고양이들 */
export async function feed(userId: string, cat: number, saw: number[]) {
  const { catBond: r } = await getSettings();
  // 한 사람은 같은 고양이에게 관리자 설정 간격(기본 10분)에 한 번만
  const [mine] = await db.select({ fedAt: catBonds.fedAt }).from(catBonds).where(and(eq(catBonds.userId, userId), eq(catBonds.cat, cat)));
  const wait = mine?.fedAt ? r.feedCooldownMin * 60_000 - (Date.now() - mine.fedAt.getTime()) : 0;
  if (wait > 0) return { ok: false, reason: "cooldown", waitMin: Math.ceil(wait / 60_000) } as const;
  // 누가 줬든 방금 먹은 고양이는 잠깐 배불러함
  const [{ last }] = await db.select({ last: max(catBonds.fedAt) }).from(catBonds).where(eq(catBonds.cat, cat));
  if (last && Date.now() - last.getTime() < r.fullMin * 60_000) return { ok: false, reason: "full" } as const;
  const used = await db.update(inventory).set({ qty: sql`${inventory.qty} - 1` })
    .where(and(eq(inventory.userId, userId), eq(inventory.item, "churu"), sql`${inventory.qty} > 0`)).returning({ qty: inventory.qty });
  if (!used.length) return { ok: false, reason: "no_churu" } as const;
  const [row] = await db.select().from(catBonds).where(and(eq(catBonds.userId, userId), eq(catBonds.cat, cat)));
  const score = clamp(effective(row, r) + r.feedGain);
  await save(userId, cat, score, { fedAt: new Date() });
  return { ok: true, hearts: heartsOf(score, r), churuLeft: used[0].qty, jealous: await jealousy(userId, cat, saw) } as const;
}

/** 낚싯대 놀이 시작: 낚싯대를 한 번 씀 (0이 되면 부러짐) */
export async function startPlay(userId: string, cat: number) {
  const used = await db.update(inventory).set({ qty: sql`${inventory.qty} - 1` })
    .where(and(eq(inventory.userId, userId), eq(inventory.item, "rod"), sql`${inventory.qty} > 0`)).returning({ qty: inventory.qty });
  if (!used.length) return { ok: false, reason: "no_rod" } as const;
  const { catBond: r } = await getSettings();
  const [row] = await db.select().from(catBonds).where(and(eq(catBonds.userId, userId), eq(catBonds.cat, cat)));
  const score = effective(row, r);
  await save(userId, cat, score, { playAt: new Date() });
  return { ok: true, usesLeft: used[0].qty, hearts: heartsOf(score, r) } as const;
}

/** 낚싯대 놀이 끝: 사냥에 성공했으면 호감도가 오름 (시작한 놀이 하나에 한 번만, 최소 몇 초는 놀았어야) */
export async function finishPlay(userId: string, cat: number, success: boolean, saw: number[]) {
  const { catBond: r } = await getSettings();
  const [row] = await db.select().from(catBonds).where(and(eq(catBonds.userId, userId), eq(catBonds.cat, cat)));
  const age = row?.playAt ? Date.now() - row.playAt.getTime() : -1;
  if (!row || age < 4000 || age > 5 * 60_000) return { ok: false, reason: "no_play" } as const;
  const score = clamp(effective(row, r) + (success ? r.playGain : 0));
  await save(userId, cat, score, { playAt: null });
  return { ok: true, hearts: heartsOf(score, r), jealous: success ? await jealousy(userId, cat, saw) : [] } as const;
}

/** 이름 지어 주기 (하트가 넉넉할 때만). 1~8자, 제어문자·꺾쇠 빼고 */
export async function nameCat(userId: string, cat: number, raw: string) {
  const name = raw.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 8);
  if (!name) return { ok: false, reason: "empty" } as const;
  const { catBond: r } = await getSettings();
  const [row] = await db.select().from(catBonds).where(and(eq(catBonds.userId, userId), eq(catBonds.cat, cat)));
  const score = effective(row, r);
  if (heartsOf(score, r) < r.nameHearts) return { ok: false, reason: "not_close" } as const;
  await save(userId, cat, score, { name });
  return { ok: true, name } as const;
}
