"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as THREE from "three";
import { animateChar, makeChar } from "@/game/character";
import { Input } from "@/game/controls";
import { createMinimap } from "@/game/minimap";
import { SPAWN, move } from "@/game/park-map";
import { PRESETS } from "@/game/presets";
import { QUALITY_HIGH, QUALITY_LOW, buildWorld } from "@/game/world";

const COARSE = "(pointer: coarse)";
const isCoarse = () => matchMedia(COARSE).matches;
const subscribeCoarse = (cb: () => void) => { const m = matchMedia(COARSE); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };

const WALK = 3.0, BACK = 1.6, TURN = 2.1;      // m/s, rad/s
const CAM_DIST = 4.8, CAM_H = 2.2, DRAG_YAW = 0.006, DRAG_PITCH = 0.004;

export function ParkView({ presetId, nickname }: { presetId: string; nickname: string }) {
  const box = useRef<HTMLDivElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);
  const input = useRef<Input | null>(null);
  const touch = useSyncExternalStore(subscribeCoarse, isCoarse, () => false);
  const [hint, setHint] = useState(true);

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
    const world = buildWorld(scene, q);
    const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
    const me = makeChar(preset);
    me.root.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
    scene.add(me.root);

    const pos = { x: SPAWN.x, z: SPAWN.z };
    let yaw = SPAWN.yaw, pitch = 0;
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
    const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), focus = new THREE.Vector3();
    const placeCamera = (k: number) => {
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const want = new THREE.Vector3(pos.x - fx * CAM_DIST, CAM_H + pitch * 1.6, pos.z - fz * CAM_DIST);
      const look = new THREE.Vector3(pos.x + fx * 2, 1.3 - pitch * 2.2, pos.z + fz * 2);
      camPos.lerp(want, k); camLook.lerp(look, k);
      camera.position.copy(camPos); camera.lookAt(camLook);
    };
    placeCamera(1);

    const inp = new Input(renderer.domElement); input.current = inp;
    const drawMini = createMinimap(mini.current!);

    const fit = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h); camera.aspect = w / h;
      camera.fov = w / h < 0.8 ? 68 : 55; camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(fit); ro.observe(el); fit();

    // 개발 중 성능 측정용 (운영 빌드엔 없음)
    if (process.env.NODE_ENV === "development") Object.assign(window, { __park: { renderer, scene, camera, pos, face: (y: number) => { yaw = y; } } });

    const clock = new THREE.Clock();
    let moved = false;
    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
      const { forward, turn } = inp.axes(), drag = inp.takeDrag();
      yaw += turn * TURN * dt - drag.x * DRAG_YAW;
      pitch = THREE.MathUtils.clamp(pitch + drag.y * DRAG_PITCH, -0.35, 0.45);
      const speed = forward > 0 ? WALK * forward : BACK * forward;
      if (Math.abs(forward) > 0.05) {
        const np = move(pos.x, pos.z, pos.x + Math.sin(yaw) * speed * dt, pos.z + Math.cos(yaw) * speed * dt);
        pos.x = np.x; pos.z = np.z;
        if (!moved) { moved = true; setHint(false); }
      }
      me.root.position.set(pos.x, 0, pos.z); me.root.rotation.y = yaw;
      animateChar(me, t, dt, Math.abs(forward) > 0.05 ? "walk" : "idle");
      focus.set(pos.x, 0, pos.z);
      world.update(t, dt, focus);
      placeCamera(1 - Math.exp(-dt * 8));
      drawMini(pos.x, pos.z, yaw);
      renderer.render(scene, camera);
    });

    return () => {
      ro.disconnect(); renderer.setAnimationLoop(null); inp.dispose(); input.current = null;
      scene.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
      renderer.dispose(); el.removeChild(renderer.domElement);
    };
  }, [presetId]);

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-sky">
      <div ref={box} className="absolute inset-0" />
      <p className="pointer-events-none absolute left-4 top-4 rounded-full bg-cream/85 px-3 py-1 text-sm">{nickname}</p>
      {hint && (
        <p className="pointer-events-none absolute inset-x-0 top-16 mx-auto w-fit rounded-full bg-cream/85 px-4 py-1.5 text-sm">
          {touch ? "왼쪽 조이스틱으로 걷고, 화면을 끌어서 둘러봐요" : "방향키(또는 WASD)로 걷고, 마우스로 끌어서 둘러봐요"}
        </p>
      )}
      <canvas ref={mini} aria-label="미니맵"
        className="pointer-events-none absolute bottom-4 right-4 h-[72px] w-[220px] rounded-xl shadow-md ring-2 ring-cream max-sm:h-[54px] max-sm:w-[164px]" />
      {touch && <Joystick onMove={(x, y) => input.current?.setJoy(x, y)} />}
    </div>
  );
}

function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const R = 46;
  const set = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    let x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    const l = Math.hypot(x, y); if (l > R) { x *= R / l; y *= R / l; }
    setKnob({ x, y });
    onMove(x / R, y / R);
  };
  const reset = () => { setKnob({ x: 0, y: 0 }); onMove(0, 0); };
  return (
    <div role="application" aria-label="이동 조이스틱"
      className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-6 size-32 touch-none rounded-full bg-cream/40 ring-2 ring-cream/80"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); set(e); }}
      onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") set(e); }}
      onPointerUp={reset} onPointerCancel={reset}>
      <div className="absolute left-1/2 top-1/2 size-14 rounded-full bg-cream shadow-md"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
    </div>
  );
}
