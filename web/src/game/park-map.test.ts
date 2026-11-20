// 실행: node --test src/game/park-map.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { BOUNDS, SPAWN, move, overlaps, resolve } from "./park-map.ts";

test("시작 위치는 비어 있음", () => assert.ok(!overlaps(SPAWN.x, SPAWN.z)));

test("경계 밖으로 못 나감", () => {
  const p = resolve(999, -999);
  assert.ok(p.x <= BOUNDS.maxX && p.z >= BOUNDS.minZ);
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
