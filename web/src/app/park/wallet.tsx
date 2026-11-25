"use client";

import { useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { MAT_COLORS, MAT_COLOR_NAMES, MAT_SWATCH, type MatColor } from "@/lib/mat-colors";
import { t as msg, type MsgKey } from "@/content/messages";

export type MeInfo = {
  isGuest: boolean;
  green: number;
  items: { noteSheets: number; mat: boolean; mats: MatColor[]; churu: number; rod: number };
  shop: { notebookPrice: number; notebookSheets: number; matPrice: number; churuPrice: number; churuPack: number; rodPrice: number; rodUses: number };
  charge: { product: string; amount: number }[];
  paymentsReady: boolean;
  unreadNotes: number;
  fountainPrice: number;
  fountain: { rewardOuter: number; rewardMid: number; rewardBull: number; midPct: number; bullPct: number };
  sound: { wind: number; water: number; crowd: number; nature: number; sfx: number };
  controls: { walkSpeedCm: number; turnSpeed: number; cameraBackCm: number; cameraSideCm: number };
  cat: { enabled: number; count: number };
  /** 관리자가 고친 안내 멘트 (content/messages.ts) */
  messages?: Partial<Record<MsgKey, string>>;
};

const card = "absolute inset-x-4 bottom-24 z-20 mx-auto max-h-[calc(100dvh-7rem)] w-auto max-w-[24rem] overflow-y-auto rounded-3xl bg-cream/95 p-5 shadow-xl ring-1 ring-sakura/20";
const fmt = (n: number) => n.toLocaleString("ko-KR");

function GuestNote() {
  return (
    <p className="mt-4 rounded-2xl bg-sakura/15 px-4 py-3 text-sm">
      {msg("wallet.guest")} {/* 새로 불러오기: 공원(3D)을 숨겨 둔 채 넘어가면 휴대폰에서 첫 화면 버튼이 먹통이 됨 */}
      <button onClick={() => location.replace("/")} className="underline">{msg("wallet.guestLink")}</button>{msg("wallet.guestAfter")}
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
      if (!r.ok) throw new Error(msg(r.status === 503 ? "wallet.noKey" : "wallet.orderFail"));
      const o = await r.json() as { orderId: string; amount: number; orderName: string; customerKey: string; clientKey: string };
      const toss = await loadTossPayments(o.clientKey);
      await toss.payment({ customerKey: o.customerKey }).requestPayment({
        method: "CARD", amount: { currency: "KRW", value: o.amount }, orderId: o.orderId, orderName: o.orderName,
        successUrl: `${location.origin}/payments/success`, failUrl: `${location.origin}/payments/fail`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : msg("wallet.startFail"));
      setBusy(null);
    }
  };
  return (
    <section role="dialog" aria-label="내 지갑" className={card}>
      <div className="mb-3 flex items-center">
        <h2 className="text-lg">{msg("wallet.title")}</h2>
        <button onClick={onClose} aria-label="닫기" className="ml-auto px-2 text-xl opacity-60">×</button>
      </div>
      <p className="flex items-center gap-2 text-3xl tabular-nums"><GreenCoin className="size-7" /> {fmt(me.green)} <span className="text-base opacity-60">{msg("shop.green", { n: "" }).trim()}</span></p>
      <p className="mt-1 text-sm opacity-70">{msg("wallet.bag", { notes: me.items.noteSheets, mats: me.items.mats.length ? me.items.mats.map((c) => MAT_COLOR_NAMES[c]).join("·") : msg("wallet.none"), churu: me.items.churu, rod: me.items.rod ? msg("wallet.rodLeft", { n: me.items.rod }) : msg("wallet.none") })}</p>
      {me.isGuest ? <GuestNote /> : (
        <>
          <h3 className="mb-2 mt-4 text-sm opacity-70">{msg("wallet.chargeTitle")}</h3>
          <div className="grid grid-cols-3 gap-2">
            {me.charge.map((c) => (
              <button key={c.product} disabled={!!busy || !me.paymentsReady} onClick={() => charge(c.product)}
                className="rounded-2xl bg-white py-3 ring-1 ring-sakura/40 disabled:opacity-50">
                <span className="block tabular-nums">{fmt(c.amount)}</span><span className="text-xs opacity-60">{fmt(c.amount)}원</span>
              </button>
            ))}
          </div>
          {!me.paymentsReady && <p className="mt-2 text-xs opacity-60">{msg("wallet.notReady")}</p>}
          {busy && <p className="mt-2 text-xs opacity-60">{msg("wallet.opening")}</p>}
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
  const [color, setColor] = useState<MatColor>(() => MAT_COLORS.find((c) => !me.items.mats.includes(c)) ?? "pink");
  const owned = (c: MatColor) => me.items.mats.includes(c), allMats = MAT_COLORS.every(owned);
  const buy = async (item: "notebook" | "mat" | "churu" | "rod") => {
    setBusy(true); setError("");
    const r = await fetch("/api/shop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ item, color }) })
      .then((x) => x.json() as Promise<{ ok: boolean; reason?: string }>).catch(() => null);
    setBusy(false);
    if (r?.ok && item === "mat") setColor(MAT_COLORS.find((c) => c !== color && !owned(c)) ?? color);
    if (r?.ok) onBought(item === "notebook" ? msg("shop.boughtNote", { n: me.shop.notebookSheets }) : item === "churu" ? msg("shop.boughtChuru", { n: me.shop.churuPack })
      : item === "rod" ? msg("shop.boughtRod") : msg("shop.boughtMat", { color: MAT_COLOR_NAMES[color] }));
    else setError(msg(r?.reason === "insufficient" ? "shop.noGreen" : r?.reason === "owned" ? (item === "rod" ? "shop.ownedRod" : "shop.ownedMat") : "shop.fail"));
  };
  const items = [
    { id: "notebook" as const, name: msg("item.notebook.name"), desc: msg("item.notebook.desc", { n: me.shop.notebookSheets }), price: me.shop.notebookPrice, disabled: false },
    { id: "churu" as const, name: msg("item.churu.name"), desc: `${msg("item.churu.desc", { n: me.shop.churuPack })} (${msg("shop.haveChuru", { n: me.items.churu })})`, price: me.shop.churuPrice, disabled: false },
    { id: "rod" as const, name: msg("item.rod.name"), desc: me.items.rod ? msg("shop.haveRod", { n: me.items.rod }) : msg("item.rod.desc", { n: me.shop.rodUses }), price: me.shop.rodPrice, disabled: me.items.rod > 0 },
    { id: "mat" as const, name: msg("item.mat.name"), desc: allMats ? msg("shop.allMats") : owned(color) ? msg("shop.haveMat", { color: MAT_COLOR_NAMES[color] }) : msg("item.mat.desc", { color: MAT_COLOR_NAMES[color] }), price: me.shop.matPrice, disabled: owned(color) },
  ];
  return (
    <section role="dialog" aria-label="매점" className={card}>
      <div className="mb-3 flex items-center">
        <h2 className="text-lg">{msg("shop.title")}</h2>
        <span className="ml-3 inline-flex items-center gap-1 text-sm tabular-nums opacity-70"><GreenCoin /> {fmt(me.green)}</span>
        <button onClick={onClose} aria-label="닫기" className="ml-auto px-2 text-xl opacity-60">×</button>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3">
            <div className="min-w-0 flex-1"><p>{it.name}</p><p className="text-xs opacity-60">{it.desc}</p>
              {it.id === "mat" && (
                <div role="radiogroup" aria-label="돗자리 색" className="mt-1.5 flex gap-1.5">
                  {MAT_COLORS.map((c) => (
                    <button key={c} role="radio" aria-checked={c === color} aria-label={`${MAT_COLOR_NAMES[c]}${owned(c) ? " (갖고 있음)" : ""}`} title={MAT_COLOR_NAMES[c]} onClick={() => setColor(c)}
                      className={`grid size-6 place-items-center rounded-full text-[11px] text-ink/70 ring-1 ring-black/15 ${c === color ? "outline-2 outline-offset-2 outline-sakura-deep" : ""}`} style={{ background: MAT_SWATCH[c] }}>{owned(c) ? "✓" : ""}</button>
                  ))}
                </div>
              )}
            </div>
            <button disabled={busy || it.disabled} onClick={() => buy(it.id)}
              className="shrink-0 rounded-full bg-sakura px-4 py-1.5 text-sm text-white disabled:opacity-50">{msg("shop.green", { n: fmt(it.price) })}</button>
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
