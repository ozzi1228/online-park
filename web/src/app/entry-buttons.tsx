"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

const LABELS: Record<string, { text: string; className: string }> = {
  naver: { text: "네이버로 시작", className: "bg-[#03C75A] text-white" },
  kakao: { text: "카카오로 시작", className: "bg-[#FEE500] text-[#191919]" },
  google: { text: "구글로 시작", className: "bg-white text-[#3c4043] ring-1 ring-[#dadce0]" },
};

export function EntryButtons({ providers, guest = false }: { providers: string[]; guest?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const asGuest = async () => {
    if (guest) { router.push("/park"); return; } // 이미 비회원으로 들어와 있음
    setBusy(true); setError("");
    const { error } = await authClient.signIn.anonymous();
    if (error) { setBusy(false); setError("입장하지 못했어요. 잠시 후 다시 시도해 주세요."); return; }
    router.push("/park");
  };
  const social = (provider: string) => {
    setBusy(true);
    authClient.signIn.social({ provider, callbackURL: "/park" });
  };

  return (
    <div className="flex w-full max-w-xs flex-col gap-3">
      <button onClick={asGuest} disabled={busy}
        className="rounded-full bg-sakura py-3.5 text-lg text-white shadow-[0_3px_0_var(--color-sakura-deep)] active:translate-y-0.5 active:shadow-none disabled:opacity-60">
        {guest ? "비회원으로 계속 둘러보기" : "비회원으로 둘러보기"}
      </button>
      {providers.length > 0 && <p className="mt-2 text-center text-sm opacity-70">회원은 그린으로 노트·소원 기능을 쓸 수 있어요</p>}
      {providers.map((p) => (
        <button key={p} onClick={() => social(p)} disabled={busy}
          className={`rounded-full py-3 disabled:opacity-60 ${LABELS[p]?.className ?? ""}`}>
          {LABELS[p]?.text ?? p}
        </button>
      ))}
      {error && <p role="alert" className="text-center text-sm text-red-600">{error}</p>}
    </div>
  );
}
