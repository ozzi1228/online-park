import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteContent } from "@/db/schema";
import { getGuide, guideToText } from "@/lib/content";
import { kst } from "@/lib/format";
import { resetGuide, saveGuide } from "./actions";
import { SaveButton } from "../../save-button";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export const instant = false; // 관리자 화면은 항상 요청 때 최신 데이터로

export default async function ContentPage({ searchParams }: PageProps<"/admin/content">) {
  await connection();
  const q = await searchParams, saved = one(q.saved), error = one(q.error);
  const [guide, [row]] = await Promise.all([getGuide(), db.select({ updatedAt: siteContent.updatedAt }).from(siteContent).where(eq(siteContent.key, "guide"))]);
  const t = guideToText(guide);
  const area = "w-full rounded-xl bg-cream px-3 py-2 text-sm leading-relaxed ring-1 ring-black/10";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl">안내 문구</h1>
        <p className="mt-1 text-sm opacity-60">공원 안내소에서 안내원이 보여주는 소개·팁·사용법이에요. 저장하면 바로 반영돼요.
          {row ? ` (마지막 수정 ${kst(row.updatedAt)})` : " (지금은 기본 문구)"}</p>
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {saved && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-700">저장했어요 ✓</p>}
      <form action={saveGuide} className="flex flex-col gap-4 rounded-2xl bg-white p-4 ring-1 ring-black/5">
        <label className="flex flex-col gap-1">
          <span className="font-bold">소개</span><span className="text-xs opacity-60">빈 줄로 문단을 나눠요</span>
          <textarea name="intro" defaultValue={t.intro} rows={8} className={area} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-bold">팁</span><span className="text-xs opacity-60">한 줄에 하나씩</span>
          <textarea name="tips" defaultValue={t.tips} rows={4} className={area} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-bold">사용법</span><span className="text-xs opacity-60">한 줄에 하나씩, &ldquo;제목 | PC 조작 | 모바일 조작&rdquo;</span>
          <textarea name="howTo" defaultValue={t.howTo} rows={7} className={`${area} font-mono text-xs`} />
        </label>
        <div className="flex justify-end gap-2">
          {row && <button formAction={resetGuide} className="rounded-full px-4 py-2 text-sm ring-1 ring-black/10">기본 문구로</button>}
          <SaveButton className="px-6 py-2" />
        </div>
      </form>
    </div>
  );
}
