"use client";

import { useRef } from "react";

/** 체크한 쪽지 일괄 삭제 (전체 선택 + 한 번 더 묻기) */
export function BulkForm({ action, back, children }: { action: (f: FormData) => Promise<void>; back: string; children: React.ReactNode }) {
  const form = useRef<HTMLFormElement>(null);
  const boxes = () => [...(form.current?.querySelectorAll<HTMLInputElement>('input[name="ids"]') ?? [])];
  return (
    <form ref={form} action={action} className="flex flex-col gap-3"
      onSubmit={(e) => {
        const n = boxes().filter((b) => b.checked).length;
        if (!n || !confirm(`쪽지 ${n}장을 삭제할까요?\n소원나무 쪽지는 단 사람에게 노트를 1장씩 돌려줘요. 되돌릴 수 없어요.`)) e.preventDefault();
      }}>
      <input type="hidden" name="back" value={back} />
      <div className="sticky top-14 z-[5] flex items-center gap-3 rounded-2xl bg-white/95 px-4 py-2 text-sm ring-1 ring-black/5 backdrop-blur">
        <label className="flex items-center gap-1.5"><input type="checkbox" onChange={(e) => boxes().forEach((b) => (b.checked = e.target.checked))} /> 전체 선택</label>
        <button className="ml-auto rounded-full px-4 py-1.5 text-red-600 ring-1 ring-red-200 hover:bg-red-50">선택한 쪽지 삭제</button>
      </div>
      {children}
    </form>
  );
}
