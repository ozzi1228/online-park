"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, clearAdminCookie, loginAllowed, recordFailure, setAdminCookie } from "@/lib/admin";
import { logEvent, requestCtx } from "@/lib/log";

/** 성공하면 "ok" — 화면이 새로 불러와서 들어감 (액션 안에서 바로 이동하면 쿠키가 아직 안 붙은 채 관리자 화면을 그려 로그인 창으로 되돌아오고, 두 번째에야 들어가졌음) */
export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  const ctx = requestCtx(await headers()), ip = ctx.ip ?? "unknown";
  if (!loginAllowed(ip)) return "잠시 후 다시 시도해 주세요. (10분에 5번까지)";
  if (!checkPassword(String(form.get("password") ?? ""))) {
    recordFailure(ip);
    await logEvent("admin.login_failed", {}, ctx);
    return "비밀번호가 맞지 않아요.";
  }
  await setAdminCookie();
  await logEvent("admin.login", {}, ctx);
  return "ok";
}

export async function logout() {
  await clearAdminCookie();
  redirect("/admin/login");
}
