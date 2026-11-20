import { sql } from "drizzle-orm";
import { bigserial, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const now = () => timestamp({ withTimezone: true }).notNull().defaultNow();

// ---------- Better Auth 기본 테이블 (+ 비회원 플러그인, 캐릭터 필드) ----------
export const user = pgTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  isAnonymous: boolean().default(false),
  nickname: text(),
  characterPreset: text(),            // 고른 캐릭터 번호. 성별·나이 같은 정보는 저장하지 않음
  characterLockedAt: timestamp({ withTimezone: true }), // 확정 시각. 이후 변경 불가
  createdAt: now(),
  updatedAt: now().$onUpdate(() => new Date()),
});

export const session = pgTable("session", {
  id: text().primaryKey(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  token: text().notNull().unique(),
  ipAddress: text(),
  userAgent: text(),
  userId: text().notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: now(),
  updatedAt: now().$onUpdate(() => new Date()),
}, (t) => [index().on(t.userId)]);

export const account = pgTable("account", {
  id: text().primaryKey(),
  accountId: text().notNull(),
  providerId: text().notNull(),
  userId: text().notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: timestamp({ withTimezone: true }),
  refreshTokenExpiresAt: timestamp({ withTimezone: true }),
  scope: text(),
  password: text(),
  createdAt: now(),
  updatedAt: now().$onUpdate(() => new Date()),
}, (t) => [index().on(t.userId)]);

export const verification = pgTable("verification", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: now(),
  updatedAt: now().$onUpdate(() => new Date()),
}, (t) => [index().on(t.identifier)]);

// ---------- 그린(캐시) 원장: 모든 증감을 한 줄씩. 잔액 = 합계 ----------
export const greenLedger = pgTable("green_ledger", {
  id: bigserial({ mode: "number" }).primaryKey(),
  // 회원 탈퇴해도 결제·지급 기록은 남겨야 하므로 FK 없이 ID만 보관
  userId: text().notNull(),
  amount: integer().notNull(),        // +충전/지급, -사용
  reason: text().notNull(),           // signup_bonus, charge, notebook, fountain ...
  refId: text().notNull(),            // 주문번호 등. (reason, refId)로 중복 처리 방지
  createdAt: now(),
}, (t) => [
  index().on(t.userId, t.createdAt),
  uniqueIndex().on(t.reason, t.refId),
]);

// ---------- 행동 로그: 추가만, 수정·삭제 없음 ----------
// ponytail: 단일 테이블. 행이 수천만 개 넘어가면 월별 파티션으로
export const eventLog = pgTable("event_log", {
  id: bigserial({ mode: "number" }).primaryKey(),
  at: now(),
  type: text().notNull(),             // user.created, park.enter, petal.caught ...
  userId: text(),
  isGuest: boolean().notNull().default(false),
  sessionId: text(),
  data: jsonb().notNull().default(sql`'{}'::jsonb`),
  ipHash: text(),
  ua: text(),
}, (t) => [
  index().on(t.userId, t.at),
  index().on(t.type, t.at),
  index().on(t.at),
]);
