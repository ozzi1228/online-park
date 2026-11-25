import { sql } from "drizzle-orm";
import { bigserial, boolean, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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

// ---------- 운영 설정 (관리자 페이지에서 편집, 기본값은 src/lib/settings.ts) ----------
export const gameSettings = pgTable("game_settings", {
  key: text().primaryKey(),           // 설정 묶음 이름 (wishPetal, green ...)
  value: jsonb().notNull(),
  updatedAt: now().$onUpdate(() => new Date()),
});

// ---------- 운세꽃잎: 하루 전체 선착순 + 1인당 횟수 ----------
export const wishPetalDays = pgTable("wish_petal_days", {
  day: text().primaryKey(),           // 한국 날짜 YYYY-MM-DD
  caught: integer().notNull().default(0),
});
// ---------- 고양이 호감도: 사람 × 고양이(무늬 번호)마다 한 줄. 이름은 그 사람에게만 보임 ----------
export const catBonds = pgTable("cat_bonds", {
  userId: text().notNull(),
  cat: integer().notNull(),           // 고양이 = 무늬 번호 (game/cat.ts LOOKS)
  score: real().notNull(),            // 0~100 (마지막으로 만난 때 기준. 안 만난 날만큼 깎는 건 읽을 때 계산)
  name: text(),                       // 이 사람이 지어 준 이름
  lastAt: now(),                      // 마지막으로 교류한 때 (오래 안 만나면 깎이는 기준)
  pettedAt: timestamp({ withTimezone: true }), // 쓰다듬기로 마지막에 오른 때
  calledAt: timestamp({ withTimezone: true }), // 마지막으로 부른 때 (연달아 불러 확률을 채우지 못하게)
  fedAt: timestamp({ withTimezone: true }),    // 이 사람이 마지막으로 츄르를 준 때 (고양이가 배부른지는 모든 사람 것 중 가장 최근으로)
  jealousAt: timestamp({ withTimezone: true }), // 마지막으로 질투한 때
  playAt: timestamp({ withTimezone: true }),    // 낚싯대 놀이를 시작한 때 (끝났다고 알리면 비움 → 시작 없이 성공만 보내지 못하게)
}, (t) => [uniqueIndex().on(t.userId, t.cat)]);

export const petalCatches = pgTable("petal_catches", {
  id: bigserial({ mode: "number" }).primaryKey(),
  userId: text().notNull(),
  day: text().notNull(),
  seq: integer().notNull(),           // 그날 몇 번째로 잡았는지 → (user, day, seq) 유니크로 초과 방지
  fortune: text(),                    // 그때 나온 운세 문구
  kept: boolean().notNull().default(false), // '간직할게요'를 눌러 쪽지함에 간직했는지
  createdAt: now(),
}, (t) => [uniqueIndex().on(t.userId, t.day, t.seq), index().on(t.day)]);

// ---------- 그린 충전 주문 (토스페이먼츠). 1그린 = 1원 ----------
export const orders = pgTable("orders", {
  id: text().primaryKey(),            // 토스에 넘기는 orderId
  userId: text().notNull(),
  amount: integer().notNull(),        // 결제 금액(원) = 지급 그린
  status: text().notNull().default("pending"), // pending → paid | failed | canceled
  paymentKey: text(),
  method: text(),
  failCode: text(),
  failMessage: text(),
  raw: jsonb(),                       // 승인 응답 원본 (문의 대응용)
  createdAt: now(),
  approvedAt: timestamp({ withTimezone: true }),
}, (t) => [index().on(t.userId, t.createdAt), index().on(t.status, t.createdAt)]);

// ---------- 가방: 노트 장수, 돗자리 등 ----------
export const inventory = pgTable("inventory", {
  userId: text().notNull(),
  item: text().notNull(),             // "note_sheet" | "mat"
  qty: integer().notNull().default(0),
  variant: text(),                    // 돗자리 색 등 (lib/mat-colors)
  updatedAt: now().$onUpdate(() => new Date()),
}, (t) => [uniqueIndex().on(t.userId, t.item)]);

// ---------- 안내소 문의 ----------
export const inquiries = pgTable("inquiries", {
  id: bigserial({ mode: "number" }).primaryKey(),
  userId: text().notNull(),
  nickname: text(),                   // 남길 당시 닉네임 (나중에 바뀌어도 기록 유지)
  isGuest: boolean().notNull().default(false),
  email: text().notNull(),            // 답변받을 이메일
  category: text().notNull(),         // general | payment | bug | flyer | other
  content: text().notNull(),
  status: text().notNull().default("open"), // open → answered → closed
  reply: text(),
  repliedAt: timestamp({ withTimezone: true }),
  createdAt: now(),
}, (t) => [index().on(t.userId, t.createdAt), index().on(t.status, t.createdAt)]);

// ---------- 손글씨 쪽지 (벚꽃잎 노트 한 장) ----------
export const notes = pgTable("notes", {
  id: bigserial({ mode: "number" }).primaryKey(),
  authorId: text().notNull(),
  authorNickname: text(),
  recipientId: text(),                // 건넨 경우 받는 사람 (소원나무에 달면 null)
  strokes: jsonb().notNull(),         // [[색, x1,y1, x2,y2, ...], ...] 0~1000 정수 좌표
  kind: text().notNull().default("given"), // given(건넨 쪽지) | tree(소원나무에 단 쪽지)
  posX: real(), posY: real(), posZ: real(), // 소원나무에 단 자리 (월드 좌표)
  covered: boolean().notNull().default(false), // 한 장 더 풀칠해 내용을 가렸는지 (주인만 볼 수 있음)
  readAt: timestamp({ withTimezone: true }),
  createdAt: now(),
}, (t) => [index().on(t.recipientId, t.createdAt), index().on(t.authorId, t.createdAt), index().on(t.kind, t.id)]);

// ---------- 화면 문구 (관리자 편집, 기본값은 src/content) ----------
export const siteContent = pgTable("site_content", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: now().$onUpdate(() => new Date()),
});
