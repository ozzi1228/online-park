import { auth } from "@/lib/auth";
import { logEvent, requestCtx } from "@/lib/log";
import { ITEMS, buy, type Item } from "@/lib/shop";

/** 매점 구매 (회원 전용) */
export async function POST(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return new Response(null, { status: 401 });
  if (s.user.isAnonymous) return Response.json({ ok: false, reason: "member_only" }, { status: 403 });
  const { item } = await req.json().catch(() => ({})) as { item?: string };
  if (!ITEMS.includes(item as Item)) return new Response(null, { status: 400 });
  const r = await buy(s.user.id, item as Item);
  await logEvent(r.ok ? "shop.purchased" : "shop.refused", r.ok ? { item, price: r.price, balance: r.balance } : { item, reason: r.reason, balance: r.balance },
    { userId: s.user.id, sessionId: s.session.id, ...requestCtx(req.headers) });
  return Response.json(r);
}
