// 실행: node --test src/game/park-map.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { BACKDROP_TREES, BENCH_SEATS, BOUNDS, BOUNDS_N, BRIDGE, PROPS, SPAWN, benchSeatAt, groundY, inRiver, move, overlaps, resolve } from "./park-map.ts";

test("시작 위치는 비어 있음", () => assert.ok(!overlaps(SPAWN.x, SPAWN.z)));

test("경계 밖으로 못 나감", () => {
  const p = resolve(999, -999);
  assert.ok(p.x <= BOUNDS_N.maxX && p.z >= BOUNDS_N.minZ);
});

test("강은 다리로만 건널 수 있음", () => {
  const swim = resolve(30, -24); // 다리 아닌 곳 강 한가운데 → 강가로 밀려남
  assert.ok(swim.z > BOUNDS.minZ - 0.01 || swim.z < BOUNDS_N.maxZ + 0.01 || Math.abs(swim.x - BRIDGE.x) < BRIDGE.w / 2);
  let x = BRIDGE.x, z = -3; // 산책로에서 북쪽으로 쭉 걸으면 다리를 건너 건너편 공원까지
  for (let i = 0; i < 600; i++) ({ x, z } = move(x, z, x, z - 0.12));
  assert.ok(z < BOUNDS_N.maxZ, `건너편까지 못 감: z=${z.toFixed(2)}`);
  assert.ok(groundY(BRIDGE.x, (BRIDGE.z0 + BRIDGE.z1) / 2) > 1, "다리 가운데는 솟아 있음");
});

test("분수 한가운데로는 못 들어감", () => {
  const p = move(46, 0, 46, 10);
  assert.ok(Math.hypot(p.x - 46, p.z - 10) >= 3.1);
});

test("아무렇게나 걸어 다녀도 장애물과 겹치지 않음", () => {
  let x = SPAWN.x, z = SPAWN.z, yaw = SPAWN.yaw;
  for (let i = 0; i < 200000; i++) {
    yaw += (Math.random() - 0.5) * 0.6;
    const p = move(x, z, x + Math.sin(yaw) * 0.12, z + Math.cos(yaw) * 0.12);
    assert.ok(!overlaps(p.x, p.z), `step ${i}: (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
    x = p.x; z = p.z;
  }
});

test("정자는 북쪽 입구로만 들어갈 수 있음", async () => {
  const { PROPS, groundY } = await import("./park-map.ts");
  const pv = PROPS.find((p) => p.kind === "pavilion")!;
  const walk = (fromZ: number, toZ: number) => {
    let x = pv.x, z = fromZ;
    for (let i = 0; i < 400; i++) { const p = move(x, z, x, z + Math.sign(toZ - fromZ) * 0.05); x = p.x; z = p.z; }
    return { x, z };
  };
  const north = walk(pv.z - 8, pv.z);           // 북쪽에서 남쪽으로
  assert.ok(groundY(north.x, north.z) > 0, "북쪽 입구로 못 들어감");
  const south = walk(pv.z + 8, pv.z);           // 남쪽에서 북쪽으로
  assert.equal(groundY(south.x, south.z), 0, "난간을 뚫고 들어감");
});

test("앉기: 잔디·정자는 되고 길·광장은 안 됨", async () => {
  const { canSit, PROPS, PLAZA } = await import("./park-map.ts");
  const pv = PROPS.find((p) => p.kind === "pavilion")!;
  assert.ok(canSit(-10, 8), "잔디");
  assert.ok(canSit(pv.x, pv.z), "정자 마루");
  assert.ok(!canSit(0, -4), "강변 산책로");
  assert.ok(!canSit(PLAZA.x + 5, PLAZA.z), "분수 광장");
});

test("벤치 자리: 앞자리는 충돌 밖, 앉는 곳은 벤치 위", () => {
  assert.ok(BENCH_SEATS.length >= 4);
  for (const s of BENCH_SEATS) {
    const r = resolve(s.fx, s.fz);
    assert.ok(Math.hypot(r.x - s.fx, r.z - s.fz) < 0.02, "앞자리에 서 있을 수 있어야 함");
    assert.ok(overlaps(s.x, s.z, 0.05), "앉는 곳은 벤치 좌판 위");
    assert.equal(benchSeatAt(s.fx, s.fz), s);
  }
});

test("강물 위에 서 있는 나무는 하나도 없음 (공원 안·밖 모두)", () => {
  const wet = [...PROPS, ...BACKDROP_TREES].filter((p) => p.kind === "tree" && inRiver(p.z));
  assert.equal(wet.length, 0, wet.map((p) => `(${p.x.toFixed(1)}, ${p.z.toFixed(1)})`).join(" "));
});
