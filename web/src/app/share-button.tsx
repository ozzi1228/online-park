"use client";

import { useState } from "react";
import { setMsgOverrides, t as msg, type MsgKey } from "@/content/messages";

/** 친구에게 공유하기: 공유 창이 있는 기기(휴대폰 등)는 공유 창, 없으면 링크 복사 */
export function ShareButton({ messages }: { messages: Partial<Record<MsgKey, string>> }) {
  setMsgOverrides(messages);
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = `${location.origin}/`;
    if (navigator.share) {
      try { await navigator.share({ title: "랜선 벚꽃공원", text: msg("share.text"), url }); return; }
      catch (e) { if ((e as Error).name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { window.prompt(msg("share.prompt"), url); }
  };
  return (
    <button onClick={share} className="mx-auto flex items-center gap-1.5 rounded-full px-4 py-2 text-sm opacity-70 transition hover:opacity-100">
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
      </svg>
      {copied ? msg("share.copied") : msg("share.button")}
    </button>
  );
}
