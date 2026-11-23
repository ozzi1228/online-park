// 시간 미리보기: 날짜·시각을 골라 그때의 공원(하늘색·구름·해·가로등)을 새 탭에서 봄. 서비스엔 영향 없음
const PRESETS: [string, string][] = [["새벽", "05:00"], ["해 뜰 녘", "06:30"], ["아침", "09:00"], ["한낮", "13:00"], ["노을", "18:40"], ["밤", "21:00"], ["한밤", "00:30"]];

export default function PreviewPage() {
  const btn = "rounded-full bg-white px-4 py-2 text-sm ring-1 ring-black/10 hover:bg-sakura/10";
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl">시간 미리보기</h1>
        <p className="mt-1 text-sm opacity-60">날짜와 시각을 골라 그때 공원이 어떻게 보이는지 새 탭에서 확인해요. 내 화면에서만 바뀌고 다른 사람에겐 영향이 없어요.
          날짜에 따라 그날의 구름 양·바람 방향도 달라져요.</p>
      </div>
      <form action="/park" method="get" target="_blank" className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/5">
        <label className="flex flex-col gap-1 text-sm">날짜
          <input type="date" name="date" className="rounded-lg bg-cream px-3 py-2 ring-1 ring-black/10" />
        </label>
        <label className="flex flex-col gap-1 text-sm">시각
          <input type="time" name="time" required defaultValue="13:00" className="rounded-lg bg-cream px-3 py-2 ring-1 ring-black/10" />
        </label>
        <button className="rounded-full bg-sakura px-5 py-2 text-sm text-white shadow-[0_3px_0_var(--color-sakura-deep)]">새 탭에서 보기</button>
        <span className="w-full text-xs opacity-50">날짜를 비우면 오늘 날씨로 봐요</span>
      </form>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold">바로 보기</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(([label, time]) => (
            <a key={label} href={`/park?time=${time}`} target="_blank" rel="noopener" className={btn}>{label} <span className="opacity-50">{time}</span></a>
          ))}
        </div>
      </div>
    </div>
  );
}
