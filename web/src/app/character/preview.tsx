"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { animateChar, disposeChar, makeChar, part, type Character, type Mode } from "@/game/character";
import type { Preset } from "@/game/presets";

function addLights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xfff4ea, 0xc3b0e0, 1.3)); // 그림자 쪽 보랏빛
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.2);
  sun.position.set(3, 6, 5);
  scene.add(sun);
}

// 발밑 동그란 그림자 (그림자맵보다 가볍고 부드러움)
function blobShadow() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const x = c.getContext("2d")!, g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(90,58,80,0.35)"); g.addColorStop(1, "rgba(90,58,80,0)");
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.01; m.scale.set(0.9, 0.7, 1);
  return m;
}

/** 크게 돌려보는 미리보기. 드래그로 회전, 손 떼면 천천히 자동 회전 */
export function CharacterPreview({ preset, mode }: { preset: Preset; mode: Mode }) {
  const box = useRef<HTMLDivElement>(null);
  const api = useRef<{ setPreset: (p: Preset) => void; mode: Mode } | null>(null);

  useEffect(() => {
    const el = box.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";

    const scene = new THREE.Scene();
    addLights(scene);
    const ground = part(new THREE.CylinderGeometry(0.9, 0.95, 0.08, 40), "#c6e5a9", 0.02);
    ground.position.y = -0.04; scene.add(ground, blobShadow());

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 1.4, 6);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.7, 0);
    Object.assign(controls, { enableZoom: false, enablePan: false, enableDamping: true, autoRotate: true, autoRotateSpeed: 1.2, minPolarAngle: 1.05, maxPolarAngle: 1.6 });
    controls.update();

    let char: Character | null = null;
    const state = {
      mode: "idle" as Mode,
      setPreset(p: Preset) {
        if (char) { scene.remove(char.root); disposeChar(char); }
        char = makeChar(p); scene.add(char.root);
      },
    };
    api.current = state;

    const fit = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h); camera.aspect = w / h;
      camera.fov = w / h < 0.8 ? 38 : 30; // 세로로 긴 화면에선 조금 더 넓게
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(fit); ro.observe(el); fit();

    const clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.05);
      if (char) animateChar(char, clock.elapsedTime, dt, state.mode);
      controls.update();
      renderer.render(scene, camera);
    });
    return () => {
      ro.disconnect(); renderer.setAnimationLoop(null); controls.dispose();
      if (char) disposeChar(char);
      renderer.dispose(); el.removeChild(renderer.domElement);
      api.current = null;
    };
  }, []);

  useEffect(() => { api.current?.setPreset(preset); }, [preset]);
  useEffect(() => { if (api.current) api.current.mode = mode; }, [mode]);

  return <div ref={box} className="absolute inset-0" aria-label={`${preset.name} 캐릭터 미리보기`} role="img" />;
}

/** 카드용 썸네일: 렌더러 하나로 전부 찍고 이미지로 (WebGL 컨텍스트 개수 제한 회피) */
export function renderThumbnails(presets: Preset[], size = 240): Record<string, string> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size * 1.15);
  const scene = new THREE.Scene();
  addLights(scene);
  const camera = new THREE.PerspectiveCamera(26, 1 / 1.15, 0.1, 50);
  camera.position.set(0.9, 1.15, 3.9);
  camera.lookAt(0, 0.82, 0);
  const out: Record<string, string> = {};
  for (const p of presets) {
    const c = makeChar(p);
    c.root.rotation.y = 0.12;
    scene.add(c.root);
    renderer.render(scene, camera);
    out[p.id] = renderer.domElement.toDataURL("image/png");
    scene.remove(c.root); disposeChar(c);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
