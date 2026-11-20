import { connection } from "next/server";
import Link from "next/link";
import { desc, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { kst } from "@/lib/format";
import { PRESETS } from "@/game/presets";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export const instant = false; // 관리자 화면은 항상 요청 때 최신 데이터로

export default async function Users({ searchParams }: PageProps<"/admin/users">) {
  await connection();
  const q = one((await searchParams).q).trim().replace(/[%_]/g, "");
  const rows = await db.select().from(user)
    .where(q ? or(ilike(user.id, `%${q}%`), ilike(user.nickname, `%${q}%`), ilike(user.email, `%${q}%`), ilike(user.name, `%${q}%`)) : undefined)
    .orderBy(desc(user.createdAt)).limit(50);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl">유저</h1>
      <form className="flex gap-2 text-sm">
        <input name="q" defaultValue={q} placeholder="ID · 닉네임 · 이메일 · 이름" aria-label="유저 검색" className="flex-1 rounded-lg bg-white px-3 py-2 ring-1 ring-black/10" />
        <button className="rounded-full bg-sakura px-5 text-white">검색</button>
      </form>
      <ul className="flex flex-col gap-2">
        {rows.map((u) => (
          <li key={u.id}>
            <Link href={`/admin/users/${u.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-white px-4 py-3 text-sm ring-1 ring-black/5 hover:ring-sakura/50">
              <span className="font-bold">{u.nickname ?? "(캐릭터 미정)"}</span>
              <span className={`rounded px-1.5 text-[11px] ${u.isAnonymous ? "bg-black/5" : "bg-sakura/20"}`}>{u.isAnonymous ? "비회원" : "회원"}</span>
              <span className="opacity-60">{PRESETS.find((p) => p.id === u.characterPreset)?.name ?? ""}</span>
              <span className="ml-auto font-mono text-xs opacity-50">{u.id}</span>
              <span className="w-full text-xs opacity-50 md:w-auto">가입 {kst(u.createdAt)}</span>
            </Link>
          </li>
        ))}
        {rows.length === 0 && <li className="p-6 text-center text-sm opacity-60">찾는 유저가 없어요</li>}
      </ul>
    </div>
  );
}
