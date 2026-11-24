// 공원 배치 + 충돌. three.js에 의존하지 않음 → 나중에 실시간 서버도 같은 파일로 판정.
// 좌표: x = 동(+)/서(-), z = 남(+)/북(-). 강은 북쪽(z < -8). 단위 m.
// 계절 테마는 이 배치를 그대로 두고 각 kind를 어떤 모델로 그릴지만 바꿈 (PLAN 2-9).

export const BOUNDS = { minX: -59.5, maxX: 59.5, minZ: -7.5, maxZ: 28.5 };
/** 강을 건너는 나무 다리: 가운데 x, 폭, 남쪽·북쪽 끝 z, 가운데가 솟은 높이 */
export const BRIDGE = { x: -4.5, w: 3.4, z0: -7.0, z1: -31.3, rise: 1.4 };
/** 강 건너 공원 (다리로 이어짐) */
export const BOUNDS_N = { minX: -59.5, maxX: 59.5, minZ: -61.5, maxZ: -30.8 }; // 강 폭 약 22m
type Area = { minX: number; maxX: number; minZ: number; maxZ: number };
/** 걸어 다닐 수 있는 곳 = 공원 + 다리 + 강 건너 공원 (겹치게 이어 붙임) */
const AREAS: Area[] = [BOUNDS, { minX: BRIDGE.x - BRIDGE.w / 2 + 0.2, maxX: BRIDGE.x + BRIDGE.w / 2 - 0.2, minZ: BRIDGE.z1 - 0.6, maxZ: BRIDGE.z0 + 0.6 }, BOUNDS_N];
/** 영역 밖이면 가장 가까운 영역 안으로 (벽을 따라 미끄러지듯) */
function clampToAreas(x: number, z: number, r: number) {
  let best = { x, z }, bd = Infinity;
  for (const a of AREAS) {
    const cx = Math.max(a.minX + r, Math.min(a.maxX - r, x)), cz = Math.max(a.minZ + r, Math.min(a.maxZ - r, z)), d = (cx - x) ** 2 + (cz - z) ** 2;
    if (d < bd) { bd = d; best = { x: cx, z: cz }; }
  }
  return best;
}
export const onBridge = (x: number, z: number) => Math.abs(x - BRIDGE.x) < BRIDGE.w / 2 + 0.05 && z < BRIDGE.z0 && z > BRIDGE.z1;
/** 다리 위 높이: 양 끝 0 → 가운데 rise (완만한 아치) */
export const bridgeY = (z: number) => BRIDGE.rise * Math.sin(Math.PI * Math.min(1, Math.max(0, (BRIDGE.z0 - z) / (BRIDGE.z0 - BRIDGE.z1))));
export const SPAWN = { x: -58.5, z: 10, yaw: Math.PI / 2 }; // 서쪽 입구 밖, 동쪽(+x)을 봄
export const PLAYER_R = 0.3;
/** 시설물 배율: 나무에 맞춘 현실 크기 (캐릭터만 작고 뽀짝하게). 모델·충돌 모두 이 값으로 키움 */
export const PROP_S = 1.5;

// 팔각정: 꼭짓점 각도 θ = π/8 + kπ/4, 위치 (R·sinθ, R·cosθ) → 남쪽(+z) 한 면이 입구
export const PAVILION = { postR: 2.3, floorR: 2.5, floorH: 0.35 }; // PROP_S 곱하기 전 값
/** 정자 입구가 있는 변: 꼭짓점 k→k+1 (3 = 북쪽, 공원 입구 길에서 오면 바로 정면) */
export const PAVILION_DOOR = 3;
export const pavilionCorner = (k: number, r: number) => {
  const a = Math.PI / 8 + (k * Math.PI) / 4;
  return [r * Math.sin(a), r * Math.cos(a)] as const;
};

