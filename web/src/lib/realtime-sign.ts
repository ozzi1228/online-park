// 실시간 서버에 넘기는 값에 서명: base64url(json).base64url(hmac). 서버끼리만 아는 REALTIME_SECRET 으로
// (실시간 서버 입장권, 고양이 부르기 결과). realtime/src/index.ts 의 verify 와 짝
import { createHmac } from "node:crypto";

export function signForRealtime(payload: object) {
  const secret = process.env.REALTIME_SECRET;
  if (!secret) return null;
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}
