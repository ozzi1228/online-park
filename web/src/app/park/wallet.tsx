"use client";

import { useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { MAT_COLORS, MAT_COLOR_NAMES, MAT_SWATCH, type MatColor } from "@/lib/mat-colors";

export type MeInfo = {
  isGuest: boolean;
  green: number;
  items: { noteSheets: number; mat: boolean; matColor: MatColor };
  shop: { notebookPrice: number; notebookSheets: number; matPrice: number };
  charge: { product: string; amount: number }[];
  paymentsReady: boolean;
  unreadNotes: number;
  fountainPrice: number;
  fountain: { rewardOuter: number; rewardMid: number; rewardBull: number; midPct: number; bullPct: number };
  sound: { wind: number; water: number; crowd: number; nature: number; sfx: number };
  controls: { walkSpeedCm: number; turnSpeed: number; cameraBackCm: number; cameraSideCm: number };
  cat: { enabled: number; count: number };
};

const card = "absolute inset-x-4 bottom-24 z-20 mx-auto max-h-[calc(100dvh-7rem)] w-auto max-w-[24rem] overflow-y-auto rounded-3xl bg-cream/95 p-5 shadow-xl ring-1 ring-sakura/20";
const fmt = (n: number) => n.toLocaleString("ko-KR");

function GuestNote() {
  return (
    <p className="mt-4 rounded-2xl bg-sakura/15 px-4 py-3 text-sm">
      충전은 회원만 할 수 있어요. {/* 새로 불러오기: 공원(3D)을 숨겨 둔 채 넘어가면 휴대폰에서 첫 화면 버튼이 먹통이 됨 */}
      <button onClick={() => location.replace("/")} className="underline">처음 화면</button>에서 로그인하면 쓴 그린·산 물건은 그대로 가져가요.
    </p>
  );
}

/** 내 지갑: 잔액, 가방, 충전 */
export function WalletPanel({ me, onClose }: { me: MeInfo; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const charge = async (product: string) => {
    setBusy(product); setError("");
    try {
      const r = await fetch("/api/payments/order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ product }) });
      if (!r.ok) throw new Error(r.status === 503 ? "결제 설정이 아직 안 됐어요" : "주문을 만들지 못했어요");
      const o = await r.json() as { orderId: string; amount: number; orderName: string; customerKey: string; clientKey: string };
      const toss = await loadTossPayments(o.clientKey);
      await toss.payment({ customerKey: o.customerKey }).requestPayment({
        method: "CARD", amount: { currency: "KRW", value: o.amount }, orderId: o.orderId, orderName: o.orderName,
        successUrl: `${location.origin}/payments/success`, failUrl: `${location.origin}/payments/fail`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "결제를 시작하지 못했어요");
      setBusy(null);
    }
  };
  return (
    <section role="dialog" aria-label="내 지갑" className={card}>
      <div className="mb-3 flex items-center">
        <h2 className="text-lg">내 지갑</h2>
        <button onClick={onClose} aria-label="닫기" className="ml-auto px-2 text-xl opacity-60">×</button>
      </div>
      <p className="flex items-center gap-2 text-3xl tabular-nums"><GreenCoin className="size-7" /> {fmt(me.green)} <span className="text-base opacity-60">그린</span></p>
      <p className="mt-1 text-sm opacity-70">가방: 벚꽃잎 노트 {me.items.noteSheets}장 · 돗자리 {me.items.mat ? `${MAT_COLOR_NAMES[me.items.matColor]} 1장` : "없음"}</p>
      {me.isGuest ? <GuestNote /> : (
        <>
          <h3 className="mb-2 mt-4 text-sm opacity-70">충전하기 (1그린 = 1원)</h3>
          <div className="grid grid-cols-3 gap-2">
            {me.charge.map((c) => (
              <button key={c.product} disabled={!!busy || !me.paymentsReady} onClick={() => charge(c.product)}
                className="rounded-2xl bg-white py-3 ring-1 ring-sakura/40 disabled:opacity-50">
                <span className="block tabular-nums">{fmt(c.amount)}</span><span className="text-xs opacity-60">{fmt(c.amount)}원</span>
              </button>
            ))}
          </div>
          {!me.paymentsReady && <p className="mt-2 text-xs opacity-60">결제 설정 전이에요 (토스페이먼츠 키 필요)</p>}
          {busy && <p className="mt-2 text-xs opacity-60">결제창을 여는 중…</p>}
          {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
        </>
      )}
    </section>
  );
}

/** 매점: 노트·돗자리 */
export function ShopPanel({ me, onClose, onBought }: { me: MeInfo; onClose: () => void; onBought: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [color, setColor] = useState<MatColor>("pink");
  const buy = async (item: "notebook" | "mat") => {
    setBusy(true); setError("");
    const r = await fetch("/api/shop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ item, color }) })
      .then((x) => x.json() as Promise<{ ok: boolean; reason?: string }>).catch(() => null);
    setBusy(false);
    if (r?.ok) onBought(item === "notebook" ? `벚꽃잎 노트를 샀어요 (+${me.shop.notebookSheets}장)` : `${MAT_COLOR_NAMES[color]} 돗자리를 샀어요! 잔디밭에서 앉으면 깔려요`);
    else setError(r?.reason === "insufficient" ? "그린이 모자라요" : r?.reason === "owned" ? "돗자리는 이미 있어요" : "살 수 없었어요");
  };
  const items = [
    { id: "notebook" as const, name: "벚꽃잎 노트", desc: `${me.shop.notebookSheets}장 · 손글씨 쪽지용`, price: me.shop.notebookPrice, disabled: false },
    { id: "mat" as const, name: "돗자리", desc: me.items.mat ? `${MAT_COLOR_NAMES[me.items.matColor]} 돗자리를 갖고 있어요` : `${MAT_COLOR_NAMES[color]} · 잔디밭에 깔고 앉기`, price: me.shop.matPrice, disabled: me.items.mat },
  ];
  return (
    <section role="dialog" aria-label="매점" className={card}>
      <div className="mb-3 flex items-center">
        <h2 className="text-lg">매점</h2>
        <span className="ml-3 inline-flex items-center gap-1 text-sm tabular-nums opacity-70"><GreenCoin /> {fmt(me.green)}</span>
        <button onClick={onClose} aria-label="닫기" className="ml-auto px-2 text-xl opacity-60">×</button>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3">
            <div className="min-w-0 flex-1"><p>{it.name}</p><p className="text-xs opacity-60">{it.desc}</p>
              {it.id === "mat" && !me.items.mat && (
                <div role="radiogroup" aria-label="돗자리 색" className="mt-1.5 flex gap-1.5">
                  {MAT_COLORS.map((c) => (
                    <button key={c} role="radio" aria-checked={c === color} aria-label={MAT_COLOR_NAMES[c]} title={MAT_COLOR_NAMES[c]} onClick={() => setColor(c)}
                      className={`size-6 rounded-full ring-1 ring-black/15 ${c === color ? "outline-2 outline-offset-2 outline-sakura-deep" : ""}`} style={{ background: MAT_SWATCH[c] }} />
                  ))}
                </div>
              )}
            </div>
            <button disabled={busy || it.disabled} onClick={() => buy(it.id)}
              className="shrink-0 rounded-full bg-sakura px-4 py-1.5 text-sm text-white disabled:opacity-50">{fmt(it.price)}그린</button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}

/** 그린 화폐 아이콘: 청록빛 엽전 (네모 구멍 + 새긴 테두리·획) */
export function GreenCoin({ className = "size-[1.15em]" }: { className?: string }) {
  const dark = "#155e57", light = "#9fe3d7";
  // 음각 = 어두운 홈 + 아래쪽에 밝은 턱
  const cut = (d: string) => (<><path d={d} stroke={light} strokeWidth="1.1" transform="translate(0 0.7)" /><path d={d} stroke={dark} strokeWidth="1.1" /></>);
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={`inline-block shrink-0 ${className}`} fill="none" strokeLinecap="round">
      <circle cx="12" cy="12" r="11.3" fill="#2e9c8f" stroke={dark} strokeWidth="1" />
      <circle cx="12" cy="12.5" r="9" stroke={light} strokeWidth="0.9" />
      <circle cx="12" cy="12" r="9" stroke={dark} strokeWidth="0.9" />
      <rect x="8.2" y="8.7" width="7.6" height="7.6" stroke={light} strokeWidth="0.9" />
      <rect x="8.2" y="8.2" width="7.6" height="7.6" stroke={dark} strokeWidth="0.9" />
      <rect x="9.7" y="9.7" width="4.6" height="4.6" fill={dark} />
      <path d="M10 14.3h4.3V10" stroke={light} strokeWidth="0.7" />
      {cut("M10.6 5.2h2.8")}{cut("M10.6 18.6h2.8M12 17.6v2")}{cut("M5.2 10.8v2.6")}{cut("M18.8 10.6v2.8M17.9 12h1.8")}
    </svg>
  );
}
