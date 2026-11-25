// 호감도 계산 (숫자만, DB 없이): 하트 개수 · 오래 안 만나 깎인 값
type Rules = { heart1: number; heart2: number; heart3: number; heart4: number; heart5: number; start: number; decayAfterDays: number; decayPerDay: number };
const DAY = 86_400_000;
export const clamp = (v: number) => Math.max(0, Math.min(100, v));

/** 호감도 → 하트 개수 (경계값 순서가 뒤섞여 있어도 맞게: 넘은 경계 수를 셈) */
export const heartsOf = (score: number, r: Rules) => [r.heart1, r.heart2, r.heart3, r.heart4, r.heart5].filter((h) => score >= h).length;

/** 지금 호감도 = 저장된 값 − 오래 안 만난 날만큼 (처음 만나면 시작 값) */
export function effective(row: { score: number; lastAt: Date } | undefined, r: Rules, now = Date.now()) {
  if (!row) return r.start;
  const idle = Math.floor((now - row.lastAt.getTime()) / DAY) - r.decayAfterDays;
  return clamp(row.score - Math.max(0, idle) * r.decayPerDay);
}
