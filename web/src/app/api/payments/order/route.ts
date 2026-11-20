import { auth } from "@/lib/auth";
import { logEvent, requestCtx } from "@/lib/log";
import { PRODUCTS, createOrder, paymentsReady, type Product } from "@/lib/payments";

/** 충전 주문 만들기 (회원 전용). 금액은 서버 설정값으로 정함 */
export async function POST(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s) return new Response(null, { status: 401 });
  if (s.user.isAnonymous) return Response.json({ error: "member_only" }, { status: 403 });
  if (!paymentsReady()) return Response.json({ error: "not_configured" }, { status: 503 });
  const { product } = await req.json().catch(() => ({})) as { product?: string };
  if (!PRODUCTS.includes(product as Product)) return new Response(null, { status: 400 });
  const order = await createOrder(s.user.id, product as Product);
  await logEvent("payment.order_created", { orderId: order.orderId, amount: order.amount }, { userId: s.user.id, sessionId: s.session.id, ...requestCtx(req.headers) });
  return Response.json(order);
}
