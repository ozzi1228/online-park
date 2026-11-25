// 화면 문구: 기본값은 src/content, 관리자 페이지에서 고친 값(DB site_content)이 덮어씀
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteContent } from "@/db/schema";
import { HOW_TO, INTRO, TIPS } from "@/content/guide";
import { FORTUNES } from "@/content/fortunes";
import { MESSAGES, type MsgKey } from "@/content/messages";

export type Guide = { intro: string[]; tips: string[]; howTo: { title: string; pc: string; mobile: string }[] };
export const DEFAULT_GUIDE: Guide = { intro: INTRO, tips: TIPS, howTo: HOW_TO };

const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

export async function getGuide(): Promise<Guide> {
  try {
    const [row] = await db.select().from(siteContent).where(eq(siteContent.key, "guide"));
    const v = row?.value as Partial<Guide> | undefined;
    if (!v) return DEFAULT_GUIDE;
    return {
      intro: isStrList(v.intro) && v.intro.length ? v.intro : DEFAULT_GUIDE.intro,
      tips: isStrList(v.tips) ? v.tips : DEFAULT_GUIDE.tips,
      howTo: Array.isArray(v.howTo) && v.howTo.length ? v.howTo : DEFAULT_GUIDE.howTo,
    };
  } catch {
    return DEFAULT_GUIDE;
  }
}

// ---------- 관리자 편집 형식 ↔ 데이터 ----------
// 소개: 빈 줄로 문단 구분 / 팁: 한 줄에 하나 / 사용법: 한 줄에 "제목 | PC 조작 | 모바일 조작"
export const guideToText = (g: Guide) => ({
  intro: g.intro.join("\n\n"),
  tips: g.tips.join("\n"),
  howTo: g.howTo.map((h) => `${h.title} | ${h.pc} | ${h.mobile}`).join("\n"),
});

export function textToGuide(t: { intro: string; tips: string; howTo: string }): Guide | string {
  const lines = (s: string) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const intro = t.intro.split(/\r?\n\s*\r?\n/).map((p) => p.replace(/\s*\r?\n\s*/g, " ").trim()).filter(Boolean);
  const howTo = [];
  for (const [i, l] of lines(t.howTo).entries()) {
    const [title, pc, mobile] = l.split("|").map((x) => x.trim());
    if (!title || !pc) return `사용법 ${i + 1}번째 줄: "제목 | PC 조작 | 모바일 조작" 형식으로 적어 주세요`;
    howTo.push({ title, pc, mobile: mobile || pc });
  }
  if (!intro.length) return "소개를 한 문단 이상 적어 주세요";
  if (!howTo.length) return "사용법을 한 줄 이상 적어 주세요";
  const all = [...intro, ...lines(t.tips), ...howTo.flatMap((h) => [h.title, h.pc, h.mobile])];
  if (all.some((x) => x.length > 500)) return "한 문단(줄)은 500자까지 적을 수 있어요";
  return { intro, tips: lines(t.tips), howTo };
}

// ---------- 운세꽃잎 문구: 기본값은 src/content/fortunes.ts, 관리자가 고치면 DB(site_content "fortunes") ----------
export async function getFortunes(): Promise<string[]> {
  try {
    const [row] = await db.select().from(siteContent).where(eq(siteContent.key, "fortunes"));
    return isStrList(row?.value) && row.value.length ? row.value : FORTUNES;
  } catch {
    return FORTUNES;
  }
}
/** 관리자 입력(한 줄에 하나) → 문구 목록, 잘못됐으면 안내 문구 */
export function textToFortunes(t: string): string[] | string {
  const list = t.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  if (!list.length) return "운세 문구를 한 줄 이상 적어 주세요";
  if (list.some((x) => x.length > 200)) return "운세 문구는 한 줄에 200자까지 적을 수 있어요";
  return list;
}

// ---------- 안내 멘트: 기본값은 src/content/messages.ts, 관리자가 고친 것만 DB(site_content "messages")에 {키: 문구} ----------
export async function getMessageOverrides(): Promise<Partial<Record<MsgKey, string>>> {
  try {
    const [row] = await db.select().from(siteContent).where(eq(siteContent.key, "messages"));
    const v = row?.value as Record<string, unknown> | undefined, out: Partial<Record<MsgKey, string>> = {};
    for (const [k, text] of Object.entries(v ?? {})) if (k in MESSAGES && typeof text === "string" && text.trim()) out[k as MsgKey] = text;
    return out;
  } catch {
    return {};
  }
}
