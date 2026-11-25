// 실행: node --test src/lib/cat-hearts.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { effective, heartsOf } from "./cat-hearts.ts";

const R = { heart1: 11, heart2: 31, heart3: 51, heart4: 71, heart5: 91, start: 20, decayAfterDays: 3, decayPerDay: 2 };

test("하트: 0~10=0, 11~30=1, 31~50=2, 51~70=3, 71~90=4, 91~100=5", () => {
  for (const [s, h] of [[0, 0], [10, 0], [11, 1], [30, 1], [31, 2], [50, 2], [51, 3], [70, 3], [71, 4], [90, 4], [91, 5], [100, 5]]) assert.equal(heartsOf(s, R), h, `${s}`);
});
test("처음 만나면 시작 값, 3일까지는 그대로, 그다음 날부터 하루 2씩 (0 아래로는 안 감)", () => {
  const day = 86_400_000, now = Date.now(), at = (d: number) => new Date(now - d * day);
  assert.equal(effective(undefined, R, now), 20);
  assert.equal(effective({ score: 60, lastAt: at(3) }, R, now), 60);
  assert.equal(effective({ score: 60, lastAt: at(5) }, R, now), 56);
  assert.equal(effective({ score: 5, lastAt: at(30) }, R, now), 0);
});
