import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMessageOverrides } from "@/lib/content";
import { Picker } from "./picker";

export const instant = false; // 로그인 상태에 따라 갈림 → 요청 때 렌더

export default async function CharacterPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  if (session.user.characterLockedAt) redirect("/park"); // 한 번 정하면 변경 불가
  return <Picker messages={await getMessageOverrides()} />;
}
