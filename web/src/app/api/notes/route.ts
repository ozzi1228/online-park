import { auth } from "@/lib/auth";
import { logEvent, requestCtx } from "@/lib/log";
import { cleanStrokes, giveNote, inbox, markRead } from "@/lib/notes";

const session = (req: Request) => auth.api.getSession({ headers: req.headers });

/** 받은 쪽지함 */
export async function GET(req: Request) {
  const s = await session(req);
  if (!s) return new Response(null, { status: 401 });
  return Response.json(await inbox(s.user.id), { headers: { "cache-control": "no-store" } });
}

/** 쪽지 건네기 (회원 전용, 노트 한 장 사용) */
export async function POST(req: Request) {
  const s = await session(req);
  if (!s) return new Response(null, { status: 401 });
  if (s.user.isAnonymous) return Response.json({ ok: false, reason: "member_only" }, { status: 403 });
  const body = await req.json().catch(() => ({})) as { to?: unknown; strokes?: unknown };
  const strokes = cleanStrokes(body.strokes);
  if (!strokes || typeof body.to !== "string") return Response.json({ ok: false, reason: "invalid" }, { status: 400 });
  const r = await giveNote(s.user.id, body.to, strokes);
  await logEvent(r.ok ? "note.given" : "note.refused", r.ok ? { noteId: r.id, to: body.to, strokes: strokes.length, sheetsLeft: r.sheetsLeft } : { to: body.to, reason: r.reason },
    { userId: s.user.id, sessionId: s.session.id, ...requestCtx(req.headers) });
  return Response.json(r);
}

/** 읽음 표시 */
export async function PATCH(req: Request) {
  const s = await session(req);
  if (!s) return new Response(null, { status: 401 });
  const { id } = await req.json().catch(() => ({})) as { id?: unknown };
  if (!Number.isInteger(id)) return new Response(null, { status: 400 });
  await markRead(s.user.id, id as number);
  await logEvent("note.read", { noteId: id }, { userId: s.user.id, isGuest: !!s.user.isAnonymous, sessionId: s.session.id });
  return new Response(null, { status: 204 });
}
