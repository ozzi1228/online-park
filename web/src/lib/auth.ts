import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { logEvent } from "@/lib/log";

// 환경변수가 있는 로그인만 켬
const provider = (id: string) => {
  const clientId = process.env[`${id}_CLIENT_ID`], clientSecret = process.env[`${id}_CLIENT_SECRET`];
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
};
const socialProviders = Object.fromEntries(
  (["google", "kakao", "naver"] as const)
    .map((id) => [id, provider(id.toUpperCase())])
    .filter(([, v]) => v),
);
export const enabledProviders = Object.keys(socialProviders);

export const SIGNUP_BONUS = 100;

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  socialProviders,
  user: {
    additionalFields: {
      nickname: { type: "string", required: false, input: false },
      characterPreset: { type: "string", required: false, input: false },
      characterLockedAt: { type: "date", required: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const isGuest = (user as { isAnonymous?: boolean }).isAnonymous ?? false;
          await logEvent("user.created", { isGuest }, { userId: user.id, isGuest });
          if (isGuest) return;
          // 가입 보너스. (reason, refId) 유니크라 중복 지급 불가
          await db.insert(schema.greenLedger)
            .values({ userId: user.id, amount: SIGNUP_BONUS, reason: "signup_bonus", refId: user.id })
            .onConflictDoNothing();
          await logEvent("green.granted", { amount: SIGNUP_BONUS, reason: "signup_bonus" }, { userId: user.id });
        },
      },
    },
  },
  plugins: [
    anonymous({
      emailDomainName: "guest.sakura.invalid",
      // 비회원 → 회원 전환: 확정한 캐릭터를 그대로 가져감. 로그는 guest.linked 로 두 ID를 이어둠
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        const guest = anonymousUser.user as typeof anonymousUser.user & { characterPreset?: string | null; characterLockedAt?: Date | null; nickname?: string | null };
        const member = newUser.user as typeof newUser.user & { characterPreset?: string | null };
        if (guest.characterPreset && !member.characterPreset) {
          await db.update(schema.user)
            .set({ characterPreset: guest.characterPreset, characterLockedAt: guest.characterLockedAt, nickname: guest.nickname })
            .where(eq(schema.user.id, member.id));
        }
        await logEvent("guest.linked", { guestId: guest.id }, { userId: member.id });
      },
    }),
    nextCookies(), // 마지막에 둬야 서버 액션에서 쿠키가 설정됨
  ],
});

export type Session = typeof auth.$Infer.Session;
