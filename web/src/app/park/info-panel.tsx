"use client";

import { useEffect, useState } from "react";
import { HOW_TO, INTRO, NPC_NAME, TIPS } from "@/content/guide";
import { INQUIRY_CATEGORIES, INQUIRY_STATUS } from "@/lib/inquiry";

type Tab = "intro" | "howto" | "ask" | "mine";
type Mine = { id: number; category: string; content: string; status: string; reply: string | null; repliedAt: string | null; createdAt: string; email: string };

const TABS: [Tab, string][] = [["intro", "소개"], ["howto", "사용법"], ["ask", "문의하기"], ["mine", "내 문의"]];
const date = (s: string) => new Date(s).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** 안내소 창: 안내원이 소개·사용법을 알려주고, 문의를 받아요 */
export function InfoPanel({ nickname, touch, onClose }: { nickname: string; touch: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("intro");
  // 관리자 페이지에서 고친 문구 (불러오기 전·실패 시엔 기본 문구)
  const [guide, setGuide] = useState({ intro: INTRO, tips: TIPS, howTo: HOW_TO });
  useEffect(() => {
    let alive = true;
    fetch("/api/guide", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((g) => { if (alive && g) setGuide(g); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return (
    <section role="dialog" aria-label="안내소"
      className="absolute inset-x-4 bottom-24 top-16 z-20 mx-auto flex w-[min(100%,30rem)] flex-col overflow-hidden rounded-3xl bg-cream/97 shadow-xl ring-1 ring-sakura/20">
      <header className="flex items-center gap-2 px-5 pt-4">
        <span className="text-2xl" aria-hidden>🙋‍♂️</span>
        <h2 className="text-lg">{NPC_NAME}</h2>
        <button onClick={onClose} aria-label="닫기" className="ml-auto px-2 text-xl opacity-60">×</button>
      </header>
      <nav className="flex gap-1 px-4 pt-3" role="tablist">
        {TABS.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1.5 text-sm ${tab === t ? "bg-sakura text-white" : "bg-white"}`}>{label}</button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed">
        {tab === "intro" && (
          <div className="flex flex-col gap-3">
            {guide.intro.map((p) => <p key={p}>{p}</p>)}
            <ul className="mt-2 flex flex-col gap-1.5 rounded-2xl bg-white p-3">
              {guide.tips.map((t) => <li key={t}>🌸 {t}</li>)}
            </ul>
          </div>
        )}
        {tab === "howto" && (
          <dl className="flex flex-col gap-2">
            {guide.howTo.map((h) => (
              <div key={h.title} className="rounded-2xl bg-white px-4 py-2.5">
                <dt className="font-bold">{h.title}</dt>
                <dd className="opacity-80">{touch ? h.mobile : h.pc}</dd>
              </div>
            ))}
          </dl>
        )}
        {tab === "ask" && <AskForm nickname={nickname} onSent={() => setTab("mine")} />}
        {tab === "mine" && <MyInquiries />}
      </div>
    </section>
  );
}

function AskForm({ nickname, onSent }: { nickname: string; onSent: () => void }) {
  const [email, setEmail] = useState(""), [category, setCategory] = useState("general"), [content, setContent] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    const r = await fetch("/api/inquiries", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, category, content }) });
    const j = await r.json().catch(() => ({})) as { error?: string };
    setBusy(false);
    if (r.ok) { setContent(""); onSent(); } else setError(j.error ?? "보내지 못했어요. 잠시 후 다시 해 주세요.");
  };
  const field = "w-full rounded-xl bg-white px-3 py-2.5 ring-1 ring-sakura/30 outline-none focus:ring-2 focus:ring-sakura";
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="opacity-70">궁금한 점이나 불편한 점을 남겨 주세요. 답변은 이메일과 &lsquo;내 문의&rsquo;에서 확인할 수 있어요.</p>
      <label className="flex flex-col gap-1">아이디<input value={nickname} readOnly className={`${field} opacity-60`} /></label>
      <label className="flex flex-col gap-1">답변받을 이메일
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className={field} />
      </label>
      <label className="flex flex-col gap-1">종류
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
          {Object.entries(INQUIRY_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">내용
        <textarea required minLength={5} value={content} onChange={(e) => setContent(e.target.value)} rows={5} className={`${field} resize-none`} />
      </label>
      {error && <p role="alert" className="text-red-600">{error}</p>}
      <button disabled={busy} className="rounded-full bg-sakura py-2.5 text-white disabled:opacity-60">{busy ? "보내는 중…" : "문의 남기기"}</button>
    </form>
  );
}

function MyInquiries() {
  const [rows, setRows] = useState<Mine[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/inquiries", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).then((x: Mine[]) => { if (alive) setRows(x); }).catch(() => alive && setRows([]));
    return () => { alive = false; };
  }, []);
  if (!rows) return <p className="opacity-60">불러오는 중…</p>;
  if (rows.length === 0) return <p className="opacity-60">아직 남긴 문의가 없어요.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.id} className="rounded-2xl bg-white p-4">
          <p className="flex items-center gap-2 text-xs">
            <span className={`rounded px-1.5 ${r.status === "answered" ? "bg-emerald-100" : "bg-black/5"}`}>{INQUIRY_STATUS[r.status] ?? r.status}</span>
            <span className="opacity-60">{INQUIRY_CATEGORIES[r.category as keyof typeof INQUIRY_CATEGORIES] ?? r.category} · {date(r.createdAt)}</span>
          </p>
          <p className="mt-2 whitespace-pre-wrap">{r.content}</p>
          {r.reply && (
            <div className="mt-3 rounded-xl bg-sakura/10 p-3">
              <p className="text-xs opacity-60">답변 · {r.repliedAt && date(r.repliedAt)}</p>
              <p className="mt-1 whitespace-pre-wrap">{r.reply}</p>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
