// 분수 동전이 어디에 떨어지는지: 공기저항 없는 포물선이라 식으로 바로 풂 → 화면과 서버가 똑같은 답을 냄 (서버가 다시 계산해서 보상)
// three 없이 숫자만 씀 (서버·테스트에서도 import)
import { PROPS, PROP_S } from "./park-map.ts";

export const FOUNTAIN = PROPS.find((p) => p.kind === "fountain") as { x: number; z: number };

export const G = 9.8;
/** 분수 모양 (fountain.ts 가 그릴 때도 같은 값을 씀). 크기 곱하기 전 */
export const FOUNTAIN_SHAPE = { R_OUT: 3.1, R_IN: 2.82, WATER_Y: 0.48, FLOOR_Y: 0.16, LOWER: { y: 1.0, r: 1.3 }, UPPER: { y: 1.9, r: 0.66 } };

export function fountainTargets(at: { x: number; z: number } = FOUNTAIN, scale = PROP_S) {
  const S = FOUNTAIN_SHAPE;
  return {
    x: at.x, z: at.z,
    dish: { y: (S.UPPER.y + 0.24) * scale, r: (S.UPPER.r - 0.1) * scale },
    lower: { y: (S.LOWER.y + 0.35) * scale, r: (S.LOWER.r - 0.1) * scale },
    basin: { y: S.WATER_Y * scale, r: S.R_IN * scale },
  };
}
export type Targets = ReturnType<typeof fountainTargets>;
export type Landing = "dish" | "lower" | "basin" | "ground";
/** 맨 위 접시 과녁: 정중앙(bull) · 가운데(mid) · 바깥(outer) */
export type Ring = "bull" | "mid" | "outer";
type V3 = { x: number; y: number; z: number };

/** 새총 세기·방향 → 처음 속도. 위로 약 54°, 빠르기 4~12 */
export const LAUNCH = { up: 0.95, min: 4, max: 12 };
export function launchVec(yaw: number, aim: number, pull: number): V3 {
  const speed = LAUNCH.min + pull * (LAUNCH.max - LAUNCH.min), a = yaw + aim, h = speed * Math.cos(LAUNCH.up);
  return { x: Math.sin(a) * h, y: speed * Math.sin(LAUNCH.up), z: Math.cos(a) * h };
}
/** 서버 확인용: 새총으로 낼 수 있는 속도인지 (각도 고정, 빠르기 범위 안) */
export function validLaunch(v: V3) {
  const s = Math.hypot(v.x, v.y, v.z);
  return Number.isFinite(s) && s >= LAUNCH.min - 0.01 && s <= LAUNCH.max + 0.01 && Math.abs(v.y / s - Math.sin(LAUNCH.up)) < 1e-3;
}

export const posAt = (from: V3, v: V3, t: number): V3 => ({ x: from.x + v.x * t, y: from.y + v.y * t - 0.5 * G * t * t, z: from.z + v.z * t });

/** 높이 y를 내려가며 지나는 시각 (못 닿으면 null) */
function downAt(from: V3, v: V3, y: number) {
  const disc = v.y * v.y + 2 * G * (from.y - y);
  if (disc < 0) return null;
  const t = (v.y + Math.sqrt(disc)) / G;
  return t > 0 ? t : null;
}

export type Shot = { kind: Landing; t: number; at: V3; ring: Ring | null; d: number };

/** 어디에 떨어지는지 + 접시라면 과녁 몇 번째 칸인지. bull·mid 는 접시 반지름에 대한 비율 */
export function simulate(T: Targets, from: V3, v: V3, rings = { bull: 0.25, mid: 0.6 }): Shot {
  for (const [kind, lv] of [["dish", T.dish], ["lower", T.lower], ["basin", T.basin]] as const) {
    const t = downAt(from, v, lv.y);
    if (t === null) continue;
    const at = posAt(from, v, t), d = Math.hypot(at.x - T.x, at.z - T.z);
    if (d < lv.r) {
      const ring: Ring | null = kind !== "dish" ? null : d <= lv.r * rings.bull ? "bull" : d <= lv.r * rings.mid ? "mid" : "outer";
      return { kind, t, at: { ...at, y: lv.y }, ring, d: d / lv.r };
    }
  }
  const t = downAt(from, v, 0) ?? 0;
  return { kind: "ground", t, at: { ...posAt(from, v, t), y: 0 }, ring: null, d: 1 };
}
