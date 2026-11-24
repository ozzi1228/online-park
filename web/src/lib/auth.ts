import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { logEvent } from "@/lib/log";
import { getSettings } from "@/lib/settings";

// 환경변수가 있는 로그인만 켬
// 카카오·네이버는 이메일을 안 줄 수 있음(카카오 이메일은 비즈 앱만, 네이버는 사용자가 동의 안 할 수 있음)
// → 이메일이 없으면 계정 ID로 만든 가짜 주소를 씀 (메일은 안 보내니 상관없음, .invalid 라 실제로 없는 주소)
const placeholder = (id: string, sub: unknown, email?: string | null) => (email ? {} : { email: `${id}-${sub}@member.sakura.invalid` });
const extra: Record<string, object> = {
  // 카카오는 닉네임만 요청 (이메일·프로필 사진 동의항목은 설정 안 해도 로그인되게)
  kakao: { disableDefaultScope: true, scope: ["profile_nickname"],
    mapProfileToUser: (p: { id: number; kakao_account?: { email?: string } }) => placeholder("kakao", p.id, p.kakao_account?.email) },
  naver: { mapProfileToUser: (p: { response: { id: string; email?: string } }) => placeholder("naver", p.response.id, p.response.email) },
};
const provider = (id: string) => {
  const clientId = process.env[`${id.toUpperCase()}_CLIENT_ID`], clientSecret = process.env[`${id.toUpperCase()}_CLIENT_SECRET`];
  return clientId && clientSecret ? { clientId, clientSecret, ...extra[id] } : undefined;
};
const socialProviders = Object.fromEntries(
  (["google", "kakao", "naver"] as const)
    .map((id) => [id, provider(id)])
    .filter(([, v]) => v),
);
export const enabledProviders = Object.keys(socialProviders);

// 개발 중 휴대폰 등 다른 기기 주소에서도 로그인되게 (.env.local 의 DEV_ORIGINS, 운영에선 BETTER_AUTH_URL만)
const devHosts = process.env.NODE_ENV === "development" ? (process.env.DEV_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean) : [];

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  trustedOrigins: (req) => {
    const o = req?.headers.get("origin");
    if (!o || !devHosts.length) return [];
    try { return devHosts.includes(new URL(o).hostname) ? [o] : []; } catch { return []; }
  },
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
          // 기본 그린 (금액은 관리자 설정). 비회원도 받음 (충전만 회원 전용). (reason, refId) 유니크라 중복 지급 불가
          const amount = (await getSettings()).green.signupBonus;
          await db.insert(schema.greenLedger)
            .values({ userId: user.id, amount, reason: "signup_bonus", refId: user.id })
            .onConflictDoNothing();
          await logEvent("green.granted", { amount, reason: "signup_bonus" }, { userId: user.id });
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
        // 비회원 때 쓴 그린·산 물건·쪽지를 회원 계정으로 옮김. 비회원 기본 그린만 안 옮김(회원 가입 그린을 따로 받으니)
        await db.transaction(async (tx) => {
          await tx.update(schema.greenLedger).set({ userId: member.id })
            .where(and(eq(schema.greenLedger.userId, guest.id), ne(schema.greenLedger.reason, "signup_bonus")));
          await tx.execute(sql`insert into inventory (user_id, item, qty) select ${member.id}, item, qty from inventory where user_id = ${guest.id}
            on conflict (user_id, item) do update set qty = inventory.qty + excluded.qty`);
          await tx.delete(schema.inventory).where(eq(schema.inventory.userId, guest.id));
          await tx.update(schema.notes).set({ authorId: member.id }).where(eq(schema.notes.authorId, guest.id));
          await tx.update(schema.notes).set({ recipientId: member.id }).where(eq(schema.notes.recipientId, guest.id));
        });
        await logEvent("guest.linked", { guestId: guest.id }, { userId: member.id });
      },
    }),
    nextCookies(), // 마지막에 둬야 서버 액션에서 쿠키가 설정됨
  ],
});

export type Session = typeof auth.$Infer.Session;
