import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { logEvent, requestCtx } from "@/lib/log";
import { markFailed } from "@/lib/payments";
import { Result } from "../result";

export const instant = false;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

// 결제창에서 취소·실패하고 돌아오는 곳 (code, message, orderId 가 붙어 옴. 취소 땐 orderId 없음)
export default async function PaymentFail({ searchParams }: PageProps<"/payments/fail">) {
  const q = await searchParams, h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session) redirect("/");
  const code = one(q.code), message = one(q.message), orderId = one(q.orderId);
  if (orderId) await markFailed(orderId, code || "FAILED", message || "결제 실패");
  await logEvent("payment.failed", { orderId: orderId || null, code, message }, { userId: session.user.id, sessionId: session.session.id, ...requestCtx(h) });
  if (code === "PAY_PROCESS_CANCELED") redirect("/park");
  return <Result title="pay.cancelTitle" message={message} />;
}
