import { createHmac } from "node:crypto";
import { auth } from "@/lib/auth";

// 실시간 서버 입장권: 1분짜리, 서버끼리만 아는 비밀값으로 서명 (realtime/src/index.ts 의 verify 와 짝)
export async function GET(req: Request) {
  const secret = process.env.REALTIME_SECRET, url = process.env.NEXT_PUBLIC_REALTIME_URL;
  if (!secret || !url) return Response.json({ error: "realtime not configured" }, { status: 503 });

  const session = await auth.api.getSession({ headers: req.headers });
  const user = session?.user;
  if (!user?.characterLockedAt || !user.characterPreset) return new Response(null, { status: 401 });

  const body = Buffer.from(JSON.stringify({
    uid: user.id, preset: user.characterPreset, nickname: user.nickname ?? "", exp: Date.now() + 60_000,
  })).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return Response.json({ token: `${body}.${sig}`, url }, { headers: { "cache-control": "no-store" } });
}
