// 소원꽃잎: 하루 전체 선착순 N개 + 한 사람당 하루 M번. 판정은 항상 서버(DB 트랜잭션)에서.
import { and, count, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { petalCatches, wishPetalDays } from "@/db/schema";
import { getSettings, kstDate } from "@/lib/settings";

export async function wishStatus(userId: string) {
  const { wishPetal: s } = await getSettings(), day = kstDate();
  const [[mine], [today]] = await Promise.all([
    db.select({ n: count() }).from(petalCatches).where(and(eq(petalCatches.userId, userId), eq(petalCatches.day, day))),
    db.select({ caught: wishPetalDays.caught }).from(wishPetalDays).where(eq(wishPetalDays.day, day)),
  ]);
  const caught = today?.caught ?? 0, myCount = mine?.n ?? 0;
  return {
    eligible: myCount < s.perUserDaily && caught < s.dailyTotal,
    myCount, perUser: s.perUserDaily, left: Math.max(0, s.dailyTotal - caught),
    minIntervalSec: s.minIntervalSec, maxIntervalSec: s.maxIntervalSec,
  };
}

export type ClaimResult = { ok: true; myCount: number; left: number } | { ok: false; reason: "limit" | "soldout" };

export async function claimWishPetal(userId: string): Promise<ClaimResult> {
  const { wishPetal: s } = await getSettings(), day = kstDate();
  try {
    return await db.transaction(async (tx) => {
      const [{ n: mine }] = await tx.select({ n: count() }).from(petalCatches).where(and(eq(petalCatches.userId, userId), eq(petalCatches.day, day)));
      if (mine >= s.perUserDaily) return { ok: false, reason: "limit" } as const;
      await tx.insert(wishPetalDays).values({ day, caught: 0 }).onConflictDoNothing();
      // 남아 있을 때만 1 올림 (동시에 여러 명이 눌러도 한도를 넘지 않음)
      const [row] = await tx.update(wishPetalDays).set({ caught: sql`${wishPetalDays.caught} + 1` })
        .where(and(eq(wishPetalDays.day, day), lt(wishPetalDays.caught, s.dailyTotal))).returning({ caught: wishPetalDays.caught });
      if (!row) return { ok: false, reason: "soldout" } as const;
      // 같은 사람이 동시에 두 번 눌러도 (user, day, seq) 유니크에 걸려 전체가 취소됨
      await tx.insert(petalCatches).values({ userId, day, seq: mine + 1 });
      return { ok: true, myCount: mine + 1, left: s.dailyTotal - row.caught } as const;
    });
  } catch (e) {
    if ((e as { code?: string })?.code === "23505" || String(e).includes("duplicate key")) return { ok: false, reason: "limit" };
    throw e;
  }
}
