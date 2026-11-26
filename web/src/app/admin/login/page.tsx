"use client";

import { useActionState, useEffect } from "react";
import { login } from "./actions";

export default function AdminLogin() {
  const [state, action, pending] = useActionState(login, null);
  const ok = state === "ok", error = ok ? null : state;
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- 일부러 새로 불러옴: 방금 받은 관리자 쿠키를 달고 서버에서 다시 그리게
  useEffect(() => { if (ok) window.location.assign("/admin"); }, [ok]);
  return (
    <main className="flex flex-1 items-center justify-center bg-cream px-4">
      <form action={action} className="flex w-full max-w-xs flex-col gap-3 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-sakura/20">
        <h1 className="text-xl">관리자 로그인</h1>
        <input name="password" type="password" required autoFocus autoComplete="current-password" aria-label="비밀번호" placeholder="비밀번호"
          className="rounded-xl bg-cream px-4 py-3 ring-1 ring-sakura/40 outline-none focus:ring-2 focus:ring-sakura" />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button disabled={pending || ok} className="rounded-full bg-sakura py-3 text-white disabled:opacity-60">{pending || ok ? "확인 중…" : "들어가기"}</button>
      </form>
    </main>
  );
}
