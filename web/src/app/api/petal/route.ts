import { auth } from "@/lib/auth";
import { logEvent, requestCtx } from "@/lib/log";
import { claimWishPetal, wishStatus } from "@/lib/wish-petal";

const session = (req: Request) => auth.api.getSession({ headers: req.headers });

/** 나에게 소원꽃잎이 보여도 되는지 + 나타나는 간격 */
export async function GET(req: Request) {
  const s = await session(req);
  if (!s) return new Response(null, { status: 401 });
  return Response.json(await wishStatus(s.user.id), { headers: { "cache-control": "no-store" } });
}

/** 잡기: 하루 선착순·1인당 횟수를 서버에서 판정 */
export async function POST(req: Request) {
  const s = await session(req);
  if (!s) return new Response(null, { status: 401 });
  const body = await req.json().catch(() => ({})) as { height?: unknown };
  const result = await claimWishPetal(s.user.id);
  await logEvent(result.ok ? "petal.caught" : "petal.claim_refused", {
    ...(result.ok ? { myCount: result.myCount, left: result.left } : { reason: result.reason }),
    height: typeof body.height === "number" ? Math.round(body.height * 100) / 100 : null,
  }, { userId: s.user.id, isGuest: !!s.user.isAnonymous, sessionId: s.session.id, ...requestCtx(req.headers) });
  return Response.json(result);
}
