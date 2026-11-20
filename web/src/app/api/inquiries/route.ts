import { and, count, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { inquiries, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { logEvent, requestCtx } from "@/lib/log";
import { INQUIRY_CATEGORIES } from "@/lib/inquiry";
import { getSettings } from "@/lib/settings";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

/** 내가 남긴 문의 (안내소 "내 문의") */
export async function GET(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return new Response(null, { status: 401 });
  const rows = await db.select({
    id: inquiries.id, category: inquiries.category, content: inquiries.content, status: inquiries.status,
    reply: inquiries.reply, repliedAt: inquiries.repliedAt, createdAt: inquiries.createdAt, email: inquiries.email,
  }).from(inquiries).where(eq(inquiries.userId, s.user.id)).orderBy(desc(inquiries.id)).limit(50);
  return Response.json(rows, { headers: { "cache-control": "no-store" } });
}

/** 문의 남기기 (비회원도 가능, 하루 개수 제한) */
export async function POST(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return new Response(null, { status: 401 });
  const { inquiry: cfg } = await getSettings();
  const body = await req.json().catch(() => ({})) as { email?: unknown; category?: unknown; content?: unknown };
  const email = String(body.email ?? "").trim(), content = String(body.content ?? "").trim();
  const category = Object.hasOwn(INQUIRY_CATEGORIES, String(body.category)) ? String(body.category) : "general";
  if (!EMAIL.test(email)) return Response.json({ error: "답변받을 이메일 주소를 확인해 주세요." }, { status: 400 });
  if (content.length < 5) return Response.json({ error: "내용을 5자 이상 적어 주세요." }, { status: 400 });
  if (content.length > cfg.maxLength) return Response.json({ error: `내용은 ${cfg.maxLength}자까지 적을 수 있어요.` }, { status: 400 });

  const [{ n }] = await db.select({ n: count() }).from(inquiries)
    .where(and(eq(inquiries.userId, s.user.id), gte(inquiries.createdAt, new Date(Date.now() - 86_400_000))));
  if (n >= cfg.dailyLimit) return Response.json({ error: `문의는 하루 ${cfg.dailyLimit}개까지 남길 수 있어요.` }, { status: 429 });

  const [u] = await db.select({ nickname: user.nickname }).from(user).where(eq(user.id, s.user.id));
  const [row] = await db.insert(inquiries).values({
    userId: s.user.id, nickname: u?.nickname ?? null, isGuest: !!s.user.isAnonymous, email, category, content,
  }).returning({ id: inquiries.id });
  await logEvent("inquiry.created", { inquiryId: row.id, category, length: content.length },
    { userId: s.user.id, isGuest: !!s.user.isAnonymous, sessionId: s.session.id, ...requestCtx(req.headers) });
  return Response.json({ ok: true, id: row.id });
}
