// 고양이 호감도: 사람 × 고양이마다 0~100. 계산은 숫자로, 사람에게는 하트 개수만 보냄.
// 오래 안 만나면 깎이는 건 매일 돌리지 않고, 읽을 때 "마지막으로 만난 뒤 지난 날"만큼 빼서 계산함.
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { catBonds } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { CAT_LOOKS } from "@/game/cat-brain";
import { clamp, effective, heartsOf } from "@/lib/cat-hearts";

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
