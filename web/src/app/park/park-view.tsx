"use client";

import Image from "next/image";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as THREE from "three";
import { CATCH_HIGH, CatchPetal } from "@/game/catch-petal";
import { animateChar, makeChar, playGesture, type Mode } from "@/game/character";
import { Staff } from "@/game/staff";
import { CatView } from "@/game/cat";
import { CatColony, type CatReaction, type CatState, type PlayPhase } from "@/game/cat-brain";
import { Input, JOY_R, type Tap } from "@/game/controls";
import { createMinimap, drawFullMap, type MapLabelKey } from "@/game/minimap";
import { Multiplayer, nameSprite, type NetStatus } from "@/game/multiplayer";
import { BENCH_SEATS, BOUNDS_N, COLLIDERS, PLAZA, LADDER_FOOT, PROPS, PROP_S, SPAWN, WISH_TREE, canSit, groundY, move, type BenchSeat } from "@/game/park-map";
import { PRESETS, type Preset } from "@/game/presets";
import { NPC_NAME } from "@/content/guide";
import { InfoPanel } from "./info-panel";
import { NoteEditor, NoteView } from "./note";
import type { Strokes } from "@/lib/notes-shared";
import { QUALITY_HIGH, QUALITY_LOW, buildWorld, makePetalGeometry } from "@/game/world";
import { LoadingScreen } from "./loading-screen";
import { churuIcon, rodIcon } from "@/game/item-icons";
import { CatToy, ChuruStick } from "@/game/cat-toy";
import { setMsgOverrides, t as msg, type MsgKey } from "@/content/messages";
import { makeMat, matAnim, matCenter, matFits, matPreview, paintMat, placeMat, secondSeat, SEAT_GAP } from "@/game/mat";
import { MAT_COLOR_NAMES, type MatColor } from "@/lib/mat-colors";

type MatSeat = { x: number; z: number; yaw: number; owner: string; ownerId: string };
import { LADDER_TOP, TreeNotes, type TreeNote } from "@/game/tree-notes";
import { CoinGame, type Shot, launchVelocity } from "@/game/coin-game";
import { fountainTargets } from "@/game/fountain";
import { ParkAudio } from "@/game/audio";
import { kstHour } from "@/game/sky";
import { authClient } from "@/lib/auth-client";
import { BagPanel, GreenCoin, ShopPanel, WalletPanel, type MeInfo } from "./wallet";

const COARSE = "(pointer: coarse)";
const isCoarse = () => matchMedia(COARSE).matches;
const subscribeCoarse = (cb: () => void) => { const m = matchMedia(COARSE); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };

const WALK = 3.0;                             // m/s (관리자 설정 걷기 빠르기가 없을 때)
const EYE = 1.5, EYE_SIT = 0.95;             // 1인칭 눈높이 (서 있을 때 / 앉았을 때, 캐릭터 키 기준)
const DRAG_YAW = 0.006, DRAG_PITCH = 0.004; // 끌어서 둘러보기 빠르기
const PITCH_UP = -0.9, PITCH_DOWN = 1.0;      // 올려다보기·내려다보기 한계 (rad)
const LOOK_YAW = 1.6;                         // 사다리 위에서 방향키로 나무를 돌아보는 빠르기 (rad/s)
const WISH_SEC = 3.2;

/** 행동 로그 (실패해도 게임은 계속) */
const logClient = (type: string, data: Record<string, unknown> = {}) =>
  fetch("/api/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, data }), keepalive: true }).catch(() => {});

/** 캐릭터 → 카메라 사이에 굵은 나무줄기·분수 등이 있으면 그 앞까지 카메라를 당김 (가려지지 않게) */
function cameraRoom(x: number, z: number, dx: number, dz: number, max: number) {
  let best = max;
  for (const c of COLLIDERS) {
    if (c.t === "b") { // 건물(안내소·매점 등): 상자 벽에 닿기 전까지만
      if (c.hw < 1 && c.hd < 1) continue;               // 벤치 같은 작은 건 무시
      const m = 0.35, lo = [c.x - c.hw - m, c.z - c.hd - m], hi = [c.x + c.hw + m, c.z + c.hd + m], o = [x, z], d = [dx, dz];
      let t0 = 0, t1 = Infinity;
      for (let i = 0; i < 2; i++) {
        if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) { t0 = Infinity; break; } continue; }
        const a = (lo[i] - o[i]) / d[i], b2 = (hi[i] - o[i]) / d[i];
        t0 = Math.max(t0, Math.min(a, b2)); t1 = Math.min(t1, Math.max(a, b2));
      }
      if (t0 <= t1 && t0 > 0.3 && t0 < best) best = t0;
      continue;
    }
    if (c.r < 0.4) continue;                           // 가는 가로등·난간은 무시
    const ox = x - c.x, oz = z - c.z, r = c.r + 0.35;
    const bq = ox * dx + oz * dz, cq = ox * ox + oz * oz - r * r, disc = bq * bq - cq;
    if (disc < 0) continue;
    const hit = -bq - Math.sqrt(disc);
    if (hit > 0.3 && hit < best) best = hit;
  }
  return Math.max(best, 1.0);
}

