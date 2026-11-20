// 실행: node --test src/lib/notes-shared.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanStrokes } from "./notes-shared.ts";

test("정상 획은 정수로 정리돼 통과", () => {
  assert.deepEqual(cleanStrokes([[1, 10.4, 20.6, 30, 40]]), [[1, 10, 21, 30, 40]]);
});
test("이상한 데이터는 거절", () => {
  assert.equal(cleanStrokes([]), null);                         // 빈 쪽지
  assert.equal(cleanStrokes("hi"), null);                       // 형식 아님
  assert.equal(cleanStrokes([[9, 1, 1]]), null);                // 없는 펜 색
  assert.equal(cleanStrokes([[0, 1, 2, 3]]), null);             // 좌표가 짝이 안 맞음
  assert.equal(cleanStrokes([[0, -5, 2]]), null);               // 종이 밖
  assert.equal(cleanStrokes([[0, 1, "x"]]), null);              // 숫자 아님
  assert.equal(cleanStrokes(Array.from({ length: 301 }, () => [0, 1, 1])), null); // 획 너무 많음
  assert.equal(cleanStrokes([[0, ...Array(12001).fill(5)]]), null);             // 점 너무 많음
});
