"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { inquiries } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { logEvent, requestCtx } from "@/lib/log";

/** 답변 저장 (안내소 '내 문의'에 바로 보임). 메일 발송은 메일 서비스 연결 후 추가 */
export async function reply(form: FormData) {
  await requireAdmin();
  const id = Number(form.get("id")), text = String(form.get("reply") ?? "").trim(), status = String(form.get("status") ?? "answered");
  if (!Number.isInteger(id) || !["open", "answered", "closed"].includes(status)) redirect("/admin/inquiries?error=1");
  await db.update(inquiries).set({ reply: text || null, status, repliedAt: text ? new Date() : null }).where(eq(inquiries.id, id));
  await logEvent("admin.inquiry.replied", { inquiryId: id, status, length: text.length }, requestCtx(await headers()));
  redirect(`/admin/inquiries/${id}?saved=1`);
}