/** yaw: 0이면 +z를 봄. 방향 벡터 = (sin yaw, cos yaw) */
export type Prop =
  | { kind: "tree"; x: number; z: number; s: number; inside: boolean }
  | { kind: "bench" | "lamp" | "booth" | "kiosk" | "pavilion" | "fountain" | "wishTree" | "gate" | "npc"; x: number; z: number; yaw: number };

export type Path = { x1: number; z1: number; x2: number; z2: number; w: number };

export const PATHS: Path[] = [
  { x1: -70, z1: -4, x2: 70, z2: -4, w: 4 },      // 강변 산책로
  { x1: -50, z1: 24, x2: 40, z2: 24, w: 3 },      // 북쪽(뒤쪽) 벚꽃길
  { x1: -200, z1: 10, x2: -44, z2: 10, w: 3.5 }, // 입구 길 (입구 밖으로 멀리까지 이어짐)
  { x1: -44, z1: -4, x2: -44, z2: 24, w: 3 },     // 서쪽 연결
  { x1: 46, z1: -4, x2: 46, z2: 1, w: 3 },        // 산책로 → 분수 광장
  { x1: 40, z1: 24, x2: 46, z2: 24, w: 3 },
  { x1: 46, z1: 19, x2: 46, z2: 24, w: 3 },       // 북쪽 길 → 광장
  { x1: -4.5, z1: -7.5, x2: -4.5, z2: -4, w: 3.4 }, // 산책로 → 다리
  // 강 건너 공원
  { x1: -4.5, z1: -31, x2: -4.5, z2: -34.5, w: 3.4 }, // 다리 → 건너편 강변길
  { x1: -70, z1: -34.5, x2: 70, z2: -34.5, w: 4 }, // 건너편 강변 산책로
  { x1: -48, z1: -50.5, x2: 48, z2: -50.5, w: 3 }, // 안쪽 벚꽃길
  { x1: -30, z1: -34.5, x2: -30, z2: -50.5, w: 3 },
  { x1: 26, z1: -34.5, x2: 26, z2: -50.5, w: 3 },
];
export const PLAZA = { x: 46, z: 10, r: 11 };

// 같은 배치가 매번 나오도록 고정 시드 난수
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

