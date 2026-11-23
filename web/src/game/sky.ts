// 하늘: 실제 한국 시간에 따라 새벽·낮·노을·밤 빛깔이 바뀌고, 구름이 흘러감.
// 날짜마다 구름 양·모양(뭉게구름/새털구름)·바람 방향이 달라짐. 햇빛·안개 색도 함께 바꿈.
import * as THREE from "three";

type Key = { h: number; zenith: string; horizon: string; cloud: string; shade: string; sun: string; sunI: number; hemi: number; night: number };
// 시각(h)별 색. 사이는 섞어서 부드럽게 넘어감
const KEYS: Key[] = [
  { h: 0, zenith: "#0d1a3d", horizon: "#2e3a6e", cloud: "#4a5585", shade: "#262f57", sun: "#9fb4ff", sunI: 0.35, hemi: 0.75, night: 1 },
  { h: 4.5, zenith: "#14224a", horizon: "#3c4a80", cloud: "#5a6596", shade: "#2c355f", sun: "#9fb4ff", sunI: 0.35, hemi: 0.8, night: 1 },
  { h: 6, zenith: "#6f8fcf", horizon: "#f8c8b0", cloud: "#ffe3d6", shade: "#c49aa6", sun: "#ffc9a0", sunI: 1.3, hemi: 1.0, night: 0.15 },
  { h: 8, zenith: "#5aa7ea", horizon: "#d9eefa", cloud: "#ffffff", shade: "#c5d6ea", sun: "#fff0dc", sunI: 2.1, hemi: 1.25, night: 0 },
  { h: 15.5, zenith: "#4f9de6", horizon: "#d6ecf9", cloud: "#ffffff", shade: "#c2d3e8", sun: "#fff0dc", sunI: 2.2, hemi: 1.3, night: 0 },
  { h: 17.5, zenith: "#6b88c9", horizon: "#f9c7a6", cloud: "#ffe2cf", shade: "#cf9ea8", sun: "#ffc08a", sunI: 1.6, hemi: 1.1, night: 0 },
  { h: 18.7, zenith: "#4b4f93", horizon: "#f49b8c", cloud: "#f8b9a8", shade: "#8f6f9c", sun: "#ff9f80", sunI: 1.0, hemi: 0.95, night: 0.35 },
  { h: 20, zenith: "#18234d", horizon: "#45467a", cloud: "#5d5a8c", shade: "#2c2f5c", sun: "#a7b6ff", sunI: 0.4, hemi: 0.8, night: 0.9 },
  { h: 24, zenith: "#0d1a3d", horizon: "#2e3a6e", cloud: "#4a5585", shade: "#262f57", sun: "#9fb4ff", sunI: 0.35, hemi: 0.75, night: 1 },
];

/** 한국 시각 (시 단위 소수) */
export const kstHour = (now = Date.now()) => ((now / 3_600_000 + 9) % 24 + 24) % 24;
/** 한국 날짜 기준 그날의 고유 번호 */
const kstDay = (now = Date.now()) => Math.floor((now + 9 * 3_600_000) / 86_400_000);

/** 그날의 하늘 성격: 구름 양, 새털구름 여부, 바람 방향 */
function dayWeather(day: number) {
  const r = (k: number) => { const v = Math.sin(day * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };
  return { coverage: 0.4 + r(1) * 0.22, cirrus: r(2) < 0.25 ? 1 : 0, windAngle: r(3) * Math.PI * 2 };
}

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // 항상 가장 먼 곳에
}`;
const frag = /* glsl */ `
uniform vec3 zenith, horizon, cloudLit, cloudShade, sunDir, sunColor;
uniform float time, coverage, cirrus, night;
uniform vec2 wind;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.5));
  // 해 주변 은은한 빛
  float s = max(dot(d, sunDir), 0.0);
  col += sunColor * (pow(s, 300.0) * 0.8 + pow(s, 8.0) * 0.18) * (1.0 - night * 0.8);
  // 밤하늘 별
  if (night > 0.0 && h > 0.05) {
    vec2 g = floor(d.xz / (h + 0.3) * 160.0);
    float st = step(0.996, hash(g)) * (0.6 + 0.4 * sin(time * 2.0 + hash(g + 3.0) * 30.0));
    col += vec3(st) * night * smoothstep(0.05, 0.3, h);
  }
  // 구름: 하늘을 평면에 투영해 흐르게
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.18) * 1.6 + wind * time;
    vec2 cuv = mix(uv, vec2(uv.x * 0.25, uv.y * 2.2), cirrus);       // 새털구름은 길게 늘림
    float n = clamp((fbm(cuv * 1.5) - 0.5) * 2.4 + 0.5, 0.0, 1.0);  // 몽실한 덩어리 (값 분포를 넓혀 또렷하게)
    float th = 1.0 - coverage;
    float c = smoothstep(th, th + mix(0.14, 0.3, cirrus), n) * mix(1.0, 0.8, cirrus);
    float light = clamp((fbm(cuv * 1.5) - fbm(cuv * 1.5 + vec2(0.04, 0.07))) * 7.0 + 0.65, 0.0, 1.0); // 해 쪽은 밝게, 아래는 그늘
    vec3 cc = mix(cloudShade, cloudLit, light);
    col = mix(col, cc, c * smoothstep(0.0, 0.18, h));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const lerpHex = (a: string, b: string, t: number, out: THREE.Color) => out.set(a).lerp(new THREE.Color(b), t);

