import { auth } from "@/lib/auth";
import { logEvent, requestCtx } from "@/lib/log";

// 브라우저에서 보내는 행동 로그. 로그인(비회원 포함)한 세션만, 형식·크기 제한
const TYPE = /^[a-z]+(\.[a-z_]+){1,3}$/;
const MAX_DATA = 2000;

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return new Response(null, { status: 401 });

  const body = await req.json().catch(() => null) as { type?: unknown; data?: unknown } | null;
  const type = body?.type, data = body?.data ?? {};
  if (typeof type !== "string" || !TYPE.test(type) || typeof data !== "object" || JSON.stringify(data).length > MAX_DATA) {
    return new Response(null, { status: 400 });
  }
  await logEvent(`client.${type}`, data as Record<string, unknown>, {
    userId: session.user.id,
    isGuest: !!session.user.isAnonymous,
    sessionId: session.session.id,
    ...requestCtx(req.headers),
  });
  return new Response(null, { status: 204 });
}