function buildProps(): Prop[] {
  const r = rng(11), out: Prop[] = [];
  // 고정 시설 먼저 → 나무는 이 근처를 피해서 심음
  const fixed: Prop[] = [
    { kind: "gate", x: -56.5, z: 10, yaw: 0 },          // 기둥이 길 양옆에 섬
    { kind: "booth", x: -50, z: 5.4, yaw: 0 },          // 안내소: 입구 길을 바라봄
    { kind: "npc", x: -50, z: 6.85, yaw: 0 },           // 안내원: 안내소 안, 창구로 얼굴을 살짝 내밂 (비스듬히 봐도 보이게)
    { kind: "kiosk", x: 12, z: 2.5, yaw: Math.PI },     // 매점: 산책로를 바라봄
    { kind: "pavilion", x: -22, z: 15, yaw: 0 },        // 정자 (입구는 북쪽 = 입구 길에서 다가오는 쪽)
    { kind: "fountain", x: PLAZA.x, z: PLAZA.z, yaw: 0 },
    { kind: "wishTree", x: PLAZA.x, z: PLAZA.z + 7.5, yaw: 0 },
  ];
  out.push(...fixed);
  const free = (x: number, z: number) =>
    fixed.every((f) => Math.hypot(x - f.x, z - f.z) > (f.kind === "pavilion" ? 10 : 7)) &&
    Math.hypot(x - PLAZA.x, z - PLAZA.z) > PLAZA.r + 3 && Math.abs(x - PLAZA.x) > 3 &&
    !(Math.abs(x - BRIDGE.x) < 3.4 && z < 2 && z > -50); // 다리로 가는 길목은 비움
  const landSide: number[] = [];
  const tree = (x: number, z: number, s = 1) => {
    x += (r() - 0.5) * 1.2; z += (r() - 0.5) * 0.4;
    if (!free(x, z)) return false;
    out.push({ kind: "tree", x, z, s: s * (0.92 + r() * 0.2), inside: true });
    return true;
  };
  // 강변 산책로: 거대한 벚꽃이 양쪽에서 가지를 뻗어 터널을 만듦 (여의도 느낌)
  for (let x = -50; x <= 56; x += 13) { tree(x, -6.7); if (tree(x + 6.5, -0.9)) landSide.push(out.at(-1)!.x); }
  // 북쪽 벚꽃길 양쪽
  for (let x = -44; x <= 34; x += 13) { tree(x, 20.3, 0.95); tree(x + 6.5, 27.4, 0.95); }
  // 분수 광장 둘레: 두 겹으로 벚꽃을 둘러 광장이 꽃으로 감싸이게 (길 위는 비움)
  const offPath = (x: number, z: number) => PATHS.every((p) => {
    const vx = p.x2 - p.x1, vz = p.z2 - p.z1, t = Math.max(0, Math.min(1, ((x - p.x1) * vx + (z - p.z1) * vz) / (vx * vx + vz * vz)));
    return Math.hypot(x - (p.x1 + vx * t), z - (p.z1 + vz * t)) > p.w / 2 + 1.8;
  });
  for (const [rr, n, s, off] of [[15.5, 12, 0.9, 0], [21.5, 14, 1.0, 0.5]] as const)
    for (let i = 0; i < n; i++) {
      const a = ((i + off) / n) * Math.PI * 2, x = PLAZA.x + Math.cos(a) * rr, z = PLAZA.z + Math.sin(a) * rr;
      if (z > BOUNDS.minZ + 2.5 && offPath(x, z)) tree(x, z, s);
    }
  // 잔디밭 한가운데 피크닉 그늘 나무
  for (const [x, z] of [[-31, 8], [-6, 12], [24, 13], [-38, 18], [4, 20]]) tree(x, z, 1.15);
  // 매점 둘레: 뒤쪽 잔디에 그늘 나무 (매점 앞 산책로 쪽은 비움)
  for (const [x, z] of [[3, 8.5], [20.5, 8.5], [28, 4], [15.5, 12.5], [8, 14.5], [-1, 3.5]]) tree(x, z, 1.05);
  // 벤치·가로등: 남쪽 줄 나무 사이사이에 번갈아
  landSide.sort((a, b) => a - b);
  for (let i = 0; i < landSide.length - 1; i++) {
    const x = landSide[i] + 3.25; // 강가 나무와 길 쪽 나무 사이 → 벤치에 앉으면 강이 탁 트여 보임
    if (!free(x, -1.6)) continue;
    out.push({ kind: "bench", x, z: -1.7, yaw: Math.PI });
    if (free(x + 2.4, -1.5)) out.push({ kind: "lamp", x: x + 2.4, z: -1.5, yaw: Math.PI }); // 벤치마다 하나, 초롱이 벤치 쪽으로
  }

  // ---------- 강 건너 공원 ----------
  const offBridge = (x: number) => Math.abs(x - BRIDGE.x) > BRIDGE.w / 2 + 2.2;
  const northInner: number[] = [];
  // 강변 산책로 양쪽 벚꽃 터널 (다리 앞은 비움)
  for (let x = -54; x <= 56; x += 13) {
    if (offBridge(x)) tree(x, -31.7);
    if (offBridge(x + 6.5) && tree(x + 6.5, -37.9)) northInner.push(out.at(-1)!.x);
  }
  // 강을 바라보는 벤치·가로등: 이쪽 공원과 똑같이 강가 울타리에서 5.8m (산책로 건너편 가장자리, 안쪽 나무 사이)
  const BENCH_FROM_RIVER = -1.7 - BOUNDS.minZ; // 이쪽 공원 벤치가 강에서 떨어진 거리
  northInner.sort((a, b) => a - b);
  for (let i = 0; i < northInner.length - 1; i++) {
    const x = northInner[i] + 3.25;
    if (!offBridge(x) || !offBridge(x + 2.4)) continue;
    out.push({ kind: "bench", x, z: BOUNDS_N.maxZ - BENCH_FROM_RIVER, yaw: 0 });
    out.push({ kind: "lamp", x: x + 2.4, z: BOUNDS_N.maxZ - BENCH_FROM_RIVER - 0.2, yaw: Math.PI }); // 팔·초롱이 벤치 쪽(-x)으로
  }
  // 안쪽 벚꽃길 양쪽 + 잔디밭 그늘 나무
  for (let x = -46; x <= 46; x += 11) { tree(x, -47.1, 1); tree(x + 5.5, -54.1, 1.05); }
  for (const [x, z] of [[-44, -42.5], [-14, -42.5], [12, -43.5], [42, -42.5], [-38, -58], [-8, -58], [18, -58], [48, -58]]) tree(x, z, 1.15);
  return out;
}
export const PROPS = buildProps();

