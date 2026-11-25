"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { inquiries } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { logEvent, requestCtx } from "@/lib/log";
import { mailReply } from "@/lib/mail";

/** 답변 저장 (안내소 '내 문의'에 바로 보임). 내 도메인 메일(MAIL_FROM)이 있으면 문의한 사람에게 메일도 보냄 */
export async function reply(form: FormData) {
  await requireAdmin();
  const id = Number(form.get("id")), text = String(form.get("reply") ?? "").trim(), status = String(form.get("status") ?? "answered");
  if (!Number.isInteger(id) || !["open", "answered", "closed"].includes(status)) redirect("/admin/inquiries?error=1");
  const [before] = await db.select({ reply: inquiries.reply }).from(inquiries).where(eq(inquiries.id, id));
  const [q] = await db.update(inquiries).set({ reply: text || null, status, repliedAt: text ? new Date() : null }).where(eq(inquiries.id, id))
    .returning({ email: inquiries.email, content: inquiries.content });
  const mailed = !!(q && text && text !== before?.reply && await mailReply({ id, email: q.email, content: q.content, reply: text }));
  await logEvent("admin.inquiry.replied", { inquiryId: id, status, length: text.length, mailed }, requestCtx(await headers()));
  redirect(`/admin/inquiries/${id}?saved=1`);
}
