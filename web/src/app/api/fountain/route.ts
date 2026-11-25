import { auth } from "@/lib/auth";
import { logEvent, requestCtx } from "@/lib/log";
import { tossCoin } from "@/lib/tree";
import { FOUNTAIN, validLaunch } from "@/game/coin-sim";

const vec = (v: unknown) => {
  const o = v as { x?: unknown; y?: unknown; z?: unknown } | null;
  return o && [o.x, o.y, o.z].every((n) => typeof n === "number" && Number.isFinite(n)) ? { x: o.x as number, y: o.y as number, z: o.z as number } : null;
};

/** 분수에 동전 던지기: 던진 자리·속도를 받아 서버가 떨어질 곳을 다시 계산 → 그린 차감 + 과녁 보상 */
export async function POST(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return new Response(null, { status: 401 });
  const body = await req.json().catch(() => ({})) as { from?: unknown; vel?: unknown };
  const from = vec(body.from), vel = vec(body.vel);
  // 분수 근처(메뉴가 뜨는 9m 안 + 여유)에서 손 높이로, 새총이 낼 수 있는 속도로만
  if (!from || !vel || !validLaunch(vel) || Math.hypot(from.x - FOUNTAIN.x, from.z - FOUNTAIN.z) > 10 || from.y < 0.5 || from.y > 2.5)
    return Response.json({ ok: false, reason: "invalid" }, { status: 400 });
  const r = await tossCoin(s.user.id, from, vel);
  await logEvent(r.ok ? "fountain.coin" : "fountain.refused",
    r.ok ? { price: r.price, balance: r.balance, land: r.shot.kind, ring: r.shot.ring, d: Math.round(r.shot.d * 100) / 100, reward: r.reward, capped: r.capped } : { reason: r.reason, balance: r.balance },
    { userId: s.user.id, sessionId: s.session.id, ...requestCtx(req.headers) });
  return Response.json(r);
}