/** 강물 위인지 (양쪽 강변 울타리 사이, 1m 여유) */
export const inRiver = (z: number) => z < BOUNDS.minZ + 0.5 && z > BOUNDS_N.maxZ - 0.5;

/** 맵 밖 배경 나무 (지나갈 수 없는 곳, 보이기만) */
export const BACKDROP_TREES: Prop[] = (() => {
  const r = rng(29), out: Prop[] = [];
  // 강 건너 공원 뒤: 세 줄로 빽빽하고 크게 (벤치에 앉으면 건너편이 온통 벚꽃, 그 뒤로 도시)
  for (const [z0, step, s0] of [[-64, 6.5, 1.1], [-68.5, 7, 1.25], [-73.5, 7.5, 1.4], [-79.5, 8, 1.5], [-86, 8.5, 1.6]] as const)
    for (let x = -190 + r() * step; x <= 190; x += step * (0.85 + r() * 0.3))
      out.push({ kind: "tree", x, z: z0 - r() * 2, s: s0 + r() * 0.25, inside: false });
  // 강둑 따라 공원 밖까지: 공원 안 강변 벚꽃길과 똑같은 자리·간격으로 이어 심어 경계가 티 나지 않게
  //  (이쪽: 울타리 바로 안쪽 z -6.7 + 길 건너 -0.9 / 건너편: -31.7 + -37.9, 13m 간격·6.5m 엇갈림)
  const tw = (x: number, z: number) => out.push({ kind: "tree", x: x + (r() - 0.5) * 1.2, z: z + (r() - 0.5) * 0.4, s: 0.95 + r() * 0.2, inside: false });
  for (const dir of [-1, 1]) for (let i = 1; i <= 11; i++) {
    const base = dir < 0 ? -50 - 13 * i : 56 + 13 * (i - 1) + 13; // 공원 안 강변 줄(x = -50 + 13k)을 그대로 이어감
    tw(base, -6.7); tw(base + 6.5, -0.9);
    tw(base + (dir < 0 ? -4 : 4), -31.7); tw(base + 6.5 + (dir < 0 ? -4 : 4), -37.9);
    for (const z of [-44, -50, -56]) tw(base + (r() - 0.5) * 6, z);                 // 건너편 그 뒤 숲
  }
  // 더 멀리는 강가 줄만 안개 속까지 (줄이 뚝 끝나는 자리가 보이지 않게)
  for (const dir of [-1, 1]) for (let i = 12; i <= 24; i++) {
    const base = dir < 0 ? -50 - 13 * i : 56 + 13 * i;
    tw(base, -6.7); tw(base + (dir < 0 ? -4 : 4), -31.7);
  }
  const t = (x: number, z: number, s: number) => out.push({ kind: "tree", x: x + (r() - 0.5) * 2.5, z: z + (r() - 0.5) * 2.5, s: s + r() * 0.25, inside: false });
  // 남쪽 뒤: 네 줄로 엇갈려 빽빽하게, 멀수록 크게 (울타리 너머가 벚꽃 숲)
  for (const [z0, step, s0] of [[33.5, 6.5, 1], [39.5, 7, 1.1], [46, 7.5, 1.25], [53, 8, 1.4]] as const)
    for (let x = -100 + r() * step; x <= 100; x += step * (0.85 + r() * 0.3)) t(x, z0, s0);
  // 동·서 끝: 세 줄 (서쪽 입구 길은 비움)
  for (const [d, step, s0] of [[65, 6.5, 1], [71.5, 7, 1.15], [78.5, 7.5, 1.3]] as const)
    for (let z = -4 + r() * step; z <= 31; z += step * (0.85 + r() * 0.3)) {
      if (Math.abs(z - 10) > 4.5) t(-d, z, s0);
      t(d, z, s0);
    }
  // 입구 밖: 길 양옆으로 멀리까지 벚꽃 가로수 (길 위로 가지가 드리우게 길가에 바짝), 그 뒤로 숲
  for (let x = -63 - r() * 2; x > -196; x -= 6.5 + r() * 1.5) {
    const k = Math.min(1, (-60 - x) / 100); // 멀수록 조금 크게 (원근에도 덜 작아 보이게)
    for (const side of [-1, 1]) out.push({ kind: "tree", x: x + (r() - 0.5) * 1.2, z: 10 + side * (4 + r() * 0.6), s: 1 + k * 0.3 + r() * 0.15, inside: false });
  }
  for (const [off, step, s0] of [[11, 7, 1.1], [18, 7.5, 1.25], [26, 8, 1.4]] as const)
    for (let x = -84 - r() * step; x > -196; x -= step * (0.85 + r() * 0.3))
      for (const side of [-1, 1]) if (10 + side * off > -3) t(x, 10 + side * off, s0); // 강 쪽(남쪽 너머 = 강)으로는 심지 않음
  // 안전장치: 강(양쪽 울타리 사이) 안에 줄기가 들어가는 나무는 하나도 두지 않음
  return out.filter((p) => !inRiver(p.z));
})();

