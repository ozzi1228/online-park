import { createHash } from "node:crypto";
import { db } from "@/db";
import { eventLog } from "@/db/schema";

type Ctx = {
  userId?: string | null;
  isGuest?: boolean;
  sessionId?: string | null;
  ip?: string | null;
  ua?: string | null;
};

// IP는 원문 대신 비밀값을 섞은 해시로만 (같은 사람 추적은 되고 원본은 안 남음)
const hashIp = (ip: string) =>
  createHash("sha256").update(`${process.env.BETTER_AUTH_SECRET}:${ip}`).digest("hex").slice(0, 32);

/** 모든 행동 기록. 실패해도 본 기능을 막지 않음 (에러는 콘솔에). */
export async function logEvent(type: string, data: Record<string, unknown> = {}, ctx: Ctx = {}) {
  try {
    await db.insert(eventLog).values({
      type,
      data,
      userId: ctx.userId ?? null,
      isGuest: ctx.isGuest ?? false,
      sessionId: ctx.sessionId ?? null,
      ipHash: ctx.ip ? hashIp(ctx.ip) : null,
      ua: ctx.ua?.slice(0, 300) ?? null,
    });
  } catch (e) {
    console.error("[logEvent]", type, e);
  }
}

export const requestCtx = (h: Headers) => ({
  ip: h.get("x-forwarded-for")?.split(",")[0].trim() ?? h.get("x-real-ip"),
  ua: h.get("user-agent"),
});
