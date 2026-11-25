"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { siteContent } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { logEvent, requestCtx } from "@/lib/log";
import { MESSAGES, type MsgKey } from "@/content/messages";

/** 안내 멘트 저장: 기본값과 다르고 비어 있지 않은 것만 남김 (비우면 기본값으로 돌아감) */
export async function saveMessages(form: FormData) {
  await requireAdmin();
  const out: Partial<Record<MsgKey, string>> = {};
  for (const k of Object.keys(MESSAGES) as MsgKey[]) {
    const v = String(form.get(k) ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 300);
    if (v.trim() && v !== MESSAGES[k].text) out[k] = v;
  }
  await db.insert(siteContent).values({ key: "messages", value: out })
    .onConflictDoUpdate({ target: siteContent.key, set: { value: out, updatedAt: new Date() } });
  await logEvent("admin.content.updated", { key: "messages", changed: Object.keys(out).length }, requestCtx(await headers()));
  redirect("/admin/messages?saved=1");
}

export async function resetMessages() {
  await requireAdmin();
  await db.delete(siteContent).where(eq(siteContent.key, "messages"));
  await logEvent("admin.content.updated", { key: "messages", reset: true }, requestCtx(await headers()));
  redirect("/admin/messages?saved=1");
}