// ---------- 충돌 ----------
type Circle = { t: "c"; x: number; z: number; r: number };
type Box = { t: "b"; x: number; z: number; hw: number; hd: number }; // 축 정렬, 반폭/반깊이
export type Collider = Circle | Box;

const box = (x: number, z: number, w: number, d: number, yaw = 0): Box => {
  const turned = Math.abs(Math.sin(yaw)) > 0.5; // 90° 돌았으면 폭·깊이 교환
  return { t: "b", x, z, hw: (turned ? d : w) / 2, hd: (turned ? w : d) / 2 };
};

function buildColliders(): Collider[] {
  const out: Collider[] = [], S = PROP_S;
  const circle = (x: number, z: number, r: number) => out.push({ t: "c", x, z, r });
  for (const p of PROPS) {
    if (p.kind === "tree") circle(p.x, p.z, 0.55 * p.s);
    else if (p.kind === "bench") out.push(box(p.x, p.z, 1.5 * S, 0.5 * S, p.yaw));
    else if (p.kind === "lamp") circle(p.x, p.z, 0.15 * S);
    else if (p.kind === "booth") out.push(box(p.x, p.z, 3.4 * S, 2.6 * S, p.yaw));
    else if (p.kind === "kiosk") out.push(box(p.x, p.z, 4.2 * S, 3.2 * S, p.yaw));
    else if (p.kind === "pavilion") {
      // 기둥 8개 + 입구(남쪽 면) 뺀 7면 난간
      for (let k = 0; k < 8; k++) {
        const [x0, z0] = pavilionCorner(k, PAVILION.postR * S), [x1, z1] = pavilionCorner(k + 1, PAVILION.postR * S);
        circle(p.x + x0, p.z + z0, 0.16 * S);
        if (k === PAVILION_DOOR) continue; // 꼭짓점 3→4 사이(북쪽)가 입구
        for (let i = 1; i < 6; i++) circle(p.x + x0 + ((x1 - x0) * i) / 6, p.z + z0 + ((z1 - z0) * i) / 6, 0.12);
      }
    }
    else if (p.kind === "fountain") circle(p.x, p.z, 3.1 * S);
    else if (p.kind === "wishTree") { circle(p.x, p.z, 0.6 * S); out.push(box(p.x - 1.1 * S, p.z, 0.5 * S, 0.7 * S)); } // 줄기 + 사다리 (광장으로 들어오는 서쪽)
    else if (p.kind === "npc") circle(p.x, p.z, 0.32);
    else if (p.kind === "gate") for (const s of [-1, 1]) out.push(box(p.x, p.z + s * 2.3 * S, 0.6 * S, 0.6 * S));
  }
  return out;
}
export const COLLIDERS = buildColliders();

