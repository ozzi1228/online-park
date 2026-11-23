import { createHmac } from "node:crypto";
import { auth } from "@/lib/auth";

// 실시간 서버 입장권: 1분짜리, 서버끼리만 아는 비밀값으로 서명 (realtime/src/index.ts 의 verify 와 짝)
export async function GET(req: Request) {
  // REALTIME_URL은 실행할 때 읽음 (운영 이미지를 주소와 상관없이 하나로 빌드하려고). 개발용 예전 이름도 받음
  const secret = process.env.REALTIME_SECRET, url = process.env.REALTIME_URL ?? process.env.NEXT_PUBLIC_REALTIME_URL;
  if (!secret || !url) return Response.json({ error: "realtime not configured" }, { status: 503 });

  const session = await auth.api.getSession({ headers: req.headers });
  const user = session?.user;
  if (!user?.characterLockedAt || !user.characterPreset) return new Response(null, { status: 401 });

  const body = Buffer.from(JSON.stringify({
    uid: user.id, preset: user.characterPreset, nickname: user.nickname ?? "", exp: Date.now() + 60_000,
  })).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  // 다른 기기(휴대폰)에서 접속했으면 실시간 서버 주소도 그 기기가 부른 호스트로 (localhost는 그 기기 자신이라)
  const ws = new URL(url), host = req.headers.get("host")?.split(":")[0];
  if ((ws.hostname === "localhost" || ws.hostname === "127.0.0.1") && host && host !== "localhost" && host !== "127.0.0.1") ws.hostname = host;
  return Response.json({ token: `${body}.${sig}`, url: ws.toString().replace(/\/$/, "") }, { headers: { "cache-control": "no-store" } });
}
