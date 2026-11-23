// 실시간 서버가 읽어 가는 고양이 설정 (관리자 운영 설정 → 고양이). 공개해도 되는 값만
import { connection } from "next/server";
import { getSettings } from "@/lib/settings";

export async function GET() {
  await connection();
  return Response.json((await getSettings()).cat);
}
