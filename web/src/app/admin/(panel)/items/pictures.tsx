"use client";

import { useEffect, useState } from "react";
import { churuIcon, notebookIcon, rodIcon } from "@/game/item-icons";
import { matPreview } from "@/game/mat";
import { renderCatThumbnails } from "@/game/cat";
import { renderThumbnails } from "@/app/character/preview";
import { PRESETS } from "@/game/presets";
import { MAT_COLORS, type MatColor } from "@/lib/mat-colors";

/** 관리자 화면 그림: 게임 안에서 쓰는 그림 그대로 브라우저에서 그려 보여 줌 (물품 아이콘·돗자리 무늬·캐릭터·고양이) */
export function ItemPicture({ kind, className = "" }: { kind: "notebook" | "churu" | "rod" | `mat:${MatColor}`; className?: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => { // 그림은 브라우저에서만 그릴 수 있어서 첫 화면 뒤에
    const id = setTimeout(() => setSrc(kind === "notebook" ? notebookIcon() : kind === "churu" ? churuIcon() : kind === "rod" ? rodIcon() : matPreview(kind.slice(4) as MatColor)), 0);
    return () => clearTimeout(id);
  }, [kind]);
  // eslint-disable-next-line @next/next/no-img-element -- 캔버스로 그린 그림(data URL)
  return src ? <img src={src} alt="" className={className} /> : <span className={`${className} animate-pulse bg-black/5`} />;
}

export function MatPictures() {
  return <div className="flex flex-wrap gap-1.5">{MAT_COLORS.map((c) => <ItemPicture key={c} kind={`mat:${c}`} className="h-9 w-14 rounded ring-1 ring-black/10" />)}</div>;
}

export function CharacterPictures() {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => { const id = setTimeout(() => setThumbs(renderThumbnails(PRESETS, 180)), 50); return () => clearTimeout(id); }, []);
  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
      {PRESETS.map((p) => (
        <li key={p.id} className="flex flex-col items-center gap-1 rounded-xl bg-white p-2 text-center text-xs ring-1 ring-black/5">
          {/* eslint-disable-next-line @next/next/no-img-element -- 캔버스로 찍은 그림 */}
          {thumbs[p.id] ? <img src={thumbs[p.id]} alt="" className="aspect-[1/1.15] w-full rounded-lg bg-sky/40" /> : <span className="aspect-[1/1.15] w-full animate-pulse rounded-lg bg-sky/30" />}
          <span>{p.name}</span>
          <span className="opacity-50">{p.id} · {p.tags.join(", ")}</span>
        </li>
      ))}
    </ul>
  );
}

export function CatPictures({ names }: { names: readonly string[] }) {
  const [thumbs, setThumbs] = useState<string[]>([]);
  useEffect(() => { const id = setTimeout(() => setThumbs(renderCatThumbnails(180)), 80); return () => clearTimeout(id); }, []);
  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
      {names.map((n, i) => (
        <li key={n} className="flex flex-col items-center gap-1 rounded-xl bg-white p-2 text-center text-xs ring-1 ring-black/5">
          {/* eslint-disable-next-line @next/next/no-img-element -- 캔버스로 찍은 그림 */}
          {thumbs[i] ? <img src={thumbs[i]} alt="" className="aspect-square w-full rounded-lg bg-[#e9f3df]" /> : <span className="aspect-square w-full animate-pulse rounded-lg bg-[#e9f3df]" />}
          <span>{n}</span><span className="opacity-50">{i}번</span>
        </li>
      ))}
    </ul>
  );
}