/** 원(반지름 r)을 장애물·경계 밖으로 밀어냄. 벽을 따라 미끄러지듯 움직임 */
export function resolve(x: number, z: number, r = PLAYER_R, colliders = COLLIDERS) {
  // ponytail: 매번 전체 검사(O(n), n≈150). 장애물이 수천 개로 늘면 격자 버킷으로
  for (let pass = 0; pass < 8; pass++) { // 장애물과 경계 사이 좁은 틈에선 여러 번 밀어야 빠져나옴
    const ox = x, oz = z;
    for (const c of colliders) {
      if (c.t === "c") {
        const dx = x - c.x, dz = z - c.z, min = c.r + r, d2 = dx * dx + dz * dz;
        if (d2 < min * min) {
          const d = Math.sqrt(d2) || 1e-6;
          x = c.x + (dx / d) * min; z = c.z + (dz / d) * min;
        }
      } else {
        const px = Math.max(c.x - c.hw, Math.min(x, c.x + c.hw)), pz = Math.max(c.z - c.hd, Math.min(z, c.z + c.hd));
        const dx = x - px, dz = z - pz, d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-12) { const d = Math.sqrt(d2); x = px + (dx / d) * r; z = pz + (dz / d) * r; }
          else { // 중심이 상자 안: 가장 가까운 면으로
            const ex = c.hw - Math.abs(x - c.x), ez = c.hd - Math.abs(z - c.z);
            if (ex < ez) x = c.x + Math.sign(x - c.x || 1) * (c.hw + r); else z = c.z + Math.sign(z - c.z || 1) * (c.hd + r);
          }
        }
      }
    }
    ({ x, z } = clampToAreas(x, z, r));
    if (Math.abs(x - ox) < 1e-9 && Math.abs(z - oz) < 1e-9) break;
  }
  return { x, z };
}

