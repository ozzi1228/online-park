import Link from "next/link";

export function Result({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-gradient-to-b from-sky to-cream px-4 text-center">
      <h1 className="text-2xl">{title}</h1>
      <p className="opacity-75">{message}</p>
      <p className="text-sm opacity-60">돈이 빠져나갔는데 그린이 안 들어왔다면 안내소에 문의해 주세요.</p>
      <Link href="/park" className="rounded-full bg-sakura px-6 py-3 text-white">공원으로 돌아가기</Link>
    </main>
  );
}
