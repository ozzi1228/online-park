// 운영 설정: 코드엔 기본값만 두고, 관리자 페이지에서 바꾼 값(DB game_settings)이 덮어씀.
// 새 수치를 넣을 땐 여기 DEFAULTS에 추가 → 관리자 페이지가 이 목록으로 편집 화면을 만듦.
import { db } from "@/db";
import { gameSettings } from "@/db/schema";

export const DEFAULTS = {
  wishPetal: {
    dailyTotal: 100,      // 하루 전체(모든 유저 합계) 선착순 개수
    perUserDaily: 1,      // 한 사람이 하루에 잡을 수 있는 횟수 (운세는 하루 한 번)
    minIntervalSec: 90,   // 내 앞에 운세꽃잎이 나타나는 간격 (최소~최대 사이 랜덤)
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
    churuPrice: 10,       // 츄르 한 묶음 (고양이 간식)
    churuPack: 3,         // 한 묶음에 든 츄르 수
    rodPrice: 30,         // 고양이 낚싯대 장난감
    rodUses: 100,         // 낚싯대는 이만큼 놀아 주면 부러짐
  },
  fountain: {
    coinPrice: 10,        // 분수에 동전 던지기 (그린)
    rewardOuter: 5,       // 맨 위 접시 바깥 칸에 들어가면 (그린)
    rewardMid: 10,        // 가운데 칸
    rewardBull: 20,       // 정중앙
    midPct: 60,           // 가운데 칸 = 접시 반지름의 몇 %까지
    bullPct: 25,          // 정중앙 = 접시 반지름의 몇 %까지
    rewardDailyCap: 100,  // 한 사람이 하루에 받을 수 있는 보상 합계 (0 = 제한 없음)
  },
  wishTree: {
    notesPerUserDaily: 5, // 한 사람이 하루에 달 수 있는 소원 쪽지 수
    maxVisible: 3000,     // 나무에 보이는 쪽지 최대 수 (최근 것부터)
  },
  cat: {
    enabled: 1,           // 공원 고양이 (1 = 있음, 0 = 없음). 있으면 늘 공원 어딘가를 돌아다님
    count: 2,             // 몇 마리 (서로 다른 무늬로)
  },
  catBond: {              // 고양이 호감도 (사람마다·고양이마다 따로, 0~100). 화면엔 하트 개수로만
    heart1: 11, heart2: 31, heart3: 51, heart4: 71, heart5: 91, // 하트 n개가 되는 호감도
    start: 20,            // 처음 만났을 때
    nameHearts: 3,        // 이름 지어 주기·부르기: 하트 몇 개부터
    petStayHearts: 4,     // 쓰다듬어도 도망가지 않음: 하트 몇 개부터
    purrAt: 85,           // 이 호감도부터 쓰다듬으면 고로롱 + 부비부비 (하트로는 안 보이는 숨은 단계)
    petGain: 1,           // 쓰다듬으면 오르는 호감도 (가만히 있을 때만)
    petGainMin: 10,       // 쓰다듬기로 오르는 건 같은 고양이에게 몇 분에 한 번
    dislikeBelow: 30,     // 이 호감도 밑에서 쓰다듬으려 하면 깎임
    dislikePenalty: 1,
    decayAfterDays: 3,    // 이만큼 안 만나면 그다음 날부터
    decayPerDay: 2,       // 하루에 깎이는 호감도
    callMaxPct: 80,       // 부르면 올 확률 = 호감도 × 이 값 / 100 (호감도 100이면 이 %)
    callCooldownSec: 30,  // 한 사람이 다시 부를 수 있는 간격
    feedGain: 8,          // 츄르를 먹으면 오르는 호감도
    feedCooldownMin: 10,  // 한 사람이 같은 고양이에게 다시 츄르를 줄 수 있는 간격 (분)
    fullMin: 3,           // 한 번 먹은 고양이는 몇 분 동안 배불러함 (모든 사람 공통)
    jealousLoss: 3,       // 질투: 내가 다른 고양이에게 츄르·놀이를 해 주는 걸 본 고양이에게서 깎이는 호감도
    jealousMin: 50,       // 이 호감도 이상인(정든) 고양이만 질투함
    jealousRangeM: 8,     // 이 거리 안에서 본 고양이만
    jealousCooldownMin: 10, // 같은 고양이는 몇 분에 한 번만 질투
    playGain: 5,          // 낚싯대로 놀아 줘서 사냥에 성공하면 오르는 호감도
    petStrokeSec: 10,     // 손으로 이만큼(초) 문질러 주면 쓰다듬기가 저절로 끝남
    petIdleSec: 6,        // 이만큼(초) 손을 안 대면 쓰다듬기가 끝남
  },
  controls: {
    walkSpeedCm: 300,     // 걷기 빠르기 (cm/초). 서버도 6m/초까지는 받아줌
    turnSpeed: 110,       // 좌우 키로 몸·시야가 도는 빠르기 (도/초)
    cameraBackCm: 420,    // 시점: 내 머리 뒤로 떨어진 거리 (0 = 완전 1인칭, 클수록 내 캐릭터가 많이 보임)
    cameraSideCm: 0,      // 시점: 오른쪽으로 비켜선 거리 (0 = 내 캐릭터가 화면 가운데 아래)
  },
  sound: {                // 소리 크기 기본값 (0~100). 각자 화면에서 켜기/끄기·전체 음량 조절
    wind: 60, water: 60, crowd: 45, nature: 40, sfx: 70,
  },
  inquiry: {
    dailyLimit: 5,        // 한 사람이 하루에 남길 수 있는 문의 수
    maxLength: 2000,      // 문의 내용 최대 글자 수
  },
} as const;

