// 문의 종류 (안내소 폼·관리자 화면 공용)
export const INQUIRY_CATEGORIES = { general: "이용 문의", payment: "결제·그린", bug: "오류 신고", other: "기타" } as const;
export type InquiryCategory = keyof typeof INQUIRY_CATEGORIES;
export const INQUIRY_STATUS: Record<string, string> = { open: "답변 대기", answered: "답변 완료", closed: "종료" };
