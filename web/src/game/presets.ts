// 캐릭터 프리셋. 성별·나이는 저장하지 않음 — 생김새 데이터일 뿐.
// id는 DB에 저장되므로 절대 바꾸거나 재사용하지 말 것 (삭제 대신 hidden: true)

export type Preset = {
  id: string;
  name: string;
  tags: Tag[];
  skin: string; hair: string;
  style: "short" | "long" | "wavy" | "bob" | "buns" | "pony" | "twotail" | "manbun" | "braid" | "curly" | "slick" | "bald";
  bangs?: "side" | "none";
  top: string; topType?: "tee" | "hoodie" | "jacket" | "overalls"; inner?: string; tie?: string;
  bottom: string; bottomType?: "pants" | "wide" | "shorts" | "skirt" | "longskirt";
  shoes: string;
  collar?: string; scarf?: string; bag?: string;
  hat?: "beanie" | "cap" | "bucket" | "beret"; hatColor?: string; ribbon?: string;
  glasses?: boolean; smile?: boolean; eye?: string; brow?: string; kid?: boolean;
  hidden?: boolean;
};

export const TAGS = ["캐주얼", "러블리", "힙", "단정", "댄디", "스포티", "클래식", "꼬마"] as const;
export type Tag = (typeof TAGS)[number];

