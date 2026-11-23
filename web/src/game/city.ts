// 강 건너 도시 풍경: 앞줄 아파트 → 사무 빌딩 → 뒤쪽 고층 타워(뾰족 탑·금빛 빌딩·쌍둥이 빌딩) → 멀리 산과 전망탑, 동쪽엔 다리.
// 창문은 셰이더로 그려서(정점 수 적음) 낮엔 하늘이 비치는 유리, 노을엔 반쯤, 밤엔 창마다 불이 켜짐. 멀수록 뿌옇게.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { SkyUniforms } from "./water";

const VERT = /* glsl */ `
attribute vec3 color; attribute float aGlass; attribute float aSeed;
varying vec3 vColor, vN, vWorld; varying vec2 vUv; varying float vGlass, vSeed;
void main() {
  vColor = color; vGlass = aGlass; vSeed = aSeed; vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
uniform vec3 zenith, horizon, sunDir, sunColor, haze;
uniform float night;
varying vec3 vColor, vN, vWorld; varying vec2 vUv; varying float vGlass, vSeed;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 N = normalize(vN);
  float roof = step(0.6, N.y);
  // 창 칸: 가로 1.6m × 세로 2.6m (유리 건물은 칸 전체가 유리, 사이에 가는 창틀)
  vec2 cell = vUv / vec2(1.6, 2.6), f = fract(cell), id = floor(cell);
  float punched = step(0.18, f.x) * step(f.x, 0.82) * step(0.22, f.y) * step(f.y, 0.82);
  float curtain = 1.0 - (step(f.x, 0.05) + step(0.97, f.y)) * 0.7;
  float win = mix(punched, curtain, vGlass) * (1.0 - roof);
  float lit = 0.62 + 0.38 * max(dot(N, normalize(sunDir)), 0.0) + 0.1 * N.y;
  // 낮: 벽 + 하늘이 비치는 유리
  vec3 sky = mix(horizon, zenith, clamp(0.25 + 0.5 * f.y + 0.2 * hash(id + vSeed), 0.0, 1.0));
  vec3 day = mix(vColor * lit, sky * (0.78 + 0.25 * vGlass) + sunColor * 0.06, win * (0.5 + 0.4 * vGlass));
  // 밤: 벽은 어둡게, 창마다 따뜻하거나 하얀 불 (켜진 창 비율은 밤이 깊을수록)
  float on = step(1.0 - (0.12 + 0.26 * night), hash(id * 1.7 + vSeed * 13.1));
  vec3 bulb = mix(vec3(1.0, 0.78, 0.48), vec3(0.82, 0.9, 1.0), step(0.6, hash(id + vSeed * 3.3)));
  vec3 dark = vColor * 0.16 + vec3(0.02, 0.03, 0.07);
  vec3 nightCol = dark + win * on * bulb * 0.95 + roof * 0.02;
  vec3 col = mix(day, nightCol, smoothstep(0.15, 0.85, night));
  // 멀수록 뿌옇게 (공기 원근)
  float d = length(cameraPosition - vWorld);
  col = mix(col, haze, smoothstep(25.0, 190.0, d) * 0.82);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/** 상자 하나: uv를 실제 크기(m)로 → 창 크기가 건물마다 같게 */
function boxGeo(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.Color, glass: number, seed: number) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    if (ny > 0.5) uv.setXY(i, px, pz);
    else uv.setXY(i, (nx > 0.5 ? pz : px) + w * 0.5 + d * 0.5, py + h / 2);
  }
  g.translate(x, y + h / 2, z);
  return withAttrs(g, color, glass, seed);
}
/** 위로 갈수록 가늘어지는 팔각 타워 */
function towerGeo(r0: number, r1: number, h: number, x: number, z: number, color: THREE.Color, glass: number, seed: number, sides = 8) {
  const g = new THREE.CylinderGeometry(r1, r0, h, sides, 1, false).toNonIndexed();
  const uv = g.attributes.uv, pos = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * (r0 + r1), pos.getY(i) + h / 2);
  g.translate(x, h / 2, z);
  return withAttrs(g, color, glass, seed);
}
function withAttrs(g: THREE.BufferGeometry, c: THREE.Color, glass: number, seed: number) {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3), gl = new Float32Array(n), sd = new Float32Array(n);
  for (let i = 0; i < n; i++) { col.set([c.r, c.g, c.b], i * 3); gl[i] = glass; sd[i] = seed; }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aGlass", new THREE.BufferAttribute(gl, 1));
  g.setAttribute("aSeed", new THREE.BufferAttribute(sd, 1));
  return g;
}

export function createCity(scene: THREE.Scene, sky: SkyUniforms, fog: THREE.Fog) {
  let n = 4242; const rnd = () => ((n = (n * 16807) % 2147483647) / 2147483647);
  const C = (h: string) => new THREE.Color(h);
  const CONCRETE = ["#e9e3d8", "#ddd6cc", "#f1ece4", "#d3cfc9", "#e4dccd"].map(C);
  const GLASS = ["#6f93b3", "#5d84a8", "#7aa0bd", "#8aa9bf", "#55789a"].map(C);
  const geos: THREE.BufferGeometry[] = [];
  const beacons: THREE.Vector3[] = []; // 꼭대기 항공 장애등

  // 앞줄: 강변 아파트 단지 (낮고 넓게, 창 촘촘)
  for (let x = -170; x < 170; x += 9 + rnd() * 5) {
    const h = 15 + rnd() * 10, w = 7 + rnd() * 4;
    geos.push(boxGeo(w, h, 4.5, x, -0.3, -76 - rnd() * 4, CONCRETE[Math.floor(rnd() * CONCRETE.length)], 0, rnd() * 100));
  }
  // 가운데: 사무 빌딩 (유리 반, 계단식 꼭대기)
  for (let x = -170; x < 170; x += 11 + rnd() * 12) {
    const h = 24 + rnd() * 22, w = 6 + rnd() * 6, d = 6 + rnd() * 4, z = -90 - rnd() * 8, glass = rnd() < 0.55 ? 1 : 0;
    const col = glass ? GLASS[Math.floor(rnd() * GLASS.length)] : CONCRETE[Math.floor(rnd() * CONCRETE.length)];
    geos.push(boxGeo(w, h, d, x, -0.3, z, col, glass, rnd() * 100));
    if (rnd() < 0.45) geos.push(boxGeo(w * 0.65, 4 + rnd() * 6, d * 0.65, x, h - 0.3, z, col, glass, rnd() * 100)); // 윗단
    if (h > 40) beacons.push(new THREE.Vector3(x, h + 0.5, z));
  }
  // 뒤쪽: 고층 타워 (멀리서도 도시가 깊어 보이게)
  for (let x = -160; x < 160; x += 17 + rnd() * 18) {
    const h = 42 + rnd() * 24, w = 9 + rnd() * 6, z = -108 - rnd() * 12, glass = rnd() < 0.7 ? 1 : 0;
    geos.push(boxGeo(w, h, w, x, -0.3, z, glass ? GLASS[Math.floor(rnd() * GLASS.length)] : CONCRETE[Math.floor(rnd() * CONCRETE.length)], glass, rnd() * 100));
    beacons.push(new THREE.Vector3(x, h + 0.5, z));
  }
  // 눈에 띄는 랜드마크 몇 개
  geos.push(towerGeo(9, 2, 112, 70, -135, C("#9db6c9"), 1, 7.7));                 // 위로 가늘어지는 아주 높은 유리 탑
  geos.push(boxGeo(1, 10, 1, 70, 111.5, -135, C("#cfd8df"), 0, 1)); beacons.push(new THREE.Vector3(70, 122, -135));
  geos.push(boxGeo(14, 76, 11, -52, -0.3, -112, C("#caa45e"), 1, 3.3));             // 금빛 유리 빌딩
  beacons.push(new THREE.Vector3(-52, 76.5, -112));
  for (const dx of [-6, 6]) {                                                      // 쌍둥이 타워
    geos.push(boxGeo(9, 66, 9, 14 + dx, -0.3, -110, C("#586f8c"), 1, 9 + dx));
    geos.push(boxGeo(5, 5, 5, 14 + dx, 65.7, -110, C("#3f5068"), 1, 2));
    beacons.push(new THREE.Vector3(14 + dx, 71, -110));
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: { zenith: sky.zenith, horizon: sky.horizon, sunDir: sky.sunDir, sunColor: sky.sunColor, night: sky.night, haze: { value: fog.color } },
    vertexShader: VERT, fragmentShader: FRAG,
  });
  scene.add(new THREE.Mesh(mergeGeometries(geos), mat));

  // 멀리 산 (뿌연 실루엣) + 봉우리 전망탑
  const hillMat = new THREE.MeshBasicMaterial({ color: "#8fa6b8", fog: false });
  const hills = new THREE.Group();
  for (const [x, z, r, h] of [[-120, -175, 70, 30], [-40, -185, 80, 40], [40, -178, 65, 33], [130, -182, 85, 36], [-190, -180, 60, 24]] as const) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
    m.scale.set(r, h, r * 0.45); m.position.set(x, -1, z); hills.add(m);
  }
  const towerMat = new THREE.MeshBasicMaterial({ color: "#7d92a4", fog: false });
  const mast = new THREE.Group(); mast.position.set(-40, 38, -185);
  mast.add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 16, 10), towerMat).translateY(8));
  mast.add(new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 2.2, 14), towerMat).translateY(15));
  mast.add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 10, 6), towerMat).translateY(21));
  hills.add(mast); beacons.push(new THREE.Vector3(-40, 64.5, -185));
  scene.add(hills);

  // 동쪽 다리: 강을 가로지르는 아치 다리 (밤엔 가로등이 줄지어 켜짐)
  const bridge = new THREE.Group();
  const bMat = new THREE.MeshLambertMaterial({ color: "#c9c3b8" }), archMat = new THREE.MeshLambertMaterial({ color: "#6c8f84" });
  const BX = 82, Z0 = -7, Z1 = -44;
  bridge.add(new THREE.Mesh(new THREE.BoxGeometry(7, 0.8, Z0 - Z1), bMat).translateX(BX).translateY(3.2).translateZ((Z0 + Z1) / 2));
  const lampPts: THREE.Vector3[] = [];
  for (let z = Z0 - 3; z > Z1 + 1; z -= 7.5) {
    bridge.add(new THREE.Mesh(new THREE.BoxGeometry(5, 4, 1.6), bMat).translateX(BX).translateY(1).translateZ(z));
    const arch = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.22, 6, 16, Math.PI), archMat);
    arch.rotation.y = Math.PI / 2; arch.position.set(BX - 3.2, 3.6, z - 3.75); bridge.add(arch);
    const arch2 = arch.clone(); arch2.position.x = BX + 3.2; bridge.add(arch2);
    lampPts.push(new THREE.Vector3(BX - 3.3, 5, z - 3.75), new THREE.Vector3(BX + 3.3, 5, z - 3.75));
  }
  scene.add(bridge);

  // 밤 불빛: 항공 장애등(빨강, 깜빡) + 다리 가로등(노랑) — 작은 빛 점
  const glow = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 32;
    const x = c.getContext("2d")!, g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.3, "rgba(255,255,255,0.5)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c);
  })();
  const dots = (pts: THREE.Vector3[], color: string, size: number) => {
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.PointsMaterial({ color, size, map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 });
    const p = new THREE.Points(geo, m); scene.add(p); return m;
  };
  const red = dots(beacons, "#ff4a4a", 2.2), lamps = dots(lampPts, "#ffd38a", 1.6);

  const tmp = new THREE.Color();
  return {
    update(t: number) {
      const nt = sky.night.value;
      hillMat.color.copy(tmp.copy(sky.horizon.value).lerp(C("#6f8aa0"), 0.45)).multiplyScalar(1 - nt * 0.55);
      towerMat.color.copy(hillMat.color).multiplyScalar(0.92);
      const on = THREE.MathUtils.smoothstep(nt, 0.2, 0.7);
      red.opacity = on * (Math.sin(t * 2.4) > 0 ? 1 : 0.15); // 장애등은 깜빡
      lamps.opacity = on * 0.95;
    },
  };
}
