// 분수 광장 분수: 2단 돌 분수 + 맑은 청록 물(잔물결·하늘 반사·윤슬) + 바닥에 일렁이는 빛무늬와 동전들
// + 그릇 가장자리에서 흘러내리는 물막 + 꼭대기 물줄기 물보라. 크기는 group(PROP_S배) 안의 로컬 단위.
import * as THREE from "three";
import { part, toonGradient } from "./character";
import type { SkyUniforms } from "./water";

const STONE = "#ece2d2", STONE_DARK = "#d9ccb8";
const R_OUT = 3.1, R_IN = 2.82, WATER_Y = 0.48, FLOOR_Y = 0.16;
const LOWER = { y: 1.0, r: 1.3 }, UPPER = { y: 1.9, r: 0.66 };

/** (반지름, 높이) 단면을 돌려서 만든 돌 모양 */
const lathe = (pts: [number, number][], seg = 48) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

const NOISE = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}`;

const VERT = /* glsl */ `
varying vec3 vWorld; varying vec2 vLocal;
void main() {
  vLocal = position.xz;
  vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

// 물 밑바닥: 연한 타일 + 물결 따라 일렁이는 빛무늬(코스틱)
const FLOOR_FRAG = /* glsl */ `
uniform float time; uniform vec3 fogColor; uniform float fogNear, fogFar;
varying vec3 vWorld; varying vec2 vLocal;
${NOISE}
void main() {
  vec2 p = vLocal;
  vec2 g = abs(fract(p * 2.2) - 0.5);
  float grout = smoothstep(0.47, 0.5, max(g.x, g.y));
  vec3 tile = mix(vec3(0.80, 0.92, 0.93), vec3(0.70, 0.84, 0.86), grout);
  float n1 = noise(p * 3.2 + vec2(time * 0.5, time * 0.3)), n2 = noise(p * 3.6 - vec2(time * 0.35, -time * 0.45) + 4.0);
  float caustic = pow(1.0 - abs(n1 - n2) * 2.2, 6.0);
  vec3 col = tile * vec3(0.50, 0.80, 0.86) + vec3(0.95, 1.0, 0.92) * caustic * 0.28;
  col = mix(col, fogColor, smoothstep(fogNear, fogFar, length(cameraPosition - vWorld)));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// 물 표면: 반투명(바닥·동전이 비침) + 잔물결 + 물막 떨어지는 곳 물결·거품 + 하늘 반사 + 윤슬
const WATER_FRAG = /* glsl */ `
uniform float time, night, ringR;
uniform vec3 glintDir, sunColor, zenith, horizon, fogColor;
uniform float fogNear, fogFar;
varying vec3 vWorld; varying vec2 vLocal;
${NOISE}
float height(vec2 p) {
  float r = length(p), h = 0.0;
  h += (noise(p * 2.4 + time * 0.25) - 0.5) * 0.03;
  h += (noise(p * 6.0 - time * 0.5) - 0.5) * 0.012;
  h += sin((r - ringR) * 16.0 - time * 7.0) * 0.012 * exp(-abs(r - ringR) * 2.2); // 물막이 떨어지는 둘레에서 퍼지는 물결
  return h;
}
void main() {
  vec2 p = vLocal; float r = length(p);
  vec3 toCam = cameraPosition - vWorld; float dist = length(toCam); vec3 V = toCam / dist;
  float e = 0.03, h0 = height(p);
  vec3 N = normalize(vec3(-(height(p + vec2(e, 0.0)) - h0) / e, 1.0, -(height(p + vec2(0.0, e)) - h0) / e));
  vec3 R = reflect(-V, N);
  float fres = clamp(0.08 + pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.9, 0.0, 0.9);
  vec3 tint = vec3(0.22, 0.66, 0.72);
  vec3 sky = mix(horizon, zenith, smoothstep(0.0, 0.6, R.y));
  vec3 col = mix(tint, sky, fres);
  float a = mix(0.38, 0.88, fres);
  // 물막이 떨어지는 자리의 하얀 거품
  float foam = smoothstep(0.32, 0.0, abs(r - ringR)) * (0.5 + 0.5 * noise(p * 9.0 + time * 3.0));
  col = mix(col, vec3(1.0), foam * 0.7); a = max(a, foam * 0.85);
  float s = max(dot(R, glintDir), 0.0);
  float glint = smoothstep(0.986, 0.997, s) * (1.0 - night * 0.8);
  col += sunColor * glint * 1.4; a = max(a, glint);
  col = mix(col, fogColor, smoothstep(fogNear, fogFar, dist));
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

// 흘러내리는 물막: 아래로 흐르는 줄무늬
const SHEET_FRAG = /* glsl */ `
uniform float time;
varying vec3 vWorld; varying vec2 vUv2;
${NOISE}
void main() {
  float streak = noise(vec2(vUv2.x * 60.0, vUv2.y * 3.0 + time * 4.0));
  float a = (0.18 + streak * 0.42) * smoothstep(0.0, 0.12, vUv2.y) * smoothstep(1.0, 0.85, vUv2.y);
  gl_FragColor = vec4(mix(vec3(0.82, 0.95, 1.0), vec3(1.0), streak), a);
  #include <colorspace_fragment>
}`;
const SHEET_VERT = /* glsl */ `
varying vec3 vWorld; varying vec2 vUv2;
void main() { vUv2 = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const sprite = () => {
  const c = document.createElement("canvas"); c.width = c.height = 32;
  const x = c.getContext("2d")!, g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.5, "rgba(235,248,255,0.6)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
};

/** 동전 게임 판정용: 맨 위 접시(목표)·가운데 접시·아래 수반의 물 높이와 반지름 (월드 좌표, m) */
export function fountainTargets(at: { x: number; z: number }, scale: number) {
  return {
    x: at.x, z: at.z,
    dish: { y: (UPPER.y + 0.24) * scale, r: (UPPER.r - 0.1) * scale },
    lower: { y: (LOWER.y + 0.35) * scale, r: (LOWER.r - 0.1) * scale },
    basin: { y: WATER_Y * scale, r: R_IN * scale },
  };
}

export function createFountain(at: { x: number; z: number }, scale: number, sky: SkyUniforms) {
  const group = new THREE.Group(); group.position.set(at.x, 0, at.z); group.scale.setScalar(scale);
  const fog = { fogColor: { value: new THREE.Color() }, fogNear: { value: 50 }, fogFar: { value: 200 } };
  const time = { value: 0 };
  // 돌은 외곽선 없이 (돌린 모양은 외곽선을 키워 그리면 넓은 갈색 판처럼 보임)
  const stone = (geo: THREE.BufferGeometry, color = STONE) => { const m = part(geo, color, 0); group.add(m); return m; };

  // 바깥 수조: 둥근 테두리 턱 + 안쪽 벽
  stone(lathe([[R_IN, FLOOR_Y], [R_IN, 0.5], [R_IN + 0.04, 0.58], [R_OUT - 0.06, 0.62], [R_OUT + 0.04, 0.55], [R_OUT + 0.08, 0.35], [R_OUT, 0.08], [R_OUT + 0.12, 0]]));
  stone(new THREE.CylinderGeometry(R_OUT + 0.35, R_OUT + 0.4, 0.06, 56), STONE_DARK).position.y = 0.03; // 바닥 디딤 테두리

  // 물 밑바닥 (빛무늬)
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R_IN, 48).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({ uniforms: { time, ...fog }, vertexShader: VERT, fragmentShader: FLOOR_FRAG }));
  floor.position.y = FLOOR_Y; group.add(floor);

  // 바닥에 가라앉은 동전 (10원·50원·100원 빛깔)
  const COIN_MAX = 400;
  const coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 14),
    new THREE.MeshToonMaterial({ gradientMap: toonGradient() }), COIN_MAX);
  coins.count = 0; group.add(coins);
  const cd = new THREE.Object3D(), cc = new THREE.Color(), COIN_COLS = ["#e0b45a", "#c98a52", "#d8dadc", "#cfd2d4", "#e6c46a"];
  const putCoin = (lx: number, lz: number) => {
    if (coins.count >= COIN_MAX) return;
    const i = coins.count++;
    cd.position.set(lx, FLOOR_Y + 0.008, lz); cd.rotation.set((Math.random() - 0.5) * 0.25, Math.random() * 6.28, (Math.random() - 0.5) * 0.25);
    cd.updateMatrix(); coins.setMatrixAt(i, cd.matrix); coins.setColorAt(i, cc.set(COIN_COLS[i % COIN_COLS.length]));
    coins.instanceMatrix.needsUpdate = true; if (coins.instanceColor) coins.instanceColor.needsUpdate = true;
  };
  for (let i = 0; i < 90; i++) { // 그동안 사람들이 던진 동전
    const a = Math.random() * 6.28, r = 0.7 + Math.sqrt(Math.random()) * (R_IN - 0.85);
    putCoin(Math.cos(a) * r, Math.sin(a) * r);
  }

  // 수면
  const wu = { time, night: sky.night, ringR: { value: LOWER.r + 0.04 }, glintDir: { value: new THREE.Vector3() }, sunColor: sky.sunColor, zenith: sky.zenith, horizon: sky.horizon, ...fog };
  const water = new THREE.Mesh(new THREE.CircleGeometry(R_IN, 64).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({ uniforms: wu, vertexShader: VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false }));
  water.position.y = WATER_Y; water.renderOrder = 2; group.add(water);

  // 가운데 2단 분수: 받침 기둥 → 아래 그릇 → 기둥 → 위 그릇 → 꼭지
  stone(lathe([[0.55, FLOOR_Y], [0.5, 0.3], [0.36, 0.45], [0.3, 0.75], [0.4, 0.9], [0.32, LOWER.y]], 32));
  stone(lathe([[0.3, LOWER.y], [0.8, LOWER.y + 0.12], [LOWER.r - 0.08, LOWER.y + 0.3], [LOWER.r + 0.04, LOWER.y + 0.38], [LOWER.r, LOWER.y + 0.42], [LOWER.r - 0.1, LOWER.y + 0.36], [0.4, LOWER.y + 0.26]]));
  stone(lathe([[0.22, LOWER.y + 0.26], [0.17, LOWER.y + 0.5], [0.26, LOWER.y + 0.66], [0.18, UPPER.y]], 28));
  stone(lathe([[0.18, UPPER.y], [0.45, UPPER.y + 0.08], [UPPER.r - 0.04, UPPER.y + 0.2], [UPPER.r + 0.03, UPPER.y + 0.26], [UPPER.r, UPPER.y + 0.29], [UPPER.r - 0.08, UPPER.y + 0.24], [0.2, UPPER.y + 0.18]], 36));
  stone(lathe([[0.12, UPPER.y + 0.18], [0.16, UPPER.y + 0.3], [0.1, UPPER.y + 0.42], [0.14, UPPER.y + 0.5], [0.05, UPPER.y + 0.58]], 20));
  // 그릇 속 물
  const bowlWater = (r: number, y: number) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ uniforms: { ...wu, ringR: { value: 0.0 } }, vertexShader: VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false }));
    m.position.y = y; m.renderOrder = 2; group.add(m);
  };
  bowlWater(LOWER.r - 0.1, LOWER.y + 0.35); bowlWater(UPPER.r - 0.08, UPPER.y + 0.24);

  // 그릇 가장자리에서 흘러내리는 물막
  const sheetMat = new THREE.ShaderMaterial({ uniforms: { time }, vertexShader: SHEET_VERT, fragmentShader: SHEET_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const sheet = (r0: number, r1: number, top: number, bottom: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, top - bottom, 48, 1, true), sheetMat);
    m.position.y = (top + bottom) / 2; m.renderOrder = 3; group.add(m);
  };
  sheet(LOWER.r + 0.05, LOWER.r + 0.1, LOWER.y + 0.4, WATER_Y);
  sheet(UPPER.r + 0.04, UPPER.r + 0.08, UPPER.y + 0.28, LOWER.y + 0.35);

  // 꼭대기 물줄기 + 물보라 (솟았다가 위 그릇으로 떨어짐)
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.07, 0.8, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: "#f2fbff", transparent: true, opacity: 0.75, depthWrite: false }));
  jet.position.y = UPPER.y + 0.98; group.add(jet);
  const N = 260, sp = new Float32Array(N * 3), sv = new Float32Array(N * 3);
  const spawn = (i: number) => {
    const a = Math.random() * 6.28, out = 0.25 + Math.random() * 0.5;
    sp.set([0, UPPER.y + 1.35, 0], i * 3);
    sv.set([Math.cos(a) * out, 0.4 + Math.random() * 0.8, Math.sin(a) * out], i * 3);
  };
  for (let i = 0; i < N; i++) { spawn(i); sp[i * 3 + 1] -= Math.random() * 1.2; }
  const sprayGeo = new THREE.BufferGeometry(); sprayGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  const spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({ size: 0.07, map: sprite(), transparent: true, opacity: 0.85, depthWrite: false, color: "#ffffff" }));
  spray.renderOrder = 3; group.add(spray);

  return {
    group,
    /** 동전 던지기: 월드 좌표에 떨어진 동전을 바닥에 남김 */
    addCoin(wx: number, wz: number) {
      const lx = (wx - at.x) / scale, lz = (wz - at.z) / scale, r = Math.hypot(lx, lz);
      const k = r > R_IN - 0.15 ? (R_IN - 0.15) / r : 1;
      putCoin(lx * k, lz * k);
    },
    update(t: number, dt: number, f: THREE.Fog) {
      time.value = t;
      const sd = sky.sunDir.value;
      wu.glintDir.value.set(sd.x * 0.5, 0.2 + Math.max(sd.y, 0) * 0.3, sd.z > 0 ? -0.8 : 0.8).normalize();
      fog.fogColor.value.copy(f.color); fog.fogNear.value = f.near; fog.fogFar.value = f.far;
      jet.scale.y = 1 + Math.sin(t * 6) * 0.08;
      for (let i = 0; i < N; i++) {
        const o = i * 3;
        sv[o + 1] -= 3.2 * dt;
        sp[o] += sv[o] * dt; sp[o + 1] += sv[o + 1] * dt; sp[o + 2] += sv[o + 2] * dt;
        if (sp[o + 1] < UPPER.y + 0.24) spawn(i);
      }
      sprayGeo.attributes.position.needsUpdate = true;
    },
  };
}
