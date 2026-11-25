import { connection } from "next/server";
import Link from "next/link";
import { MESSAGES, fillMsg, type MsgKey, type MsgVars } from "@/content/messages";
import { getMessageOverrides } from "@/lib/content";
import { getSettings } from "@/lib/settings";
import { CAT_COATS } from "@/game/cat-brain";
import { SaveButton } from "../../save-button";
import { saveItemTexts } from "./actions";
import { CatPictures, CharacterPictures, ItemPicture, MatPictures } from "./pictures";

export const instant = false; // 관리자 화면은 항상 요청 때 최신 데이터로

/** 게임 요소 한눈에: 매점 물품(그림·가격·이름·설명 고치기), 캐릭터 디자인, 고양이 */
export default async function Items({ searchParams }: PageProps<"/admin/items">) {
  await connection();
  const [{ shop }, o, q] = await Promise.all([getSettings(), getMessageOverrides(), searchParams]);
  const text = (k: MsgKey) => o[k] ?? "";
  const goods: { id: "notebook" | "churu" | "rod" | "mat"; price: number; unit: string; vars: MsgVars }[] = [
    { id: "notebook" as const, price: shop.notebookPrice, unit: `${shop.notebookSheets}장 한 권`, vars: { n: shop.notebookSheets } },
    { id: "churu" as const, price: shop.churuPrice, unit: `${shop.churuPack}개 한 묶음`, vars: { n: shop.churuPack } },
    { id: "rod" as const, price: shop.rodPrice, unit: `${shop.rodUses}번 놀면 부러짐`, vars: { n: shop.rodUses } },
    { id: "mat" as const, price: shop.matPrice, unit: "색마다 한 장", vars: { color: "분홍" } },
  ];
  const box = "rounded-2xl bg-white p-4 ring-1 ring-black/5";
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl">게임 요소</h1>
        <p className="mt-1 text-sm opacity-60">게임 안 물품·캐릭터·고양이를 그림과 함께 보는 곳이에요. 가격·개수는 <Link href="/admin/settings" className="underline">운영 설정</Link>에서 바꿔요.</p>
      </div>
      {q.saved && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-700">저장했어요 ✓</p>}

      <form action={saveItemTexts} className={box}>
        <h2 className="mb-1 font-bold">매점 물품</h2>
        <p className="mb-3 text-xs opacity-60">이름·설명은 매점에 그대로 보여요. 비우면 회색 기본 문구. {"{n}"}·{"{color}"} 자리는 개수·색으로 채워져요.</p>
        <ul className="flex flex-col gap-3">
          {goods.map((g) => {
            const nk = `item.${g.id}.name` as MsgKey, dk = `item.${g.id}.desc` as MsgKey;
            return (
              <li key={g.id} className="grid gap-3 rounded-xl bg-cream/60 p-3 md:grid-cols-[8rem_1fr]">
                <div className="flex flex-col items-center gap-1">
                  {g.id === "mat" ? <MatPictures /> : <ItemPicture kind={g.id} className="h-16 w-24 rounded-lg bg-white ring-1 ring-black/10" />}
                  <span className="text-sm font-bold tabular-nums">{g.price.toLocaleString("ko-KR")}그린</span>
                  <span className="text-xs opacity-60">{g.unit}</span>
                </div>
                <div className="flex flex-col gap-2 text-sm">
                  <label className="flex flex-col gap-1"><span className="text-xs opacity-60">이름</span>
                    <input name={nk} defaultValue={text(nk)} placeholder={MESSAGES[nk].text} className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-black/10" /></label>
                  <label className="flex flex-col gap-1"><span className="text-xs opacity-60">{MESSAGES[dk].label}</span>
                    <textarea name={dk} defaultValue={text(dk)} placeholder={MESSAGES[dk].text} rows={2} className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-black/10" /></label>
                  <p className="text-xs opacity-60">매점에선 이렇게 보여요: <b>{fillMsg(o[nk] || MESSAGES[nk].text)}</b> · {fillMsg(o[dk] || MESSAGES[dk].text, g.vars)}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex justify-end"><SaveButton className="px-6 py-2" /></div>
      </form>

      <section className={box}>
        <h2 className="mb-1 font-bold">캐릭터 디자인 <span className="text-sm font-normal opacity-60">처음 들어올 때 고르는 캐릭터</span></h2>
        <CharacterPictures />
      </section>

      <section className={box}>
        <h2 className="mb-1 font-bold">고양이 <span className="text-sm font-normal opacity-60">무늬마다 한 마리 · 공원에 나오는 수는 운영 설정 → 고양이</span></h2>
        <CatPictures names={CAT_COATS} />
        <p className="mt-2 text-xs opacity-60">사람들과의 호감도는 <Link href="/admin/cats" className="underline">고양이</Link> 메뉴에서 봐요.</p>
      </section>
    </div>
  );
}
