// 실행: node --test src/game/coin-sim.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { FOUNTAIN, fountainTargets, launchVec, simulate, validLaunch } from "./coin-sim.ts";

const T = fountainTargets(), from = { x: FOUNTAIN.x, y: 1.25, z: FOUNTAIN.z - 6 }; // 분수 남쪽 6m에서 북쪽(+z)을 보고
const shots = Array.from({ length: 401 }, (_, i) => simulate(T, from, launchVec(0, 0, i / 400)));

test("세기를 바꿔 가며 던지면 정중앙·가운데·바깥 칸과 빗나감이 다 나옴", () => {
  const got = new Set(shots.map((s) => s.ring ?? s.kind));
  for (const k of ["bull", "mid", "outer", "lower"]) assert.ok(got.has(k), k);
});
test("정중앙은 접시 반지름 25% 안", () => {
  for (const s of shots.filter((s) => s.ring === "bull")) assert.ok(s.d <= 0.25);
});
test("새총 속도만 통과 (각도가 다르거나 너무 빠르면 거절)", () => {
  assert.equal(validLaunch(launchVec(1.2, 0.3, 0.7)), true);
  assert.equal(validLaunch({ x: 0, y: 5, z: 5 }), false);
  const v = launchVec(0, 0, 1);
  assert.equal(validLaunch({ x: v.x * 2, y: v.y * 2, z: v.z * 2 }), false);
});
