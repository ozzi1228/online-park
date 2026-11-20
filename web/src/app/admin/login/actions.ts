"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, clearAdminCookie, loginAllowed, recordFailure, setAdminCookie } from "@/lib/admin";
import { logEvent, requestCtx } from "@/lib/log";

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
  redirect("/admin");
}

export async function logout() {
  await clearAdminCookie();
  redirect("/admin/login");
}
