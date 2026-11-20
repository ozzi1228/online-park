import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { greenBalance } from "@/lib/green";
import { logEvent, requestCtx } from "@/lib/log";

// 개인 화면이라 미리 그려둘 부분이 없음 → 요청 때 렌더
export const instant = false;

// 임시 화면: 3D 공원은 다음 단계에서 이 자리에 들어감
export default async function Park() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session) redirect("/");
  if (!session.user.characterLockedAt) redirect("/character");

  const { user } = session;
  const isGuest = !!user.isAnonymous;
  await logEvent("park.enter", {}, { userId: user.id, isGuest, sessionId: session.session.id, ...requestCtx(h) });
  const green = isGuest ? null : await greenBalance(user.id);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-gradient-to-b from-sky to-cream px-4 text-center">
      <h1 className="text-2xl">벚꽃 공원 입구</h1>
      <p>{user.nickname}님, 반가워요{isGuest && " (비회원)"}</p>
      {green !== null && <p className="rounded-full bg-white/80 px-4 py-1.5">🌱 {green.toLocaleString()} 그린</p>}
      <p className="text-sm opacity-60">공원은 아직 공사 중이에요</p>
    </main>
  );
}
