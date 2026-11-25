import { auth } from "@/lib/auth";
import { logEvent, requestCtx } from "@/lib/log";
import { callCat, feed, isCat, myBonds, nameCat, pet } from "@/lib/cat-bond";

const session = (req: Request) => auth.api.getSession({ headers: req.headers });

/** 내 고양이들: 하트 개수·지어 준 이름 */
export async function GET(req: Request) {
  const s = await session(req);
  if (!s) return new Response(null, { status: 401 });
  return Response.json(await myBonds(s.user.id), { headers: { "cache-control": "no-store" } });
}

/** 고양이에게 하기: { cat, act: "pet" } 쓰다듬기 · { cat, act: "call" } 부르기 · { cat, act: "name", name } 이름 지어 주기 */
export async function POST(req: Request) {
  const s = await session(req);
  if (!s) return new Response(null, { status: 401 });
  const body = await req.json().catch(() => ({})) as { cat?: unknown; act?: unknown; name?: unknown; saw?: unknown };
  if (!isCat(body.cat)) return new Response(null, { status: 400 });
  const ctx = { userId: s.user.id, isGuest: !!s.user.isAnonymous, sessionId: s.session.id, ...requestCtx(req.headers) };
  if (body.act === "pet") {
    const r = await pet(s.user.id, body.cat);
    await logEvent("cat.pet", { cat: body.cat, ...r }, ctx);
    return Response.json(r);
  }
  if (body.act === "feed") {
    const saw = Array.isArray(body.saw) ? body.saw.filter(isCat).slice(0, 6) : [];
    const r = await feed(s.user.id, body.cat, saw);
    await logEvent(r.ok ? "cat.fed" : "cat.feed_refused", { cat: body.cat, ...(r.ok ? { churuLeft: r.churuLeft, jealous: r.jealous } : { reason: r.reason }) }, ctx);
    return Response.json(r);
  }
  if (body.act === "call") {
    const r = await callCat(s.user.id, body.cat);
    await logEvent(r.ok ? "cat.call" : "cat.call_refused", { cat: body.cat, ...(r.ok ? { comes: r.comes } : { reason: r.reason }) }, ctx);
    return Response.json(r);
  }
  if (body.act === "name" && typeof body.name === "string") {
    const r = await nameCat(s.user.id, body.cat, body.name);
    await logEvent(r.ok ? "cat.named" : "cat.name_refused", { cat: body.cat, ...(r.ok ? { name: r.name } : { reason: r.reason }) }, ctx);
    return Response.json(r);
  }
  return new Response(null, { status: 400 });
}
