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

test("사람이 아무 때나 쓰다듬고·부르고·놀아 줘도 고양이가 순간이동하지 않음 (0.1초에 0.6m 넘게 안 움직임)", async () => {
  const { CatColony } = await import("./cat-brain.ts");
  const col = new CatColony(); col.cfg = { enabled: 1, count: 6 };
  const R = ["flee", "content", "pet", "petEnd", "eat", "eatEnd", "come", "huff", "rub"] as const;
  const P = ["watch", "crouch", "pounce", "roll", "end"] as const;
  const last = new Map<number, { x: number; z: number }>(), me = { x: 0, z: 5 };
  for (let i = 0; i < 10 * 60 * 10; i++) {
    const t = i / 10; me.x = Math.sin(t / 30) * 40; me.z = 10 + Math.cos(t / 17) * 12;
    if (i % 37 === 0 && col.brains.length) {
      const b = col.brains[i % col.brains.length], near = { x: b.s.x + 1, z: b.s.z + 1 };
      if (Math.random() < 0.3) b.play(P[Math.floor(Math.random() * P.length)], near); else b.react(R[Math.floor(Math.random() * R.length)], near);
    }
    col.update(0.1, [me]);
    for (const b of col.brains) {
      const p = last.get(b.s.look);
      if (p) assert.ok(Math.hypot(b.s.x - p.x, b.s.z - p.z) < 0.6, `${t.toFixed(1)}초 고양이 ${b.s.look} ${b.s.act}`);
      last.set(b.s.look, { x: b.s.x, z: b.s.z });
    }
  }
});
