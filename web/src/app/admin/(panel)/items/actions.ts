"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { siteContent } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { logEvent, requestCtx } from "@/lib/log";
import { getMessageOverrides } from "@/lib/content";
import { MESSAGES, type MsgKey } from "@/content/messages";

/** 매점 물품 이름·설명 저장 (안내 멘트와 같은 곳에, 이 물품 칸만 바꿔 넣음). 비우면 기본값 */
export async function saveItemTexts(form: FormData) {
  await requireAdmin();
  const cur = await getMessageOverrides();
  for (const k of Object.keys(MESSAGES) as MsgKey[]) {
    if (!k.startsWith("item.") || !form.has(k)) continue;
    const v = String(form.get(k) ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 300);
    if (v.trim() && v !== MESSAGES[k].text) cur[k] = v; else delete cur[k];
  }
  await db.insert(siteContent).values({ key: "messages", value: cur })
    .onConflictDoUpdate({ target: siteContent.key, set: { value: cur, updatedAt: new Date() } });
  await logEvent("admin.content.updated", { key: "messages", items: true }, requestCtx(await headers()));
  redirect("/admin/items?saved=1");
}
