"use client";

import { useRef, useState } from "react";
import { PEN_COLORS, type Strokes } from "@/lib/notes-shared";

// 벚꽃잎 모양 종이 (위쪽 가운데가 살짝 갈라진 꽃잎), 1000×1000 좌표
export const PETAL_PATH = "M500 965 C190 830 80 500 215 235 C280 105 395 70 468 150 L500 215 L532 150 C605 70 720 105 785 235 C920 500 810 830 500 965 Z";

const path = (s: number[]) => {
  const p = s.slice(1);
  if (p.length === 2) return `M${p[0]} ${p[1]} l0.1 0`; // 점 하나
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i < p.length; i += 2) d += ` L${p[i]} ${p[i + 1]}`;
  return d;
};

/** 쪽지 보기 */
export function NoteView({ strokes, className = "" }: { strokes: Strokes; className?: string }) {
  return (
    <svg viewBox="0 0 1000 1000" className={className} role="img" aria-label="손글씨 쪽지">
      <defs>
        <radialGradient id="paper" cx="50%" cy="65%" r="65%"><stop offset="0" stopColor="#fff7fa" /><stop offset="1" stopColor="#ffd7e3" /></radialGradient>
        <clipPath id="petal"><path d={PETAL_PATH} /></clipPath>
      </defs>
      <path d={PETAL_PATH} fill="url(#paper)" stroke="#e9a3b8" strokeWidth="8" />
      <g clipPath="url(#petal)" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="14">
        {strokes.map((s, i) => <path key={i} d={path(s)} stroke={PEN_COLORS[s[0]] ?? PEN_COLORS[0]} />)}
      </g>
    </svg>
  );
}

/** 손글씨로만 쓰는 쪽지 (텍스트 입력 없음) */
export function NoteEditor({ title, sheets, busy, onSend, onCancel, coverOption = false, sendLabel = "찢어서 건네기" }: {
  title: string; sheets: number; busy: boolean; onSend: (s: Strokes, covered: boolean) => void; onCancel: () => void;
  /** 소원나무용: "한 장 더 풀칠해서 내용 가리기" 선택지 */
  coverOption?: boolean; sendLabel?: string;
}) {
  const [strokes, setStrokes] = useState<Strokes>([]);
  const [covered, setCovered] = useState(false);
  const need = covered ? 2 : 1;
  const [color, setColor] = useState(0);
  const drawing = useRef<number[] | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const total = strokes.reduce((n, s) => n + s.length, 0);

  const toPaper = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * 1000), Math.round(((e.clientY - r.top) / r.height) * 1000)].map((v) => Math.max(0, Math.min(1000, v)));
  };
  const down = (e: React.PointerEvent) => {
    if (total > 11000 || strokes.length >= 300) return; // 저장 한도
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 이미 뗀 포인터 */ }
    const [x, y] = toPaper(e);
    drawing.current = [color, x, y];
    setStrokes((s) => [...s, drawing.current!]);
  };
  const move = (e: React.PointerEvent) => {
    const cur = drawing.current;
    if (!cur) return;
    const [x, y] = toPaper(e), lx = cur[cur.length - 2], ly = cur[cur.length - 1];
    if (Math.hypot(x - lx, y - ly) < 6) return; // 너무 촘촘한 점은 생략 (용량 절약)
    cur.push(x, y);
    setStrokes((s) => [...s.slice(0, -1), [...cur]]);
  };
  const up = () => { drawing.current = null; };

  return (
    <section role="dialog" aria-label="쪽지 쓰기" className="absolute inset-x-4 top-1/2 z-30 mx-auto flex w-auto max-w-[24rem] -translate-y-1/2 flex-col items-center gap-3 rounded-3xl bg-cream/97 p-5 shadow-xl ring-1 ring-sakura/20">
      <div className="flex w-full items-center">
        <h2 className="text-lg">{title}</h2>
        <span className="ml-auto text-xs opacity-60">노트 {sheets}장 남음</span>
      </div>
      <p className="w-full text-xs opacity-60">손가락이나 마우스로 꽃잎 위에 적어 주세요</p>
      <svg ref={svg} viewBox="0 0 1000 1000" className="aspect-square w-full max-w-[20rem] touch-none select-none"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <defs><radialGradient id="paperE" cx="50%" cy="65%" r="65%"><stop offset="0" stopColor="#fff7fa" /><stop offset="1" stopColor="#ffd7e3" /></radialGradient>
          <clipPath id="petalE"><path d={PETAL_PATH} /></clipPath></defs>
        <path d={PETAL_PATH} fill="url(#paperE)" stroke="#e9a3b8" strokeWidth="8" />
        <g clipPath="url(#petalE)" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="14">
          {strokes.map((s, i) => <path key={i} d={path(s)} stroke={PEN_COLORS[s[0]]} />)}
        </g>
      </svg>
      <div className="flex w-full items-center gap-2">
        {PEN_COLORS.map((c, i) => (
          <button key={c} onClick={() => setColor(i)} aria-label={`펜 색 ${i + 1}`} aria-pressed={color === i}
            className={`size-7 rounded-full ring-2 ${color === i ? "ring-ink" : "ring-white"}`} style={{ background: c }} />
        ))}
        <button onClick={() => setStrokes((s) => s.slice(0, -1))} disabled={!strokes.length} className="ml-auto rounded-full bg-white px-3 py-1 text-sm ring-1 ring-black/10 disabled:opacity-40">되돌리기</button>
        <button onClick={() => setStrokes([])} disabled={!strokes.length} className="rounded-full bg-white px-3 py-1 text-sm ring-1 ring-black/10 disabled:opacity-40">지우기</button>
      </div>
      {coverOption && (
        <label className="flex w-full items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm">
          <input type="checkbox" checked={covered} onChange={(e) => setCovered(e.target.checked)} disabled={sheets < 2} />
          <span>한 장 더 풀칠해서 내용 가리기 <span className="opacity-60">(노트 +1장, 나만 볼 수 있어요)</span></span>
        </label>
      )}
      <div className="flex w-full gap-2">
        <button onClick={onCancel} className="flex-1 rounded-full bg-white py-2.5 ring-1 ring-sakura/40">그만두기</button>
        <button onClick={() => onSend(strokes, covered)} disabled={!strokes.length || busy || sheets < need} className="flex-1 rounded-full bg-sakura py-2.5 text-white disabled:opacity-50">
          {busy ? "잠시만요…" : sendLabel}
        </button>
      </div>
    </section>
  );
}
