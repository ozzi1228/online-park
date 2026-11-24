"use client";

import { deleteUser } from "./actions";

/** 유저 삭제 (한 번 더 묻고 지움) */
export function DeleteUserButton({ id, name }: { id: string; name: string }) {
  return (
    <form action={deleteUser} onSubmit={(e) => { if (!confirm(`${name} 유저를 삭제할까요?\n계정과 그린·쪽지(소원나무 포함)·주문·문의·기록이 모두 지워지고 되돌릴 수 없어요.`)) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <button className="rounded-full px-4 py-1.5 text-sm text-red-600 ring-1 ring-red-200 hover:bg-red-50">유저 삭제</button>
    </form>
  );
}
