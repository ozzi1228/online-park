// 공원 배치 + 충돌. three.js에 의존하지 않음 → 나중에 실시간 서버도 같은 파일로 판정.
// 좌표: x = 동(+)/서(-), z = 남(+)/북(-). 강은 북쪽(z < -8). 단위 m.
// 계절 테마는 이 배치를 그대로 두고 각 kind를 어떤 모델로 그릴지만 바꿈 (PLAN 2-9).

export const BOUNDS = { minX: -59.5, maxX: 59.5, minZ: -7.5, maxZ: 28.5 };
export const SPAWN = { x: -58.5, z: 10, yaw: Math.PI / 2 }; // 서쪽 입구 밖, 동쪽(+x)을 봄
export const PLAYER_R = 0.3;

/** yaw: 0이면 +z를 봄. 방향 벡터 = (sin yaw, cos yaw) */
export type Prop =
  | { kind: "tree"; x: number; z: number; s: number; inside: boolean }
  | { kind: "bench" | "lamp" | "booth" | "kiosk" | "pavilion" | "fountain" | "wishTree" | "gate"; x: number; z: number; yaw: number };

export type Path = { x1: number; z1: number; x2: number; z2: number; w: number };

export const PATHS: Path[] = [
  { x1: -70, z1: -4, x2: 70, z2: -4, w: 4 },      // 강변 산책로
  { x1: -50, z1: 24, x2: 40, z2: 24, w: 3 },      // 북쪽(뒤쪽) 벚꽃길
  { x1: -70, z1: 10, x2: -44, z2: 10, w: 3.5 },   // 입구 길
  { x1: -44, z1: -4, x2: -44, z2: 24, w: 3 },     // 서쪽 연결
  { x1: 46, z1: -4, x2: 46, z2: 1, w: 3 },        // 산책로 → 분수 광장
  { x1: 40, z1: 24, x2: 46, z2: 24, w: 3 },
  { x1: 46, z1: 19, x2: 46, z2: 24, w: 3 },       // 북쪽 길 → 광장
];
export const PLAZA = { x: 46, z: 10, r: 9.5 };

// 같은 배치가 매번 나오도록 고정 시드 난수
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

function buildProps(): Prop[] {
  const r = rng(11), out: Prop[] = [];
  const tree = (x: number, z: number, s = 1) => out.push({ kind: "tree", x: x + (r() - 0.5) * 0.8, z: z + (r() - 0.5) * 0.4, s: s * (0.9 + r() * 0.25), inside: true });
  // 강변 산책로 양쪽 벚꽃 (여의도 느낌의 터널)
  for (let x = -52; x <= 56; x += 7) { tree(x, -6.9, 1); tree(x + 3.5, -1.0, 1); }
  // 북쪽 벚꽃길 양쪽
  for (let x = -46; x <= 36; x += 7) { tree(x, 21.6, 0.95); tree(x + 3.5, 26.6, 0.95); }
  // 잔디밭에 드문드문 큰 나무
  for (const [x, z] of [[-30, 8], [-8, 14], [8, 9], [24, 15], [-36, 17]]) tree(x, z, 1.25);
  // 벤치: 산책로 남쪽 가장자리, 강을 바라봄
  // (남쪽 줄 나무는 x = -48.5 + 7k → 벤치·가로등은 그 사이에)
  for (let x = -45; x <= 53; x += 14) out.push({ kind: "bench", x, z: -1.7, yaw: Math.PI });
  for (let x = -38; x <= 56; x += 14) if (x !== 46) out.push({ kind: "lamp", x, z: -1.5, yaw: 0 });
  out.push({ kind: "gate", x: -56.5, z: 10, yaw: 0 });          // 기둥이 길 양옆(z±2.2)에 섬
  out.push({ kind: "booth", x: -50, z: 6.2, yaw: 0 });          // 안내소: 입구 길을 바라봄
  out.push({ kind: "kiosk", x: 12, z: 1.6, yaw: Math.PI });     // 매점: 산책로를 바라봄
  out.push({ kind: "pavilion", x: -22, z: 16, yaw: 0 });        // 정자
  out.push({ kind: "fountain", x: PLAZA.x, z: PLAZA.z, yaw: 0 });
  out.push({ kind: "wishTree", x: PLAZA.x, z: PLAZA.z + 7.5, yaw: 0 });
  return out;
}
export const PROPS = buildProps();

/** 맵 밖 배경 나무 (지나갈 수 없는 곳, 보이기만) */
export const BACKDROP_TREES: Prop[] = (() => {
  const r = rng(29), out: Prop[] = [];
  for (let x = -90; x <= 90; x += 4.5) out.push({ kind: "tree", x: x + r() * 2, z: -44 - r() * 3, s: 0.9 + r() * 0.3, inside: false }); // 강 건너
  for (let x = -80; x <= 80; x += 6) out.push({ kind: "tree", x: x + r() * 2, z: 32 + r() * 4, s: 1 + r() * 0.2, inside: false });   // 남쪽 뒤
  for (let z = -4; z <= 30; z += 6) { out.push({ kind: "tree", x: -66 - r() * 4, z, s: 1, inside: false }); out.push({ kind: "tree", x: 66 + r() * 4, z, s: 1, inside: false }); }
  return out;
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
  const out: Collider[] = [];
  for (const p of PROPS) {
    if (p.kind === "tree") out.push({ t: "c", x: p.x, z: p.z, r: 0.3 * p.s });
    else if (p.kind === "bench") out.push(box(p.x, p.z, 1.5, 0.5, p.yaw));
    else if (p.kind === "lamp") out.push({ t: "c", x: p.x, z: p.z, r: 0.15 });
    else if (p.kind === "booth") out.push(box(p.x, p.z, 3.2, 2.4, p.yaw));
    else if (p.kind === "kiosk") out.push(box(p.x, p.z, 4, 3, p.yaw));
    else if (p.kind === "pavilion") for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) out.push({ t: "c", x: p.x + dx, z: p.z + dz, r: 0.18 });
    else if (p.kind === "fountain") out.push({ t: "c", x: p.x, z: p.z, r: 3.1 });
    else if (p.kind === "wishTree") { out.push({ t: "c", x: p.x, z: p.z, r: 0.9 }); out.push(box(p.x, p.z - 1.1, 0.7, 0.5)); } // 줄기 + 사다리
    else if (p.kind === "gate") for (const s of [-1, 1]) out.push(box(p.x, p.z + s * 2.2, 0.7, 0.7));
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
    x = Math.max(BOUNDS.minX + r, Math.min(BOUNDS.maxX - r, x));
    z = Math.max(BOUNDS.minZ + r, Math.min(BOUNDS.maxZ - r, z));
    if (Math.abs(x - ox) < 1e-9 && Math.abs(z - oz) < 1e-9) break;
  }
  return { x, z };
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
