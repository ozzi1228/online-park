import { connection } from "next/server";
import { DEFAULTS, META, getSettings, type SettingsGroup } from "@/lib/settings";
import { resetGroup, saveGroup } from "./actions";
import { SaveButton } from "../../save-button";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export const instant = false; // 관리자 화면은 항상 요청 때 최신 데이터로

export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  await connection();
  const q = await searchParams, saved = one(q.saved), error = one(q.error);
  const current = await getSettings();
  const groups = Object.keys(DEFAULTS) as SettingsGroup[];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl">운영 설정</h1>
        <p className="mt-1 text-sm opacity-60">저장하면 30초 안에 서비스에 반영돼요. 바꾼 기록은 로그(운영 설정 변경)에 남아요.</p>
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((g) => {
          const fields = META[g].fields as Record<string, { label: string; unit?: string; min: number; max: number }>;
          const cur = current[g] as Record<string, number>, def = DEFAULTS[g] as Record<string, number>;
          const changed = Object.keys(fields).some((k) => cur[k] !== def[k]);
          return (
            <section key={g} className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
              <div className="mb-3 flex items-center gap-2">
                <h2 className="font-bold">{META[g].title}</h2>
                {changed && <span className="rounded bg-sakura/20 px-1.5 text-[11px]">기본값에서 바뀜</span>}
                {saved === g && <span role="status" className="ml-auto text-xs text-emerald-600">저장했어요 ✓</span>}
              </div>
              <form action={saveGroup} className="flex flex-col gap-3">
                <input type="hidden" name="group" value={g} />
                {Object.entries(fields).map(([k, m]) => (
                  <label key={k} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1">{m.label}</span>
                    <span className="flex items-center gap-1">
                      <input name={k} type="number" inputMode="numeric" required min={m.min} max={m.max} step={1} defaultValue={cur[k]}
                        className="w-28 rounded-lg bg-cream px-3 py-1.5 text-right tabular-nums ring-1 ring-black/10" />
                      <span className="w-8 text-xs opacity-60">{m.unit}</span>
                    </span>
                    <span className="w-full text-right text-[11px] opacity-50">기본값 {def[k].toLocaleString("ko-KR")}{m.unit} · {m.min}~{m.max}</span>
                  </label>
                ))}
                <div className="flex justify-end gap-2">
                  {changed && <button formAction={resetGroup} className="rounded-full px-4 py-1.5 text-sm ring-1 ring-black/10">기본값으로</button>}
                  <SaveButton className="px-5 py-1.5" />
                </div>
              </form>
            </section>
          );
        })}
      </div>
    </div>
  );
}
