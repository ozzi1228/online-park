// 강물: 흐르는 잔물결 + 하늘 반사 + 반짝이는 윤슬. 정점은 평평하고 물결은 픽셀마다 계산(가벼움).
import * as THREE from "three";

const vert = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const frag = /* glsl */ `
uniform float time, night, bankZ;
uniform vec3 glintDir, sunColor, zenith, horizon, deep, shallow, fogColor;
uniform float fogNear, fogFar;
varying vec3 vWorld;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
// 물결 높이: 강을 따라 흐르는 큰 너울 + 바람에 이는 잔물결 (멀수록 잔물결은 줄여 지글거림 방지)
float height(vec2 p, float detail) {
  vec2 flow = vec2(-0.35 * time, 0.0);
  float h = 0.0;
  h += sin(dot(p, vec2(0.55, 0.9)) * 1.3 + time * 0.9) * 0.08;
  h += sin(dot(p, vec2(-0.8, 0.6)) * 1.9 - time * 1.2) * 0.05;
  h += (noise((p + flow) * 1.1) - 0.5) * 0.16;
  h += (noise((p + flow * 1.6) * vec2(2.6, 4.2) + 7.3) - 0.5) * 0.09 * detail;
  h += (noise((p * vec2(1.0, 1.6) - flow * 2.2) * 6.5 + 3.1) - 0.5) * 0.045 * detail;
  return h;
}

void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float detail = 1.0 / (1.0 + dist * 0.035);
  vec2 p = vWorld.xz;
  float e = 0.04 + dist * 0.002;
  float h0 = height(p, detail);
  float hx = height(p + vec2(e, 0.0), detail), hz = height(p + vec2(0.0, e), detail);
  float k = mix(0.35, 1.0, detail);
  vec3 N = normalize(vec3(-(hx - h0) / e * k, 1.0, -(hz - h0) / e * k));
  vec3 R = reflect(-V, N);

  // 물빛: 둑 가까이는 얕고 밝게, 멀수록 깊은 파랑
  float shore = smoothstep(4.0, 0.0, bankZ - vWorld.z);
  vec3 base = mix(deep, shallow, shore * 0.6 + smoothstep(0.03, 0.12, h0) * 0.25);
  // 하늘 반사 (비스듬히 볼수록 많이)
  vec3 sky = mix(horizon, zenith, smoothstep(0.0, 0.6, R.y));
  float fres = clamp(0.12 + pow(1.0 - max(dot(N, V), 0.0), 4.0) * 0.9, 0.0, 0.85);
  vec3 col = mix(base, sky, fres);

  // 윤슬: 물결 면이 해를 정확히 비출 때만 또렷한 흰 반짝임 (잔물결 따라 꿈틀거림)
  float s = max(dot(R, glintDir), 0.0);
  float tw = noise(p * 9.0 + vec2(time * 2.3, -time * 1.7));            // 반짝임이 켜졌다 꺼졌다
  float glint = smoothstep(0.988 - tw * 0.012, 0.997, s) * (0.55 + tw);
  float sheen = pow(s, 18.0) * 0.18;                                       // 해 쪽으로 넓게 번지는 빛길
  float dayK = 1.0 - night * 0.75;
  col += sunColor * (glint * 1.7 + sheen) * dayK;

  // 안개
  col = mix(col, fogColor, smoothstep(fogNear, fogFar, dist));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export type SkyUniforms = { zenith: { value: THREE.Color }; horizon: { value: THREE.Color }; sunDir: { value: THREE.Vector3 }; sunColor: { value: THREE.Color }; night: { value: number } };

/** z = 둑에서 시작하는 물의 가운데, width = 강폭(남북), bankZ = 공원 쪽 둑 */
export function createRiver(scene: THREE.Scene, sky: SkyUniforms, opts: { y: number; z: number; width: number; bankZ: number }) {
  const u = {
    time: { value: 0 }, night: sky.night, bankZ: { value: opts.bankZ },
    glintDir: { value: new THREE.Vector3() }, sunColor: sky.sunColor, zenith: sky.zenith, horizon: sky.horizon,
    deep: { value: new THREE.Color("#3d78a8") }, shallow: { value: new THREE.Color("#7fc0dc") },
    fogColor: { value: new THREE.Color() }, fogNear: { value: 50 }, fogFar: { value: 200 },
  };
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1400, opts.width), new THREE.ShaderMaterial({ uniforms: u, vertexShader: vert, fragmentShader: frag }));
  mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, opts.y, opts.z);
  scene.add(mesh);
  return {
    update(t: number, fog: THREE.Fog) {
      u.time.value = t;
      // 해는 공원 남쪽이라 북쪽 강에선 반사가 안 보임 → 윤슬용 빛은 강 건너편 낮은 하늘에 둠 (보기 좋게)
      const sd = sky.sunDir.value;
      u.glintDir.value.set(sd.x * 0.5, 0.16 + Math.max(sd.y, 0) * 0.22, -1).normalize();
      u.fogColor.value.copy(fog.color); u.fogNear.value = fog.near; u.fogFar.value = fog.far;
    },
  };
}
