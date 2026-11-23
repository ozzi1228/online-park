import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";
import { auth, enabledProviders } from "@/lib/auth";
import { EntryButtons } from "./entry-buttons";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-gradient-to-b from-sky to-cream px-4 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <Image src="/logo.png" alt="" width={140} height={140} priority />
        <h1 className="text-3xl">온라인 벚꽃놀이</h1>
        <p className="opacity-75">사람 많은 데 가지 말고, 여기서 벚꽃 구경해요</p>
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
  if (!session) return <EntryButtons providers={enabledProviders} />;
  return (
    <Link href="/park"
      className="w-full max-w-xs rounded-full bg-sakura py-3.5 text-center text-lg text-white shadow-[0_3px_0_var(--color-sakura-deep)]">
      공원으로 들어가기
    </Link>
  );
}
