"use server";

import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { user } from "@/db/schema";
import { isValidPresetId, NICK_MAX } from "@/game/presets";
import { auth } from "@/lib/auth";
import { getMessageOverrides } from "@/lib/content";
import { msgFrom } from "@/content/messages";
import { logEvent, requestCtx } from "@/lib/log";



export async function confirmCharacter(presetId: string, rawNickname: string, viewedCount: number): Promise<{ error?: string }> {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  const msg = msgFrom(await getMessageOverrides());
  if (!session) return { error: msg("pick.errSession") };

  const nickname = String(rawNickname).normalize("NFC").trim().replace(/\s+/g, " ");
  const len = [...nickname].length;
  if (!isValidPresetId(String(presetId))) return { error: msg("pick.errPreset") };
  if (len < 1 || len > NICK_MAX) return { error: msg("pick.errLen", { n: NICK_MAX }) };
  if (/[\p{C}<>]/u.test(nickname)) return { error: msg("pick.errChar") };

  // 아직 확정 안 한 경우에만 (동시 클릭·재시도에도 한 번만)
  const done = await db.update(user)
    .set({ characterPreset: presetId, nickname, characterLockedAt: new Date() })
    .where(and(eq(user.id, session.user.id), isNull(user.characterLockedAt)))
    .returning({ id: user.id });
  if (!done.length) return { error: msg("pick.errDone") };

  await logEvent("character.confirmed", { presetId, nickname, viewedCount: Math.min(Number(viewedCount) || 0, 999) }, {
    userId: session.user.id, isGuest: !!session.user.isAnonymous, sessionId: session.session.id, ...requestCtx(h),
  });
  return {};
}