/** 관리자 화면에 보일 이름·단위·허용 범위 (DEFAULTS에 칸을 추가하면 여기도 추가) */
export const META: { [G in keyof typeof DEFAULTS]: { title: string; fields: { [K in keyof (typeof DEFAULTS)[G]]: { label: string; unit?: string; min: number; max: number } } } } = {
  wishPetal: {
    title: "운세꽃잎",
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
      churuPrice: { label: "츄르 한 묶음 가격", unit: "그린", min: 0, max: 100000 },
      churuPack: { label: "츄르 한 묶음 개수", unit: "개", min: 1, max: 100 },
      rodPrice: { label: "낚싯대 가격", unit: "그린", min: 0, max: 100000 },
      rodUses: { label: "낚싯대가 부러지기까지 (놀아 주는 횟수)", unit: "번", min: 1, max: 10000 },
    },
  },
  fountain: {
    title: "분수",
    fields: {
      coinPrice: { label: "동전 한 번 가격", unit: "그린", min: 0, max: 100000 },
      rewardOuter: { label: "접시 바깥 칸 보상", unit: "그린", min: 0, max: 100000 },
      rewardMid: { label: "가운데 칸 보상", unit: "그린", min: 0, max: 100000 },
      rewardBull: { label: "정중앙 보상", unit: "그린", min: 0, max: 100000 },
      midPct: { label: "가운데 칸 크기 (접시 반지름의)", unit: "%", min: 5, max: 95 },
      bullPct: { label: "정중앙 크기 (접시 반지름의)", unit: "%", min: 1, max: 90 },
      rewardDailyCap: { label: "하루 보상 한도 (0 = 없음)", unit: "그린", min: 0, max: 1000000 },
    },
  },
  wishTree: {
    title: "소원나무",
    fields: {
      notesPerUserDaily: { label: "1인당 하루 쪽지 수", unit: "장", min: 0, max: 100 },
      maxVisible: { label: "나무에 보이는 쪽지 최대 수", unit: "장", min: 50, max: 20000 },
    },
  },
  cat: {
    title: "고양이",
    fields: {
      enabled: { label: "고양이 있음 (1 = 켬, 0 = 끔)", unit: "", min: 0, max: 1 },
      count: { label: "마리 수 (서로 다른 무늬)", unit: "마리", min: 0, max: 6 },
    },
  },
  catBond: {
    title: "고양이 호감도",
    fields: {
      heart1: { label: "하트 1개가 되는 호감도", unit: "점", min: 0, max: 100 },
      heart2: { label: "하트 2개", unit: "점", min: 0, max: 100 },
      heart3: { label: "하트 3개", unit: "점", min: 0, max: 100 },
      heart4: { label: "하트 4개", unit: "점", min: 0, max: 100 },
      heart5: { label: "하트 5개", unit: "점", min: 0, max: 100 },
      start: { label: "처음 만났을 때 호감도", unit: "점", min: 0, max: 100 },
      nameHearts: { label: "이름 짓기·부르기 (하트 몇 개부터)", unit: "개", min: 0, max: 5 },
      petStayHearts: { label: "쓰다듬어도 가만히 (하트 몇 개부터)", unit: "개", min: 0, max: 5 },
      purrAt: { label: "고로롱·부비부비 (호감도)", unit: "점", min: 0, max: 100 },
      petGain: { label: "쓰다듬으면 오르는 호감도", unit: "점", min: 0, max: 20 },
      petGainMin: { label: "쓰다듬기로 오르는 간격", unit: "분", min: 0, max: 1440 },
      dislikeBelow: { label: "이 호감도 밑에서 쓰다듬으면 깎임", unit: "점", min: 0, max: 100 },
      dislikePenalty: { label: "그때 깎이는 호감도", unit: "점", min: 0, max: 20 },
      decayAfterDays: { label: "안 만나면 깎이기 시작 (며칠 뒤)", unit: "일", min: 1, max: 60 },
      decayPerDay: { label: "하루에 깎이는 호감도", unit: "점", min: 0, max: 20 },
      callMaxPct: { label: "부르면 올 확률 (호감도 100일 때)", unit: "%", min: 0, max: 100 },
      callCooldownSec: { label: "다시 부를 수 있는 간격", unit: "초", min: 0, max: 3600 },
      feedGain: { label: "츄르를 먹으면 오르는 호감도", unit: "점", min: 0, max: 50 },
      feedCooldownMin: { label: "같은 고양이에게 다시 츄르 줄 수 있는 간격 (한 사람 기준)", unit: "분", min: 0, max: 10080 },
      fullMin: { label: "츄르 먹고 배불러하는 시간", unit: "분", min: 0, max: 1440 },
      jealousLoss: { label: "질투로 깎이는 호감도", unit: "점", min: 0, max: 50 },
      jealousMin: { label: "질투하는 고양이 (이 호감도 이상)", unit: "점", min: 0, max: 100 },
      jealousRangeM: { label: "질투하는 거리 (이 안에서 본 고양이)", unit: "m", min: 0, max: 100 },
      jealousCooldownMin: { label: "같은 고양이 질투 간격", unit: "분", min: 0, max: 1440 },
      playGain: { label: "낚싯대 사냥 성공하면 오르는 호감도", unit: "점", min: 0, max: 50 },
      petStrokeSec: { label: "쓰다듬기: 이만큼 문지르면 저절로 끝남", unit: "초", min: 1, max: 120 },
      petIdleSec: { label: "쓰다듬기: 이만큼 손을 안 대면 끝남", unit: "초", min: 1, max: 120 },
    },
  },
  controls: {
    title: "조작",
    fields: {
      walkSpeedCm: { label: "걷기 빠르기", unit: "cm/초", min: 100, max: 600 },
      turnSpeed: { label: "좌우 키로 도는 빠르기", unit: "도/초", min: 30, max: 300 },
      cameraBackCm: { label: "시점: 내 캐릭터 뒤 거리 (0 = 완전 1인칭)", unit: "cm", min: 0, max: 700 },
      cameraSideCm: { label: "시점: 오른쪽으로 비켜선 거리", unit: "cm", min: 0, max: 150 },
    },
  },
  sound: {
    title: "소리",
    fields: {
      wind: { label: "바람 소리", unit: "", min: 0, max: 100 },
      water: { label: "물소리 (강·분수)", unit: "", min: 0, max: 100 },
      crowd: { label: "사람들 웅성임", unit: "", min: 0, max: 100 },
      nature: { label: "새·풀벌레", unit: "", min: 0, max: 100 },
      sfx: { label: "효과음 (종·퐁당·종이)", unit: "", min: 0, max: 100 },
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
