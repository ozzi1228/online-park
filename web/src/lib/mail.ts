// 메일 보내기 (Resend API). 키가 없으면 조용히 건너뜀.
// RESEND_API_KEY: Resend 키, INQUIRY_EMAIL_TO: 새 문의 알림 받을 관리자 주소
// MAIL_FROM: 인증한 내 도메인 주소 (예: "랜선 벚꽃공원 <no-reply@도메인>"). 없으면 Resend 시험 주소 → 가입한 본인에게만 보낼 수 있음
const SITE = process.env.SITE_URL ?? "https://sakura-park-8660.japaneast.cloudapp.azure.com";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function send(to: string, subject: string, text: string, replyTo?: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || "랜선 벚꽃공원 <onboarding@resend.dev>", to: [to], subject,
        html: `<div style="font-family:sans-serif;white-space:pre-wrap;line-height:1.6">${esc(text)}</div>`, text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) console.error("mail failed", r.status, await r.text().catch(() => ""));
    return r.ok;
  } catch (e) {
    console.error("mail failed", e);
    return false;
  }
}

/** 새 문의 → 관리자에게 */
export function notifyInquiry(q: { id: number; nickname: string | null; email: string; category: string; content: string }) {
  return send(process.env.INQUIRY_EMAIL_TO ?? "", `[벚꽃공원 문의 #${q.id}] ${q.category} · ${q.nickname ?? "이름 없음"}`,
    `${q.content}\n\n답변받을 주소: ${q.email}\n관리자 화면: ${SITE}/admin/inquiries/${q.id}`, q.email);
}

/** 관리자 답변 → 문의한 사람에게. 내 도메인(MAIL_FROM)이 있어야 다른 사람에게 보낼 수 있어서 그 전엔 안 보냄 */
export function mailReply(q: { id: number; email: string; content: string; reply: string }) {
  if (!process.env.MAIL_FROM) return Promise.resolve(false);
  return send(q.email, "[랜선 벚꽃공원] 문의하신 내용에 답변드려요",
    `${q.reply}\n\n──────────\n남기신 문의:\n${q.content}\n\n공원 안내소의 '내 문의'에서도 볼 수 있어요. ${SITE}`);
}
