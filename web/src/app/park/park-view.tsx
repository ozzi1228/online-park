"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as THREE from "three";
import { CATCH_HIGH, CatchPetal } from "@/game/catch-petal";
import { animateChar, makeChar, type Mode } from "@/game/character";
import { Input, type Tap } from "@/game/controls";
import { createMinimap } from "@/game/minimap";
import { Multiplayer, type NetStatus } from "@/game/multiplayer";
import { COLLIDERS, SPAWN, canSit, groundY, move } from "@/game/park-map";
import { PRESETS } from "@/game/presets";
import { QUALITY_HIGH, QUALITY_LOW, buildWorld, makePetalGeometry } from "@/game/world";

const COARSE = "(pointer: coarse)";
const isCoarse = () => matchMedia(COARSE).matches;
const subscribeCoarse = (cb: () => void) => { const m = matchMedia(COARSE); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };

const WALK = 3.0, TURN_RATE = 12;             // m/s, 캐릭터가 이동 방향으로 도는 빠르기
const CAM_DIST = 5.4, CAM_H = 2.3, DRAG_YAW = 0.006, DRAG_PITCH = 0.004;
const LOOK_YAW = 1.6, LOOK_PITCH = 0.9;       // 앉아서 방향키로 둘러보는 빠르기 (rad/s)
const WISH_SEC = 3.2;

