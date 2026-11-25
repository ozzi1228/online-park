// 돗자리 색 (매점에서 살 때 고름). 서버·화면·실시간 서버가 같이 씀
export const MAT_COLORS = ["pink", "yellow", "blue", "green", "white"] as const;
export type MatColor = (typeof MAT_COLORS)[number];
export const MAT_COLOR_NAMES: Record<MatColor, string> = { pink: "분홍", yellow: "노랑", blue: "파랑", green: "초록", white: "흰색" };
/** 고르는 칸에 보여줄 대표색 */
export const MAT_SWATCH: Record<MatColor, string> = { pink: "#f4a6bf", yellow: "#f6d365", blue: "#7fb3e6", green: "#8fcf9a", white: "#fbf7ef" };