export function createSky(scene: THREE.Scene, sun: THREE.DirectionalLight, hemi: THREE.HemisphereLight, fog: THREE.Fog, overrideHour?: number) {
  const u = {
    zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
    cloudLit: { value: new THREE.Color() }, cloudShade: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color() },
    time: { value: 0 }, coverage: { value: 0.4 }, cirrus: { value: 0 }, night: { value: 0 },
    wind: { value: new THREE.Vector2(0.01, 0.004) },
  };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24),
    new THREE.ShaderMaterial({ uniforms: u, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, fog: false }));
  dome.renderOrder = -1; dome.frustumCulled = false;
  scene.add(dome);
  scene.background = null;

  const pinkMist = new THREE.Color("#f7e3ea"), tmp = new THREE.Color();
  /** 해(또는 달)가 있는 방향. 그림자를 위해 너무 낮아지지 않게 */
  const lightDir = new THREE.Vector3();
  let lastDay = -1;

  return {
    lightDir,
    /** 하늘 색·해 방향 (물 반사 등에서 같이 씀) */
    uniforms: u,
    update(t: number, center: THREE.Vector3) {
      dome.position.copy(center);
      u.time.value = t;
      const now = Date.now(), hour = overrideHour ?? kstHour(now), day = kstDay(now);
      if (day !== lastDay) {
        lastDay = day;
        const w = dayWeather(day);
        u.coverage.value = w.coverage; u.cirrus.value = w.cirrus;
        u.wind.value.set(Math.cos(w.windAngle), Math.sin(w.windAngle)).multiplyScalar(0.012);
      }
      // 시각에 맞는 두 키 사이를 섞음
      let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1].h <= hour) i++;
      const a = KEYS[i], b = KEYS[i + 1], k = (hour - a.h) / (b.h - a.h);
      lerpHex(a.zenith, b.zenith, k, u.zenith.value); lerpHex(a.horizon, b.horizon, k, u.horizon.value);
      lerpHex(a.cloud, b.cloud, k, u.cloudLit.value); lerpHex(a.shade, b.shade, k, u.cloudShade.value);
      lerpHex(a.sun, b.sun, k, u.sunColor.value);
      u.night.value = a.night + (b.night - a.night) * k;
      // 해: 6시 동쪽에서 떠서 18시 서쪽으로 (밤엔 달이 같은 길로)
      const arc = (((hour - 6) / 12) % 2 + 2) % 2, ang = (arc > 1 ? arc - 1 : arc) * Math.PI;
      u.sunDir.value.set(Math.cos(ang), Math.sin(ang) * 0.9 + 0.05, 0.35).normalize();
      lightDir.copy(u.sunDir.value); lightDir.y = Math.max(lightDir.y, 0.55); lightDir.normalize();
      sun.color.copy(u.sunColor.value); sun.intensity = a.sunI + (b.sunI - a.sunI) * k;
      hemi.intensity = a.hemi + (b.hemi - a.hemi) * k;
      hemi.color.copy(tmp.copy(u.horizon.value).lerp(new THREE.Color("#fff4ea"), 0.6));
      // 안개는 지평선 색에 벚꽃 분홍을 살짝
      fog.color.copy(u.horizon.value).lerp(pinkMist, 0.35 * (1 - u.night.value));
    },
  };
}
