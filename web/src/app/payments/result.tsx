import Link from "next/link";
import { msgFrom } from "@/content/messages";
import { getMessageOverrides } from "@/lib/content";

export async function Result({ title, message }: { title: "pay.failTitle" | "pay.cancelTitle"; message: string }) {
  const msg = msgFrom(await getMessageOverrides());
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-gradient-to-b from-sky to-cream px-4 text-center">
      <h1 className="text-2xl">{msg(title)}</h1>
      <p className="opacity-75">{message || msg("pay.retry")}</p>
      <p className="text-sm opacity-60">{msg("pay.help")}</p>
      <Link href="/park" className="rounded-full bg-sakura px-6 py-3 text-white">{msg("pay.back")}</Link>
    </main>
  );
}
