"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { siteContent } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { textToGuide } from "@/lib/content";
import { logEvent, requestCtx } from "@/lib/log";

export async function saveGuide(form: FormData) {
  await requireAdmin();
  const g = textToGuide({ intro: String(form.get("intro") ?? ""), tips: String(form.get("tips") ?? ""), howTo: String(form.get("howTo") ?? "") });
  if (typeof g === "string") redirect(`/admin/content?${new URLSearchParams({ error: g })}`);
  await db.insert(siteContent).values({ key: "guide", value: g })
    .onConflictDoUpdate({ target: siteContent.key, set: { value: g, updatedAt: new Date() } });
  await logEvent("admin.content.updated", { key: "guide", intro: g.intro.length, tips: g.tips.length, howTo: g.howTo.length }, requestCtx(await headers()));
  redirect("/admin/content?saved=1");
}

export async function resetGuide() {
  await requireAdmin();
  await db.delete(siteContent).where(eq(siteContent.key, "guide"));
  await logEvent("admin.content.updated", { key: "guide", reset: true }, requestCtx(await headers()));
  redirect("/admin/content?saved=1");
}
