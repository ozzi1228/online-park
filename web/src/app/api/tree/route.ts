import { auth } from "@/lib/auth";
import { logEvent, requestCtx } from "@/lib/log";
import { cleanStrokes } from "@/lib/notes-shared";
import { attachToTree, listTree, peel, recover, removeNote } from "@/lib/tree";

const session = (req: Request) => auth.api.getSession({ headers: req.headers });

/** 소원나무에 달린 쪽지 (누구나) */
export async function GET(req: Request) {
  const s = await session(req);
  return Response.json(await listTree(s?.user.id ?? null), { headers: { "cache-control": "no-store" } });
}

/** 쪽지 달기 (회원 전용): { strokes, covered, x, y, z } */
export async function POST(req: Request) {
  const s = await session(req);
  if (!s) return new Response(null, { status: 401 });
  if (s.user.isAnonymous) return Response.json({ ok: false, reason: "member_only" }, { status: 403 });
  const b = await req.json().catch(() => ({})) as { strokes?: unknown; covered?: unknown; x?: unknown; y?: unknown; z?: unknown };
  const strokes = cleanStrokes(b.strokes);
  if (!strokes) return Response.json({ ok: false, reason: "invalid" }, { status: 400 });
  const r = await attachToTree(s.user.id, strokes, b.covered === true, { x: Number(b.x), y: Number(b.y), z: Number(b.z) });
  await logEvent(r.ok ? "tree.attached" : "tree.refused", r.ok ? { noteId: r.id, covered: b.covered === true, sheetsLeft: r.sheetsLeft } : { reason: r.reason },
    { userId: s.user.id, sessionId: s.session.id, ...requestCtx(req.headers) });
  return Response.json(r);
}

/** 내 쪽지: { id, action: "peel"(겹친 장 떼기) | "cover"(가리기, 노트 1장) | "remove"(떼어 내기) } */
export async function PATCH(req: Request) {
  const s = await session(req);
  if (!s) return new Response(null, { status: 401 });
  const { id, action } = await req.json().catch(() => ({})) as { id?: unknown; action?: unknown };
  if (!Number.isInteger(id)) return new Response(null, { status: 400 });
  if (action === "peel") {
    const ok = await peel(s.user.id, id as number);
    await logEvent("tree.peeled", { noteId: id, ok }, { userId: s.user.id, sessionId: s.session.id });
    return Response.json({ ok });
  }
  if (action === "remove") {
    const ok = await removeNote(s.user.id, id as number);
    await logEvent("tree.removed", { noteId: id, ok }, { userId: s.user.id, sessionId: s.session.id });
    return Response.json({ ok });
  }
  if (action === "cover") {
    const r = await recover(s.user.id, id as number);
    await logEvent("tree.recovered", { noteId: id, ...r }, { userId: s.user.id, sessionId: s.session.id });
    return Response.json(r);
  }
  return new Response(null, { status: 400 });
}
