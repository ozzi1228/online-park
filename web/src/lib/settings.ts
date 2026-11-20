// 운영 설정: 코드엔 기본값만 두고, 관리자 페이지에서 바꾼 값(DB game_settings)이 덮어씀.
// 새 수치를 넣을 땐 여기 DEFAULTS에 추가 → 관리자 페이지가 이 목록으로 편집 화면을 만듦.
import { db } from "@/db";
import { gameSettings } from "@/db/schema";

export const DEFAULTS = {
  wishPetal: {
    dailyTotal: 100,      // 하루 전체(모든 유저 합계) 선착순 개수
    perUserDaily: 2,      // 한 사람이 하루에 잡을 수 있는 횟수
    minIntervalSec: 90,   // 내 앞에 소원꽃잎이 나타나는 간격 (최소~최대 사이 랜덤)
    maxIntervalSec: 240,
  },
  green: {
    signupBonus: 100,     // 회원가입 시 지급
    chargeSmall: 500,     // 충전 상품 (1그린 = 1원)
    chargeMedium: 1000,
    chargeLarge: 3000,
  },
  shop: {
    notebookPrice: 10,    // 벚꽃잎 노트 1권 (그린)
    notebookSheets: 30,   // 노트 1권 장수
    matPrice: 10,         // 돗자리 (한 번 사면 계속 사용)
  },
  inquiry: {
    dailyLimit: 5,        // 한 사람이 하루에 남길 수 있는 문의 수
    maxLength: 2000,      // 문의 내용 최대 글자 수
  },
} as const;

/** 관리자 화면에 보일 이름·단위·허용 범위 (DEFAULTS에 칸을 추가하면 여기도 추가) */
export const META: { [G in keyof typeof DEFAULTS]: { title: string; fields: { [K in keyof (typeof DEFAULTS)[G]]: { label: string; unit?: string; min: number; max: number } } } } = {
  wishPetal: {
    title: "소원꽃잎",
    fields: {
      dailyTotal: { label: "하루 전체 개수 (모든 유저 선착순)", unit: "개", min: 0, max: 100000 },
      perUserDaily: { label: "1인당 하루 횟수", unit: "번", min: 0, max: 100 },
      minIntervalSec: { label: "나타나는 간격 (최소)", unit: "초", min: 5, max: 86400 },
      maxIntervalSec: { label: "나타나는 간격 (최대)", unit: "초", min: 5, max: 86400 },
    },
  },
  green: {
    title: "그린",
    fields: {
      signupBonus: { label: "회원가입 보너스", unit: "그린", min: 0, max: 100000 },
      chargeSmall: { label: "충전 상품 1 (1그린=1원)", unit: "그린", min: 100, max: 1000000 },
      chargeMedium: { label: "충전 상품 2", unit: "그린", min: 100, max: 1000000 },
      chargeLarge: { label: "충전 상품 3", unit: "그린", min: 100, max: 1000000 },
    },
  },
  shop: {
    title: "매점",
    fields: {
      notebookPrice: { label: "벚꽃잎 노트 가격", unit: "그린", min: 0, max: 100000 },
      notebookSheets: { label: "노트 1권 장수", unit: "장", min: 1, max: 1000 },
      matPrice: { label: "돗자리 가격", unit: "그린", min: 0, max: 100000 },
    },
  },
  inquiry: {
    title: "문의",
    fields: {
      dailyLimit: { label: "1인당 하루 문의 수", unit: "개", min: 1, max: 100 },
      maxLength: { label: "문의 내용 최대 길이", unit: "자", min: 100, max: 10000 },
    },
  },
};

type Widen<T> = { -readonly [K in keyof T]: T[K] extends number ? number : T[K] extends object ? Widen<T[K]> : T[K] };
export type Settings = Widen<typeof DEFAULTS>;
export type SettingsGroup = keyof Settings;

// 자주 읽으니 30초 동안은 메모리 값 사용
let cache: { at: number; value: Settings } | null = null;

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value;
  const value = structuredClone(DEFAULTS) as Settings;
  try {
    for (const row of await db.select().from(gameSettings)) {
      const group = row.key as SettingsGroup;
      if (group in value && row.value && typeof row.value === "object") {
        // 기본값에 있는 칸 중 숫자만 덮어씀 (잘못 들어간 값은 무시)
        for (const [k, v] of Object.entries(row.value as Record<string, unknown>)) {
          const target = value[group] as Record<string, unknown>;
          if (k in target && typeof v === "number" && Number.isFinite(v)) target[k] = v;
        }
      }
    }
  } catch (e) {
    console.error("[settings] DB 읽기 실패, 기본값 사용", e);
  }
  cache = { at: Date.now(), value };
  return value;
}

/** 관리자 페이지에서 저장한 뒤 바로 반영되게 */
export const invalidateSettings = () => { cache = null; };

/** 한국 날짜 'YYYY-MM-DD' (하루 단위 제한 기준) */
export const kstDate = (now = Date.now()) => new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);