/** 행동 로그 (실패해도 게임은 계속) */
const logClient = (type: string, data: Record<string, unknown> = {}) =>
  fetch("/api/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, data }), keepalive: true }).catch(() => {});

/** 캐릭터 → 카메라 사이에 굵은 나무줄기·분수 등이 있으면 그 앞까지 카메라를 당김 (가려지지 않게) */
function cameraRoom(x: number, z: number, dx: number, dz: number, max: number) {
  let best = max;
  for (const c of COLLIDERS) {
    if (c.t !== "c" || c.r < 0.4) continue;            // 가는 가로등·난간은 무시
    const ox = x - c.x, oz = z - c.z, r = c.r + 0.35;
    const bq = ox * dx + oz * dz, cq = ox * ox + oz * oz - r * r, disc = bq * bq - cq;
    if (disc < 0) continue;
    const hit = -bq - Math.sqrt(disc);
    if (hit > 0.3 && hit < best) best = hit;
  }
  return Math.max(best, 1.6);
}

type MenuItem = { label: string; run?: () => void };
type Menu = { x: number; y: number; items: MenuItem[] };
type Actions = { sit: () => void; stand: () => void; wish: () => void; release: () => void };

export function ParkView({ presetId, nickname }: { presetId: string; nickname: string }) {
  const box = useRef<HTMLDivElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);
  const input = useRef<Input | null>(null);
  const actions = useRef<Actions | null>(null);
  const touch = useSyncExternalStore(subscribeCoarse, isCoarse, () => false);
  const [hint, setHint] = useState(true);
  const [net, setNet] = useState<NetStatus | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [caught, setCaught] = useState(false);
  const [sitting, setSitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // 잠깐 뜨는 안내 문구 (setState·ref만 써서 항상 같은 함수)
  const sayRef = useRef((msg: string) => { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 2200); });

  useEffect(() => {
    const el = box.current!;
    const coarse = isCoarse();
    const q = coarse ? QUALITY_LOW : QUALITY_HIGH;

    const renderer = new THREE.WebGLRenderer({ antialias: !coarse });
    renderer.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.touchAction = "none";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // ?hour=19 처럼 주면 그 시각 하늘로 고정 (확인용)
    const hourParam = Number(new URLSearchParams(location.search).get("hour"));
    const world = buildWorld(scene, q, Number.isFinite(hourParam) && location.search.includes("hour=") ? hourParam % 24 : undefined);
    const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
    const me = makeChar(preset);
    me.root.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
    scene.add(me.root);
    const petal = new CatchPetal(makePetalGeometry());
    scene.add(petal.group);

    const pos = { x: SPAWN.x, z: SPAWN.z };
    let yaw = SPAWN.yaw, camYaw = SPAWN.yaw, pitch = 0, footY = 0; // yaw = 캐릭터가 보는 쪽, camYaw = 카메라가 보는 쪽
    // 상태: 앉음 / 소원 비는 중 / 꽃잎 들고 있음
    const st = { sitting: false, wishUntil: 0, holding: false, anim: "idle" as "idle" | "sit" | "wish", now: 0, faceCam: false };
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
    const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), focus = new THREE.Vector3();
    const placeCamera = (k: number) => {
      const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
      const dist = cameraRoom(pos.x, pos.z, -fx, -fz, CAM_DIST);
      const want = new THREE.Vector3(pos.x - fx * dist, footY + CAM_H * (0.6 + 0.4 * dist / CAM_DIST) + pitch * 1.6, pos.z - fz * dist);
      const look = new THREE.Vector3(pos.x + fx * 2, footY + 1.9 - pitch * 2.2, pos.z + fz * 2); // 살짝 올려다봐서 꽃이 더 보이게
      camPos.lerp(want, k); camLook.lerp(look, k);
      camera.position.copy(camPos); camera.lookAt(camLook);
    };
    placeCamera(1);

    const inp = new Input(renderer.domElement, coarse); input.current = inp;
    const screen = new THREE.Vector3();
    const drawMini = createMinimap(mini.current!);
    const mp = new Multiplayer(scene);
    mp.onStatus = setNet;
    mp.connect();
    let synced = false;

    // ---------- 행동 ----------
    const stand = () => {
      if (!st.sitting) return;
      st.sitting = false; setSitting(false); inp.setSteer(true);
      logClient("sit.end", { x: Math.round(pos.x), z: Math.round(pos.z) });
    };
    actions.current = {
      sit: () => {
        setMenu(null);
        if (!canSit(pos.x, pos.z)) { sayRef.current("여기선 앉을 수 없어요. 잔디밭이나 정자로 가 볼까요?"); return; }
        st.sitting = true; st.wishUntil = 0; setSitting(true); inp.setSteer(false);
        camYaw = yaw;
        logClient("sit.start", { x: Math.round(pos.x), z: Math.round(pos.z), onPavilion: groundY(pos.x, pos.z) > 0 });
      },
      stand: () => { setMenu(null); stand(); },
      wish: () => {
        if (!st.holding) return;
        st.holding = false; setCaught(false);
        st.wishUntil = st.now + WISH_SEC; st.faceCam = true; // 카메라가 정면으로 돌아와 손 모은 모습을 보여줌
        logClient("wish.made", {});
        setTimeout(() => sayRef.current("소원을 빌었어요 🌸"), WISH_SEC * 1000);
      },
      release: () => { st.holding = false; setCaught(false); logClient("petal.released", {}); },
    };
    // 소원꽃잎 자격·간격은 서버가 정함 (하루 선착순·1인당 횟수). 5분마다 다시 확인
    const refreshWish = async () => {
      try {
        const r = await fetch("/api/petal", { cache: "no-store" });
        if (!r.ok) return;
        const w = await r.json() as { eligible: boolean; minIntervalSec: number; maxIntervalSec: number };
        petal.setSchedule(st.now, w.eligible, w.minIntervalSec, w.maxIntervalSec);
      } catch { /* 다음 확인 때 다시 */ }
    };
    refreshWish();
    const wishTimer = setInterval(refreshWish, 5 * 60_000);
    const claim = async (height: number) => {
      const r = await fetch("/api/petal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ height }) })
        .then((x) => x.json() as Promise<{ ok: boolean; reason?: string; myCount?: number }>).catch(() => null);
      if (r?.ok) { st.holding = true; setCaught(true); }
      else sayRef.current(r?.reason === "soldout" ? "아쉽게도 오늘의 소원꽃잎이 모두 떨어졌어요" : r?.reason === "limit" ? "오늘은 소원을 충분히 빌었어요" : "잠시 후 다시 해볼까요?");
      refreshWish(); // 두 번 다 잡았거나 다 떨어졌으면 더는 안 보이게
    };

    const openMenu = (tap: Tap) => {
      const items: MenuItem[] = st.sitting ? [{ label: "일어나기", run: () => actions.current!.stand() }]
        : canSit(pos.x, pos.z) ? [{ label: "여기 앉기", run: () => actions.current!.sit() }]
        : [{ label: "여기선 앉을 수 없어요" }];
      setMenu({ x: tap.x, y: tap.y, items });
    };
    const handleTap = (tap: Tap, rect: DOMRect) => {
      if (tap.menu) { openMenu(tap); return; }
      if (petal.hit(camera, rect, tap.x, tap.y)) {
        const y = petal.group.position.y;
        if (petal.catchable && !st.holding) {
          petal.end(st.now); setMenu(null);
          claim(y); // 서버가 확인한 뒤에 "잡았어요" (로그도 서버에서)
        } else {
          sayRef.current(y > CATCH_HIGH ? "조금만 더 기다렸다가!" : "아쉽게 놓쳤어요");
          logClient("petal.missed", { height: Math.round(y * 100) / 100 });
        }
        return;
      }
      // 내 캐릭터를 누르면 메뉴
      screen.set(pos.x, footY + 0.8, pos.z).project(camera);
      const sx = rect.left + (screen.x + 1) / 2 * rect.width, sy = rect.top + (1 - screen.y) / 2 * rect.height;
      if (Math.hypot(sx - tap.x, sy - tap.y) < 60) { openMenu(tap); return; }
      setMenu(null);
    };

    const fit = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h); camera.aspect = w / h;
      camera.fov = w / h < 0.8 ? 72 : 60; camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(fit); ro.observe(el); fit();

    // 개발 중 확인용 (운영 빌드엔 없음)
    if (process.env.NODE_ENV === "development") Object.assign(window, { __park: { renderer, scene, camera, pos, petal, face: (y: number) => { yaw = camYaw = y; } } });

    const clock = new THREE.Clock();
    let moved = false;
    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
      st.now = t;
      const rect = renderer.domElement.getBoundingClientRect();
      for (const tap of inp.takeTaps()) handleTap(tap, rect);

      if (inp.touch) { // 화면에서 캐릭터(허리 높이) → 손가락 방향으로 걸어감
        screen.set(pos.x, footY + 0.9, pos.z).project(camera);
        const dx = inp.touch.x - (rect.left + (screen.x + 1) / 2 * rect.width), dy = inp.touch.y - (rect.top + (1 - screen.y) / 2 * rect.height);
        const dead = (v: number, d: number, full: number) => Math.abs(v) < d ? 0 : Math.max(-1, Math.min(1, (v - Math.sign(v) * d) / full));
        inp.setJoy(dead(dx, 20, 70), dead(dy, 20, 70));
      }
      const { forward, right } = inp.axes(), drag = inp.takeDrag();
      camYaw -= drag.x * DRAG_YAW;
      if (st.faceCam) { // 소원 빌 땐 캐릭터 얼굴 쪽으로 카메라를 천천히 돌림 (직접 돌리거나 걸으면 해제)
        const front = yaw + Math.PI;
        camYaw += Math.atan2(Math.sin(front - camYaw), Math.cos(front - camYaw)) * (1 - Math.exp(-dt * 3));
        pitch += (0.15 - pitch) * (1 - Math.exp(-dt * 3));
        if (drag.x !== 0 || t > st.wishUntil + 1.5) st.faceCam = false;
      }
      let walking = false;
      if (st.sitting) {
        // 앉아 있을 땐 방향키 = 카메라를 돌려 앉은 캐릭터와 풍경을 둘러보기
        camYaw -= right * LOOK_YAW * dt;
        pitch = THREE.MathUtils.clamp(pitch + drag.y * DRAG_PITCH - forward * LOOK_PITCH * dt, -0.7, 0.45);
      } else {
        pitch = THREE.MathUtils.clamp(pitch + drag.y * DRAG_PITCH, -0.35, 0.45);
        // 카메라 기준 앞/오른쪽으로 이동 방향을 만들고, 캐릭터는 그쪽으로 돌아서 걸음
        const amount = Math.min(1, Math.hypot(forward, right));
        walking = amount > 0.05;
        if (walking) {
          st.wishUntil = 0; st.faceCam = false; // 걸으면 소원 동작은 멈춤
          const cf = { x: Math.sin(camYaw), z: Math.cos(camYaw) }, cr = { x: -Math.cos(camYaw), z: Math.sin(camYaw) };
          const dx = cf.x * forward + cr.x * right, dz = cf.z * forward + cr.z * right, len = Math.hypot(dx, dz);
          const want = Math.atan2(dx, dz);
          yaw += Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw)) * (1 - Math.exp(-dt * TURN_RATE));
          const step = WALK * amount * dt;
          // 다른 사람 자리도 장애물 (서버도 같은 규칙으로 다시 판정)
          const np = move(pos.x, pos.z, pos.x + (dx / len) * step, pos.z + (dz / len) * step, undefined, [...COLLIDERS, ...mp.colliders()]);
          pos.x = np.x; pos.z = np.z;
          if (!moved) { moved = true; setHint(false); }
        }
      }
      // 서버 판정과 1m 넘게 어긋나면(처음 입장 위치 포함) 서버 쪽으로 맞춤
      const srv = mp.mine();
      if (srv && (!synced || Math.hypot(srv.x - pos.x, srv.z - pos.z) > 1)) { pos.x = srv.x; pos.z = srv.z; if (!synced) yaw = camYaw = srv.yaw; synced = true; }

      const mode: Mode = st.sitting ? "sit" : t < st.wishUntil ? "wish" : walking ? "walk" : "idle";
      const anim = mode === "sit" ? "sit" : mode === "wish" ? "wish" : "idle";
      if (anim !== st.anim) { st.anim = anim; mp.sendAnim(anim); }
      mp.update(t, dt, { x: pos.x, z: pos.z, yaw, walking });

      footY += (groundY(pos.x, pos.z) - footY) * (1 - Math.exp(-dt * 14)); // 정자 마루에 올라서면 살짝 올라감
      me.root.position.set(pos.x, footY, pos.z); me.root.rotation.y = yaw;
      animateChar(me, t, dt, mode);

      petal.update(t, dt, { x: pos.x, z: pos.z, yaw }, st.holding || t < st.wishUntil);
      focus.set(pos.x, 0, pos.z);
      world.update(t, dt, focus, walking, yaw);
      placeCamera(1 - Math.exp(-dt * 8));
      drawMini(pos.x, pos.z, yaw);
      renderer.render(scene, camera);
    });

    return () => {
      clearInterval(wishTimer);
      ro.disconnect(); renderer.setAnimationLoop(null); inp.dispose(); input.current = null; actions.current = null; mp.dispose();
      scene.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
      renderer.dispose(); el.removeChild(renderer.domElement);
    };
  }, [presetId]);

  const pill = "rounded-full bg-cream/90 px-4 py-2 shadow-md";
  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-sky">
      <div ref={box} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 text-sm">
        <p className="rounded-full bg-cream/85 px-3 py-1">{nickname}</p>
        {net && (
          <p className="flex items-center gap-1.5 rounded-full bg-cream/85 px-3 py-1">
            <span className={`size-2 rounded-full ${net.online ? "bg-emerald-400" : "bg-stone-400"}`} />
            {net.online ? `${net.count}명 산책 중` : "혼자 산책 중"}
          </p>
        )}
      </div>
      {hint && !sitting && (
        <p className="pointer-events-none absolute inset-x-4 top-16 mx-auto w-fit rounded-full bg-cream/85 px-4 py-1.5 text-center text-sm">
          {touch ? "가고 싶은 쪽을 누르고 있으면 걸어가요 · 내 캐릭터를 톡 누르면 메뉴" : "방향키(또는 WASD)로 걷고, 마우스로 끌어서 둘러봐요 · 우클릭하면 메뉴"}
        </p>
      )}
      {toast && <p role="status" className="pointer-events-none absolute inset-x-4 top-28 mx-auto w-fit rounded-full bg-ink/80 px-4 py-1.5 text-sm text-white">{toast}</p>}

      {menu && (
        <ul role="menu" className="absolute z-10 min-w-36 overflow-hidden rounded-2xl bg-cream text-sm shadow-lg ring-1 ring-sakura/30"
          style={{ left: Math.min(menu.x, (typeof window !== "undefined" ? innerWidth : 400) - 160), top: Math.max(menu.y - 12, 8) }}>
          {menu.items.map((it) => (
            <li key={it.label}>
              <button role="menuitem" disabled={!it.run} onClick={() => { it.run?.(); setMenu(null); }}
                className="block w-full px-4 py-2.5 text-left hover:bg-sakura/20 disabled:opacity-50">{it.label}</button>
            </li>
          ))}
        </ul>
      )}

      {caught && (
        <div className="absolute inset-x-4 bottom-24 mx-auto flex w-fit flex-col items-center gap-3 rounded-3xl bg-cream/95 px-6 py-4 shadow-lg">
          <p>🌸 벚꽃잎을 잡았어요!</p>
          <div className="flex gap-2">
            <button onClick={() => actions.current?.wish()} className="rounded-full bg-sakura px-5 py-2 text-white shadow-[0_3px_0_var(--color-sakura-deep)]">소원 빌기</button>
            <button onClick={() => actions.current?.release()} className="rounded-full bg-white px-5 py-2 ring-1 ring-sakura/40">놓아주기</button>
          </div>
        </div>
      )}

      {sitting && (
        <div className="absolute inset-x-4 bottom-24 mx-auto flex w-fit items-center gap-3">
          <p className={`${pill} pointer-events-none text-sm`}>{touch ? "화면을 끌어서 둘러봐요" : "방향키로 둘러봐요"}</p>
          <button onClick={() => actions.current?.stand()} className="rounded-full bg-sakura px-5 py-2 text-white shadow-[0_3px_0_var(--color-sakura-deep)]">일어나기</button>
        </div>
      )}

      <canvas ref={mini} aria-label="미니맵"
        className="pointer-events-none absolute bottom-4 right-4 h-[72px] w-[220px] rounded-xl shadow-md ring-2 ring-cream max-sm:h-[54px] max-sm:w-[164px]" />
    </div>
  );
}
