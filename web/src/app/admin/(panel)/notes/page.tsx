import { connection } from "next/server";
import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { notes, user } from "@/db/schema";
import { NoteView } from "@/app/park/note";
import type { Strokes } from "@/lib/notes-shared";
import { kst } from "@/lib/format";
import { deleteNotes } from "./actions";
import { BulkForm } from "./bulk-form";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const TABS = [["", "전체"], ["tree", "소원나무"], ["given", "주고받은 쪽지"]] as const;

export const instant = false; // 관리자 화면은 항상 요청 때 최신 데이터로

export default async function Notes({ searchParams }: PageProps<"/admin/notes">) {
  await connection();
  const sp = await searchParams, kind = one(sp.kind) === "tree" || one(sp.kind) === "given" ? one(sp.kind) : "";
  const deleted = one(sp.deleted), refunded = one(sp.refunded);
  const rows = await db.select().from(notes).where(kind ? eq(notes.kind, kind) : undefined).orderBy(desc(notes.id)).limit(120);
  const rid = [...new Set(rows.map((r) => r.recipientId).filter((x): x is string => !!x))];
  const names = new Map((rid.length ? await db.select({ id: user.id, nickname: user.nickname }).from(user).where(inArray(user.id, rid)) : []).map((u) => [u.id, u.nickname]));
  const back = `/admin/notes${kind ? `?kind=${kind}` : ""}`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl">쪽지</h1>
        <p className="mt-1 text-sm opacity-60">최근 120장. 체크해서 한 번에 지울 수 있어요.</p>
      </div>
      {deleted && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-700">쪽지 {deleted}장을 삭제했어요{Number(refunded) > 0 ? ` · 소원나무 쪽지 ${refunded}장만큼 노트를 돌려줬어요` : ""}</p>}
      <nav className="flex gap-1 text-sm">
        {TABS.map(([k, label]) => (
          <Link key={k} href={k ? `/admin/notes?kind=${k}` : "/admin/notes"} className={`rounded-full px-3 py-1.5 ${k === kind ? "bg-sakura text-white" : "bg-white ring-1 ring-black/10"}`}>{label}</Link>
        ))}
      </nav>
      <BulkForm action={deleteNotes} back={back}>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {rows.map((n) => (
            <li key={n.id}>
              <label className="flex cursor-pointer flex-col gap-1 rounded-2xl bg-white p-2 text-xs ring-1 ring-black/5 has-[:checked]:ring-2 has-[:checked]:ring-red-300">
                <span className="flex items-center gap-1.5">
                  <input type="checkbox" name="ids" value={n.id} />
                  <span className={`rounded px-1.5 ${n.kind === "tree" ? "bg-emerald-50 text-emerald-700" : "bg-sakura/15"}`}>{n.kind === "tree" ? "소원나무" : "쪽지"}</span>
                  {n.covered && <span className="opacity-60">가림</span>}
                  <span className="ml-auto opacity-50">{kst(n.createdAt).slice(5, 16)}</span>
                </span>
                <NoteView strokes={n.strokes as Strokes} className="w-full" />
              </label>
              <p className="mt-1 truncate px-1 text-xs">
                <Link href={`/admin/users/${n.authorId}`} className="hover:underline">{n.authorNickname ?? n.authorId.slice(0, 8)}</Link>
                {n.recipientId && <> → <Link href={`/admin/users/${n.recipientId}`} className="hover:underline">{names.get(n.recipientId) ?? n.recipientId.slice(0, 8)}</Link></>}
              </p>
            </li>
          ))}
          {rows.length === 0 && <li className="col-span-full text-sm opacity-50">쪽지가 없어요</li>}
        </ul>
      </BulkForm>
    </div>
  );
}
