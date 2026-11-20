// 쪽지 펜 색·획 형식 (브라우저와 서버 공용 — DB를 쓰는 notes.ts는 브라우저에서 못 불러서 따로)
export const PEN_COLORS = ["#5a3a30", "#e8628a", "#4f78a8", "#5f9a6a"] as const; // 갈색·분홍·하늘·초록
export type Strokes = number[][]; // [색번호, x1, y1, x2, y2, ...] 좌표는 0~1000 정수

/** 클라이언트가 보낸 획 데이터 검사 (크기·형식). 문제 있으면 null */
export function cleanStrokes(input: unknown): Strokes | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > 300) return null;
  let total = 0;
  const out: Strokes = [];
  for (const s of input) {
    if (!Array.isArray(s) || s.length < 3 || s.length % 2 === 0) return null; // 색 + (x,y)쌍
    total += s.length;
    if (total > 12000) return null;
    const color = Number(s[0]);
    if (!Number.isInteger(color) || color < 0 || color >= PEN_COLORS.length) return null;
    const pts = s.slice(1).map((v) => Math.round(Number(v)));
    if (pts.some((v) => !Number.isFinite(v) || v < 0 || v > 1000)) return null;
    out.push([color, ...pts]);
  }
  return out;
}

