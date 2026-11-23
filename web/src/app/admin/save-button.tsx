"use client";
// 관리자 폼 저장 버튼: 바뀐 칸이 있을 때만 진하게 눌리고, 없으면 흐리게 잠김. 저장하는 동안엔 "저장 중…"
// 바뀜 여부는 각 칸의 현재 값과 처음 값(defaultValue)을 비교 → 저장 후 화면이 새 값으로 다시 그려지면 자동으로 다시 흐려짐
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

const changed = (el: Element) => {
  if (el instanceof HTMLSelectElement) return [...el.options].some((o) => o.selected !== o.defaultSelected);
  if (el instanceof HTMLTextAreaElement) return el.value !== el.defaultValue;
  if (el instanceof HTMLInputElement) {
    if (el.type === "hidden" || el.type === "submit" || el.type === "button") return false;
    if (el.type === "checkbox" || el.type === "radio") return el.checked !== el.defaultChecked;
    return el.value !== el.defaultValue;
  }
  return false;
};

export function SaveButton({ className = "px-5 py-2" }: { className?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [dirty, setDirty] = useState(false);
  const { pending } = useFormStatus();

  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const check = () => setDirty([...form.elements].some(changed));
    form.addEventListener("input", check); form.addEventListener("change", check); form.addEventListener("reset", check);
    Promise.resolve().then(check); // 저장 뒤 새 값으로 다시 그려졌을 때도 다시 확인
    return () => { form.removeEventListener("input", check); form.removeEventListener("change", check); form.removeEventListener("reset", check); };
  });

  const on = dirty && !pending;
  return (
    <button ref={ref} disabled={!on} aria-disabled={!on}
      className={`rounded-full text-sm text-white transition ${className} ${on
        ? "bg-sakura shadow-[0_3px_0_var(--color-sakura-deep)] hover:brightness-105 active:translate-y-px active:shadow-none"
        : "cursor-default bg-sakura/25 text-white/90"}`}>
      {pending ? "저장 중…" : "저장"}
    </button>
  );
}
