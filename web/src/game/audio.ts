// 공원 소리: 파일 없이 브라우저에서 합성 (저작권·로딩 걱정 없음).
// 배경음은 위치·바람·주변 사람 수·시간대에 따라 크기가 바뀌고, 효과음은 필요할 때 한 번씩.
// ponytail: 전부 합성음. 녹음 파일로 바꾸고 싶으면 public/sounds 에 넣고 각 층을 AudioBufferSource로 교체

export type SoundLevels = { wind: number; water: number; crowd: number; nature: number; sfx: number }; // 0~100
export const DEFAULT_LEVELS: SoundLevels = { wind: 60, water: 60, crowd: 45, nature: 40, sfx: 70 };

type Voice = { filter: BiquadFilterNode; gain: GainNode; next: number; talking: boolean };
const PREF = "sakura.sound"; // 이 기기에서 켜기/끄기·음량 기억

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function noiseBuffer(ctx: AudioContext, kind: "white" | "pink" | "brown", seconds = 3) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate), d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === "white") d[i] = w;
    else if (kind === "pink") { b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.5; }
    else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
  }
  return buf;
}

export class ParkAudio {
  levels: SoundLevels = { ...DEFAULT_LEVELS };
  muted = false;
  volume = 0.8;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private wind!: { gain: GainNode; filter: BiquadFilterNode };
  private river!: GainNode;
  private trickle!: GainNode;
  private fountain!: GainNode;
  private crowd!: GainNode;
  private voices: Voice[] = [];
  private nature!: GainNode;
  private nextBird = 0;
  private nextTrickle = 0;
  private buffers: Record<"white" | "pink" | "brown", AudioBuffer> | null = null;

  constructor() {
    try {
      const p = JSON.parse(localStorage.getItem(PREF) ?? "{}");
      if (typeof p.muted === "boolean") this.muted = p.muted;
      if (typeof p.volume === "number") this.volume = clamp01(p.volume);
    } catch { /* 저장소를 못 쓰면 기본값 */ }
  }

  private save() { try { localStorage.setItem(PREF, JSON.stringify({ muted: this.muted, volume: this.volume })); } catch { /* 무시 */ } }

  /** 브라우저 정책상 사용자가 처음 누르거나 키를 칠 때 호출해야 소리가 남 */
  start() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = this.ctx = new Ctx();
    this.buffers = { white: noiseBuffer(ctx, "white"), pink: noiseBuffer(ctx, "pink"), brown: noiseBuffer(ctx, "brown") };
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : this.volume; this.master.connect(ctx.destination);
    this.sfxBus = this.gain(this.master, 0);

