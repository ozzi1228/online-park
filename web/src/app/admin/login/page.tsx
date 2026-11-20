"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function AdminLogin() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <main className="flex flex-1 items-center justify-center bg-cream px-4">
      <form action={action} className="flex w-full max-w-xs flex-col gap-3 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-sakura/20">
        <h1 className="text-xl">관리자 로그인</h1>
        <input name="password" type="password" required autoFocus autoComplete="current-password" aria-label="비밀번호" placeholder="비밀번호"
          className="rounded-xl bg-cream px-4 py-3 ring-1 ring-sakura/40 outline-none focus:ring-2 focus:ring-sakura" />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button disabled={pending} className="rounded-full bg-sakura py-3 text-white disabled:opacity-60">{pending ? "확인 중…" : "들어가기"}</button>
      </form>
    </main>
  );
}
