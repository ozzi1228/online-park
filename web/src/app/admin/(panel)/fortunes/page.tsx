import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteContent } from "@/db/schema";
import { getFortunes } from "@/lib/content";
import { kst } from "@/lib/format";
import { resetFortunes, saveFortunes } from "../content/actions";
import { SaveButton } from "../../save-button";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export const instant = false; // 관리자 화면은 항상 요청 때 최신 데이터로

/** 운세꽃잎 문구: 한 줄에 하나. 꽃잎을 잡으면 이 중 하나가 무작위로 나옴 */
export default async function FortunesPage({ searchParams }: PageProps<"/admin/fortunes">) {
  await connection();
  const q = await searchParams, saved = one(q.saved), error = one(q.error);
  const [fortunes, [row]] = await Promise.all([getFortunes(), db.select({ updatedAt: siteContent.updatedAt }).from(siteContent).where(eq(siteContent.key, "fortunes"))]);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl">운세 문구</h1>
        <p className="mt-1 text-sm opacity-60">운세꽃잎을 잡으면 이 중 하나가 무작위로 나와요. 한 줄에 하나씩 넣고 저장하면 바로 반영돼요.
          {row ? ` (지금 ${fortunes.length}개, 마지막 수정 ${kst(row.updatedAt)})` : ` (지금 기본 문구 ${fortunes.length}개)`}</p>
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {saved && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-700">저장했어요 ✓</p>}
      <form action={saveFortunes} className="flex flex-col gap-2 rounded-2xl bg-white p-4 ring-1 ring-black/5">
        <textarea name="fortunes" defaultValue={fortunes.join("\n")} rows={28} className="w-full rounded-xl bg-cream px-3 py-2 text-sm leading-relaxed ring-1 ring-black/10" />
        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto text-xs opacity-60">빈 줄은 무시돼요 · 한 줄에 200자까지</span>
          {row && <button formAction={resetFortunes} className="rounded-full px-4 py-2 text-sm ring-1 ring-black/10">기본 문구로</button>}
          <SaveButton className="px-6 py-2" />
        </div>
      </form>
    </div>
  );
}
