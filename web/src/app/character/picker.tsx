"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { Mode } from "@/game/character";
import { NICK_MAX, TAGS, visiblePresets, type Tag } from "@/game/presets";
import { confirmCharacter } from "./actions";
import { CharacterPreview, renderThumbnails } from "./preview";

const PRESETS = visiblePresets();
const MODES: [Mode, string][] = [["idle", "서 있기"], ["walk", "걷기"], ["wish", "소원 빌기"], ["sit", "앉기"]];

export function Picker() {
  const [selected, setSelected] = useState(PRESETS[0]);
  const [tag, setTag] = useState<Tag | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const viewed = useRef(new Set([PRESETS[0].id]));
  const dialog = useRef<HTMLDialogElement>(null);

  // 첫 화면이 먼저 뜨고 나서 썸네일 생성
  useEffect(() => { const id = setTimeout(() => setThumbs(renderThumbnails(PRESETS)), 50); return () => clearTimeout(id); }, []);

  const list = tag ? PRESETS.filter((p) => p.tags.includes(tag)) : PRESETS;
  const pick = (p: typeof selected) => { setSelected(p); viewed.current.add(p.id); };

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    startTransition(async () => {
      const res = await confirmCharacter(selected.id, nickname, viewed.current.size);
      if (res.error) setError(res.error);
      else window.location.replace(new URL("/park", window.location.href)); // 새로 불러와서 (예전 이동 기록 말고 정한 캐릭터로)
    });
  };

  return (
    <main className="flex h-dvh flex-col md:flex-row">
      {/* 미리보기 */}
      <section className="relative h-[46dvh] shrink-0 bg-gradient-to-b from-sky to-cream md:h-auto md:flex-1">
        <CharacterPreview preset={selected} mode={mode} />
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center gap-2 px-4">
          <p className="rounded-full bg-cream/90 px-4 py-1 text-lg">{selected.name}</p>
          <div className="pointer-events-auto flex flex-wrap justify-center gap-1.5">
            {MODES.map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m}
                className={`rounded-full px-3 py-1 text-sm ${mode === m ? "bg-sakura text-white" : "bg-cream/90"}`}>{label}</button>
            ))}
          </div>
        </div>
      </section>

      {/* 목록 */}
      <section className="flex min-h-0 flex-1 flex-col md:max-w-xl">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4">
          <h1 className="text-2xl">캐릭터 고르기</h1>
          <p className="mt-1 text-sm opacity-70">정하기 전까지는 마음껏 바꿔볼 수 있어요</p>
          <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="분위기">
            {[null, ...TAGS].map((t) => (
              <button key={t ?? "all"} onClick={() => setTag(t)} aria-pressed={tag === t}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm ${tag === t ? "bg-sakura text-white" : "bg-white ring-1 ring-sakura/40"}`}>
                {t ?? "전체"}
              </button>
            ))}
          </div>
          <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
            {list.map((p) => (
              <li key={p.id}>
                <button onClick={() => pick(p)} aria-pressed={selected.id === p.id}
                  className={`flex w-full flex-col items-center rounded-2xl bg-white p-1.5 transition ${selected.id === p.id ? "ring-3 ring-sakura" : "ring-1 ring-black/5"}`}>
                  {thumbs[p.id]
                    // eslint-disable-next-line @next/next/no-img-element -- 브라우저에서 만든 data URL
                    ? <img src={thumbs[p.id]} alt="" className="aspect-[1/1.15] w-full rounded-xl bg-sky/40" />
                    : <div className="aspect-[1/1.15] w-full animate-pulse rounded-xl bg-sky/40" />}
                  <span className="mt-1 line-clamp-1 text-xs">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t border-sakura/20 bg-cream p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button onClick={() => { setError(""); dialog.current?.showModal(); }}
            className="w-full rounded-full bg-sakura py-3.5 text-lg text-white shadow-[0_3px_0_var(--color-sakura-deep)] active:translate-y-0.5 active:shadow-none">
            이 캐릭터로 정하기
          </button>
        </div>
      </section>

      <dialog ref={dialog} className="m-auto w-[min(92vw,22rem)] rounded-3xl bg-cream p-6 text-ink backdrop:bg-ink/40">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <h2 className="text-xl">닉네임을 정해 주세요</h2>
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={NICK_MAX * 2} required autoFocus
            placeholder={`${NICK_MAX}자 이내`} aria-label="닉네임"
            className="rounded-xl bg-white px-4 py-3 ring-1 ring-sakura/40 outline-none focus:ring-2 focus:ring-sakura" />
          <p className="rounded-xl bg-sakura/15 px-3 py-2 text-sm">
            <b>{selected.name}</b> 캐릭터로 정하면 <b>나중에 바꿀 수 없어요.</b>
          </p>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => dialog.current?.close()} className="flex-1 rounded-full bg-white py-3 ring-1 ring-sakura/40">다시 고를래요</button>
            <button disabled={pending} className="flex-1 rounded-full bg-sakura py-3 text-white disabled:opacity-60">{pending ? "정하는 중…" : "확정하기"}</button>
          </div>
        </form>
      </dialog>
    </main>
  );
}
