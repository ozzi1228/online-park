// 관리자 인증: 관리자는 한 명 → 환경변수 비밀번호 + 서명된 쿠키(12시간).
// ponytail: 비밀번호 하나. 관리자가 여러 명이 되거나 2단계 인증이 필요해지면 계정 테이블로
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";

const COOKIE = "sakura_admin";
const HOURS = 12;
const key = () => {
  const s = process.env.BETTER_AUTH_SECRET;
  if (!s) throw new Error("BETTER_AUTH_SECRET 필요");
  return `admin:${s}`;
};
const sign = (v: string) => createHmac("sha256", key()).update(v).digest("base64url");
const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/** 비밀번호 확인 (길이가 달라도 시간 차이로 새지 않게 해시끼리 비교) */
export function checkPassword(input: string) {
  const real = process.env.ADMIN_PASSWORD;
  if (!real || real.length < 12) return false; // 설정 안 됐거나 너무 짧으면 로그인 불가
  return same(sign(`pw:${input}`), sign(`pw:${real}`));
}

export async function setAdminCookie() {
  const exp = Date.now() + HOURS * 3_600_000;
  (await cookies()).set(COOKIE, `${exp}.${sign(String(exp))}`, {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/admin", maxAge: HOURS * 3600,
  });
}

export async function clearAdminCookie() { (await cookies()).delete({ name: COOKIE, path: "/admin" }); }

export async function isAdmin() {
  await connection(); // 만료 시각 비교는 요청 시각 기준
  const v = (await cookies()).get(COOKIE)?.value;
  if (!v) return false;
  const [exp, sig] = v.split(".");
  return !!exp && !!sig && Number(exp) > Date.now() && same(sig, sign(exp));
}

/** 관리자 화면·액션 맨 앞에서 호출 */
export async function requireAdmin() { if (!(await isAdmin())) redirect("/admin/login"); }

// 로그인 시도 제한: IP당 10분에 5번
const tries = new Map<string, { n: number; until: number }>();
export function loginAllowed(ip: string) {
  const t = tries.get(ip);
  if (!t || t.until < Date.now()) return true;
  return t.n < 5;
}
export function recordFailure(ip: string) {
  const t = tries.get(ip);
  if (!t || t.until < Date.now()) tries.set(ip, { n: 1, until: Date.now() + 10 * 60_000 });
  else t.n++;
}
