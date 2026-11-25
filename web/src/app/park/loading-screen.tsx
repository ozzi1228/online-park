import Image from "next/image";

// 공원 들어가는 동안 보이는 화면: 하늘빛 바탕에 로고가 살랑이고 꽃잎이 흩날림 (CSS만, 3D 준비되면 서서히 사라짐)
const PETALS = Array.from({ length: 14 }, (_, i) => ({
  left: `${(i * 37 + 11) % 100}%`, delay: `${-(i * 0.73) % 6}s`, dur: `${5.5 + (i % 5) * 0.9}s`, size: 10 + (i % 4) * 4, drift: `${(i % 2 ? 1 : -1) * (30 + (i % 3) * 25)}px`,
}));

export function LoadingScreen({ hidden = false }: { hidden?: boolean }) {
  return (
    <div role="status" aria-live="polite" aria-hidden={hidden}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 overflow-hidden bg-gradient-to-b from-[#cfe7f5] via-[#fde8ef] to-[#fff6ee] transition-opacity duration-700 ${hidden ? "pointer-events-none opacity-0" : "opacity-100"}`}>
      {PETALS.map((p, i) => (
        <span key={i} aria-hidden className="park-petal absolute -top-8"
          style={{ left: p.left, width: p.size, height: p.size * 0.8, animationDelay: p.delay, animationDuration: p.dur, ["--drift" as string]: p.drift }} />
      ))}
      <Image src="/logo-mark.png" alt="" width={128} height={128} priority className="park-sway size-28 drop-shadow-[0_6px_12px_rgba(217,134,158,0.35)]" />
      <p className="text-xl tracking-wide text-[#7a4a5c]">랜선 벚꽃공원</p>
      <p className="flex items-center gap-1 text-sm text-[#7a4a5c]/70">
        입장 중
        <span className="park-dot">·</span><span className="park-dot [animation-delay:0.2s]">·</span><span className="park-dot [animation-delay:0.4s]">·</span>
      </p>
    </div>
  );
}
