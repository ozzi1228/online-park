import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { logEvent, requestCtx } from "@/lib/log";
import { ParkView } from "./park-view";

// 개인 화면이라 미리 그려둘 부분이 없음 → 요청 때 렌더
export const instant = false;

export default async function Park() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session) redirect("/");
  const { user } = session;
  if (!user.characterLockedAt || !user.characterPreset) redirect("/character");

  await logEvent("park.enter", {}, { userId: user.id, isGuest: !!user.isAnonymous, sessionId: session.session.id, ...requestCtx(h) });
  return <ParkView presetId={user.characterPreset} nickname={user.nickname ?? ""} />;
}
