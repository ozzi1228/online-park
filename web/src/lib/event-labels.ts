// 로그 종류 → 관리자 화면에 보일 한국어 이름. 없는 건 원래 이름 그대로 보임.
export const EVENT_LABELS: Record<string, string> = {
  "user.created": "계정 생성",
  "guest.linked": "비회원 → 회원 전환",
  "green.granted": "그린 지급",
  "character.confirmed": "캐릭터 확정",
  "park.enter": "공원 입장",
  "petal.caught": "소원꽃잎 잡음",
  "petal.claim_refused": "소원꽃잎 거절 (한도)",
  "client.petal.caught": "소원꽃잎 잡음 (서버 판정 이전 기록)",
  "client.petal.missed": "소원꽃잎 놓침",
  "client.petal.released": "소원꽃잎 놓아줌",
  "client.wish.made": "소원 빌기",
  "client.sit.start": "앉기",
  "client.sit.end": "일어나기",
  "admin.login": "관리자 로그인",
  "admin.login_failed": "관리자 로그인 실패",
  "admin.settings.updated": "운영 설정 변경",
};
export const eventLabel = (t: string) => EVENT_LABELS[t] ?? t;
