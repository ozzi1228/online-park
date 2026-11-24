"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

// 로고만 있는 작은 동그라미 (각 서비스 로그인 버튼 가이드의 심볼 + 바탕색)
const LOGOS: Record<string, { name: string; bg: string; icon: React.ReactNode }> = {
  google: { name: "구글", bg: "bg-white ring-1 ring-[#dadce0]", icon: (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>) },
  kakao: { name: "카카오", bg: "bg-[#FEE500]", icon: (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
      <path fill="#191919" d="M12 3.5c-5.25 0-9.5 3.3-9.5 7.38 0 2.64 1.77 4.95 4.43 6.25l-.9 3.3c-.08.29.25.52.5.35l3.92-2.6c.51.06 1.03.09 1.55.09 5.25 0 9.5-3.3 9.5-7.39S17.25 3.5 12 3.5z" />
    </svg>) },
  naver: { name: "네이버", bg: "bg-[#03C75A]", icon: (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#fff" d="M16.27 12.84 7.46 0H0v24h7.73V11.16L16.54 24H24V0h-7.73z" />
    </svg>) },
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
      {providers.length > 0 && (
        <div className="flex justify-center gap-4">
          {providers.map((p) => (
            <button key={p} onClick={() => social(p)} disabled={busy} aria-label={`${LOGOS[p]?.name ?? p}로 시작`} title={`${LOGOS[p]?.name ?? p}로 시작`}
              className={`grid size-12 place-items-center rounded-full shadow-sm transition active:scale-95 disabled:opacity-60 ${LOGOS[p]?.bg ?? "bg-white"}`}>
              {LOGOS[p]?.icon ?? p}
            </button>
          ))}
        </div>
      )}
      {error && <p role="alert" className="text-center text-sm text-red-600">{error}</p>}
    </div>
  );
}
