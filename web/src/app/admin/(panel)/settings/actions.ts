"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { gameSettings } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { logEvent, requestCtx } from "@/lib/log";
import { DEFAULTS, META, getSettings, invalidateSettings, type SettingsGroup } from "@/lib/settings";

const back = (q: Record<string, string>) => redirect(`/admin/settings?${new URLSearchParams(q)}`);

export async function saveGroup(form: FormData) {
  await requireAdmin();
  const group = String(form.get("group")) as SettingsGroup;
  if (!(group in DEFAULTS)) back({ error: "알 수 없는 설정이에요" });
  const before = (await getSettings())[group] as Record<string, number>;
  const fields = META[group].fields as Record<string, { label: string; min: number; max: number }>;
  const next: Record<string, number> = {};
  for (const [k, m] of Object.entries(fields)) {
    const v = Number(form.get(k));
    if (!Number.isInteger(v) || v < m.min || v > m.max) back({ error: `${m.label}: ${m.min}~${m.max} 사이 정수로 입력해 주세요`, g: group });
    next[k] = v;
  }
  if ("minIntervalSec" in next && next.minIntervalSec > next.maxIntervalSec) back({ error: "간격은 최소가 최대보다 클 수 없어요", g: group });

  await db.insert(gameSettings).values({ key: group, value: next })
    .onConflictDoUpdate({ target: gameSettings.key, set: { value: next, updatedAt: new Date() } });
  invalidateSettings();
  await logEvent("admin.settings.updated", { group, before, after: next }, requestCtx(await headers()));
  back({ saved: group });
}

export async function resetGroup(form: FormData) {
  await requireAdmin();
  const group = String(form.get("group")) as SettingsGroup;
  if (!(group in DEFAULTS)) back({ error: "알 수 없는 설정이에요" });
  const before = (await getSettings())[group];
  await db.delete(gameSettings).where(eq(gameSettings.key, group));
  invalidateSettings();
  await logEvent("admin.settings.updated", { group, before, after: DEFAULTS[group], reset: true }, requestCtx(await headers()));
  back({ saved: group });
}
