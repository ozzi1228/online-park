import { connection } from "next/server";
import { getGuide } from "@/lib/content";

/** 안내소 소개·사용법 (관리자 편집 반영) */
export async function GET() {
  await connection(); // 관리자가 고친 문구를 바로 반영 (미리 만들어 두지 않음)
  return Response.json(await getGuide(), { headers: { "cache-control": "no-store" } });
}
