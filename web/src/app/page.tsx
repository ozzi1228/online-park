import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";
import { auth, enabledProviders } from "@/lib/auth";
import { EntryButtons } from "./entry-buttons";
import { ShareButton } from "./share-button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-gradient-to-b from-sky to-cream px-4 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <Image src="/logo.png" alt="" width={140} height={140} priority />
        <h1 className="text-3xl">랜선 벚꽃공원</h1>
      </div>
      {/* 로고·제목은 바로 보이고, 로그인 상태에 따른 버튼만 뒤따라 옴 */}
      <Suspense fallback={<div className="h-[52px] w-full max-w-xs rounded-full bg-sakura/40" />}>
        <EntryAction />
      </Suspense>
    </main>
  );
}

async function EntryAction() {
  const session = await auth.api.getSession({ headers: await headers() });
  // 비회원으로 둘러본 사람도 여기서 로그인하면 캐릭터 그대로 회원이 됨
  if (!session || session.user.isAnonymous) return <EntryButtons providers={enabledProviders} guest={!!session} />;
  return (
    <div className="flex w-full max-w-xs flex-col gap-3">
      <Link href="/park"
        className="w-full rounded-full bg-sakura py-3.5 text-center text-lg text-white shadow-[0_3px_0_var(--color-sakura-deep)]">
        공원 입장하기
      </Link>
      <ShareButton />
    </div>
  );
}
