// 실행: node --test src/game/cat-brain.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { CatBrain } from "./cat-brain.ts";
import { BOUNDS, groundY } from "./park-map.ts";

test("난간 위 고양이에게 낚싯대 알림이 계속 와도 한 번만 뛰어내리고 허공에서 통통 튀지 않음", () => {
  const b = new CatBrain(); b.spawn(0);
  const railZ = BOUNDS.minZ - 0.25;
  Object.assign(b.s, { x: 0, z: railZ, y: 0.94 });
  (b as unknown as { onRail: boolean }).onRail = true;
  const feather = { x: 0, z: railZ + 1.2 }, me = { x: 0, z: railZ + 3 };
  let ups = 0, prevY = b.s.y, rising = false;
  for (let t = 0; t < 3; t += 1 / 60) {
    if (Math.round(t * 60) % 6 === 0) b.play("watch", feather); // 1초에 10번 알림
    b.update(1 / 60, [me]);
    const r = b.s.y > prevY + 1e-4;
    if (r && !rising) ups++;
    rising = r; prevY = b.s.y;
  }
  assert.ok(ups <= 1, `뛰어오른 횟수 ${ups}`);
  assert.ok(Math.abs(b.s.y - groundY(b.s.x, b.s.z)) < 0.01, "땅에 내려와 있음");
  assert.ok(b.s.z - railZ < 1.6, `너무 멀리 감: ${(b.s.z - railZ).toFixed(2)}m`);
});
