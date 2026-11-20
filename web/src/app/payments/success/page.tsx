import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { logEvent, requestCtx } from "@/lib/log";
import { confirmOrder } from "@/lib/payments";
import { Result } from "../result";

export const instant = false;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

// 토스 결제창에서 돌아오는 곳: 서버에서 승인 → 그린 지급 → 공원으로
export default async function PaymentSuccess({ searchParams }: PageProps<"/payments/success">) {
  const q = await searchParams, h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session) redirect("/");
  const r = await confirmOrder(session.user.id, { paymentKey: one(q.paymentKey), orderId: one(q.orderId), amount: Number(one(q.amount)) });
  await logEvent(r.ok ? "payment.confirmed" : "payment.failed", r.ok ? { orderId: one(q.orderId), amount: r.amount, already: r.already } : { orderId: one(q.orderId), message: r.message },
    { userId: session.user.id, sessionId: session.session.id, ...requestCtx(h) });
  if (r.ok) redirect(`/park?charged=${r.amount}`);
  return <Result title="결제를 완료하지 못했어요" message={r.message} />;
}
