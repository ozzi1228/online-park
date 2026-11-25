import { auth } from "@/lib/auth";
import { logEvent, requestCtx } from "@/lib/log";
import { ITEMS, buy, type Item } from "@/lib/shop";
import { MAT_COLORS, type MatColor } from "@/lib/mat-colors";

/** 매점 구매  */
export async function POST(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return new Response(null, { status: 401 });
  const { item, color } = await req.json().catch(() => ({})) as { item?: string; color?: string };
  if (!ITEMS.includes(item as Item)) return new Response(null, { status: 400 });
  const r = await buy(s.user.id, item as Item, MAT_COLORS.includes(color as MatColor) ? color as MatColor : "pink");
  await logEvent(r.ok ? "shop.purchased" : "shop.refused", r.ok ? { item, ...(item === "mat" ? { color } : {}), price: r.price, balance: r.balance } : { item, reason: r.reason, balance: r.balance },
    { userId: s.user.id, sessionId: s.session.id, ...requestCtx(req.headers) });
  return Response.json(r);
}
