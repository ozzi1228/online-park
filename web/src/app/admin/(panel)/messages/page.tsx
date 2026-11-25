import { connection } from "next/server";
import { MESSAGES, type MsgKey } from "@/content/messages";
import { getMessageOverrides } from "@/lib/content";
import { resetMessages, saveMessages } from "./actions";
import { SaveButton } from "../../save-button";
import { TextTabs } from "../text-tabs";

export const instant = false; // 관리자 화면은 항상 요청 때 최신 데이터로

/** 공원 안 안내 멘트·메뉴 글자를 하나하나 고치는 곳. 비워 두면 기본값 */
export default async function Messages({ searchParams }: PageProps<"/admin/messages">) {
  await connection();
  const [o, q] = await Promise.all([getMessageOverrides(), searchParams]);
  const keys = Object.keys(MESSAGES) as MsgKey[];
  const groups = [...new Set(keys.map((k) => MESSAGES[k].group))];
  return (
    <div className="flex flex-col gap-4">
      <TextTabs now="messages" />
      <div>
        <h1 className="text-2xl">공원 안 안내 멘트</h1>
        <p className="mt-1 text-sm opacity-60">공원 안에서 뜨는 안내·메뉴 글자예요. 고친 칸만 바뀌고, 비워 두면 회색 기본 문구로 돌아가요.
          {"{이름}"}처럼 중괄호로 된 자리는 그때그때 채워지니 지우지 마세요. 저장하면 사용자가 공원에 다시 들어올 때부터 바뀌어요. (고친 것 {Object.keys(o).length}개)</p>
      </div>
      {q.saved && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-700">저장했어요 ✓</p>}
      <form action={saveMessages} className="flex flex-col gap-4">
        {groups.map((g) => (
          <section key={g} className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
            <h2 className="mb-2 font-bold">{g}</h2>
            <div className="flex flex-col gap-2">
              {keys.filter((k) => MESSAGES[k].group === g).map((k) => (
                <label key={k} className="grid gap-1 text-sm md:grid-cols-[16rem_1fr] md:items-center">
                  <span className="opacity-70">{MESSAGES[k].label}{o[k] && <span className="ml-1 text-sakura-deep">● 고침</span>}</span>
                  <input name={k} defaultValue={o[k] ?? ""} placeholder={MESSAGES[k].text} className="w-full rounded-lg bg-cream px-3 py-1.5 ring-1 ring-black/10" />
                </label>
              ))}
            </div>
          </section>
        ))}
        <div className="sticky bottom-3 flex justify-end gap-2">
          {Object.keys(o).length > 0 && <button formAction={resetMessages} className="rounded-full bg-white px-4 py-2 text-sm ring-1 ring-black/10">모두 기본 문구로</button>}
          <SaveButton className="px-6 py-2" />
        </div>
      </form>
    </div>
  );
}
