// 그린 충전: 주문 생성 → (브라우저) 토스 결제창 → successUrl에서 서버 승인 → 그린 지급.
// 금액은 항상 서버 주문 기록 기준. 같은 주문은 두 번 지급되지 않음 (ledger (reason, refId) 유니크).
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { greenLedger, orders } from "@/db/schema";
import { getSettings } from "@/lib/settings";

export const PRODUCTS = ["chargeSmall", "chargeMedium", "chargeLarge"] as const;
export type Product = (typeof PRODUCTS)[number];

export const paymentsReady = () => !!process.env.TOSS_CLIENT_KEY && !!process.env.TOSS_SECRET_KEY;

export async function chargeOptions() {
  const { green } = await getSettings();
  return PRODUCTS.map((p) => ({ product: p, amount: green[p] }));
}

export async function createOrder(userId: string, product: Product) {
  const amount = (await getSettings()).green[product];
  const id = `g_${randomUUID().replaceAll("-", "")}`; // 토스 규칙: 6~64자, 영문·숫자·-_=
  await db.insert(orders).values({ id, userId, amount });
  return {
    orderId: id, amount, orderName: `${amount.toLocaleString("ko-KR")}그린 충전`,
    customerKey: `u_${userId}`,                       // 토스 규칙: 22자 이상 + 특수문자(_ 등) 하나 이상
    clientKey: process.env.TOSS_CLIENT_KEY!,
  };
}

type TossError = { code?: string; message?: string };

export async function confirmOrder(userId: string, q: { paymentKey: string; orderId: string; amount: number }) {
  const [order] = await db.select().from(orders).where(eq(orders.id, q.orderId));
  if (!order || order.userId !== userId) return { ok: false as const, message: "주문을 찾을 수 없어요." };
  if (order.status === "paid") return { ok: true as const, amount: order.amount, already: true }; // 새로고침 등 재요청
  if (order.status !== "pending") return { ok: false as const, message: "이미 처리된 주문이에요." };
  if (order.amount !== q.amount) { // 결제창에서 금액이 바뀌었으면 승인하지 않음
    await markFailed(order.id, "AMOUNT_MISMATCH", `주문 ${order.amount}원 / 요청 ${q.amount}원`);
    return { ok: false as const, message: "결제 금액이 주문과 달라서 승인하지 않았어요." };
  }

  const res = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.TOSS_SECRET_KEY}:`).toString("base64")}`,
      "Content-Type": "application/json",
      "Idempotency-Key": order.id, // 같은 주문의 재시도는 토스에서도 한 번만 처리
    },
    body: JSON.stringify({ paymentKey: q.paymentKey, orderId: order.id, amount: order.amount }),
  });
  const body = await res.json().catch(() => ({})) as Record<string, unknown> & TossError;
  if (!res.ok || body.status !== "DONE") {
    await markFailed(order.id, String(body.code ?? res.status), String(body.message ?? "승인 실패"), body);
    return { ok: false as const, message: String(body.message ?? "결제 승인에 실패했어요.") };
  }

  // 주문 완료 + 그린 지급을 한 번에
  await db.transaction(async (tx) => {
    const done = await tx.update(orders).set({
      status: "paid", paymentKey: q.paymentKey, method: String(body.method ?? ""), raw: body,
      approvedAt: body.approvedAt ? new Date(String(body.approvedAt)) : new Date(),
    }).where(and(eq(orders.id, order.id), eq(orders.status, "pending"))).returning({ id: orders.id });
    if (done.length) await tx.insert(greenLedger).values({ userId, amount: order.amount, reason: "charge", refId: order.id }).onConflictDoNothing();
  });
  return { ok: true as const, amount: order.amount, already: false };
}

export async function markFailed(orderId: string, code: string, message: string, raw?: unknown) {
  await db.update(orders).set({ status: code === "PAY_PROCESS_CANCELED" ? "canceled" : "failed", failCode: code.slice(0, 100), failMessage: message.slice(0, 500), raw: raw ?? null })
    .where(and(eq(orders.id, orderId), eq(orders.status, "pending")));
}