export const PRESETS: Preset[] = [
  { id: "p01", name: "롱헤어 원피스", tags: ["러블리"], skin: "#fbe2d2", hair: "#4a3328", style: "long", top: "#f6b8c8", bottom: "#f6b8c8", bottomType: "longskirt", collar: "#ffffff", shoes: "#8a5a44", ribbon: "#ffffff" },
  { id: "p02", name: "단발 청바지", tags: ["캐주얼"], skin: "#f6d8c4", hair: "#2f2626", style: "bob", top: "#fdfaf3", bottom: "#8fb3d9", shoes: "#f7f3ee", bag: "#c9956b" },
  { id: "p03", name: "비니 후드", tags: ["힙"], skin: "#e2b08a", hair: "#2f2a2a", style: "short", top: "#7c8a9e", topType: "hoodie", bottom: "#3d3a40", bottomType: "wide", shoes: "#ffffff", hat: "beanie", hatColor: "#e8846b" },
  { id: "p04", name: "셔츠 슬랙스", tags: ["단정"], skin: "#f3d1b6", hair: "#2f2a2a", style: "short", bangs: "side", top: "#f7f7f2", collar: "#ffffff", bottom: "#3f4a66", shoes: "#5a3e30" },
  { id: "p05", name: "재킷 넥타이", tags: ["댄디"], skin: "#f1cdb0", hair: "#6b4a35", style: "slick", top: "#b9a07c", topType: "jacket", inner: "#ffffff", tie: "#8a3b44", bottom: "#5b5048", shoes: "#3e2e26", glasses: true },
  { id: "p06", name: "캡 반바지", tags: ["스포티"], skin: "#c58e66", hair: "#2a2220", style: "short", top: "#ffffff", bottom: "#3f4a66", bottomType: "shorts", shoes: "#f2f2f2", hat: "cap", hatColor: "#4f7fc4" },
  { id: "p07", name: "포니테일 카디건", tags: ["러블리", "캐주얼"], skin: "#fde6d8", hair: "#7a5236", style: "pony", top: "#f3d38a", topType: "jacket", inner: "#ffffff", bottom: "#a3c7e8", bottomType: "skirt", shoes: "#ffffff" },
  { id: "p08", name: "버킷햇 멜빵", tags: ["캐주얼", "힙"], skin: "#f3d6c0", hair: "#2f2626", style: "short", top: "#f5b7b1", topType: "overalls", bottom: "#7aa0c4", bottomType: "wide", shoes: "#f7f3ee", hat: "bucket", hatColor: "#f2e2b6" },
  { id: "p09", name: "양갈래 멜빵치마", tags: ["러블리"], skin: "#fbe2d2", hair: "#5a3a2a", style: "twotail", top: "#ffffff", topType: "overalls", bottom: "#e88c8c", bottomType: "skirt", shoes: "#8a5a44" },
  { id: "p10", name: "곱슬 니트 머플러", tags: ["캐주얼", "클래식"], skin: "#7f5139", hair: "#221b19", style: "curly", top: "#e6c8a0", scarf: "#c45c5c", bottom: "#5a6e5a", shoes: "#4a3a30", brow: "#221b19" },
  { id: "p11", name: "웨이브 롱스커트", tags: ["러블리", "클래식"], skin: "#fbe7de", hair: "#f0cf7a", style: "wavy", top: "#c9b7e3", bottom: "#f1ebe1", bottomType: "longskirt", shoes: "#c9a0a8", eye: "#4f78a8", brow: "#c49a55" },
  { id: "p12", name: "베레모 트렌치", tags: ["클래식", "댄디"], skin: "#f5d5c0", hair: "#3a2a24", style: "bob", bangs: "side", top: "#d7b98b", topType: "jacket", inner: "#ffffff", bottom: "#4a4a52", shoes: "#3e2e26", hat: "beret", hatColor: "#a8434e" },
  { id: "p13", name: "꼬마 양쪽 번", tags: ["꼬마", "러블리"], skin: "#fde3d3", hair: "#8b5e3c", style: "buns", top: "#f8da7a", bottom: "#a8dcc8", bottomType: "skirt", shoes: "#e88a8a", kid: true },
  { id: "p14", name: "꼬마 캡 반바지", tags: ["꼬마", "스포티"], skin: "#e9bf9c", hair: "#3a2a20", style: "short", top: "#a9d3ef", bottom: "#e6d5b0", bottomType: "shorts", shoes: "#ffffff", hat: "cap", hatColor: "#e46b5d", kid: true },
  { id: "p15", name: "조끼 안경", tags: ["클래식"], skin: "#ebcaae", hair: "#d8d4d0", style: "bald", top: "#9c7b5a", topType: "jacket", inner: "#e9e2d0", bottom: "#7b6656", shoes: "#5a4a40", glasses: true, smile: true },
  { id: "p16", name: "카디건 안경", tags: ["클래식"], skin: "#f0cfb8", hair: "#cfc8c4", style: "bob", top: "#d9a3b5", topType: "jacket", inner: "#ffffff", bottom: "#8a8aa0", bottomType: "longskirt", shoes: "#6b5a60", glasses: true, smile: true },
  { id: "p17", name: "번헤어 오버핏 후드", tags: ["힙", "캐주얼"], skin: "#d9a47e", hair: "#3a2a20", style: "manbun", top: "#9bb7a0", topType: "hoodie", bottom: "#c9c2b3", bottomType: "wide", shoes: "#5a4a40" },
  { id: "p18", name: "땋은머리 원피스", tags: ["러블리", "클래식"], skin: "#fbe6dc", hair: "#a0522d", style: "braid", top: "#9fd1b5", bottom: "#9fd1b5", bottomType: "longskirt", collar: "#ffffff", shoes: "#8a5a44", eye: "#4a6a4a" },
  { id: "p19", name: "셔츠 크로스백", tags: ["단정"], skin: "#f1ceb4", hair: "#4a4444", style: "short", bangs: "side", top: "#a9c4d9", collar: "#ffffff", bottom: "#7a6a58", shoes: "#4a3a30", bag: "#5a4a40", smile: true },
  { id: "p20", name: "탈색 와이드", tags: ["힙"], skin: "#8d5c3f", hair: "#e8d27a", style: "short", top: "#2f2f35", bottom: "#8a8f6a", bottomType: "wide", shoes: "#ffffff", brow: "#3a2a20" },
];

export const visiblePresets = () => PRESETS.filter((p) => !p.hidden);
export const isValidPresetId = (id: string) => PRESETS.some((p) => p.id === id && !p.hidden);

export const NICK_MAX = 10;
