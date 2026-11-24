import { auth } from "@/lib/auth";
import { logEvent, requestCtx } from "@/lib/log";
import { tossCoin } from "@/lib/tree";

/** 분수에 동전 던지기 (그린 차감) */
export async function POST(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return new Response(null, { status: 401 });
  const r = await tossCoin(s.user.id);
  await logEvent(r.ok ? "fountain.coin" : "fountain.refused", r.ok ? { price: r.price, balance: r.balance } : { reason: r.reason, balance: r.balance },
    { userId: s.user.id, sessionId: s.session.id, ...requestCtx(req.headers) });
  return Response.json(r);
}
