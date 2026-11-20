"use server";

import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { user } from "@/db/schema";
import { isValidPresetId, NICK_MAX } from "@/game/presets";
import { auth } from "@/lib/auth";
import { logEvent, requestCtx } from "@/lib/log";



export async function confirmCharacter(presetId: string, rawNickname: string, viewedCount: number): Promise<{ error?: string }> {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session) return { error: "입장 정보가 없어요. 처음 화면에서 다시 들어와 주세요." };

  const nickname = String(rawNickname).normalize("NFC").trim().replace(/\s+/g, " ");
  const len = [...nickname].length;
  if (!isValidPresetId(String(presetId))) return { error: "캐릭터를 다시 골라 주세요." };
  if (len < 1 || len > NICK_MAX) return { error: `닉네임은 1~${NICK_MAX}자로 정해 주세요.` };
  if (/[\p{C}<>]/u.test(nickname)) return { error: "닉네임에 쓸 수 없는 문자가 있어요." };

  // 아직 확정 안 한 경우에만 (동시 클릭·재시도에도 한 번만)
  const done = await db.update(user)
    .set({ characterPreset: presetId, nickname, characterLockedAt: new Date() })
    .where(and(eq(user.id, session.user.id), isNull(user.characterLockedAt)))
    .returning({ id: user.id });
  if (!done.length) return { error: "이미 캐릭터를 정했어요." };

  await logEvent("character.confirmed", { presetId, nickname, viewedCount: Math.min(Number(viewedCount) || 0, 999) }, {
    userId: session.user.id, isGuest: !!session.user.isAnonymous, sessionId: session.session.id, ...requestCtx(h),
  });
  return {};
}