    const loop = (kind: "white" | "pink" | "brown", to: AudioNode) => {
      const s = ctx.createBufferSource(); s.buffer = this.buffers![kind]; s.loop = true;
      s.playbackRate.value = 0.9 + Math.random() * 0.2; s.connect(to); s.start(0, Math.random() * 2);
    };
    // 바람: 낮게 웅웅거리는 갈색 소음
    const wf = this.filter("lowpass", 400, 0.7), wg = this.gain(this.master, 0);
    wf.connect(wg); loop("brown", wf); this.wind = { gain: wg, filter: wf };
    // 강물: 낮고 부드럽게 흐르는 소리(높은 쉭쉭 소리는 걸러냄) + 맑은 물방울 소리(bubble)
    this.river = this.gain(this.master, 0);
    const rl = this.filter("lowpass", 900, 0.5), rl2 = this.filter("lowpass", 1400, 0.5);
    rl.connect(rl2); rl2.connect(this.river); loop("pink", rl);
    this.trickle = this.gain(this.master, 0); // 물방울 소리 크기 (강·분수 가까운 정도)
    // 분수: 떨어지는 물 — 가운데 대역만 남기고 지직거리는 높은 소리는 깎음
    this.fountain = this.gain(this.master, 0);
    const fb = this.filter("bandpass", 1700, 0.55), fl = this.filter("lowpass", 4200, 0.5);
    fb.connect(fl); fl.connect(this.fountain); loop("pink", fb);
    // 웅성임: 말소리 대역의 소리 덩어리 몇 개가 띄엄띄엄
    this.crowd = this.gain(this.master, 0);
    for (let i = 0; i < 4; i++) {
      const f = this.filter("bandpass", 500 + Math.random() * 900, 5), g = this.gain(this.crowd, 0);
      f.connect(g); loop("pink", f);
      this.voices.push({ filter: f, gain: g, next: 0, talking: false });
    }
    this.nature = this.gain(this.master, 0);
  }

  private gain(to: AudioNode, v: number) { const g = this.ctx!.createGain(); g.gain.value = v; g.connect(to); return g; }
  private filter(type: BiquadFilterType, f: number, q: number) { const b = this.ctx!.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  private set(p: AudioParam, v: number, tc = 0.4) { p.setTargetAtTime(v, this.ctx!.currentTime, tc); }

  setMuted(m: boolean) { this.muted = m; this.save(); if (this.ctx) this.set(this.master.gain, m ? 0 : this.volume, 0.1); }
  setVolume(v: number) { this.volume = clamp01(v); this.save(); if (this.ctx && !this.muted) this.set(this.master.gain, this.volume, 0.1); }

  /** 매 프레임: 바람 세기, 강·분수까지 거리(m), 주변 사람 수, 한국 시각 */
  update(s: { wind: number; riverDist: number; fountainDist: number; nearby: number; hour: number }) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const L = this.levels, now = ctx.currentTime;
    const gust = clamp01((s.wind - 0.4) / 1.6);
    this.set(this.wind.gain.gain, (L.wind / 100) * (0.04 + 0.16 * gust)); // 바람은 배경에 살짝
    this.set(this.wind.filter.frequency, 250 + 650 * gust, 0.8);
    // 물가에 다가갈수록 확 커지게 (멀면 거의 안 들리고 가까우면 또렷)
    const nearRiver = clamp01(1 - s.riverDist / 30) ** 2.2, nearFountain = clamp01(1 - s.fountainDist / 22) ** 2.2;
    const swell = 0.8 + 0.14 * Math.sin(now * 0.37) + 0.06 * Math.sin(now * 1.1); // 강물이 천천히 넘실
    this.set(this.river.gain, (L.water / 100) * 0.9 * nearRiver * swell, 0.8);
    this.set(this.fountain.gain, (L.water / 100) * 0.45 * nearFountain, 0.6);
    this.set(this.trickle.gain, (L.water / 100) * Math.max(nearRiver * 0.5, nearFountain), 0.5);
    this.sfxBus.gain.value = L.sfx / 100;
    if (now > this.nextTrickle && (nearRiver > 0.02 || nearFountain > 0.02)) { // 졸졸·퐁: 물방울이 띄엄띄엄
      this.nextTrickle = now + (nearFountain > nearRiver ? 0.05 + Math.random() * 0.12 : 0.12 + Math.random() * 0.35);
      this.bubble();
    }
    // 웅성임: 멀리서 늘 조금 + 가까운 사람 수만큼
    this.set(this.crowd.gain, (L.crowd / 100) * (0.04 + 0.07 * Math.min(s.nearby, 6)), 1);
    for (const v of this.voices) {
      if (now < v.next) continue;
      if (v.talking && Math.random() < 0.15) { v.talking = false; v.next = now + 0.6 + Math.random() * 2; v.gain.gain.setTargetAtTime(0, now, 0.08); continue; }
      v.talking = true; v.next = now + 0.1 + Math.random() * 0.15; // 음절처럼 끊어서
      v.gain.gain.setTargetAtTime(0.2 + Math.random() * 0.8, now, 0.03);
      v.filter.frequency.setTargetAtTime(450 + Math.random() * 1100, now, 0.1);
    }
    // 새(낮) · 풀벌레(밤)
    this.nature.gain.value = L.nature / 100;
    if (now > this.nextBird) {
      const day = s.hour >= 5.5 && s.hour < 19, night = s.hour >= 20 || s.hour < 4.5;
      if (day) { this.bird(); this.nextBird = now + 5 + Math.random() * 12; }
      else if (night) { this.cricket(); this.nextBird = now + 1.5 + Math.random() * 3; }
      else this.nextBird = now + 5;
    }
  }

  /** 물방울 하나: 짧게 위로 올라가는 맑은 사인음 (물속 공기방울이 터지는 소리) */
  private bubble() {
    const ctx = this.ctx!, at = ctx.currentTime, f = 500 + Math.random() * 900, dur = 0.05 + Math.random() * 0.07;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(f, at); o.frequency.exponentialRampToValueAtTime(f * (1.6 + Math.random() * 0.8), at + dur);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.07, at + 0.006); g.gain.exponentialRampToValueAtTime(0.0005, at + dur);
    o.connect(g); g.connect(this.trickle); o.start(at); o.stop(at + dur + 0.02);
  }

  private tone(to: AudioNode, type: OscillatorType, f0: number, f1: number, at: number, dur: number, vol: number) {
    const ctx = this.ctx!, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), at + dur);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(to); o.start(at); o.stop(at + dur + 0.05);
  }
  private burst(to: AudioNode, type: BiquadFilterType, f: number, q: number, at: number, dur: number, vol: number) {
    const ctx = this.ctx!, s = ctx.createBufferSource(), b = this.filter(type, f, q), g = ctx.createGain();
    s.buffer = this.buffers!.white; g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(b); b.connect(g); g.connect(to); s.start(at, Math.random()); s.stop(at + dur + 0.05);
  }
  private bird() {
    const t = this.ctx!.currentTime, base = 2600 + Math.random() * 1500;
    for (let i = 0, n = 2 + Math.floor(Math.random() * 4); i < n; i++) this.tone(this.nature, "sine", base, base * (1.2 + Math.random() * 0.3), t + i * 0.13, 0.09, 0.05);
  }
  private cricket() {
    const t = this.ctx!.currentTime;
    for (let i = 0; i < 6; i++) this.tone(this.nature, "sine", 4400, 4300, t + i * 0.045, 0.03, 0.025);
  }

  // ---------- 효과음 ----------
  private ok() { return !!this.ctx && this.ctx.state === "running"; }
  /** 맑은 종소리 (운세꽃잎·소원) */
  chime() {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => { this.tone(this.sfxBus, "sine", f, f, t + i * 0.09, 1.4, 0.12); this.tone(this.sfxBus, "sine", f * 2.01, f * 2.01, t + i * 0.09, 0.6, 0.03); });
  }
  /** 동전 퐁당 */
  plop() {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    this.tone(this.sfxBus, "sine", 700, 160, t, 0.16, 0.35);
    this.burst(this.sfxBus, "bandpass", 1800, 1.5, t + 0.02, 0.18, 0.25);
  }
  /** 동전 던질 때 짤랑 */
  jingle() {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    this.tone(this.sfxBus, "triangle", 2400, 2300, t, 0.12, 0.08); this.tone(this.sfxBus, "triangle", 3100, 3000, t + 0.05, 0.1, 0.06);
  }
  /** 종이 찢는·붙이는 소리 */
  paper() {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    for (let i = 0; i < 7; i++) this.burst(this.sfxBus, "bandpass", 2500 + Math.random() * 2500, 1.2, t + i * 0.045 + Math.random() * 0.02, 0.06, 0.18);
  }
  /** 사다리 오르는 나무 소리 */
  ladder() {
    if (!this.ok()) return;
    const t = this.ctx!.currentTime;
    for (let i = 0; i < 4; i++) this.tone(this.sfxBus, "triangle", 260, 180, t + i * 0.28, 0.08, 0.2);
  }
  /** 고로롱: 낮게 웅웅 떨리는 소리 (숨 들이쉬고 내쉬듯 두 번) */
  purr() {
    if (!this.ok()) return;
    const ctx = this.ctx!, t = ctx.currentTime;
    for (const [at, dur] of [[0, 1.1], [1.25, 1.3]] as const) {
      const src = ctx.createBufferSource(), lp = this.filter("lowpass", 160, 0.8), g = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
      src.buffer = this.buffers!.white; src.loop = true;
      g.gain.setValueAtTime(0.0001, t + at); g.gain.linearRampToValueAtTime(0.5, t + at + 0.25); g.gain.linearRampToValueAtTime(0.0001, t + at + dur);
      lfo.frequency.value = 26; depth.gain.value = 0.45; lfo.connect(depth); depth.connect(g.gain); // 초당 26번 떨림
      src.connect(lp); lp.connect(g); g.connect(this.sfxBus);
      src.start(t + at); src.stop(t + at + dur + 0.05); lfo.start(t + at); lfo.stop(t + at + dur + 0.05);
    }
  }
  /** 작은 버튼 소리 (구매 등) */
  pop() {
    if (!this.ok()) return;
    this.tone(this.sfxBus, "sine", 880, 1320, this.ctx!.currentTime, 0.1, 0.12);
  }

  dispose() { this.ctx?.close(); this.ctx = null; }
}