// ---------- 소원나무: 쪽지를 달 수 있는 가지(잎 덩어리) 영역 ----------
export const WISH_TREE = PROPS.find((p) => p.kind === "wishTree") as { x: number; z: number; yaw: number };
/** 사다리 앞 서는 자리: 여기서 나무 쪽으로 걸어 들어가면 쪽지를 쓰고 사다리에 오름 */
export const LADDER_FOOT = { x: WISH_TREE.x - (1.1 * PROP_S + 0.25 * PROP_S + PLAYER_R + 0.05), z: WISH_TREE.z };
export type Sphere = { x: number; y: number; z: number; r: number };
/** 잎 덩어리 6개 (월드 좌표). world.ts가 이걸로 잎을 그리고, 쪽지 위치 검사도 이걸로 */
export const WISH_CANOPY: Sphere[] = (() => {
  const S = PROP_S, out: Sphere[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * 6.28 + 0.4, dx = Math.cos(a) * 0.7, dy = 0.75, dz = Math.sin(a) * 0.7, l = Math.hypot(dx, dy, dz);
    out.push({ x: WISH_TREE.x + (dx / l) * 1.9 * S, y: (2.2 + (dy / l) * 1.9) * S, z: WISH_TREE.z + (dz / l) * 1.9 * S, r: 1.15 * S });
  }
  out.push({ x: WISH_TREE.x, y: 4.1 * S, z: WISH_TREE.z, r: 1.4 * S });
  return out;
})();
/** 소원나무 가지 (나무 기준 좌표, PROP_S 곱하기 전). world.ts가 이걸로 가지를 그리고, 쪽지는 이 가지 위에 달림 */
export type Branch = { a: [number, number, number]; b: [number, number, number]; r0: number; r1: number; t: number };
export const WISH_BRANCHES: Branch[] = (() => {
  const S = PROP_S, out: Branch[] = [];
  let n = 12345; const rnd = () => ((n = (n * 16807) % 2147483647) / 2147483647);
  const norm = (v: number[]) => { const l = Math.hypot(v[0], v[1], v[2]); return v.map((x) => x / l); };
  const rdir = () => norm([rnd() - 0.5, rnd() * 0.8 - 0.2, rnd() - 0.5]);
  const add = (a: number[], b: number[], k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const lerp = (a: number[], b: number[], k: number) => a.map((x, i) => x + (b[i] - x) * k);
  const seg = (a: number[], b: number[], r0: number, r1: number, t = 0.01) => out.push({ a: a as Branch["a"], b: b as Branch["b"], r0, r1, t });
  const top = [0, 2.4, 0];
  for (const c of WISH_CANOPY) {
    const lc = [(c.x - WISH_TREE.x) / S, c.y / S, (c.z - WISH_TREE.z) / S], rr = c.r / S;
    const mid = add(lerp(top, lc, 0.55), rdir(), 0.15);
    seg(top, mid, 0.17, 0.11, 0.014);
    for (let k = 0; k < 3; k++) {
      const tip = add(lc, rdir(), rr * (0.55 + rnd() * 0.35));
      seg(mid, tip, 0.1, 0.035);
      for (let j = 0; j < 3; j++) { // 잔가지 (여기에 쪽지가 매달린 느낌)
        const base = lerp(mid, tip, 0.45 + rnd() * 0.5);
        const out2 = norm(add(norm(add(base, lc, -1)), rdir(), 0.8));
        seg(base, add(base, out2, 0.45 + rnd() * 0.35), 0.03, 0.01, 0.006);
      }
    }
  }
  return out;
})();
/** 가지(월드 좌표)에서 점까지 가장 가까운 거리와 그 가지 위의 점 */
export function nearestBranch(x: number, y: number, z: number) {
  const S = PROP_S; let best = { d: Infinity, x: 0, y: 0, z: 0 };
  for (const b of WISH_BRANCHES) {
    const ax = WISH_TREE.x + b.a[0] * S, ay = b.a[1] * S, az = WISH_TREE.z + b.a[2] * S;
    const vx = (b.b[0] - b.a[0]) * S, vy = (b.b[1] - b.a[1]) * S, vz = (b.b[2] - b.a[2]) * S;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy + (z - az) * vz) / (vx * vx + vy * vy + vz * vz)));
    const px = ax + vx * t, py = ay + vy * t, pz = az + vz * t, d = Math.hypot(x - px, y - py, z - pz);
    if (d < best.d) best = { d, x: px, y: py, z: pz };
  }
  return best;
}
/** 쪽지를 달 수 있는 자리인지: 가지에 붙어 있는지 (쪽지가 가지 아래로 살짝 매달리니 여유를 둠) */
export const onCanopy = (x: number, y: number, z: number) => nearestBranch(x, y, z).d < 0.45;