/** tile: 글 대신 그림 칸으로 (돗자리 미리보기 그림 주소, "none" = 돗자리 없이 ✕). head: 맨 위 제목 줄 (고양이 이름·하트) */
type MenuItem = { label: string; run?: () => void; tile?: string; head?: boolean; badge?: string; dim?: boolean };
type CatBonds = { rules: { nameHearts: number; petStayHearts: number; petStrokeSec?: number; petIdleSec?: number }; cats: { cat: number; hearts: number; name: string | null }[] };
const heartText = (n: number) => "♥".repeat(n) + "♡".repeat(5 - n);
/** 받침이 있는 이름인지 (크림빵이 / 설기가, 크림빵아 / 설기야) */
const batchim = (name: string) => { const c = name.charCodeAt(name.length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0; };
const nameI = (name: string) => name + (batchim(name) ? "이" : "");      // 크림빵이 부르기 / 설기 부르기
const nameGa = (name: string) => name + (batchim(name) ? "이" : "가");   // 크림빵이 / 설기가
type Menu = { x: number; y: number; items: MenuItem[] };
type Actions = { sit: (mat?: MatColor | null) => void; stand: () => void; photo: () => void; bench: () => void };
const KIOSK = PROPS.find((p) => p.kind === "kiosk") as { x: number; z: number; yaw: number };
const NPC = PROPS.find((p) => p.kind === "npc") as { x: number; z: number; yaw: number };
const FOUNTAIN = PROPS.find((p) => p.kind === "fountain") as { x: number; z: number };
const FT = fountainTargets(FOUNTAIN, PROP_S); // 분수 동전 게임 판정 (맨 위 접시 높이·반지름)
// 안내원: 옥색 저고리 한복에 갓을 쓴 젊은 남자. 안내소 안 단 위에 서서 창구로 얼굴을 내밂
const NPC_LOOK: Preset = { id: "npc-guide", name: NPC_NAME, tags: [], skin: "#f3d1b6", hair: "#3a2a22", style: "short", bangs: "side", hat: "gat",
  top: "#a8d5c2", topType: "hanbok", inner: "#2f4f6f", collar: "#ffffff", tie: "#d9607e", bottom: "#efe6d2", shoes: "#4a3a30" };
const NPC_Y = 0.35; // 안내소 바닥 위. 창턱 위로 가슴부터 보임
// 매점 직원: 노랑 저고리에 다홍 치마, 옥비녀로 쪽진 머리의 젊은 여자
const CLERK_LOOK: Preset = { id: "npc-clerk", name: "매점 직원", tags: [], skin: "#f8dfcc", hair: "#2b211d", style: "binyeo", pin: "#7fc8b4",
  top: "#fbe7a1", topType: "hanbok", inner: "#8a3b55", collar: "#ffffff", tie: "#d2486e", bottom: "#e66a8c", bottomType: "chima", shoes: "#ffffff", smile: false };
const CLERK = { x: KIOSK.x + Math.sin(KIOSK.yaw) * 0.95 * PROP_S, z: KIOSK.z + Math.cos(KIOSK.yaw) * 0.95 * PROP_S, y: 0.45 };

export function ParkView({ presetId, nickname, messages }: { presetId: string; nickname: string; messages?: Partial<Record<MsgKey, string>> }) {
  setMsgOverrides(messages); // 첫 화면(로딩 글자 등)부터 관리자가 고친 멘트로
  const box = useRef<HTMLDivElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);
  const bigMap = useRef<HTMLCanvasElement>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [mapPeople, setMapPeople] = useState(1);
  const joyBase = useRef<HTMLDivElement>(null), knob = useRef<HTMLDivElement>(null);
  const input = useRef<Input | null>(null);
  const actions = useRef<Actions | null>(null);
  const touch = useSyncExternalStore(subscribeCoarse, isCoarse, () => false);
  const [hint, setHint] = useState(true);
  const [net, setNet] = useState<NetStatus | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const menuOpen = useRef(false);
  useEffect(() => { menuOpen.current = !!menu; }, [menu]);
  /** 잡은 운세꽃잎의 운세 문구 */
  const [fortune, setFortune] = useState<string | null>(null);
  const [sitting, setSitting] = useState(false);
  const [benchBtn, setBenchBtn] = useState(false); // 벤치 빈자리 가까이 있음 → '벤치에 앉기' 버튼
  const [toast, setToast] = useState<string | null>(null);
  const [me, setMe] = useState<MeInfo | null>(null);
  const [loaded, setLoaded] = useState(false); // 첫 장면을 그리면 로딩 화면을 걷음
  const meRef = useRef<MeInfo | null>(null);
  const [panel, setPanel] = useState<"wallet" | "shop" | "info" | "inbox" | "bag" | null>(null);
  const panelOpen = useRef(false);
  useEffect(() => { panelOpen.current = panel !== null; }, [panel]);
  const [writeTo, setWriteTo] = useState<{ sessionId: string; uid: string; nickname: string } | null>(null);
  const [nameFor, setNameFor] = useState<{ cat: number; name: string } | null>(null); // 고양이 이름 짓는 창
  const bondsRef = useRef<CatBonds | null>(null);
  const refreshBonds = useRef(async () => { const r = await fetch("/api/cats", { cache: "no-store" }).catch(() => null); if (r?.ok) bondsRef.current = await r.json() as CatBonds; });
  /** 누가 내 돗자리에 같이 앉고 싶어함 → 허락/거절 */
  const [matAsk, setMatAsk] = useState<{ from: string; nickname: string } | null>(null);
  const matApi = useRef<{ answer: (ok: boolean) => void } | null>(null);
  const [sending, setSending] = useState(false);
  const [writeTree, setWriteTree] = useState(false);          // 소원 쪽지 쓰는 중
  const [treeMode, setTreeMode] = useState<"pick" | "ready" | null>(null); // 사다리 위에서 달 자리 고르는 중
  /** 동전 게임 조준 중 (화면을 당겼다 놓으면 튕김) */
  const [coinAim, setCoinAim] = useState(false);
  /** 낚싯대 놀이 화면: 흥미 게이지(0~1)·단계·잡은 수 */
  const [playUi, setPlayUi] = useState<{ interest: number; phase: "watch" | "crouch" | "pounce"; catches: number; speed: number } | null>(null);
  const toyDrag = useRef({ on: false, x: 0, y: 0, dx: 0, dy: 0, stop: false });
  /** 츄르 짜 주기 화면: 남은 양 0~1 */
  const [squeezeUi, setSqueezeUi] = useState<{ paste: number } | null>(null);
  /** 같이 앉은 사람이 있는데 내 돗자리에서 일어나려 할 때 묻는 창 */
  const [packAsk, setPackAsk] = useState<{ id: string; nickname: string } | null>(null);
  const packApi = useRef<{ yes: () => void; no: () => void } | null>(null);
  /** 쓰다듬기 화면: 손 모양이 따라다님 (x, y = 화면 위치, on = 고양이에 닿았는지) */
  const [petUi, setPetUi] = useState<{ x: number; y: number; on: boolean; seen: boolean } | null>(null);
  const petPtr = useRef({ x: 0, y: 0, inside: false, down: false, moved: 0, stop: false });
  const handRef = useRef<SVGSVGElement>(null);
  /** 손 그림을 누른 자리에 바로 옮김 (화면 다시 그리기를 기다리지 않음 → 손가락을 안 늦게 따라옴) */
  const moveHand = (x: number, y: number) => { const h = handRef.current; if (h) { h.style.left = `${x}px`; h.style.top = `${y}px`; } };
  const squeeze = useRef({ held: false, burst: 0, stop: false });
  const aim = useRef({ on: false, sx: 0, sy: 0, x: 0, y: 0, shoot: false, cancel: false });
  const [treeDetail, setTreeDetail] = useState<TreeNote | null>(null);
  const treeApi = useRef<{ start: (strokes: Strokes, covered: boolean) => void; confirm: () => void; cancel: () => void; refresh: () => void } | null>(null);
  const mpRef = useRef<Multiplayer | null>(null);
  const audioRef = useRef<ParkAudio | null>(null);
  const [muted, setMuted] = useState(false);
  const [miniPref, setMiniOpen] = useState<boolean | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // 잠깐 뜨는 안내 문구 (setState·ref만 써서 항상 같은 함수)
  const sayRef = useRef((msg: string) => { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 2200); });

  const refreshMe = useRef(async () => {
    const r = await fetch("/api/me", { cache: "no-store" }).catch(() => null);
    if (r?.ok) { const m = await r.json() as MeInfo; setMsgOverrides(m.messages); if (m.starter) setTimeout(() => sayRef.current(msg("starter.got")), 2500); meRef.current = m; setMe(m); if (audioRef.current && m.sound) audioRef.current.levels = m.sound; }
    else if (r?.status === 401) location.replace("/"); // 관리자가 강제 로그아웃·삭제함 → 공원에서 나감
  });
  useEffect(() => {
    refreshMe.current();
    const alive = setInterval(() => { if (document.visibilityState === "visible") refreshMe.current(); }, 30_000);
    // 결제하고 돌아온 경우 (?charged=1000)
    const charged = Number(new URLSearchParams(location.search).get("charged"));
    if (charged > 0) { sayRef.current(msg("charge.done", { amount: charged.toLocaleString("ko-KR") })); history.replaceState(null, "", location.pathname); }
    return () => clearInterval(alive);
  }, []);

  useEffect(() => {
    const el = box.current!;
    const coarse = isCoarse();
    const q = coarse ? QUALITY_LOW : QUALITY_HIGH;

    const renderer = new THREE.WebGLRenderer({ antialias: !coarse });
    renderer.localClippingEnabled = true; // 강둑 너머 꽃잎 깔개 자르기용
    renderer.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.touchAction = "none";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // ?hour=19 처럼 주면 그 시각 하늘로 고정 (확인용)
    // 시간 미리보기 (관리자 화면에서 엶): ?time=HH:MM 또는 ?hour=13.5, ?date=YYYY-MM-DD
    const qs = new URLSearchParams(location.search);
    const tm = /^(\d{1,2}):(\d{2})$/.exec(qs.get("time") ?? ""), hourParam = Number(qs.get("hour"));
    const skyHour = tm ? (Number(tm[1]) + Number(tm[2]) / 60) % 24 : qs.has("hour") && Number.isFinite(hourParam) ? hourParam % 24 : undefined;
    const dateMs = /^\d{4}-\d{2}-\d{2}$/.test(qs.get("date") ?? "") ? Date.parse(`${qs.get("date")}T12:00:00+09:00`) : NaN;
    const world = buildWorld(scene, q, skyHour, Number.isFinite(dateMs) ? dateMs : undefined);
    const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
    const me = makeChar(preset);
    me.root.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
    scene.add(me.root);
    const petal = new CatchPetal(makePetalGeometry());
    scene.add(petal.group);
    const mat = makeMat(); mat.visible = false; scene.add(mat);
    const treeNotes = new TreeNotes(makePetalGeometry()); scene.add(treeNotes.group);
    // 소리: 첫 터치·키 입력 때 켜짐 (브라우저 정책)
    const audio = new ParkAudio(); audioRef.current = audio;
    Promise.resolve().then(() => setMuted(audio.muted)); // 이 기기에 저장된 켜기/끄기 표시
    if (meRef.current?.sound) audio.levels = meRef.current.sound;
    const wake = () => audio.start();
    window.addEventListener("pointerdown", wake); window.addEventListener("keydown", wake);
    const coin = new CoinGame(FT); scene.add(coin.group);
    const toy = new CatToy(); scene.add(toy.group);
    const churu = new ChuruStick(); scene.add(churu.group);
    // 동전 게임 카메라: 조준할 땐 내 뒤 위에서 맨 위 접시를 보고, 날아갈 땐 옆에서 동전을 따라감
    const coinCam = { on: false, eye: new THREE.Vector3(), look: new THREE.Vector3() };
    const refreshTree = async () => {
      const r = await fetch("/api/tree", { cache: "no-store" }).catch(() => null);
      if (r?.ok) treeNotes.set(await r.json() as TreeNote[]);
    };
    refreshTree();
    // 창구 직원들 (안내원·매점 직원)
    const npc = new Staff(NPC_LOOK, NPC.x, NPC.z, NPC_Y, NPC.yaw), npcLabel = nameSprite(NPC_NAME);
    const clerk = new Staff(CLERK_LOOK, CLERK.x, CLERK.z, CLERK.y, KIOSK.yaw);
    npcLabel.position.set(NPC.x, NPC_Y + npc.char.top + 0.5, NPC.z);
    scene.add(npc.char.root, clerk.char.root, npcLabel);
    let greeted = false;
    // 공원 고양이: 실시간 서버가 움직여 모두가 같은 고양이를 봄. 서버에 못 붙었을 땐 내 브라우저가 직접 움직임
    // 공원 고양이들 (늘 공원 어딘가에, 서로 다른 무늬). 접속 중이면 서버가, 혼자면 내 브라우저가 움직임
    const catViews: CatView[] = [], soloCats = new CatColony();
    let lastCats: CatState[] = [];
    const catOn = (s: { x: number; z: number }) => lastCats.some((c) => c.active && c.y > 0.4 && Math.hypot(c.x - s.x, c.z - s.z) < 0.4);

    const pos = { x: SPAWN.x, z: SPAWN.z };
    let yaw = SPAWN.yaw, camYaw = SPAWN.yaw, pitch = 0, footY = 0; // yaw = 캐릭터가 보는 쪽, camYaw = 카메라가 보는 쪽
    // 상태: 앉음 / 소원 비는 중 / 꽃잎 들고 있음
    const tree = { pending: null as { strokes: Strokes; covered: boolean } | null, ghost: null as THREE.Vector3 | null, busy: false };
    const st = { sitting: false, onMat: false, matColor: "pink" as MatColor,
      /** 돗자리에 앉아 있으면(내 것이든 같이 앉았든) 그 돗자리 가운데 → 카메라가 뒤에서 둘을 같이 보여 줌 */
      matAt: null as { x: number; z: number } | null,
      /** 쓰다듬는 고양이 자리 (카메라가 가까이 내려가 고양이 얼굴을 보여 줌) */
      petAt: null as { x: number; y: number; z: number } | null,
      /** 낚싯대 놀이 중: 나와 고양이 사이 (카메라가 뒤에서 둘을 같이 보여 줌) */
      playAt: null as { x: number; z: number } | null, photoAt: 0, photoUntil: 0, wishUntil: 0, holding: false, anim: "idle" as "idle" | "sit" | `sitmat:${string}` | "sitbench" | "wish" | "lie", now: 0, faceCam: false,
      /** 정자에 드러누움 (누운 몸 방향) */
      lying: false, lieYaw: 0,
      bench: null as BenchSeat | null, stoodAt: -9, waitRelease: false, camTurn: null as number | null, ladderArmed: true,
      /** 돗자리 같이 앉기를 물어보고 대답을 기다리는 중 */
      asking: null as { seat: MatSeat; until: number } | null,
      /** 동전 조준 중 / 성공해서 발 동동 하는 동안 (그 뒤에 소원) */
      aiming: false, stompUntil: 0, coinViewUntil: 0 };
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
    const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), focus = new THREE.Vector3();
    // camDist: 내가 휠·두 손가락으로 고른 카메라 거리(m, 0 = 1인칭). 안 골랐으면 관리자 기본값. 이 기기에 기억
    let camDist: number | null = (() => { try { const v = localStorage.getItem("camDist"); return v === null ? null : Math.min(8, Math.max(0, Number(v) || 0)); } catch { return null; } })();
    const adminBack = () => Math.max(0, (meRef.current?.controls?.cameraBackCm ?? 420) / 100);
    const chosenBack = () => camDist ?? adminBack();
    const vel = { x: 0, z: 0 }; let lastDragT = -9; // 걷는 속도(가속·감속), 마지막으로 끌어서 둘러본 때
    let baseFov = 60, firstPerson = false, zoomK = 1, camBack = 0; // camBack: 지금 카메라가 내 뒤로 떨어진 거리(부드럽게 따라감) // zoomK: 휠·두 손가락으로 당겨 보기(작을수록 확대)
    let matView = 0, lastMatAt = { x: 0, z: 0 }, petView = 0, lastPetAt = { x: 0, y: 0, z: 0 }; // 돗자리에 앉으면 1인칭 대신 뒤에서 둘이 같이 앉은 모습이 보이게 (0~1 부드럽게)
    let showMe = 0; // 0 = 1인칭, 1 = 소원 빌 때 내 얼굴 쪽에서 보는 3인칭 (그 사이는 부드럽게)
    const placeCamera = () => {
      // 뒤에서 보는 시점: 내 머리 뒤 조금 위에서, 내가 보는 쪽을 봄 → 화면 가운데 아래에 내 캐릭터가 살짝 보임
      // 앉아서 풍경 볼 땐(벤치·돗자리·잔디) 1인칭으로 — 내 몸이 풍경을 가리지 않게
      // (지연·흔들림 없이 바로 따라감 = 멀미 덜함. 관리자에서 뒤 거리를 0으로 하면 완전 1인칭)
      const fx = Math.sin(camYaw), fz = Math.cos(camYaw), cp = Math.cos(pitch), rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
      const at = st.bench ?? { x: pos.x, y: footY, z: pos.z }; // 벤치에 앉으면 좌판 위에서
      const eyeY = at.y + (st.lying ? 0.32 : (st.sitting ? EYE_SIT : EYE) * (preset.kid ? 0.76 : 1));
      const back = chosenBack(), side = (meRef.current?.controls?.cameraSideCm ?? 0) / 100;
      const room = back > 0.3 ? Math.min(back, cameraRoom(at.x, at.z, -fx, -fz, back + 0.4) - 0.3) : 0; // 나무·벽에 묻히지 않게
      const shoulder = room > 0.9 && !st.sitting; // 너무 가까워지면(벽 앞 등) 내 머리가 화면을 가리니 그때도 1인칭으로
      // 뒤 거리는 부드럽게: 나무에 막히면 빨리 당기고(묻히지 않게), 트이면 천천히 물러남 (카메라가 툭툭 튀지 않게)
      const wantBack = shoulder ? room : -0.25;
      camBack += (wantBack - camBack) * (wantBack < camBack ? 0.45 : 0.06);
      const dBack = camBack, up = THREE.MathUtils.clamp((camBack + 0.25) / 1.2, 0, 1) * 0.5 + Math.max(0, camBack - 1) * 0.17, sd = shoulder ? side : 0;
      const eye = new THREE.Vector3(at.x - fx * dBack + rx * sd, eyeY + up, at.z - fz * dBack + rz * sd);
      if (st.lying) eye.set(at.x - Math.sin(st.lieYaw) * 0.8, eyeY, at.z - Math.cos(st.lieYaw) * 0.8); // 누우면 눈은 머리 자리 (발 반대쪽)
      const look = eye.clone().setY(eyeY).add(new THREE.Vector3(fx * cp, -Math.sin(pitch), fz * cp).multiplyScalar(6));
      if (!st.lying) look.set(at.x + rx * sd, eyeY, at.z + rz * sd).add(new THREE.Vector3(fx * cp, -Math.sin(pitch), fz * cp).multiplyScalar(6));
      firstPerson = camBack < 0.35;
      // 돗자리: 돗자리 가운데 뒤 3.4m·위에서 내려다봄 (끌면 돗자리 둘레를 돎). 나무에 막히면 당겨 옴
      if (st.playAt) lastMatAt = st.playAt; else if (st.matAt) lastMatAt = st.matAt;
      matView += (((st.sitting && st.matAt && !st.lying) || st.playAt ? 1 : 0) - matView) * 0.07;
      if (matView > 0.001) {
        const c = lastMatAt, D = 3.4, d = THREE.MathUtils.clamp(cameraRoom(c.x, c.z, -fx, -fz, D + 0.4) - 0.3, 1.4, D), f = matView * matView * (3 - 2 * matView);
        // 기본은 돗자리를 내려다보는 각도, 위아래로 끌면(pitch) 그 자리에서 하늘·벚꽃 쪽이나 발밑으로 고개를 듦
        const ey = at.y + 1.75, vp = Math.atan2(ey - (at.y + 0.45), d + 1.4) + pitch, vc = Math.cos(vp);
        const me3 = new THREE.Vector3(c.x - fx * d, ey, c.z - fz * d);
        eye.lerp(me3, f);
        look.lerp(me3.clone().add(new THREE.Vector3(fx * vc, -Math.sin(vp), fz * vc).multiplyScalar(6)), f);
        if (matView > 0.3) firstPerson = false;
      }
      // 쓰다듬기: 고양이 앞 1.3m, 눈높이보다 조금 위에서 고양이 얼굴을 내려다봄 (내 손이 들어갈 자리)
      if (st.petAt) lastPetAt = st.petAt;
      petView += ((st.petAt ? 1 : 0) - petView) * 0.08;
      if (petView > 0.001) {
        const c = lastPetAt, toMe = Math.atan2(at.x - c.x, at.z - c.z), f = petView * petView * (3 - 2 * petView);
        eye.lerp(new THREE.Vector3(c.x + Math.sin(toMe) * 1.25, c.y + 0.85, c.z + Math.cos(toMe) * 1.25), f);
        look.lerp(new THREE.Vector3(c.x, c.y + 0.32, c.z), f);
        if (petView > 0.3) firstPerson = true; // 내 몸은 숨김 (손만 보이게)
      }
      if (showMe > 0.001) { // 소원 빌기: 캐릭터 정면에서 손 모은 모습 (앉아 있으면 앉은 자리에서)
        // 정면이 막혀 있으면(사다리·나무 앞 등) 비스듬한 쪽에서 — 너무 가까이 붙어 얼굴만 크게 나오지 않게
        const f = showMe * showMe * (3 - 2 * showMe), base = st.bench?.yaw ?? yaw, WANT = 2.8;
        let fy = base, d = 0;
        for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
          const r = Math.min(WANT, cameraRoom(at.x, at.z, Math.sin(base + off), Math.cos(base + off), WANT));
          if (r > d + 0.3) { d = r; fy = base + off; }
          if (d >= WANT - 0.05) break;
        }
        const sx = Math.sin(fy), sz = Math.cos(fy), low = st.sitting ? 0.35 : 0;
        eye.lerp(new THREE.Vector3(at.x + sx * d, at.y + 1.35 - low, at.z + sz * d), f);
        look.lerp(new THREE.Vector3(at.x, at.y + 0.95 - low, at.z), f);
      }
      if (st.aiming || coin.busy || st.now < st.coinViewUntil) {
        const dx = FT.x - pos.x, dz = FT.z - pos.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
        const ce = new THREE.Vector3(), cl = new THREE.Vector3();
        // 카메라는 늘 광장 안(둘레 벚나무에 가리지 않게)에 둠
        const R = PLAZA.r - 1.2, inPlaza = (x: number, z: number) => {
          const ox = x - FT.x, oz = z - FT.z, l = Math.hypot(ox, oz), k = l > R ? R / l : 1;
          return { x: FT.x + ox * k, z: FT.z + oz * k, cut: l - Math.min(l, R) };
        };
        if (st.aiming) { // 내 뒤 위에서 접시 안이 내려다보이게 (나무 쪽에 서 있으면 광장 안쪽으로 당기고 더 높이)
          const c = inPlaza(pos.x - ux * 4.2, pos.z - uz * 4.2);
          ce.set(c.x, FT.dish.y + 2.8 + c.cut * 0.45, c.z); cl.set(FT.x - ux * 0.8, FT.dish.y - 0.6, FT.z - uz * 0.8);
        } else { // 옆에서: 던진 곳과 접시 사이가 한 화면에. 양옆 중 트인 쪽(소원나무 반대쪽)에서
          const a = coin.from, mx = (a.x + FT.x) / 2, mz = (a.z + FT.z) / 2, side = Math.max(6, d * 0.9 + 3.5);
          const opts = [1, -1].map((sg) => inPlaza(mx - uz * side * sg, mz + ux * side * sg))
            .map((c) => ({ ...c, score: Math.hypot(c.x - WISH_TREE.x, c.z - WISH_TREE.z) - c.cut * 2 }));
          const c = opts[0].score >= opts[1].score ? opts[0] : opts[1];
          ce.set(c.x, 3.6 + c.cut * 0.5, c.z);
          cl.set(mx, 2.4, mz).lerp(coin.pos, coin.busy ? 0.35 : 0.5);
        }
        if (!coinCam.on) { coinCam.eye.copy(camPos); coinCam.look.copy(camLook); coinCam.on = true; }
        coinCam.eye.lerp(ce, 0.1); coinCam.look.lerp(cl, 0.14);
        eye.copy(coinCam.eye); look.copy(coinCam.look); firstPerson = false;
      } else coinCam.on = false;
      camPos.copy(eye); camLook.copy(look);
      // 벤치에 앉으면 살짝 줌인 → 강물과 건너편 벚꽃이 더 크게
      const wantFov = baseFov * zoomK * (st.bench && showMe < 0.5 ? 0.78 : 1);
      if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov += (wantFov - camera.fov) * 0.15; camera.updateProjectionMatrix(); }
      camera.position.copy(camPos); camera.lookAt(camLook);
    };
    placeCamera();

    const inp = new Input(renderer.domElement, coarse); input.current = inp;
    const screen = new THREE.Vector3(), tapRay = new THREE.Raycaster();
    const drawMini = createMinimap(mini.current!);
    const mp = new Multiplayer(scene);
    mp.onStatus = setNet;
    mpRef.current = mp;
    mp.onNote = (from) => { sayRef.current(msg("note.received", { from })); refreshMe.current(); };
    mp.onTreeChanged = refreshTree;
    // 돗자리 같이 앉기: 깐 사람은 허락/거절 창, 물어본 사람은 대답을 기다림
    mp.onMatAsk = (from, nickname) => { if (st.onMat) setMatAsk({ from, nickname }); else mp.answerMat(from, false); };
    mp.onMatAnswer = (ok, owner, ownerId) => {
      const a = st.asking; st.asking = null;
      if (!a || a.seat.ownerId !== ownerId) return;
      if (!ok) { sayRef.current(msg("mat.refused")); return; }
      const seat = mp.freeSeats().find((s) => s.ownerId === ownerId); // 그 사이 자리가 찼거나 일어났으면 못 앉음
      if (!seat || st.sitting || Math.hypot(seat.x - pos.x, seat.z - pos.z) > 3) { sayRef.current(msg("mat.joinFail", { owner })); return; }
      joinMat(seat);
    };
    matApi.current = {
      answer: (ok) => {
        setMatAsk((q) => {
          if (q) {
            mp.answerMat(q.from, ok);
            const kind = ok ? "wave" : "shake"; // 허락하면 웃으며 손 흔들흔들, 거절하면 단호하게 절레절레
            playGesture(me, kind, st.now); mp.sendGesture(kind);
            logClient(ok ? "mat.allowed" : "mat.refused", {});
          }
          return null;
        });
      },
    };
    // 같은 탭에서 10분 안에 다시 들어오면(충전하고 돌아오기·새로고침) 있던 자리에서 시작
    const RESUME = "park.resume", resume = (() => {
      try { const r = JSON.parse(sessionStorage.getItem(RESUME) ?? "null"); return r && Date.now() - r.at < 10 * 60_000 ? r as { x: number; z: number; yaw: number } : undefined; } catch { return undefined; }
    })();
    const saveSpot = () => { try { sessionStorage.setItem(RESUME, JSON.stringify({ x: pos.x, z: pos.z, yaw, at: Date.now() })); } catch {} };
    window.addEventListener("pagehide", saveSpot);
    mp.connect(resume);
    let synced = false;

    // ---------- 행동 ----------
    const stand = () => {
      if (!st.sitting) return;
      if (st.lying) { st.lying = false; pitch = 0; }
      st.sitting = false; st.onMat = false; st.matAt = null; mat.visible = false; setSitting(false); setMatAsk(null);
      if (st.bench) { st.bench = null; st.stoodAt = st.now; }
      logClient("sit.end", { x: Math.round(pos.x), z: Math.round(pos.z) });
    };
    // 내 돗자리 옆자리에 누가 앉아 있으면 그냥 일어나지 않고 먼저 물어봄 (확인하면 그 사람도 일어남)
    let packOpen = false;
    // 내 돗자리 옆자리: 다른 사람 화면에 보이는(서버) 내 자리 기준 (내 화면 위치는 망 지연만큼 살짝 다를 수 있어서), 넉넉히 0.9m 안
    const mySeat2 = () => { const m = mp.mine(); return m ? secondSeat(m.x, m.z, m.yaw) : secondSeat(pos.x, pos.z, yaw); };
    const askPack = () => {
      if (!st.sitting || !st.onMat) return false;
      const g = mp.matGuest(mySeat2());
      if (!g) return false;
      st.waitRelease = true; // 키를 뗄 때까지는 앉은 채로
      if (!packOpen) { packOpen = true; setPackAsk(g); }
      return true;
    };
    packApi.current = {
      yes: () => { const g = mp.matGuest(mySeat2()); if (g) mp.closeMat(g.id); packOpen = false; setPackAsk(null); stand(); sayRef.current(msg("mat.packed")); },
      no: () => { packOpen = false; setPackAsk(null); },
    };
    mp.onMatClosed = (owner) => { if (st.sitting && !st.onMat) { stand(); sayRef.current(msg("mat.packedByOwner", { owner })); } };
    // 벤치에 걸어 들어가면 자동으로 앉음: 돌아서 벤치가 보는 쪽(강)을 바라봄
    let benchNear: BenchSeat | null = null;
    const sitBench = (seat: BenchSeat) => {
      st.sitting = true; st.bench = seat; st.onMat = false; st.wishUntil = 0; st.waitRelease = true;
      setSitting(true); setMenu(null);
      pos.x = seat.fx; pos.z = seat.fz; yaw = seat.yaw; st.camTurn = seat.yaw; pitch = 0.08;
      logClient("sit.start", { x: Math.round(pos.x), z: Math.round(pos.z), bench: true });
    };
    actions.current = {
      // mat: 깔 돗자리 색 (null = 돗자리 없이, 안 주면 가진 돗자리 중 첫 번째)
      sit: (pick?: MatColor | null) => {
        setMenu(null);
        if (!canSit(pos.x, pos.z)) { sayRef.current(msg("sit.cannot")); return; }
        st.sitting = true; st.wishUntil = 0; setSitting(true);
        camYaw = yaw;
        if (groundY(pos.x, pos.z) > 0) { // 정자 마루에선 대자로 드러누워 천장(서까래)을 올려다봄
          st.lying = true; st.lieYaw = yaw; st.onMat = false; pitch = -1.12;
          logClient("sit.start", { x: Math.round(pos.x), z: Math.round(pos.z), onPavilion: true, lie: true });
          return;
        }
        // 돗자리가 있으면 잔디밭에선 깔고 앉음 (정자 마루에선 그냥 앉음)
        // 돗자리는 통째로 잔디 위일 때만 (길·광장에 걸치면 그냥 앉음)
        const mats = meRef.current?.items.mats ?? [], color = pick === undefined ? mats[0] : pick;
        st.onMat = !!color && mats.includes(color) && matFits(pos.x, pos.z, yaw);
        if (st.onMat && color) {
          st.matColor = color; st.matAt = matCenter(pos.x, pos.z, yaw); pitch = 0; // 돗자리 시점은 기본 각도에서 시작
          paintMat(mat, color); placeMat(mat, pos.x, pos.z, yaw); mat.visible = true;
          sayRef.current(msg("mat.laid", { color: MAT_COLOR_NAMES[color] }));
        } else if (color && groundY(pos.x, pos.z) === 0) sayRef.current(msg("mat.grassOnly")); // 정자 마루에선 안내 없이 그냥 앉음
        logClient("sit.start", { x: Math.round(pos.x), z: Math.round(pos.z), onPavilion: groundY(pos.x, pos.z) > 0, mat: st.onMat });
      },
      stand: () => { setMenu(null); if (!askPack()) stand(); },
      bench: () => { if (benchNear && !st.sitting) sitBench(benchNear); },
      // 사진: 카메라가 내 앞으로 돌아오고, 나는 카메라를 보며 브이 → 1.2초 뒤 찰칵 (서 있으면 몸을 돌려서 보던 풍경이 배경에 나오게)
      photo: () => {
        setMenu(null);
        if (st.photoAt || petting || feeding || st.playAt || st.aiming || tree.pending) return;
        if (!st.sitting) yaw = camYaw + Math.PI; // 카메라 쪽을 봄
        playGesture(me, "v", st.now); mp.sendGesture("v");
        st.faceCam = true; st.photoAt = st.now + 1.2; st.photoUntil = st.now + 2.4;
        logClient("photo.take", {});
      },
    };
    // 운세꽃잎 자격·간격은 서버가 정함 (하루 선착순·1인당 하루 한 번, 횟수는 잡았을 때만 셈). 1분마다 다시 확인
    const refreshWish = async () => {
      try {
        const r = await fetch("/api/petal", { cache: "no-store" });
        if (!r.ok) return;
        const w = await r.json() as { eligible: boolean; minIntervalSec: number; maxIntervalSec: number };
        petal.setSchedule(st.now, w.eligible, w.minIntervalSec, w.maxIntervalSec);
      } catch { /* 다음 확인 때 다시 */ }
    };
    refreshWish();
    const wishTimer = setInterval(refreshWish, 60_000);
    const claim = async (height: number) => {
      const r = await fetch("/api/petal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ height }) })
        .then((x) => x.json() as Promise<{ ok: boolean; reason?: string; fortune?: string }>).catch(() => null);
      if (r?.ok && r.fortune) { setFortune(r.fortune); audio.chime(); } // 꽃잎을 펼치면 오늘의 운세
      else sayRef.current(msg(r?.reason === "soldout" ? "petal.soldout" : r?.reason === "limit" ? "petal.limit" : "petal.retry"));
      refreshWish(); // 오늘 몫을 잡았거나 다 떨어졌으면 더는 안 보이게
    };

    const nearKiosk = () => Math.hypot(pos.x - KIOSK.x, pos.z - KIOSK.z) < 9;
    const nearFountain = () => Math.hypot(pos.x - FOUNTAIN.x, pos.z - FOUNTAIN.z) < 9;
    const nearTree = () => Math.hypot(pos.x - WISH_TREE.x, pos.z - WISH_TREE.z) < 8;
    // 소원 쪽지 쓰기 → 다 쓰면 사다리에 올라 달 자리를 고름
    const openTreeEditor = () => {
      setMenu(null);
      const me = meRef.current;
      if (!me) return;
      if ((me.items.noteSheets ?? 0) < 1) { sayRef.current(msg("tree.needNote")); return; }
      setPanel(null); setWriteTree(true); logClient("tree.open_editor", {});
    };
    // 분수 동전 게임: 분수를 바라보고 조준 → 당겼다 놓으면 그린 차감 후 동전이 날아감
    //  맨 위 작은 접시에 들어가면 발 동동 기뻐하고 소원, 빗나가면 아래 물에 떨어져 흔적으로 남음
    const AIM_YAW = 0.0025, AIM_PULL = () => window.innerHeight * 0.35;
    const hand = () => new THREE.Vector3(pos.x + Math.sin(yaw) * 0.3, footY + 1.25, pos.z + Math.cos(yaw) * 0.3);
    const aimShot = () => {
      const a = aim.current, pull = Math.min(1, Math.max(0, (a.y - a.sy) / AIM_PULL()));
      return { pull, vel: launchVelocity(yaw, -(a.x - a.sx) * AIM_YAW, pull) }; // 새총처럼: 왼쪽으로 당기면 오른쪽으로
    };
    const stopAim = () => { st.aiming = false; aim.current.on = false; coin.preview(null); coin.showTarget(false); setCoinAim(false); };
    const tossCoin = () => {
      setMenu(null);
      if (askPack()) return; // 내 돗자리에 손님이 있으면 먼저 물어봄 (확인하면 같이 일어남)
      if (coin.busy) return;
      if (st.sitting) stand();
      yaw = camYaw = Math.atan2(FOUNTAIN.x - pos.x, FOUNTAIN.z - pos.z); pitch = -0.12; // 분수 꼭대기 접시가 보이게
      const f = meRef.current?.fountain; if (f) coin.setRings(f.bullPct / 100, f.midPct / 100);
      st.aiming = true; setCoinAim(true); coin.showTarget(true);
      logClient("fountain.aim", {});
    };
    const shootCoin = async () => {
      const { pull, vel } = aimShot();
      if (pull < 0.08) { coin.preview(null); return; } // 살짝 건드린 건 다시 조준
      const from = hand(); stopAim();
      // 떨어질 곳·보상은 서버가 같은 식으로 다시 계산해서 정함 (화면 판정만 믿으면 보상을 속일 수 있어서)
      const r = await fetch("/api/fountain", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ from: { x: from.x, y: from.y, z: from.z }, vel: { x: vel.x, y: vel.y, z: vel.z } }) })
        .then((x) => x.json() as Promise<{ ok: boolean; reason?: string; shot: Shot; reward: number; capped: boolean }>).catch(() => null);
      if (!r?.ok) { sayRef.current(msg(r?.reason === "insufficient" ? "coin.noGreen" : "coin.fail")); return; }
      coinReward = { reward: r.reward, capped: r.capped };
      coin.launch(from, vel, r.shot); audio.jingle();
    };
    let coinReward = { reward: 0, capped: false };
    coin.onLand = (shot, at) => {
      const kind = shot.kind, { reward, capped } = coinReward;
      logClient("fountain.result", { hit: kind === "dish", ring: shot.ring });
      refreshMe.current(); // 보상 받은 그린 반영
      st.coinViewUntil = st.now + (kind === "dish" ? 0 : 1.8); // 빗나가면 떨어진 자리를 잠깐 보여 주고 돌아옴
      if (kind === "ground") { sayRef.current(msg("coin.out")); return; }
      audio.plop();
      if (kind !== "dish") { if (kind === "basin") world.addCoin(at.x, at.z); sayRef.current(msg("coin.miss")); return; }
      // 성공 (과녁·궤적 점은 바로 치움). 정중앙은 만세+펄쩍 & 큰 불꽃, 나머지는 발 동동 & 작은 불꽃 → 그다음 소원
      const bull = shot.ring === "bull", sec = bull ? 2.6 : 1.8;
      coin.hideGuides(); coin.burst(at, bull);
      const gesture = bull ? "cheer" : "stomp";
      playGesture(me, gesture, st.now); mp.sendGesture(gesture); st.faceCam = true; st.wishUntil = st.now + sec + WISH_SEC;
      const got = reward > 0 ? msg("coin.reward", { n: reward }) : capped ? msg("coin.capped") : "";
      sayRef.current(msg(bull ? "coin.bull" : shot.ring === "mid" ? "coin.mid" : "coin.outer", { reward: got }));
      if (bull) { audio.chime(); setTimeout(() => audio.chime(), 350); }
      setTimeout(() => { audio.chime(); st.stompUntil = 0; }, sec * 1000);
      setTimeout(() => sayRef.current(msg("wish.done")), (sec + WISH_SEC) * 1000);
      st.stompUntil = st.now + sec;
    };
    // 소원나무: 쪽지 쓰기 → 사다리 위에서 자리 고르기 → 달기
    treeApi.current = {
      start: (strokes, covered) => {
        tree.pending = { strokes, covered }; tree.ghost = null; treeNotes.showGhost(null);
        setWriteTree(false); setTreeMode("pick"); audio.ladder(); camYaw = Math.atan2(WISH_TREE.x - LADDER_TOP.x, WISH_TREE.z - LADDER_TOP.z);
      },
      confirm: async () => {
        if (!tree.pending || !tree.ghost || tree.busy) return;
        tree.busy = true;
        const r = await fetch("/api/tree", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...tree.pending, x: tree.ghost.x, y: tree.ghost.y, z: tree.ghost.z }) })
          .then((x) => x.json() as Promise<{ ok: boolean; reason?: string }>).catch(() => null);
        tree.busy = false;
        if (r?.ok) {
          tree.pending = null; treeNotes.showGhost(null); setTreeMode(null); audio.paper();
          await refreshTree(); mp.notifyTree(); refreshMe.current(); // 쪽지만 달고 소원 비는 동작은 없음
          sayRef.current(msg("tree.hung"));
        } else sayRef.current(msg(r?.reason === "daily_limit" ? "tree.dailyLimit" : r?.reason === "no_sheet" ? "tree.noSheet" : r?.reason === "bad_spot" ? "tree.badSpot" : "tree.fail"));
      },
      cancel: () => { tree.pending = null; tree.ghost = null; treeNotes.showGhost(null); setTreeMode(null); },
      refresh: refreshTree,
    };
    const nearNpc = () => Math.hypot(pos.x - NPC.x, pos.z - NPC.z) < 6;
    const openInfo = () => { setMenu(null); setPanel("info"); logClient("info.open", {}); };
    const talkers = [
      { x: NPC.x, z: NPC.z, armed: true, t: 0, open: openInfo },
      { x: CLERK.x, z: CLERK.z, armed: true, t: 0, open: () => { setMenu(null); setPanel("shop"); logClient("shop.open", { by: "approach" }); } },
    ];
    // 다른 사람 돗자리의 빈 옆자리: 1.6m 안이면 같이 앉을 수 있음
    const nearSeat = () => mp.freeSeats().find((s) => Math.hypot(s.x - pos.x, s.z - pos.z) < 1.6);
    // 같이 앉기 = 먼저 깐 사람에게 물어봄 (대답은 mp.onMatAnswer)
    const askJoin = (seat: MatSeat) => {
      setMenu(null);
      if (st.asking && st.now < st.asking.until) { sayRef.current(msg("mat.waiting", { owner: st.asking.seat.owner })); return; }
      st.asking = { seat, until: st.now + 20 };
      mp.askMat(seat.ownerId);
      sayRef.current(msg("mat.asked", { owner: seat.owner }));
      logClient("mat.ask", {});
    };
    const joinMat = (seat: MatSeat) => {
      setMenu(null);
      pos.x = seat.x; pos.z = seat.z; yaw = camYaw = seat.yaw; // 바로 옆이라 서버 이동 판정 안에서 따라옴
      st.sitting = true; st.onMat = false; st.wishUntil = 0; setSitting(true);
      st.matAt = { x: seat.x + Math.cos(seat.yaw) * SEAT_GAP / 2, z: seat.z - Math.sin(seat.yaw) * SEAT_GAP / 2 }; // 내 왼쪽(깐 사람 쪽)으로 반 칸
      pitch = 0;
      sayRef.current(msg("mat.joined", { owner: seat.owner }));
      logClient("sit.start", { x: Math.round(pos.x), z: Math.round(pos.z), joinedMatOf: seat.owner });
    };
    const openMenu = (tap: Tap, onlyActionable = false, onMe = false) => {
      const sheets = meRef.current?.items.noteSheets ?? 0;
      const shopItem: MenuItem[] = nearKiosk() ? [{ label: msg("menu.shop"), run: () => setPanel("shop") }]
        : nearNpc() ? [{ label: msg("menu.npc"), run: openInfo }]
        : nearTree() ? [sheets < 1 ? { label: msg("menu.treeNeedNote") }
          : { label: msg("menu.tree", { n: sheets }), run: openTreeEditor }]
        : nearFountain() ? [{ label: msg("menu.coin", { price: meRef.current?.fountainPrice ?? 10 }), run: tossCoin }] : [];
      const seat = !st.sitting ? nearSeat() : undefined;
      const items: MenuItem[] = shopItem.length && !st.sitting ? shopItem : [];
      if (onMe) items.unshift({ label: msg("menu.bag"), run: () => { refreshMe.current(); setPanel("bag"); } }, { label: msg("photo.button"), run: () => actions.current?.photo() }, ...callItems()); // 내 캐릭터를 누르면: 가방, 이름 지어 준 고양이 부르기
      if (seat) items.push({ label: msg("menu.joinMat", { owner: seat.owner }), run: () => askJoin(seat) });
      items.push(...(st.sitting ? [] // 일어나기는 걷기만 하면 됨 (방향키·조이스틱)
        : canSit(pos.x, pos.z) ? (() => {
          // 돗자리가 있고 여기 펼 수 있으면: 어떤 돗자리를 깔지 고름 (+ 그냥 앉기)
          const mats = meRef.current?.items.mats ?? [];
          if (groundY(pos.x, pos.z) > 0) return [{ label: msg("menu.lie"), run: () => actions.current!.sit() }];
          if (!mats.length || !matFits(pos.x, pos.z, yaw)) return [{ label: msg("menu.sit"), run: () => actions.current!.sit() }];
          return [...mats.map((c) => ({ label: msg("menu.matSit", { color: MAT_COLOR_NAMES[c] }), tile: matPreview(c), run: () => actions.current!.sit(c) })),
            { label: msg("menu.noMat"), tile: "none", run: () => actions.current!.sit(null) }];
        })()
        : [{ label: msg("menu.cannotSit") }]));
      if (onlyActionable && !items.some((i) => i.run)) { setMenu(null); return; }
      setMenu({ x: tap.x, y: tap.y, items: onlyActionable ? items.filter((i) => i.label !== msg("menu.cannotSit")) : items });
    };
    // ---------- 고양이: 누르면(좌클릭·우클릭·톡) 고양이 메뉴 → 쓰다듬기·츄르·낚싯대·이름 ----------
    refreshBonds.current();
    const pickCat = (tap: Tap, rect: DOMRect) => {
      let best: { v: CatView; px: number } | null = null;
      for (const v of catViews) {
        const p = v.pos; if (!p) continue;
        screen.set(p.x, p.y + 0.22, p.z).project(camera);
        if (screen.z > 1) continue;
        const px = Math.hypot(rect.left + (screen.x + 1) / 2 * rect.width - tap.x, rect.top + (1 - screen.y) / 2 * rect.height - tap.y);
        const far = Math.hypot(p.x - pos.x, p.z - pos.z);
        if (px < Math.max(28, 70 - far * 3) && (!best || px < best.px)) best = { v, px };
      }
      return best?.v ?? null;
    };
    const catDist = (v: CatView) => { const p = v.pos; return p ? Math.hypot(p.x - pos.x, p.z - pos.z) : Infinity; };
    const petCat = async (v: CatView) => {
      setMenu(null);
      if (askPack()) return; // 내 돗자리에 손님이 있으면 먼저 물어봄 (확인하면 같이 일어남)
      const cat = v.catLook;
      if (catDist(v) > 3) { sayRef.current(msg("cat.closer")); return; }
      const r = await fetch("/api/cats", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cat, act: "pet" }) })
        .then((x) => x.json() as Promise<{ outcome: CatReaction }>).catch(() => null);
      if (!r?.outcome) return;
      refreshBonds.current();
      const react = (k: CatReaction) => mp.online ? mp.catPet(cat, k) : soloCats.brains.find((b) => b.s.look === cat)?.react(k, pos);
      if (r.outcome === "flee") { react("flee"); sayRef.current(msg("cat.flee")); return; }
      // 친한 고양이: 그 자리에 앉아 기다리고, 내 손으로 직접 쓰다듬음 (아주 친하면 고로롱)
      react("pet");
      if (st.sitting) stand();
      const p = v.pos!; yaw = camYaw = Math.atan2(p.x - pos.x, p.z - pos.z);
      st.petAt = { ...p }; st.playAt = { x: (pos.x + p.x) / 2, z: (pos.z + p.z) / 2 }; // playAt: 몸이 카메라 쪽으로 돌지 않게
      petting = { v, cat, purr: r.outcome === "rub", t: 0, idle: 0, stroke: 0, rubAt: -9, purrAt: 0, done: false };
      petPtr.current = { x: innerWidth / 2, y: innerHeight / 2, inside: false, down: false, moved: 0, stop: false };
      setPetUi({ x: innerWidth / 2, y: innerHeight * 0.7, on: false, seen: false });
      sayRef.current(msg("pet.hint"));
    };
    let petting: null | { v: CatView; cat: number; purr: boolean; t: number; idle: number; stroke: number; rubAt: number; purrAt: number; done: boolean } = null;
    const endPet = (why: string) => {
      if (!petting || petting.done) return;
      const p = petting; p.done = true; petting = null; p.v.pet = null;
      if (mp.online) mp.catPet(p.cat, "petEnd"); else soloCats.brains.find((b) => b.s.look === p.cat)?.react("petEnd", pos);
      st.petAt = null; st.playAt = null; setPetUi(null);
      sayRef.current(why);
    };
    const petRay = new THREE.Raycaster();
    const updatePet = (dt: number, walking: boolean, rect: DOMRect) => {
      if (!petting || petting.done) return;
      const P = petting, ptr = petPtr.current, cp = P.v.pos;
      if (walking || ptr.stop || !cp || catDist(P.v) > 4) { endPet(msg(ptr.stop ? "pet.done" : "pet.away")); return; }
      P.t += dt;
      // 고양이 머리 자리와 크기를 화면 위에서: 손이 머리 근처(반지름 1.7배 안)면 닿은 것
      const head = new THREE.Vector3(cp.x, cp.y + 0.42, cp.z), top = head.clone().add(new THREE.Vector3(0, 0.16, 0));
      const hs = head.clone().project(camera), ts = top.clone().project(camera);
      const hx = rect.left + (hs.x + 1) / 2 * rect.width, hy = rect.top + (1 - hs.y) / 2 * rect.height;
      const r = Math.max(20, Math.abs(rect.top + (1 - ts.y) / 2 * rect.height - hy));
      const dx = (ptr.x - hx) / r, dy = (ptr.y - hy) / r, near = Math.hypot(dx, dy * 0.8) < 1.7;
      const touching = ptr.inside && (ptr.down || !coarse) && near;
      // 손이 있는 곳(월드): 고양이 얼굴 앞 0.6m(카메라 쪽)에서 화면을 마주 보는 판 위
      // (머리를 지나는 판으로 하면 손이 얼굴 정면일 때 볼 곳이 머리 속이 돼서 고양이가 엉뚱하게 옆을 봄)
      petRay.setFromCamera(new THREE.Vector2(((ptr.x - rect.left) / rect.width) * 2 - 1, -((ptr.y - rect.top) / rect.height) * 2 + 1), camera);
      const toCam = camera.getWorldDirection(new THREE.Vector3()).negate();
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(toCam, head.clone().addScaledVector(toCam, 0.6));
      const at = petRay.ray.intersectPlane(plane, new THREE.Vector3()) ?? head;
      P.v.pet = { at: { x: at.x, y: at.y, z: at.z }, dx: THREE.MathUtils.clamp(dx, -1, 1), dy: THREE.MathUtils.clamp(dy, -1, 1), touching };
      // 문지르면 고로롱 (아주 친한 고양이만), 한참 안 만지면 끝
      // 움직인 거리를 모아서 6px 넘을 때마다 '문지름'으로 침 (한 장면 안에서만 재면 천천히 쓰다듬을 땐 안 쳐져서 안 끝났음)
      if (!touching) ptr.moved = 0; else if (ptr.moved > 6) { P.rubAt = P.t; ptr.moved = 0; }
      const rubbing = touching && P.t - P.rubAt < 0.35;
      P.idle = touching ? 0 : P.idle + dt;
      if (P.purr && rubbing && P.t > P.purrAt) { audio.purr(); P.purrAt = P.t + 2.6; }
      // 충분히 문질러 주면 저절로 끝 (관리자 설정 초), 한참 손을 안 대도 끝
      if (rubbing) P.stroke += dt;
      const rules = bondsRef.current?.rules;
      if (P.stroke >= (rules?.petStrokeSec ?? 4)) { audio.purr(); endPet(msg("pet.done")); return; }
      if (P.idle > (rules?.petIdleSec ?? 6)) { endPet(msg("pet.done")); return; }
      if (Math.floor(P.t * 20) !== Math.floor((P.t - dt) * 20)) setPetUi({ x: ptr.x, y: ptr.y, on: touching, seen: ptr.inside });
    };
    // ---------- 츄르: 내가 직접 꾹꾹 짜 줌 (누를 때마다 쭉, 누르고 있으면 계속 → 고양이가 할짝할짝, 다 짜면 부비부비) ----------
    let feeding: null | { v: CatView; cat: number; paste: number; pulse: number; done: boolean } = null;
    const churuTip = new THREE.Vector3();
    const endFeed = (why: string) => {
      if (!feeding || feeding.done) return;
      const f = feeding; f.done = true; feeding = null;
      if (mp.online) mp.catPet(f.cat, "eatEnd"); else soloCats.brains.find((b) => b.s.look === f.cat)?.react("eatEnd", pos);
      churu.visible = false; setSqueezeUi(null); st.playAt = null; camYaw = yaw;
      sayRef.current(why);
    };
    // 옆에서 보는 카메라 자리: 나무 기둥이 가리지 않는 쪽을 고름 (오른쪽·왼쪽 옆을 먼저, 막히면 조금씩 돌려 봄)
    const clearSide = (c: { x: number; z: number }, face: number) => {
      // 카메라가 설 자리(3.4m 뒤)가 벚나무 꽃 덩어리 안이면(기둥에서 2.6m 안) 꽃잎에 파묻혀 안 보임 → 그런 쪽도 피함
      const inCrown = (a: number) => COLLIDERS.some((k) => k.t === "c" && k.r >= 0.4 && Math.hypot(c.x - Math.sin(a) * 3.4 - k.x, c.z - Math.cos(a) * 3.4 - k.z) < 2.6);
      let best = face + 1.4, score = -1;
      for (const off of [1.4, -1.4, 1.0, -1.0, 1.8, -1.8, 0.6, -0.6, 2.4, -2.4, 3.1]) {
        const a = face + off, r = cameraRoom(c.x, c.z, -Math.sin(a), -Math.cos(a), 3.8), crown = inCrown(a);
        if (r >= 3.7 && !crown) return a;
        const sc = r - (crown ? 2 : 0);
        if (sc > score) { score = sc; best = a; }
      }
      return best;
    };
    const feedCat = async (v: CatView) => {
      setMenu(null);
      if (askPack()) return; // 내 돗자리에 손님이 있으면 먼저 물어봄 (확인하면 같이 일어남)
      const cat = v.catLook;
      if (catDist(v) > 3) { sayRef.current(msg("cat.closer")); return; }
      // 가까이(질투 거리 안)에서 지켜본 다른 고양이들 → 서버가 정든 고양이만 골라 질투시킴
      const saw = catViews.filter((o) => o !== v && o.pos && catDist(o) < 8).map((o) => o.catLook);
      const r = await fetch("/api/cats", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cat, act: "feed", saw }) })
        .then((x) => x.json() as Promise<{ ok: boolean; reason?: string; waitMin?: number; jealous?: number[] }>).catch(() => null);
      if (!r?.ok) { sayRef.current(r?.reason === "full" ? msg("churu.full") : r?.reason === "cooldown" ? msg("churu.cooldown", { min: r.waitMin ?? 1 }) : msg(r?.reason === "no_churu" ? "churu.none" : "churu.fail")); return; }
      const react = (c: number, k: CatReaction) => mp.online ? mp.catPet(c, k) : soloCats.brains.find((b) => b.s.look === c)?.react(k, pos);
      react(cat, "eat");
      if (st.sitting) stand();
      const p = v.pos!; yaw = Math.atan2(p.x - pos.x, p.z - pos.z); camYaw = clearSide({ x: (pos.x + p.x) / 2, z: (pos.z + p.z) / 2 }, yaw); pitch = 0.1; // 옆에서 나와 고양이를 같이 (나무에 안 가리는 쪽)
      st.playAt = { x: (pos.x + p.x) / 2, z: (pos.z + p.z) / 2 }; // 바로 세워야 다음 장면에 몸이 카메라 쪽으로 돌지 않음
      feeding = { v, cat, paste: 1, pulse: 0, done: false }; churu.visible = true; squeeze.current = { held: false, burst: 0, stop: false };
      setSqueezeUi({ paste: 1 });
      sayRef.current(msg("churu.hint"));
      for (const j of r.jealous ?? []) react(j, "huff");
      if (r.jealous?.length) {
        const jn = bondsRef.current?.cats[r.jealous[0]]?.name;
        setTimeout(() => sayRef.current(msg("cat.jealous", { name: jn ? nameGa(jn) : msg("cat.jealousSomeone") })), 3000);
      }
      refreshMe.current(); refreshBonds.current();
    };
    const updateFeed = (dt: number, walking: boolean) => {
      if (!feeding || feeding.done) return;
      const f = feeding, s = squeeze.current;
      if (walking || s.stop || !f.v.pos || catDist(f.v) > 6) { endFeed(msg(s.stop ? "churu.stopped" : "churu.away")); return; }
      const push = s.burst + (s.held ? 0.16 * dt : 0); s.burst = 0; // 한 번 꾹 = 한 덩이, 누르고 있으면 조금씩 계속
      f.paste = Math.max(0, f.paste - push); f.pulse = Math.min(1, f.pulse + push * 8) * Math.exp(-dt * 3);
      const cp = f.v.pos!, toMe = Math.atan2(pos.x - cp.x, pos.z - cp.z);
      const tip = new THREE.Vector3(cp.x + Math.sin(toMe) * 0.2, cp.y + 0.24, cp.z + Math.cos(toMe) * 0.2); // 고양이 입 앞
      const hand = new THREE.Vector3(pos.x + Math.sin(yaw) * 0.35 - Math.cos(yaw) * 0.15, footY + 0.85, pos.z + Math.cos(yaw) * 0.35 + Math.sin(yaw) * 0.15);
      churu.update(hand, tip, f.paste, f.pulse); churuTip.copy(tip);
      st.playAt = { x: (pos.x + cp.x) / 2, z: (pos.z + cp.z) / 2 };
      if (Math.floor(st.now * 10) !== Math.floor((st.now - dt) * 10)) setSqueezeUi({ paste: f.paste });
      if (f.paste <= 0) { audio.purr(); endFeed(msg("churu.done", { name: (() => { const n = bondsRef.current?.cats[f.cat]?.name; return n ? nameGa(n) : msg("cat.someone"); })() })); }
    };

    // ---------- 낚싯대 놀이 ----------
    // 앞뒤·좌우로 끌어 막대를 움직이면 줄 끝 깃털이 살랑살랑 → 적당한 빠르기로 흔들면 흥미가 참
    // 흥미가 60% 넘으면 고양이가 엉덩이를 씰룩이다 덮침 → 그 순간 확 당기면 놓침(약 올리기, 흥미는 더 오름), 가만있으면 잡힘
    // 흥미 100%면 피할 수 없음. 3번 잡으면 뒹굴뒹굴
    // ponytail: 손맛 숫자는 코드 값. 운영하며 자주 바꾸게 되면 관리자 설정으로
    const PLAY = { goodMin: 0.5, goodMax: 2.4, fast: 3.2, rise: 0.2, tooFast: 0.3, idle: 0.12, ready: 0.6, dodge: 0.55, catches: 3, leap: 0.55 };
    let play: null | { v: CatView; cat: number; interest: number; phase: "watch" | "crouch" | "pounce"; phaseT: number; catches: number; t: number;
      side: number; dist: number; speed: number; idleT: number; readyT: number; crouchFor: number; target: THREE.Vector3 | null; dodged: boolean; sure: boolean;
      last: THREE.Vector3 | null; sentAt: number; done: boolean; boost: number } = null;
    const toyTip = () => { // 막대 끝: 내 앞 dist m, 좌우 side m, 무릎 높이
      const f = { x: Math.sin(yaw), z: Math.cos(yaw) }, r = { x: -Math.cos(yaw), z: Math.sin(yaw) }, p = play!;
      return new THREE.Vector3(pos.x + f.x * p.dist + r.x * p.side, footY + 0.95, pos.z + f.z * p.dist + r.z * p.side);
    };
    const sendPlay = (phase: PlayPhase, at = toy.end) => {
      if (!play) return;
      if (mp.online) mp.catPlay(play.cat, phase, at.x, at.z); else soloCats.brains.find((b) => b.s.look === play!.cat)?.play(phase, { x: at.x, z: at.z });
    };
    const startPlay = async (v: CatView) => {
      setMenu(null);
      if (askPack()) return; // 내 돗자리에 손님이 있으면 먼저 물어봄 (확인하면 같이 일어남)
      if (catDist(v) > 4) { sayRef.current(msg("cat.closer")); return; }
      const r = await fetch("/api/cats", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cat: v.catLook, act: "play" }) })
        .then((x) => x.json() as Promise<{ ok: boolean; usesLeft?: number; hearts?: number }>).catch(() => null);
      if (!r?.ok) { sayRef.current(msg("rod.none")); return; }
      if (st.sitting) stand();
      const p = v.pos!; yaw = Math.atan2(p.x - pos.x, p.z - pos.z); camYaw = clearSide({ x: (pos.x + p.x) / 2, z: (pos.z + p.z) / 2 }, yaw); pitch = 0; // 몸은 고양이 쪽, 카메라는 옆에서 (나·깃털·고양이가 다 보이게, 나무에 안 가리는 쪽)
      st.playAt = { x: (pos.x + p.x) / 2, z: (pos.z + p.z) / 2 }; // 바로 세워야 다음 장면에 몸이 카메라 쪽으로 돌지 않음
      // 친한 고양이일수록 흥미가 빨리 참 (하트 하나에 15%씩)
      play = { v, cat: v.catLook, interest: 0.15, phase: "watch", phaseT: 0, catches: 0, t: 0, side: 0, dist: 1.2, speed: 0, idleT: 0, readyT: 0, crouchFor: 1,
        target: null, dodged: false, sure: false, last: null, sentAt: 0, done: false, boost: 1 + (r.hearts ?? 0) * 0.15 };
      toy.visible = true; toyDrag.current = { on: false, x: 0, y: 0, dx: 0, dy: 0, stop: false };
      setPlayUi({ interest: 0.15, phase: "watch", catches: 0, speed: 0 });
      sayRef.current(msg(r.usesLeft === 0 ? "rod.worn" : "rod.start"));
      refreshMe.current();
    };
    const endPlay = async (success: boolean, why: string) => {
      if (!play || play.done) return;
      const p = play; p.done = true;
      sendPlay(success ? "roll" : "end");
      toy.visible = false; setPlayUi(null); play = null; st.playAt = null; pitch = 0; camYaw = yaw;
      const saw = catViews.filter((o) => o !== p.v && o.pos && catDist(o) < 8).map((o) => o.catLook);
      const r = await fetch("/api/cats", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cat: p.cat, act: "played", success, saw }) })
        .then((x) => x.json() as Promise<{ ok: boolean; jealous?: number[] }>).catch(() => null);
      const name = bondsRef.current?.cats[p.cat]?.name;
      sayRef.current(success ? msg("rod.rolled", { name: name ? nameGa(name) : msg("cat.someone") }) : why);
      if (success) { audio.chime(); for (const j of r?.jealous ?? []) { if (mp.online) mp.catPet(j, "huff"); else soloCats.brains.find((b) => b.s.look === j)?.react("huff", pos); } }
      if ((meRef.current?.items.rod ?? 1) <= 0) setTimeout(() => sayRef.current(msg("rod.broke")), 2600);
      refreshMe.current(); refreshBonds.current();
    };
    const updatePlay = (dt: number, walking: boolean) => {
      if (!play || play.done || play.catches >= PLAY.catches) return; // 세 번 잡으면 뒹굴기만
      const p = play, d = toyDrag.current;
      if (walking || d.stop || !p.v.pos || catDist(p.v) > 9) { void endPlay(false, msg(d.stop ? "rod.putDown" : "rod.quit")); return; }
      p.t += dt; p.phaseT += dt;
      p.side = THREE.MathUtils.clamp(p.side + d.dx, -1.3, 1.3); p.dist = THREE.MathUtils.clamp(p.dist + d.dy, 0.5, 2.4); d.dx = d.dy = 0;
      const hand = new THREE.Vector3(pos.x + Math.sin(yaw) * 0.3 - Math.cos(yaw) * 0.18, footY + 1.0, pos.z + Math.cos(yaw) * 0.3 + Math.sin(yaw) * 0.18);
      toy.update(hand, toyTip(), footY, dt);
      const e = toy.end;
      // 깃털 빠르기 (바닥 기준): 줄 끝이 실제로 움직인 만큼, 0.2초쯤으로 고르게
      const inst = p.last ? Math.hypot(e.x - p.last.x, e.z - p.last.z) / Math.max(dt, 1e-3) : 0; p.last = e.clone();
      p.speed += (inst - p.speed) * (1 - Math.exp(-dt * 5));
      const good = p.speed > PLAY.goodMin && p.speed < PLAY.goodMax;
      p.idleT = p.speed > PLAY.goodMin ? 0 : p.idleT + dt;
      if (p.phase === "watch") { // 씰룩·덮치는 동안엔 확 당겨도 흥미가 깎이지 않음 (약 올리기)
        if (p.speed > PLAY.fast) p.interest -= PLAY.tooFast * dt;            // 너무 마구 흔들면 시큰둥
        else if (good) p.interest += PLAY.rise * p.boost * dt;               // 살랑살랑 → 흥미 쑥
        else if (p.idleT > 0.6) p.interest -= PLAY.idle * dt;                // 한참 가만히 두면 식음
        p.interest = THREE.MathUtils.clamp(p.interest, 0, 1);
      }
      if (p.phase === "watch") {
        if (p.interest <= 0 && p.t > 5) { void endPlay(false, msg("rod.bored")); return; }
        p.readyT = p.interest >= PLAY.ready ? p.readyT + dt : 0;           // 흥미 60%부터 잠깐 지켜보다 씰룩 (높을수록 빨리) → 100% 되기 전에도 덤벼듦
        if (p.interest >= 1 || p.readyT > 0.4 + (1 - p.interest) * 1.5) {
          p.phase = "crouch"; p.phaseT = 0; p.dodged = false; p.crouchFor = 0.8 + Math.random() * 0.7; sendPlay("crouch");
          sayRef.current(msg(p.interest >= 1 ? "rod.sure" : "rod.crouch"));
        }
      } else if (p.phase === "crouch") {
        if (p.phaseT > p.crouchFor - 0.25 && p.speed > PLAY.goodMax) p.dodged = true; // 덤비기 직전에 확 당겨도 놓침
        if (p.phaseT > p.crouchFor) { // 덮침! 그 순간 깃털 자리로
          p.sure = p.interest >= 1; p.dodged = p.dodged && !p.sure;
          p.phase = "pounce"; p.phaseT = 0; p.target = e.clone(); sendPlay("pounce", p.target);
        }
      } else { // 덮치는 중: 확 당기면(빠르기가 '너무 빨라요'로 치솟거나 깃털이 멀어지면) 놓침. 흥미 100%면 못 피함
        if (!p.sure && (p.speed > PLAY.goodMax || (p.target && Math.hypot(e.x - p.target.x, e.z - p.target.z) > PLAY.dodge))) p.dodged = true;
        if (p.phaseT > PLAY.leap) {
          if (p.dodged) { p.interest = Math.min(0.97, p.interest + 0.15); sayRef.current(msg("rod.dodged")); }
          else {
            p.catches++; audio.pop(); p.interest = 0.5;
            sayRef.current(p.catches >= PLAY.catches ? msg("rod.caughtAll") : msg("rod.caught", { n: p.catches, max: PLAY.catches }));
            if (p.catches >= PLAY.catches) setTimeout(() => void endPlay(true, ""), 900);
          }
          p.phase = "watch"; p.phaseT = 0; p.readyT = 0; p.dodged = false; sendPlay("watch");
        }
      }
      if (p.t - p.sentAt > 0.12 && p.phase !== "pounce") { p.sentAt = p.t; sendPlay(p.phase); } // 깃털 자리를 고양이에게 계속 알려 줌
      const cp = p.v.pos!; st.playAt = { x: (pos.x + cp.x) / 2, z: (pos.z + cp.z) / 2 };
      if (Math.floor(p.t * 10) !== Math.floor((p.t - dt) * 10)) setPlayUi({ interest: p.interest, phase: p.phase, catches: p.catches, speed: p.speed });
    };
    const catTap = (v: CatView, tap: Tap) => {
      const b = bondsRef.current, me = b?.cats[v.catLook], hearts = me?.hearts ?? 0, canName = !!b && hearts >= b.rules.nameHearts;
      const items: MenuItem[] = [{ label: `${me?.name ?? msg("cat.unnamed")}  ${heartText(hearts)}`, head: true }];
      items.push({ label: msg("menu.pet"), run: () => void petCat(v) }); // 좌클릭·우클릭·톡 모두 메뉴 (모르고 눌러 쓰다듬지 않게)
      const churu = meRef.current?.items.churu ?? 0;
      items.push({ label: churu ? msg("menu.churu", { n: churu }) : msg("menu.churuNone"), tile: churuIcon(), badge: String(churu), dim: !churu,
        run: churu ? () => void feedCat(v) : () => sayRef.current(msg("cat.buyChuru")) });
      const rod = meRef.current?.items.rod ?? 0;
      items.push({ label: rod ? msg("menu.rod", { n: rod }) : msg("menu.rodNone"), tile: rodIcon(), badge: String(rod), dim: !rod,
        run: rod ? () => void startPlay(v) : () => sayRef.current(msg("cat.buyRod")) });
      items.push(canName
        ? { label: msg(me?.name ? "menu.rename" : "menu.name"), run: () => { setMenu(null); setNameFor({ cat: v.catLook, name: me?.name ?? "" }); } }
        : { label: msg("menu.nameLocked", { n: b?.rules.nameHearts ?? 3 }) });
      setMenu({ x: tap.x, y: tap.y, items });
    };
    // ---------- 고양이 부르기: 내 캐릭터 우클릭 → 이름 지어 준(오늘 공원에 있는) 고양이 ----------
    const pickMe = (tap: Tap, rect: DOMRect) => {
      if (!me.root.visible) return false;
      screen.set(pos.x, footY + 0.8, pos.z).project(camera);
      return screen.z < 1 && Math.hypot(rect.left + (screen.x + 1) / 2 * rect.width - tap.x, rect.top + (1 - screen.y) / 2 * rect.height - tap.y) < 70;
    };
    const catsHere = () => new Set((mp.online ? mp.cats() : soloCats.states).filter((c) => c.active).map((c) => c.look));
    const callItems = (): MenuItem[] => {
      const b = bondsRef.current, named = b?.cats.filter((c) => c.name) ?? [], here = catsHere();
      if (!b || !named.length) return [{ label: msg("call.noneNamed") }];
      const today = named.filter((c) => here.has(c.cat));
      if (!today.length) return [{ label: msg("call.noneToday") }];
      return today.map((c) => c.hearts >= b.rules.nameHearts
        ? { label: msg("menu.call", { name: nameI(c.name!) }), run: () => void callCat(c.cat, c.name!) }
        : { label: msg("menu.callCold", { name: c.name! }) });
    };
    const callCat = async (cat: number, name: string) => {
      setMenu(null);
      const r = await fetch("/api/cats", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cat, act: "call" }) })
        .then((x) => x.json() as Promise<{ ok: boolean; reason?: string; waitSec?: number; comes?: boolean; ticket?: string }>).catch(() => null);
      if (!r?.ok) { sayRef.current(r?.reason === "cooldown" ? msg("call.cooldown", { sec: r.waitSec ?? 0 }) : msg("call.cannot")); return; }
      playGesture(me, "wave", st.now); mp.sendGesture("wave");
      sayRef.current(msg("call.shout", { name: name + (batchim(name) ? "아" : "야") }));
      if (mp.online && r.ticket) mp.catCall(r.ticket);
      else setTimeout(() => { // 혼자일 땐 바로 판정
        if (r.comes) soloCats.brains.find((x) => x.s.look === cat)?.react("come", { x: pos.x, z: pos.z });
        mp.onCatCall?.(cat, r.comes ? "came" : "ignored", "");
      }, 1500);
    };
    mp.onCatCall = (cat, result, to) => {
      const n = bondsRef.current?.cats[cat]?.name, name = n ? nameGa(n) : msg("cat.someone");
      sayRef.current(msg(result === "came" ? "call.came" : result === "other" ? "call.other" : result === "ignored" ? "call.ignored" : result === "busy" ? "call.busy" : "call.gone", { name, to }));
    };
    const handleTap = (tap: Tap, rect: DOMRect) => {
      if (tree.pending) { // 사다리 위: 누른 가지 사이에 쪽지 미리보기
        const p = treeNotes.canopyPoint(camera, rect, tap.x, tap.y);
        if (p) { tree.ghost = p; treeNotes.showGhost(p); setTreeMode("ready"); }
        return;
      }
      const cv = pickCat(tap, rect);
      if (cv) { catTap(cv, tap); return; }
      if (tap.menu) { openMenu(tap, false, pickMe(tap, rect)); return; }
      if (nearTree() || Math.hypot(pos.x - WISH_TREE.x, pos.z - WISH_TREE.z) < 14) { // 나무에 달린 쪽지 보기
        const n = treeNotes.pick(camera, rect, tap.x, tap.y);
        if (n) { setMenu(null); setTreeDetail(n); logClient("tree.view", { noteId: n.id }); return; }
      }
      // 분수: 누른 곳이 분수 물(수면 높이에서 반지름 안)이면 동전 메뉴
      const onWater = (() => {
        tapRay.setFromCamera(new THREE.Vector2(((tap.x - rect.left) / rect.width) * 2 - 1, -((tap.y - rect.top) / rect.height) * 2 + 1), camera);
        const hit = tapRay.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5 * PROP_S), new THREE.Vector3());
        return !!hit && Math.hypot(hit.x - FOUNTAIN.x, hit.z - FOUNTAIN.z) < 3 * PROP_S;
      })();
      screen.set(FOUNTAIN.x, 1.2 * PROP_S, FOUNTAIN.z).project(camera);
      if (nearFountain() && (onWater || (screen.z < 1 && Math.hypot(rect.left + (screen.x + 1) / 2 * rect.width - tap.x, rect.top + (1 - screen.y) / 2 * rect.height - tap.y) < 120))) {
        setMenu({ x: tap.x, y: tap.y, items: [{ label: msg("menu.coin", { price: meRef.current?.fountainPrice ?? 10 }), run: tossCoin }] }); return;
      }
      if (petal.hit(camera, rect, tap.x, tap.y)) {
        const y = petal.group.position.y;
        if (petal.catchable) {
          petal.end(st.now); setMenu(null);
          claim(y); // 서버가 확인한 뒤에 "잡았어요" (로그도 서버에서)
        } else {
          sayRef.current(msg(y > CATCH_HIGH ? "petal.early" : "petal.missed"));
          logClient("petal.missed", { height: Math.round(y * 100) / 100 });
        }
        return;
      }
      // 안내원을 누르면 안내 창
      screen.set(NPC.x, NPC_Y + 1.3, NPC.z).project(camera);
      if (screen.z < 1 && Math.hypot(pos.x - NPC.x, pos.z - NPC.z) < 13 && Math.hypot(rect.left + (screen.x + 1) / 2 * rect.width - tap.x, rect.top + (1 - screen.y) / 2 * rect.height - tap.y) < 90) {
        openInfo(); return;
      }
      // 매점을 누르면 (가까이 있을 때) 매점 창
      screen.set(CLERK.x, CLERK.y + 1.2, CLERK.z).project(camera); // 매점 직원 얼굴 근처를 누르면
      if (screen.z < 1 && nearKiosk() && Math.hypot(rect.left + (screen.x + 1) / 2 * rect.width - tap.x, rect.top + (1 - screen.y) / 2 * rect.height - tap.y) < 150) {
        setMenu(null); setPanel("shop"); return;
      }
      // 다른 사람을 누르면 그 사람에게 할 수 있는 것
      const other = mp.pick(camera, rect, tap.x, tap.y);
      if (other) {
        const near = Math.hypot(other.x - pos.x, other.z - pos.z) < 5;
        const sheets = meRef.current?.items.noteSheets ?? 0;
        const theirSeat = !st.sitting ? mp.freeSeats().find((s) => s.ownerId === other.sessionId && Math.hypot(s.x - pos.x, s.z - pos.z) < 3) : undefined;
        setMenu({ x: tap.x, y: tap.y, items: [
          ...(theirSeat ? [{ label: msg("menu.joinMatShort"), run: () => askJoin(theirSeat) }] : []),
          near && sheets > 0
            ? { label: msg("menu.giveNote", { nick: other.nickname, n: sheets }), run: () => { setPanel(null); setWriteTo(other); logClient("note.open_editor", {}); } }
            : { label: msg(sheets <= 0 ? "menu.noNote" : "menu.tooFarNote") },
        ] });
        return;
      }
      // 빈 곳을 톡: 모바일은 내 메뉴(앉기 등)를 열고, 메뉴가 떠 있으면 닫음 (PC는 우클릭)
      // 모바일은 할 수 있는 게 있을 때만 메뉴 (이동하려다 톡 닿을 때마다 "앉을 수 없어요"가 뜨지 않게)
      if (coarse && !menuOpen.current && pickMe(tap, rect)) { openMenu(tap, false, true); return; } // 휴대폰: 내 캐릭터를 톡 = 내 메뉴(가방·고양이 부르기). 앉아 있어도
      if (coarse && st.sitting) { setMenu(null); if (!askPack()) stand(); return; } // 앉아 있을 때 빈 곳 톡 = 일어나기 (끌면 둘러보기). 돗자리에 손님이 있으면 먼저 물어봄
      if (coarse && !menuOpen.current) { openMenu(tap, true); return; }
      setMenu(null);
    };

    const fit = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h); camera.aspect = w / h;
      baseFov = w / h < 0.8 ? 72 : 60; camera.fov = baseFov; camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(fit); ro.observe(el); fit();

    // 개발 중 확인용 (운영 빌드엔 없음)
    if (process.env.NODE_ENV === "development") Object.assign(window, { __park: { renderer, scene, camera, pos, petal, mp, audio, st, catViews, soloCats, me, playGesture, coin, launchVelocity, THREE, makeMat, sit: () => actions.current?.sit(), face: (y: number) => { yaw = camYaw = y; }, cam: () => ({ yaw, camYaw, playAt: st.playAt }) } });

    const clock = new THREE.Clock();
    let moved = false, turnVel = 0, gameT = 0;
    let firstFrame = false;
    // 느린 기기: 3초 평균이 25fps 아래면 화면 해상도를 한 단계씩 낮춤 (올리지는 않음 → 들쭉날쭉 안 함)
    const perf = { t: 0, n: 0, ratio: renderer.getPixelRatio() };
    renderer.setAnimationLoop(() => {
      // 게임 시간: 실제 흐른 시간이 아니라 화면이 돌아간 만큼만 (탭을 내려 둔 동안엔 멈춤 → 돌아오자마자 운세꽃잎이 떨어지지 않게)
      const dt = Math.min(clock.getDelta(), 0.05); gameT += dt; const t = gameT;
      st.now = t;
      if (st.aiming) { // 동전 조준: 당기는 동안 날아갈 길을 보여 주고, 놓으면 튕김
        const a = aim.current;
        if (a.cancel) { a.cancel = false; stopAim(); }
        else if (a.shoot) { a.shoot = false; void shootCoin(); }
        else if (a.on) coin.preview(hand(), aimShot().vel);
        else coin.preview(null);
      }
      if (st.asking && t > st.asking.until) { sayRef.current(msg("mat.noAnswer", { owner: st.asking.seat.owner })); st.asking = null; }
      const rect = renderer.domElement.getBoundingClientRect();
      for (const tap of inp.takeTaps()) handleTap(tap, rect);

      // 조이스틱: 누른 자리에 나타나고, 손을 떼면 사라짐 (손잡이는 엄지를 따라감)
      if (joyBase.current && knob.current) {
        const c = inp.joyCenter, k = inp.joyKnob;
        joyBase.current.style.opacity = c ? "1" : "0";
        if (c) { joyBase.current.style.left = `${c.x - JOY_R}px`; joyBase.current.style.top = `${c.y - JOY_R}px`; }
        knob.current.style.transform = c && k ? `translate(${k.x - c.x}px, ${k.y - c.y}px)` : "translate(0px, 0px)";
      }
      inp.seated = coarse && st.sitting;
      const zIn = inp.takeZoom();
      if (st.sitting || tree.pending) zoomK = THREE.MathUtils.clamp(zoomK * zIn, 0.45, 1.35); // 앉아서는 풍경 당겨 보기
      else if (zIn !== 1) { // 걸을 땐 카메라 거리: 끝까지 당기면 1인칭, 밀면 멀리서 나와 주변이 다 보이게
        const cur = chosenBack();
        let nd = cur < 0.5 ? (zIn > 1 ? 0.9 : 0) : cur * zIn;
        if (nd < 0.7 && zIn < 1) nd = 0;
        camDist = THREE.MathUtils.clamp(nd, 0, 8);
        try { localStorage.setItem("camDist", camDist.toFixed(2)); } catch { /* 저장 안 되는 브라우저 */ }
      }
      const { forward, right } = inp.axes(), drag = inp.takeDrag();
      if (drag.x !== 0 || drag.y !== 0) lastDragT = t;
      const fp = chosenBack() < 0.5; // 1인칭으로 골랐으면 예전처럼: 몸 = 보는 쪽, 좌우는 돌기
      if (Math.hypot(forward, right) < 0.05) st.waitRelease = false; // 앉은 뒤엔 키를 한 번 뗐다 눌러야 일어남
      if (st.camTurn !== null) { // 벤치에 앉으면 시야가 벤치 앞쪽으로 천천히 돎
        const d = Math.atan2(Math.sin(st.camTurn - camYaw), Math.cos(st.camTurn - camYaw));
        camYaw += d * (1 - Math.exp(-dt * 4));
        if (Math.abs(d) < 0.01 || drag.x !== 0) st.camTurn = null;
      }
      camYaw -= drag.x * DRAG_YAW;
      if (tree.pending) camYaw -= right * LOOK_YAW * dt; // 사다리 위: 좌우로 나무를 돌아보기
      else if (fp) { // 1인칭: 좌우 키 = 몸과 시야가 같이 그쪽으로 돎 (살살 붙었다 살살 멈춤)
        const turnSpeed = ((meRef.current?.controls?.turnSpeed ?? 110) * Math.PI) / 180;
        turnVel += (-right * turnSpeed - turnVel) * (1 - Math.exp(-dt * 10));
        camYaw += turnVel * dt;
      }
      if (st.faceCam && (drag.x !== 0 || t > Math.max(st.wishUntil + 1.2, st.photoUntil))) { st.faceCam = false; st.photoAt = 0; } // 소원 장면 끝 (직접 돌리거나 걸어도)
      showMe += ((st.faceCam ? 1 : 0) - showMe) * (1 - Math.exp(-dt * 5)); // 느린 PC에서도 장면이 끝나기 전에 다 돌아오게
      // 위아래 끌기: 옆으로 돌리며 끌 때 섞이는 작은 세로 움직임은 무시 (모르는 새 하늘을 보게 되지 않게)
      const dragY = Math.abs(drag.y) > Math.abs(drag.x) * 0.6 ? drag.y : 0;
      let walking = false;
      if (st.sitting && Math.hypot(forward, right) >= 0.05 && !st.waitRelease) askPack(); // 손님이 있으면 걷지 않고 확인 창
      if (tree.pending) {
        // 사다리 위에선 걷지 않음
      } else if (st.sitting && (Math.hypot(forward, right) < 0.05 || st.waitRelease)) {
        vel.x = vel.z = 0;
        // 앉아 있을 땐 끌어서 둘러보기 (조금 더 내려다볼 수 있게). 누워 있으면 천장까지 올려다봄
        pitch = THREE.MathUtils.clamp(pitch + dragY * DRAG_PITCH, st.lying ? -1.5 : PITCH_UP, st.lying ? 0.2 : PITCH_DOWN);
      } else {
        if (st.sitting) stand(); // 방향키를 누르면 바로 일어나서 걸어감
        pitch = THREE.MathUtils.clamp(pitch + dragY * DRAG_PITCH, PITCH_UP, PITCH_DOWN);
        if (fp && !st.faceCam && !st.playAt) yaw = camYaw; // 1인칭: 몸은 늘 내가 보는 쪽 (다른 사람 눈에도). 낚싯대 놀이 중엔 몸은 고양이 쪽, 카메라만 비스듬히
        // 화면 기준으로 민 쪽으로 걸음 (1인칭은 앞뒤만, 방향은 도는 걸로)
        const cf = { x: Math.sin(camYaw), z: Math.cos(camYaw) }, cr = { x: -Math.cos(camYaw), z: Math.sin(camYaw) };
        const ix = cf.x * forward + (fp ? 0 : cr.x * right), iz = cf.z * forward + (fp ? 0 : cr.z * right), il = Math.hypot(ix, iz);
        const amount = Math.min(1, il), speed = (meRef.current?.controls?.walkSpeedCm ?? WALK * 100) / 100;
        // 살살 출발·살살 멈춤 (0.1~0.15초): 속도가 원하는 속도로 부드럽게 붙음
        const wx = amount > 0.05 ? (ix / il) * speed * amount : 0, wz = amount > 0.05 ? (iz / il) * speed * amount : 0;
        const ka = 1 - Math.exp(-dt * (amount > 0.05 ? 9 : 13));
        vel.x += (wx - vel.x) * ka; vel.z += (wz - vel.z) * ka;
        const v = Math.hypot(vel.x, vel.z);
        if (amount > 0.05) { st.wishUntil = 0; st.faceCam = false; st.photoAt = 0; if (st.aiming) stopAim(); } // 걸으면 소원 동작·사진은 멈춤
        walking = v > 0.15;
        if (v < 0.02) { vel.x = vel.z = 0; }
        else {
          const mvYaw = Math.atan2(vel.x, vel.z); // 실제로 움직이는 쪽
          if (!fp && !st.playAt) {
            // 몸은 가는 쪽으로 부드럽게 돎
            yaw += Math.atan2(Math.sin(mvYaw - yaw), Math.cos(mvYaw - yaw)) * (1 - Math.exp(-dt * 11));
            // 카메라는 천천히 따라옴 (방금 끌어서 둘러봤으면 잠깐 그대로)
            const d = Math.atan2(Math.sin(yaw - camYaw), Math.cos(yaw - camYaw));
            // 앞으로 걸으면 등 뒤로, 옆으로 걸으면 그쪽으로 화면이 천천히 돎(조이스틱만으로도 돌아서 매점 같은 걸 마주 볼 수 있게), 뒤로 걸을 땐 안 돎
            const cd = Math.cos(d), follow = cd > 0 ? 1 : cd > -0.35 ? 0.75 : 0;
            if (t - lastDragT > 1.2 && follow) camYaw += Math.sign(d) * Math.min(Math.abs(d), dt * 1.5 * follow * Math.min(1, v / speed) * (cd > 0 ? Math.max(0.4, Math.abs(d)) : 1));
          }
          if (dragY === 0 && drag.x === 0) pitch += (0 - pitch) * (1 - Math.exp(-dt * 1.2)); // 걸으면 시선이 천천히 앞으로 돌아옴
          // 다른 사람 자리도 장애물 (서버도 같은 규칙으로 다시 판정)
          const np = move(pos.x, pos.z, pos.x + vel.x * dt, pos.z + vel.z * dt, undefined, [...COLLIDERS, ...mp.colliders()]);
          pos.x = np.x; pos.z = np.z;
          // 사다리 앞에서 나무 쪽으로 걸어 들어가면 쪽지 쓰기 (한 번 뜨면 1.5m 떨어졌다 와야 다시)
          const ld = Math.hypot(pos.x - LADDER_FOOT.x, pos.z - LADDER_FOOT.z);
          if (ld > 1.5) st.ladderArmed = true;
          else if (st.ladderArmed && ld < 0.55 && Math.sin(mvYaw) > 0.6) { st.ladderArmed = false; openTreeEditor(); }
          if (!moved) { moved = true; setHint(false); }
        }
      }
      // 서버 판정과 많이 어긋나면 서버 쪽으로 맞춤. 처음 입장은 바로, 걷는 중엔 망 지연만큼 여유를 두고 부드럽게 당김 (화면이 튀지 않게)
      // 벤치 빈자리 가까이(1.3m) 가면 '벤치에 앉기' 버튼 (저절로 앉지 않음. 남·고양이가 앉은 자리는 빼고 가장 가까운 자리)
      {
        let bn: BenchSeat | null = null;
        if (!st.sitting && !tree.pending && !st.playAt && !st.petAt && !st.aiming) {
          const others = mp.colliders(); let best = 1.3;
          for (const s of BENCH_SEATS) {
            const d = Math.hypot(s.fx - pos.x, s.fz - pos.z);
            if (d < best && !others.some((o) => Math.hypot(o.x - s.fx, o.z - s.fz) < 0.45) && !catOn(s)) { best = d; bn = s; }
          }
        }
        if (bn !== benchNear) { benchNear = bn; setBenchBtn(!!bn); }
      }
      const srv = mp.mine();
      if (srv) {
        const off = Math.hypot(srv.x - pos.x, srv.z - pos.z), walkV = (meRef.current?.controls?.walkSpeedCm ?? 300) / 100;
        if (!synced) { pos.x = srv.x; pos.z = srv.z; yaw = camYaw = srv.yaw; synced = true; }
        else if (off > 6) { pos.x = srv.x; pos.z = srv.z; }                                   // 크게 어긋나면(벽 너머 등) 바로
        else if (off > 1.2 + walkV * 0.5 && !walking) { const k = 1 - Math.exp(-dt * 4); pos.x += (srv.x - pos.x) * k; pos.z += (srv.z - pos.z) * k; }
      }

      const mode: Mode = st.lying ? "lie" : st.sitting ? (t < st.wishUntil ? "sitwish" : "sit") : t < st.wishUntil && t >= st.stompUntil ? "wish" : walking ? "walk" : "idle";
      const anim = mode === "lie" ? "lie" : mode === "sit" || mode === "sitwish" ? (st.onMat ? matAnim(st.matColor) : st.bench ? "sitbench" : "sit") : mode === "wish" ? "wish" : "idle";
      if (anim !== st.anim) { st.anim = anim; mp.sendAnim(anim); }
      mp.update(t, dt, { x: pos.x, z: pos.z, yaw, walking });

      footY += (groundY(pos.x, pos.z) - footY) * (1 - Math.exp(-dt * 14)); // 정자 마루에 올라서면 살짝 올라감
      if (tree.pending) { // 사다리 꼭대기에 올라가 나무를 바라봄 (서버 위치는 그대로)
        me.root.position.set(LADDER_TOP.x, LADDER_TOP.y, LADDER_TOP.z);
        me.root.rotation.y = Math.atan2(WISH_TREE.x - LADDER_TOP.x, WISH_TREE.z - LADDER_TOP.z);
        animateChar(me, t, dt, "idle");
      } else {
        if (st.bench) { me.root.position.set(st.bench.x, st.bench.y, st.bench.z); me.root.rotation.y = st.bench.yaw; }
        else { me.root.position.set(pos.x, footY, pos.z); me.root.rotation.y = yaw; }
        animateChar(me, t, dt, mode);
      }
      coin.update(dt);
      updatePlay(dt, walking);
      updateFeed(dt, walking);
      updatePet(dt, walking, renderer.domElement.getBoundingClientRect());

      // 창구 직원: 다가오면 바라보고 웃으며 목인사. 안내원 말풍선은 처음 한 번만
      if (npc.update(t, dt, pos.x, pos.z) && !greeted) { greeted = true; sayRef.current(msg("npc.greet", { npc: NPC_NAME })); }
      clerk.update(t, dt, pos.x, pos.z);
      // 직원에게 말 걸기: 누르지 않아도 바로 앞에 서서 바라보면 1초쯤 뒤에 저절로 (지나가기만 하면 안 걸리게)
      for (const w of talkers) {
        const dx = w.x - pos.x, dz = w.z - pos.z, d = Math.hypot(dx, dz);
        if (d > 3.2) { w.armed = true; w.t = 0; continue; }       // 멀어지면 다시 말 걸 수 있게
        const facing = d > 0 && (Math.sin(yaw) * dx + Math.cos(yaw) * dz) / d > 0.72;
        if (w.armed && d < 2.1 && facing && !st.sitting && !tree.pending && !panelOpen.current) {
          w.t += dt;
          if (w.t > 0.9) { w.armed = false; w.t = 0; w.open(); }
        } else w.t = 0;
      }
      let cats = mp.cats();
      if (!mp.online) { if (meRef.current?.cat) Object.assign(soloCats.cfg, meRef.current.cat); soloCats.update(dt, [{ x: pos.x, z: pos.z }]); cats = soloCats.states; }
      lastCats = cats;
      while (catViews.length < cats.length) catViews.push(new CatView(scene));
      catViews.forEach((v, i) => {
        v.focus = play && play.v === v ? toy.end : feeding && feeding.v === v ? churuTip : null; // 내 화면에선 깃털·츄르를 매 장면 바로 봄
        v.update(t, dt, cats[i] ?? null, pos); v.setName(bondsRef.current?.cats[v.catLook]?.name ?? null);
      });

      petal.update(t, dt, { x: pos.x, z: pos.z, yaw }, t < st.wishUntil);
      focus.set(pos.x, 0, pos.z);
      const wind = world.update(t, dt, focus, walking, yaw);
      audio.update({
        wind, riverDist: pos.z > -8 ? pos.z + 8 : pos.z < BOUNDS_N.maxZ + 0.7 ? BOUNDS_N.maxZ + 0.7 - pos.z : 0, fountainDist: Math.hypot(pos.x - FOUNTAIN.x, pos.z - FOUNTAIN.z),
        nearby: mp.nearCount(pos.x, pos.z, 15), hour: skyHour ?? kstHour(),
      });
      if (tree.pending) { // 나무 둘레를 도는 카메라
        const k = 1 - Math.exp(-dt * 6), fx = Math.sin(camYaw), fz = Math.cos(camYaw);
        camPos.lerp(new THREE.Vector3(WISH_TREE.x - fx * 8.5, 4.2 - pitch * 3, WISH_TREE.z - fz * 8.5), k);
        camLook.lerp(new THREE.Vector3(WISH_TREE.x, 4.2 * PROP_S * 0.6, WISH_TREE.z), k);
        camera.position.copy(camPos); camera.lookAt(camLook);
      } else placeCamera();
      me.root.visible = !!tree.pending || showMe > 0.02 || !firstPerson; // 완전 1인칭일 때만 내 몸을 숨김
      const people = mp.people();
      drawMini(pos.x, pos.z, yaw, tree.pending ? yaw : camYaw, people);
      if (bigMap.current) { // 펼친 큰 지도
        drawFullMap(bigMap.current, { x: pos.x, z: pos.z, yaw }, people, { ...Object.fromEntries(MAP_KEYS.map((k) => [k, msg(`map.${k}`)])) as Record<MapLabelKey, string>, me: msg("map.me") });
        if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) setMapPeople(people.length + 1);
      }
      renderer.render(scene, camera);
      if (st.photoAt && t >= st.photoAt) { // 찰칵: 방금 그린 화면을 바로 사진으로 (다음 장면을 그리기 전이라 그대로 남아 있음)
        st.photoAt = 0; audio.pop();
        setPhoto(renderer.domElement.toDataURL("image/jpeg", 0.92));
      }
      if (t > 5 && document.visibilityState === "visible") { // 처음 몇 초(셰이더 준비)는 빼고
        perf.t += dt; perf.n++;
        if (perf.t >= 3) {
          if (perf.n / perf.t < 25 && perf.ratio > 0.75) { perf.ratio = Math.max(0.75, perf.ratio - 0.25); renderer.setPixelRatio(perf.ratio); }
          perf.t = 0; perf.n = 0;
        }
      }
      if (!firstFrame) { firstFrame = true; setTimeout(() => setLoaded(true), 150); }
    });

    return () => {
      clearInterval(wishTimer);
      window.removeEventListener("pagehide", saveSpot);
      window.removeEventListener("pointerdown", wake); window.removeEventListener("keydown", wake); audio.dispose(); audioRef.current = null;
      drawMini.dispose();
      ro.disconnect(); renderer.setAnimationLoop(null); inp.dispose(); input.current = null; actions.current = null; mp.dispose();
      scene.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
      renderer.dispose(); el.removeChild(renderer.domElement);
    };
  }, [presetId]);

  // 열린 창 닫기: Esc 키, 또는 창 바깥(어두운 곳)을 누르면
  const closePanels = useCallback(() => {
    setPanel((p) => { if (p === "inbox") refreshMe.current(); return null; });
    setTreeDetail(null); setMapOpen(false);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      closePanels();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePanels]);
  const miniOpen = miniPref ?? !touch; // 모바일은 화면이 좁아 미니맵을 접어 둔 채 시작
  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-sky">
      <div ref={box} className="absolute inset-0" />
      <LoadingScreen hidden={loaded} text={msg("loading")} />
      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 text-sm">
        <p className="rounded-full bg-cream/85 px-3 py-1">{nickname}</p>
        <button onClick={() => { const a = audioRef.current; if (!a) return; a.start(); a.setMuted(!a.muted); setMuted(a.muted); }}
          aria-label={muted ? "소리 켜기" : "소리 끄기"} aria-pressed={!muted} className="pointer-events-auto rounded-full bg-cream/85 px-2.5 py-1">
          {muted ? "🔇" : "🔊"}
        </button>
        {net && (
          <p className="hidden items-center gap-1.5 rounded-full bg-cream/85 px-3 py-1 sm:flex">
            <span className={`size-2 rounded-full ${net.online ? "bg-emerald-400" : "bg-stone-400"}`} />
            {net.online ? `${net.count}명 산책 중` : "혼자 산책 중"}
          </p>
        )}
      </div>
      {me && (
        <div className="absolute right-4 top-4 flex items-center gap-2">
          <button onClick={() => actions.current?.photo()} aria-label={msg("photo.button")} title={msg("photo.button")}
            className="rounded-full bg-cream/90 px-3 py-1 text-sm shadow-sm">📷</button>
          <button onClick={() => setPanel(panel === "inbox" ? null : "inbox")} aria-label={`쪽지함${me.unreadNotes ? ` (안 읽은 쪽지 ${me.unreadNotes}개)` : ""}`}
            className="rounded-full bg-cream/90 px-3 py-1 text-sm shadow-sm">
            ✉️{me.unreadNotes > 0 && <span className="ml-1 rounded-full bg-sakura px-1.5 text-xs text-white">{me.unreadNotes}</span>}
          </button>
          <button onClick={() => setPanel(panel === "wallet" ? null : "wallet")} aria-label="내 지갑"
            className="flex items-center gap-1.5 rounded-full bg-cream/90 px-3 py-1 text-sm shadow-sm tabular-nums">
            <GreenCoin /> {me.green.toLocaleString("ko-KR")}
          </button>
          {/* 로그아웃: 회원만 (비회원은 로그아웃하면 캐릭터를 잃으니 안 둠) */}
          {!me.isGuest && (
            <button onClick={async () => { await authClient.signOut(); location.replace("/"); }} aria-label="로그아웃" title="로그아웃"
              className="grid size-7 place-items-center rounded-full bg-cream/90 shadow-sm">
              <svg viewBox="0 0 24 24" className="size-4 opacity-70" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M9 8l-4 4 4 4" /><path d="M5 12h10" />
              </svg>
            </button>
          )}
        </div>
      )}
      {hint && !sitting && (
        <p className="pointer-events-none absolute inset-x-4 top-16 mx-auto w-fit rounded-full bg-cream/85 px-4 py-1.5 text-center text-sm">
          {msg(touch ? "hint.mobile" : "hint.pc")}
        </p>
      )}
      {toast && <p role="status" className="pointer-events-none absolute inset-x-4 top-28 mx-auto w-fit rounded-full bg-ink/80 px-4 py-1.5 text-sm text-white">{toast}</p>}

      {menu && (() => {
        const heads = menu.items.filter((i) => i.head), tiles = menu.items.filter((i) => i.tile), rows = menu.items.filter((i) => !i.tile && !i.head), w = tiles.length ? 236 : 160;
        return (
          <div role="menu" className="absolute z-10 min-w-36 overflow-hidden rounded-2xl bg-cream text-sm shadow-lg ring-1 ring-sakura/30"
            style={{ left: Math.max(8, Math.min(menu.x, (typeof window !== "undefined" ? innerWidth : 400) - w)), top: Math.max(menu.y - 12, 8) }}>
            {heads.map((it) => <p key={it.label} className="whitespace-pre border-b border-sakura/20 bg-sakura/10 px-4 py-2 font-bold text-sakura-deep">{it.label}</p>)}
            {tiles.length > 0 && ( // 그림 칸: 돗자리 고르기(가진 돗자리 + ✕), 고양이에게 줄 물건(츄르 등)
              <div className="grid grid-cols-3 gap-2 p-2.5">
                {tiles.map((it) => (
                  <button key={it.label} role="menuitem" aria-label={it.label} title={it.label} onClick={() => { it.run?.(); setMenu(null); }}
                    className={`relative grid aspect-[1.57] w-[66px] place-items-center overflow-hidden rounded-lg bg-white ring-1 ring-black/10 hover:ring-2 hover:ring-sakura-deep ${it.dim ? "opacity-40 grayscale" : ""}`}>
                    {it.badge && <span className="absolute bottom-0.5 right-1 rounded-full bg-ink/70 px-1.5 text-[10px] leading-4 text-white">{it.badge}</span>}
                    {it.tile === "none"
                      ? <span aria-hidden className="text-xl leading-none text-ink/50">✕</span>
                      // eslint-disable-next-line @next/next/no-img-element -- 캔버스로 그린 그림(data URL)이라 next/image 를 쓸 수 없음
                      : <img src={it.tile} alt="" className="size-full object-cover" />}
                  </button>
                ))}
              </div>
            )}
            {rows.length > 0 && (
              <ul className={tiles.length ? "border-t border-sakura/20" : ""}>
                {rows.map((it) => (
                  <li key={it.label}>
                    <button role="menuitem" disabled={!it.run} onClick={() => { it.run?.(); setMenu(null); }}
                      className="block w-full px-4 py-2.5 text-left hover:bg-sakura/20 disabled:opacity-50">{it.label}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })()}

      {fortune && (
        <section role="dialog" aria-label="오늘의 운세" className="absolute inset-x-4 top-1/2 z-30 mx-auto flex w-auto max-w-[22rem] -translate-y-1/2 flex-col items-center gap-4 rounded-3xl bg-cream/97 px-6 py-6 text-center shadow-xl ring-1 ring-sakura/20">
          <Image src="/logo-mark.png" alt="" width={72} height={72} className="size-16" />
          <p className="text-xs tracking-widest opacity-50">오늘의 운세</p>
          <p className="text-lg leading-relaxed">{fortune}</p>
          <button onClick={() => {
            setFortune(null);
            fetch("/api/petal", { method: "PATCH" }).then((r) => r.json() as Promise<{ ok: boolean }>)
              .then((r) => sayRef.current(msg(r.ok ? "fortune.kept" : "fortune.keepFail"))).catch(() => sayRef.current(msg("fortune.keepFail")));
          }} className="rounded-full bg-sakura px-6 py-2 text-white shadow-[0_3px_0_var(--color-sakura-deep)]">간직할게요</button>
        </section>
      )}


      {writeTree && me && (
        <NoteEditor title="소원 쪽지" sheets={me.items.noteSheets} busy={false} coverOption sendLabel="사다리 올라가기"
          onCancel={() => setWriteTree(false)} onSend={(strokes, covered) => treeApi.current?.start(strokes, covered)} />
      )}
      {treeMode && (
        <div className="absolute inset-x-4 bottom-24 z-20 mx-auto flex w-fit flex-col items-center gap-2 rounded-3xl bg-cream/95 px-5 py-3 shadow-lg">
          <p className="text-sm">{treeMode === "pick" ? "나뭇가지 사이를 눌러 쪽지를 달 곳을 골라요 · 끌어서 둘러보기" : "여기에 달까요? 다른 곳을 눌러 바꿀 수도 있어요"}</p>
          <div className="flex gap-2">
            <button onClick={() => treeApi.current?.cancel()} className="rounded-full bg-white px-4 py-1.5 text-sm ring-1 ring-sakura/40">내려오기</button>
            {treeMode === "ready" && <button onClick={() => treeApi.current?.confirm()} className="rounded-full bg-sakura px-5 py-1.5 text-sm text-white">여기에 달기</button>}
          </div>
        </div>
      )}
      {(panel || treeDetail) && ( // 창 바깥: 누르면 닫힘 (모바일은 바깥 터치, PC는 바깥 클릭)
        <div aria-hidden className="absolute inset-0 z-10 bg-black/10" onPointerDown={(e) => { e.preventDefault(); closePanels(); }} />
      )}
      {playUi && (
        <div className="absolute inset-0 z-20 touch-none select-none"
          onPointerDown={(e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch {} Object.assign(toyDrag.current, { on: true, x: e.clientX, y: e.clientY }); }}
          onPointerMove={(e) => { // 좌우로 끌면 옆으로, 위아래로 끌면 멀리·가까이
            const d = toyDrag.current; if (!d.on) return;
            d.dx += (e.clientX - d.x) / (innerWidth * 0.32); d.dy -= (e.clientY - d.y) / (innerHeight * 0.32); d.x = e.clientX; d.y = e.clientY;
          }}
          onPointerUp={() => { toyDrag.current.on = false; }} onPointerCancel={() => { toyDrag.current.on = false; }}>
          <div className="pointer-events-none absolute inset-x-4 bottom-20 mx-auto flex w-fit max-w-[22rem] flex-col items-center gap-1.5 rounded-2xl bg-cream/90 px-4 py-2 text-center text-sm">
            <p>{msg(playUi.phase === "pounce" ? "rod.pounce" : playUi.phase === "crouch" ? (playUi.interest >= 1 ? "rod.sure" : "rod.crouchPanel") : "rod.start")}</p>
            <div className="flex w-60 items-center gap-2 text-xs">
              <span className="w-10 shrink-0 opacity-70">흥미</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-black/10">
                <div className={`h-full rounded-full transition-[width] duration-100 ${playUi.interest >= 1 ? "bg-[#ff5a5f]" : "bg-sakura"}`} style={{ width: `${Math.round(playUi.interest * 100)}%` }} />
              </div>
              <span className="shrink-0 tabular-nums opacity-70">🐾 {playUi.catches}/3</span>
            </div>
            {/* 빠르기 안내: 가운데 초록 칸 안에 바늘이 있으면 딱 좋은 살랑살랑 */}
            <div className="flex w-60 items-center gap-2 text-xs">
              <span className="w-10 shrink-0 opacity-70">빠르기</span>
              <div className="relative h-2.5 flex-1 rounded-full bg-black/10">
                <div className="absolute inset-y-0 rounded-full bg-emerald-300/80" style={{ left: `${(0.5 / 4) * 100}%`, width: `${((2.4 - 0.5) / 4) * 100}%` }} />
                <div className="absolute -top-0.5 h-3.5 w-1 -translate-x-1/2 rounded-full bg-ink/80" style={{ left: `${Math.min(1, playUi.speed / 4) * 100}%` }} />
              </div>
              <span className="w-16 shrink-0 text-left opacity-70">{playUi.speed < 0.5 ? "느려요" : playUi.speed < 2.4 ? "딱 좋아요" : "너무 빨라요"}</span>
            </div>
          </div>
          <button onPointerDown={(e) => e.stopPropagation()} onClick={() => { toyDrag.current.stop = true; setTimeout(() => setPlayUi(null), 400); }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-cream/90 px-5 py-2 text-sm shadow-sm">{msg("rod.stopBtn")}</button>
        </div>
      )}
      {petUi && (
        <div className="absolute inset-0 z-20 cursor-none touch-none select-none"
          onPointerEnter={(e) => { Object.assign(petPtr.current, { x: e.clientX, y: e.clientY, inside: true }); moveHand(e.clientX, e.clientY); }}
          onPointerLeave={() => { petPtr.current.inside = false; petPtr.current.down = false; }}
          onPointerDown={(e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch {} Object.assign(petPtr.current, { x: e.clientX, y: e.clientY, inside: true, down: true }); moveHand(e.clientX, e.clientY); }}
          onPointerMove={(e) => { const p = petPtr.current; p.moved += Math.hypot(e.clientX - p.x, e.clientY - p.y); Object.assign(p, { x: e.clientX, y: e.clientY, inside: true }); moveHand(e.clientX, e.clientY); }}
          onPointerUp={() => { petPtr.current.down = false; if (touch) petPtr.current.inside = false; }}
          onPointerCancel={() => { petPtr.current.down = false; }}>
          {( // 내 손: 누른 자리가 손바닥 한가운데 (닿았는지 판정하는 점과 같은 곳). 위치는 moveHand 가 바로 옮김, 고양이에 닿으면 살짝 눌러 쓰다듬는 모양
            <svg ref={handRef} viewBox="0 0 64 72" aria-hidden className={`pointer-events-none absolute left-1/2 top-2/3 size-20 drop-shadow transition-transform duration-150 ${petUi.seen ? "" : "invisible"}`}
              style={{ transformOrigin: "53% 62%", transform: `translate(-53%,-62%) rotate(${petUi.on ? -14 : -4}deg) scale(${petUi.on ? 0.92 : 1})` }}>
              <path d="M18 66 C8 56 6 44 9 36 L12 22 C13 17 19 17 20 22 L21 30 L22 12 C23 6 30 6 31 12 L31 28 L33 9 C34 3 41 3 42 9 L41 29 L44 14 C45 8 52 9 52 15 L49 36 C53 33 58 34 59 39 C58 45 52 52 46 58 C42 63 38 67 32 68 Z"
                fill="#ffe3d3" stroke="#c98d7a" strokeWidth="2.2" strokeLinejoin="round" />
              <path d="M24 46 Q30 50 38 47" fill="none" stroke="#e5ab97" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          )}
          <p className="pointer-events-none absolute inset-x-4 bottom-20 mx-auto w-fit rounded-full bg-cream/90 px-4 py-1.5 text-center text-sm">{msg(touch ? "pet.panelTouch" : "pet.panel")}</p>
          <button onPointerDown={(e) => e.stopPropagation()} onClick={() => { petPtr.current.stop = true; setTimeout(() => setPetUi(null), 400); }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 cursor-pointer rounded-full bg-cream/90 px-5 py-2 text-sm shadow-sm">{msg("pet.stopBtn")}</button>
        </div>
      )}
      {squeezeUi && (
        <div className="absolute inset-0 z-20 touch-none select-none"
          onPointerDown={(e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch {} squeeze.current.held = true; squeeze.current.burst += 0.08; }}
          onPointerUp={() => { squeeze.current.held = false; }} onPointerCancel={() => { squeeze.current.held = false; }}>
          <div className="pointer-events-none absolute inset-x-4 bottom-20 mx-auto flex w-fit flex-col items-center gap-2 rounded-2xl bg-cream/90 px-4 py-3 text-center text-sm">
            <p>{msg("churu.panel")}</p>
            {/* 츄르 봉지: 남은 만큼 빨갛게 차 있음 */}
            <div className="relative h-8 w-44 overflow-hidden rounded-md bg-[#fbf4ec] ring-1 ring-black/10">
              <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#d8343b] via-[#d8343b] to-[#f39a2b] transition-[width] duration-100" style={{ width: `${Math.round(squeezeUi.paste * 82)}%` }} />
              <div className="absolute inset-y-1 right-1 w-[16%] rounded-sm bg-[#f3d9a4]/90" />
            </div>
          </div>
          <button onPointerDown={(e) => e.stopPropagation()} onClick={() => { squeeze.current.stop = true; setTimeout(() => setSqueezeUi(null), 400); }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-cream/90 px-5 py-2 text-sm shadow-sm">{msg("churu.stopBtn")}</button>
        </div>
      )}
      {coinAim && (
        <div className="absolute inset-0 z-20 touch-none select-none"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); Object.assign(aim.current, { on: true, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY }); }}
          onPointerMove={(e) => { if (aim.current.on) Object.assign(aim.current, { x: e.clientX, y: e.clientY }); }}
          onPointerUp={() => { if (aim.current.on) { aim.current.on = false; aim.current.shoot = true; } }}
          onPointerCancel={() => { aim.current.on = false; }}>
          <p className="pointer-events-none absolute inset-x-4 top-16 mx-auto w-fit rounded-full bg-cream/90 px-4 py-1.5 text-center text-sm">
            {msg("coin.aimHelp")}
          </p>
          {me?.fountain && (
            <p className="pointer-events-none absolute inset-x-4 top-28 mx-auto flex w-fit items-center gap-3 rounded-full bg-cream/90 px-4 py-1 text-xs tabular-nums">
              <span><i className="mr-1 inline-block size-2.5 rounded-full bg-[#ff5a5f]" />정중앙 {me.fountain.rewardBull}</span>
              <span><i className="mr-1 inline-block size-2.5 rounded-full bg-[#ffb347]" />가운데 {me.fountain.rewardMid}</span>
              <span><i className="mr-1 inline-block size-2.5 rounded-full bg-[#fff1a8] ring-1 ring-black/10" />바깥 {me.fountain.rewardOuter}</span>
              <span className="opacity-60">그린</span>
            </p>
          )}
          <button onPointerDown={(e) => e.stopPropagation()} onClick={() => { aim.current.cancel = true; }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-cream/90 px-5 py-2 text-sm shadow-sm">그만하기</button>
        </div>
      )}
      {packAsk && (
        <section role="dialog" aria-label="돗자리 정리" className="absolute inset-x-4 top-20 z-30 mx-auto flex w-auto max-w-[22rem] flex-col gap-3 rounded-3xl bg-cream/97 p-5 shadow-xl ring-1 ring-sakura/20">
          <p className="text-center">{msg("mat.packAsk")}</p>
          <div className="flex gap-2">
            <button onClick={() => packApi.current?.no()} className="flex-1 rounded-full bg-white py-2.5 ring-1 ring-sakura/40">{msg("mat.packNo")}</button>
            <button onClick={() => packApi.current?.yes()} className="flex-1 rounded-full bg-sakura py-2.5 text-white">{msg("mat.packYes")}</button>
          </div>
        </section>
      )}
      {nameFor && (
        <form role="dialog" aria-label="고양이 이름 지어 주기" className="absolute inset-x-4 top-20 z-30 mx-auto flex w-auto max-w-[20rem] flex-col gap-3 rounded-3xl bg-cream/97 p-5 shadow-xl ring-1 ring-sakura/20"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await fetch("/api/cats", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cat: nameFor.cat, act: "name", name: nameFor.name }) })
              .then((x) => x.json() as Promise<{ ok: boolean; name?: string }>).catch(() => null);
            if (r?.ok) { await refreshBonds.current(); sayRef.current(msg("cat.named", { name: r.name ?? "" })); setNameFor(null); }
            else sayRef.current(msg("cat.nameFail"));
          }}>
          <p className="text-center">{msg("name.ask")}<br /><span className="text-xs opacity-60">{msg("name.private")}</span></p>
          <input autoFocus maxLength={8} value={nameFor.name} onChange={(e) => setNameFor({ ...nameFor, name: e.target.value })} placeholder="1~8자"
            className="rounded-xl bg-white px-3 py-2 text-center ring-1 ring-sakura/40" />
          <div className="flex gap-2">
            <button type="button" onClick={() => setNameFor(null)} className="flex-1 rounded-full bg-white py-2.5 ring-1 ring-sakura/40">그만두기</button>
            <button disabled={!nameFor.name.trim()} className="flex-1 rounded-full bg-sakura py-2.5 text-white disabled:opacity-50">이름 짓기</button>
          </div>
        </form>
      )}
      {matAsk && (
        <section role="dialog" aria-label="돗자리 같이 앉기" className="absolute inset-x-4 top-20 z-30 mx-auto flex w-auto max-w-[22rem] flex-col gap-3 rounded-3xl bg-cream/97 p-5 shadow-xl ring-1 ring-sakura/20">
          <p className="text-center"><b>{matAsk.nickname}</b>님이 돗자리에<br />같이 앉고 싶어해요</p>
          <div className="flex gap-2">
            <button onClick={() => matApi.current?.answer(false)} className="flex-1 rounded-full bg-white py-2.5 ring-1 ring-sakura/40">거절하기</button>
            <button onClick={() => matApi.current?.answer(true)} className="flex-1 rounded-full bg-sakura py-2.5 text-white">허락하기</button>
          </div>
        </section>
      )}
      {treeDetail && <TreeNotePanel note={treeDetail} sheets={me?.items.noteSheets ?? 0} onClose={() => setTreeDetail(null)}
        onChanged={(msg) => { sayRef.current(msg); setTreeDetail(null); treeApi.current?.refresh(); mpRef.current?.notifyTree(); refreshMe.current(); }} />}
      {panel === "inbox" && <Inbox onClose={() => { setPanel(null); refreshMe.current(); }} />}
      {writeTo && me && (
        <NoteEditor title={`${writeTo.nickname}님에게 쪽지`} sheets={me.items.noteSheets} busy={sending} onCancel={() => setWriteTo(null)}
          onSend={async (strokes: Strokes) => {
            setSending(true);
            const r = await fetch("/api/notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to: writeTo.uid, strokes }) })
              .then((x) => x.json() as Promise<{ ok: boolean; reason?: string }>).catch(() => null);
            setSending(false);
            if (r?.ok) { audioRef.current?.paper(); mpRef.current?.notifyNote(writeTo.sessionId); sayRef.current(msg("note.given", { nick: writeTo.nickname })); setWriteTo(null); refreshMe.current(); }
            else sayRef.current(msg(r?.reason === "no_sheet" ? "note.noSheet" : "note.fail"));
          }} />
      )}
      {panel === "info" && <InfoPanel nickname={nickname} touch={touch} onClose={() => setPanel(null)} />}
      {panel === "wallet" && me && <WalletPanel me={me} onClose={() => setPanel(null)} />}
      {panel === "bag" && me && <BagPanel me={me} onClose={() => setPanel(null)} />}
      {panel === "shop" && me && <ShopPanel me={me} onClose={() => setPanel(null)} onBought={(msg) => { audioRef.current?.pop(); sayRef.current(msg); refreshMe.current(); }} />}

      {benchBtn && !sitting && (
        <button onClick={() => actions.current?.bench()}
          className="absolute bottom-28 left-1/2 z-10 -translate-x-1/2 rounded-full bg-cream/95 px-5 py-2.5 shadow-md ring-1 ring-sakura/30 active:scale-95">
          🪑 {msg("bench.sit")}
        </button>
      )}
      {/* 모바일 조이스틱: 위아래로 밀면 앞뒤로 걷고, 좌우로 밀면 돎 */}
      {touch && (
        <div ref={joyBase} aria-hidden style={{ width: JOY_R * 2, height: JOY_R * 2, opacity: 0 }} className="pointer-events-none absolute grid transition-opacity duration-150 place-items-center rounded-full bg-white/25 ring-2 ring-white/60 shadow-[inset_0_0_18px_rgba(255,255,255,0.35)] backdrop-blur-[2px]">
          <div ref={knob} className="size-10 rounded-full bg-cream/90 shadow-md ring-1 ring-black/5" />
        </div>
      )}

      {photo && <PhotoPanel src={photo} onClose={() => setPhoto(null)} />}
      {mapOpen && (
        <section role="dialog" aria-label={msg("map.title")} className="absolute inset-3 z-30 mx-auto flex max-w-3xl flex-col rounded-3xl bg-cream/97 p-3 shadow-xl ring-1 ring-sakura/20 sm:inset-8">
          <div className="mb-2 flex items-center px-2">
            <h2 className="text-lg">{msg("map.title")}</h2>
            <span className="ml-3 text-sm opacity-70">{msg("map.people", { n: mapPeople })}</span>
            <button onClick={() => setMapOpen(false)} aria-label="닫기" className="ml-auto px-2 text-xl opacity-60">×</button>
          </div>
          <canvas ref={bigMap} className="min-h-0 w-full flex-1 rounded-2xl" />
        </section>
      )}
      {/* 미니맵: 접었다 펼 수 있음 (모바일은 접힌 채 시작) */}
      <div className="absolute bottom-4 right-4 size-40 max-sm:size-32">
        <canvas ref={mini} aria-label="미니맵 (끌어서 둘러보기, 휠로 확대)" aria-hidden={!miniOpen}
          className={`size-full origin-bottom-right cursor-grab touch-none rounded-2xl shadow-md ring-2 ring-cream transition-[opacity,scale] duration-200 ease-out active:cursor-grabbing ${miniOpen ? "" : "pointer-events-none scale-50 opacity-0"}`} />
        <button onClick={() => setMapOpen(true)} aria-label={msg("map.open")} title={msg("map.open")}
          className={`absolute grid size-7 place-items-center rounded-full bg-cream/95 text-ink/70 shadow-md ring-1 ring-black/5 hover:text-ink ${miniOpen ? "-top-2.5 -left-2.5" : "bottom-0 right-9"}`}>
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" />
          </svg>
        </button>
        <button onClick={() => setMiniOpen(!miniOpen)} aria-label={miniOpen ? "미니맵 접기" : "미니맵 펼치기"} aria-expanded={miniOpen}
          className={`absolute grid size-7 place-items-center rounded-full bg-cream/95 text-ink/70 shadow-md ring-1 ring-black/5 transition-[top,right,bottom] duration-200 hover:text-ink ${miniOpen ? "-top-2.5 -right-2.5" : "bottom-0 right-0"}`}>
          <svg viewBox="0 0 16 16" className={`size-3.5 transition-transform duration-200 ${miniOpen ? "" : "rotate-180"}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 6.5 8 10.5 12 6.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** 찍은 사진: 미리보기 + 저장(내려받기) + 공유(휴대폰 공유 창) */
function PhotoPanel({ src, onClose }: { src: string; onClose: () => void }) {
  const name = `벚꽃공원-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}.jpg`;
  const share = async () => {
    const blob = await (await fetch(src)).blob(), file = new File([blob], name, { type: "image/jpeg" });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], text: msg("photo.shareText") }); } catch { /* 취소 */ } }
    else { const a = document.createElement("a"); a.href = src; a.download = name; a.click(); }
  };
  return (
    <section role="dialog" aria-label={msg("photo.title")} className="absolute inset-x-4 top-16 z-30 mx-auto flex max-w-lg flex-col gap-3 rounded-3xl bg-cream/97 p-4 shadow-xl ring-1 ring-sakura/20">
      <p className="text-center">{msg("photo.title")}</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- 방금 찍은 data URL */}
      <img src={src} alt="" className="max-h-[60dvh] w-full rounded-2xl object-contain shadow-inner" />
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 rounded-full bg-white py-2.5 ring-1 ring-sakura/40">{msg("photo.close")}</button>
        <a href={src} download={name} className="flex-1 rounded-full bg-white py-2.5 text-center ring-1 ring-sakura/40">{msg("photo.save")}</a>
        {typeof navigator !== "undefined" && "share" in navigator && <button onClick={share} className="flex-1 rounded-full bg-sakura py-2.5 text-white">{msg("photo.share")}</button>}
      </div>
    </section>
  );
}

const MAP_KEYS: MapLabelKey[] = ["gate", "booth", "kiosk", "pavilion", "fountain", "wishTree", "bridge", "river"];

type InboxNote = { id: number; from: string | null; strokes: Strokes; readAt: string | null; createdAt: string };

/** 받은 쪽지함 */
function Inbox({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<InboxNote[] | null>(null);
  const [open, setOpen] = useState<InboxNote | null>(null);
  const [fortune, setFortune] = useState<string | null>(null); // 간직한 오늘의 운세
  useEffect(() => {
    let alive = true;
    fetch("/api/notes", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).then((x: InboxNote[]) => { if (alive) setRows(x); }).catch(() => alive && setRows([]));
    fetch("/api/petal", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((x: { fortune?: string | null } | null) => { if (alive) setFortune(x?.fortune ?? null); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const view = (n: InboxNote) => {
    setOpen(n);
    if (!n.readAt) {
      fetch("/api/notes", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: n.id }) }).catch(() => {});
      setRows((r) => r?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? r);
    }
  };
  const when = (s: string) => new Date(s).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <section role="dialog" aria-label="쪽지함" className="absolute inset-x-4 bottom-24 top-16 z-20 mx-auto flex w-auto max-w-[26rem] flex-col overflow-hidden rounded-3xl bg-cream/97 shadow-xl ring-1 ring-sakura/20">
      <header className="flex items-center px-5 pt-4">
        <h2 className="text-lg">{open ? msg("inbox.from", { from: open.from ?? msg("someone") }) : msg("inbox.title")}</h2>
        {open && <button onClick={() => setOpen(null)} className="ml-3 text-sm underline opacity-70">{msg("inbox.list")}</button>}
        <button onClick={onClose} aria-label="닫기" className="ml-auto px-2 text-xl opacity-60">×</button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {open ? (
          <div className="flex flex-col items-center gap-2">
            <NoteView strokes={open.strokes} className="w-full max-w-[min(26rem,60dvh)]" />
            <p className="text-xs opacity-60">{when(open.createdAt)}</p>
          </div>
        ) : (<>
          {fortune && ( // 간직한 오늘의 운세 (받은 쪽지 위에)
            <div className="mb-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-sakura/30">
              <Image src="/logo-mark.png" alt="" width={40} height={40} className="size-10 shrink-0" />
              <div className="min-w-0"><p className="text-xs tracking-widest opacity-50">{msg("inbox.fortune")}</p><p className="leading-snug">{fortune}</p></div>
            </div>
          )}
          {!rows ? <p className="text-sm opacity-60">{msg("inbox.loading")}</p> : rows.length === 0 ? <p className="text-sm opacity-60">{msg("inbox.empty")}</p> : (
          <ul className="grid grid-cols-3 gap-3">
            {rows.map((n) => (
              <li key={n.id}>
                <button onClick={() => view(n)} className="relative flex w-full flex-col items-center gap-1 rounded-2xl bg-white p-2">
                  {!n.readAt && <span className="absolute right-2 top-2 size-2 rounded-full bg-sakura" aria-label="안 읽음" />}
                  <NoteView strokes={n.strokes} className="w-full" />
                  <span className="line-clamp-1 text-xs">{n.from ?? msg("someone")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        </>)}
      </div>
    </section>
  );
}

/** 소원나무 쪽지 보기 (내 쪽지면 가리기·겹친 장 떼기·떼어 내기) */
function TreeNotePanel({ note, sheets, onClose, onChanged }: { note: TreeNote; sheets: number; onClose: () => void; onChanged: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const act = async (action: "peel" | "cover" | "remove") => {
    if (action === "peel" && !confirm(msg("tree.peelConfirm"))) return;
    if (action === "remove" && !confirm(msg("tree.removeConfirm"))) return;
    setBusy(true);
    const r = await fetch("/api/tree", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: note.id, action }) })
      .then((x) => x.json() as Promise<{ ok: boolean; reason?: string }>).catch(() => null);
    setBusy(false);
    if (r?.ok) onChanged(msg(action === "peel" ? "tree.peeled" : action === "remove" ? "tree.removed" : "tree.covered"));
    else alert(msg(r?.reason === "no_sheet" ? "note.noSheet" : "tree.actFail"));
  };
  return (
    <section role="dialog" aria-label="소원 쪽지" className="absolute inset-x-4 top-1/2 z-30 mx-auto flex w-auto max-w-[22rem] -translate-y-1/2 flex-col items-center gap-3 rounded-3xl bg-cream/97 p-5 shadow-xl ring-1 ring-sakura/20">
      <div className="flex w-full items-center">
        <h2 className="text-lg">{note.mine ? msg("tree.mineTitle") : msg("tree.othersTitle", { from: note.from ?? msg("someone") })}</h2>
        <button onClick={onClose} aria-label="닫기" className="ml-auto px-2 text-xl opacity-60">×</button>
      </div>
      {note.strokes && !note.covered ? <NoteView strokes={note.strokes as Strokes} className="w-full max-w-[min(22rem,55dvh)]" /> : (
        <div className="flex aspect-square w-full max-w-[16rem] items-center justify-center rounded-full bg-[#f29bb5]/40 text-center text-sm">{msg("tree.coveredFace")}</div>
      )}
      {note.mine && note.covered && <p className="text-center text-xs opacity-60">{msg("tree.coveredHelp")}</p>}
      {note.mine && (
        note.covered
          ? <button disabled={busy} onClick={() => act("peel")} className="rounded-full bg-white px-5 py-2 text-sm ring-1 ring-sakura/40">{msg("tree.peelBtn")}</button>
          : <button disabled={busy || sheets < 1} onClick={() => act("cover")} className="rounded-full bg-sakura px-5 py-2 text-sm text-white disabled:opacity-50">{msg("tree.coverBtn")}</button>
      )}
      {note.mine && <button disabled={busy} onClick={() => act("remove")} className="text-sm underline opacity-60">{msg("tree.removeBtn")}</button>}
    </section>
  );
}