/** 그 자리의 바닥 높이 (정자 마루 위면 살짝 올라감) */
export function groundY(x: number, z: number) {
  if (onBridge(x, z)) return bridgeY(z);
  for (const p of PROPS) {
    if (p.kind !== "pavilion") continue;
    // 난간 안쪽(팔각형에 내접하는 원)만 마루 위로 침
    if (Math.hypot(x - p.x, z - p.z) < PAVILION.postR * PROP_S * Math.cos(Math.PI / 8)) return (PAVILION.floorH + 0.06) * PROP_S;
  }
  return 0;
}

/** 앉을 수 있는 곳: 잔디(길·광장 아닌 곳)나 정자 마루 */
/** 길·광장 위인지 (margin만큼 길가 잔디도 길로 침) */
export function onPath(x: number, z: number, margin = 0) {
  if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + margin) return true;
  return PATHS.some((p) => {
    const vx = p.x2 - p.x1, vz = p.z2 - p.z1, l2 = vx * vx + vz * vz;
    const t = Math.max(0, Math.min(1, ((x - p.x1) * vx + (z - p.z1) * vz) / l2));
    return Math.hypot(x - (p.x1 + vx * t), z - (p.z1 + vz * t)) < p.w / 2 + margin;
  });
}
export function canSit(x: number, z: number) {
  if (onBridge(x, z)) return false; // 다리 위는 지나가는 길
  if (groundY(x, z) > 0) return true;
  return !onPath(x, z, 0.4); // 산책로·광장과 그 가장자리엔 앉지 않음 (지나가는 사람 길 막지 않게)
}

export const overlaps = (x: number, z: number, r = PLAYER_R, colliders = COLLIDERS) =>
  colliders.some((c) => {
    if (c.t === "c") return (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + r) ** 2 - 1e-6;
    const dx = Math.max(Math.abs(x - c.x) - c.hw, 0), dz = Math.max(Math.abs(z - c.z) - c.hd, 0);
    return dx * dx + dz * dz < r * r - 1e-6;
  });

/** 한 프레임 이동. 밀어내도 끼는 틈이면 한 축으로만 미끄러지거나 제자리 */
export function move(fx: number, fz: number, tx: number, tz: number, r = PLAYER_R, colliders = COLLIDERS) {
  for (const [x, z] of [[tx, tz], [tx, fz], [fx, tz]]) {
    const p = resolve(x, z, r, colliders);
    if (!overlaps(p.x, p.z, r, colliders)) return p;
  }
  return { x: fx, z: fz };
}

// ---------- 벤치 자리: 벤치마다 두 자리 ----------
/** x·y·z = 앉은 캐릭터를 놓는 곳(엉덩이가 좌판 위), fx·fz = 바로 앞 서 있는 자리(서버가 아는 위치, 충돌 밖), yaw = 벤치가 보는 쪽 */
export type BenchSeat = { x: number; y: number; z: number; fx: number; fz: number; yaw: number };
export const BENCH_SEATS: BenchSeat[] = PROPS.flatMap((b) => {
  if (b.kind !== "bench") return [];
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw), front = 0.25 * PROP_S + PLAYER_R + 0.06;
  return [-0.45, 0.45].map((lx) => {
    const wx = lx * PROP_S, lz = 0.02 * PROP_S;
    return {
      x: b.x + wx * c + lz * s, z: b.z - wx * s + lz * c, y: 0.48 * PROP_S - 0.1,
      fx: b.x + wx * c + front * s, fz: b.z - wx * s + front * c, yaw: b.yaw,
    };
  });
});
/** 벤치 앉는 판 윗면 높이 (world.ts 벤치 모델과 맞춤) */
export const BENCH_TOP = 0.468 * PROP_S;
/** 서 있는 자리(fx, fz) 근처의 벤치 자리 */
export const benchSeatAt = (x: number, z: number, within = 0.35) => BENCH_SEATS.find((s) => Math.hypot(s.fx - x, s.fz - z) < within);
