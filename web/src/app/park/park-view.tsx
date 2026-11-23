"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as THREE from "three";
import { CATCH_HIGH, CatchPetal } from "@/game/catch-petal";
import { animateChar, makeChar, type Mode } from "@/game/character";
import { Staff } from "@/game/staff";
import { Input, type Tap } from "@/game/controls";
import { createMinimap } from "@/game/minimap";
import { Multiplayer, nameSprite, type NetStatus } from "@/game/multiplayer";
import { BENCH_SEATS, COLLIDERS, PROPS, PROP_S, SPAWN, WISH_TREE, canSit, groundY, move, type BenchSeat } from "@/game/park-map";
import { PRESETS, type Preset } from "@/game/presets";
import { NPC_NAME } from "@/content/guide";
import { InfoPanel } from "./info-panel";
import { NoteEditor, NoteView } from "./note";
import type { Strokes } from "@/lib/notes-shared";
import { QUALITY_HIGH, QUALITY_LOW, buildWorld, makePetalGeometry } from "@/game/world";
import { makeMat, placeMat } from "@/game/mat";
import { CoinToss, LADDER_TOP, TreeNotes, type TreeNote } from "@/game/tree-notes";
import { ParkAudio } from "@/game/audio";
import { kstHour } from "@/game/sky";
import { GreenCoin, ShopPanel, WalletPanel, type MeInfo } from "./wallet";

const COARSE = "(pointer: coarse)";
const isCoarse = () => matchMedia(COARSE).matches;
const subscribeCoarse = (cb: () => void) => { const m = matchMedia(COARSE); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };

const WALK = 3.0;                             // m/s
const EYE = 1.5, EYE_SIT = 0.95;             // 1인칭 눈높이 (서 있을 때 / 앉았을 때, 캐릭터 키 기준)
const DRAG_YAW = 0.006, DRAG_PITCH = 0.004, TOUCH_TURN = 1.8; // 끌어서 둘러보기 / 모바일 한 손가락으로 도는 빠르기(rad/s)
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

type MenuItem = { label: string; run?: () => void };
type Menu = { x: number; y: number; items: MenuItem[] };
type Actions = { sit: () => void; stand: () => void; wish: () => void; release: () => void };
const KIOSK = PROPS.find((p) => p.kind === "kiosk") as { x: number; z: number; yaw: number };
const NPC = PROPS.find((p) => p.kind === "npc") as { x: number; z: number; yaw: number };
const FOUNTAIN = PROPS.find((p) => p.kind === "fountain") as { x: number; z: number };
// 안내원: 옥색 저고리 한복에 갓을 쓴 젊은 남자. 안내소 안 단 위에 서서 창구로 얼굴을 내밂
const NPC_LOOK: Preset = { id: "npc-guide", name: NPC_NAME, tags: [], skin: "#f3d1b6", hair: "#3a2a22", style: "short", bangs: "side", hat: "gat",
  top: "#a8d5c2", topType: "hanbok", inner: "#2f4f6f", collar: "#ffffff", tie: "#d9607e", bottom: "#efe6d2", shoes: "#4a3a30" };
const NPC_Y = 0.35; // 안내소 바닥 위. 창턱 위로 가슴부터 보임
// 매점 직원: 노랑 저고리에 다홍 치마, 옥비녀로 쪽진 머리의 젊은 여자
const CLERK_LOOK: Preset = { id: "npc-clerk", name: "매점 직원", tags: [], skin: "#f8dfcc", hair: "#2b211d", style: "binyeo", pin: "#7fc8b4",
  top: "#fbe7a1", topType: "hanbok", inner: "#8a3b55", collar: "#ffffff", tie: "#d2486e", bottom: "#e66a8c", bottomType: "chima", shoes: "#ffffff", smile: false };
const CLERK = { x: KIOSK.x + Math.sin(KIOSK.yaw) * 0.95 * PROP_S, z: KIOSK.z + Math.cos(KIOSK.yaw) * 0.95 * PROP_S, y: 0.45 };

export function ParkView({ presetId, nickname }: { presetId: string; nickname: string }) {
  const box = useRef<HTMLDivElement>(null);
  const mini = useRef<HTMLCanvasElement>(null);
  const input = useRef<Input | null>(null);
  const actions = useRef<Actions | null>(null);
  const touch = useSyncExternalStore(subscribeCoarse, isCoarse, () => false);
  const [hint, setHint] = useState(true);
  const [net, setNet] = useState<NetStatus | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const menuOpen = useRef(false);
  useEffect(() => { menuOpen.current = !!menu; }, [menu]);
  const [caught, setCaught] = useState(false);
  const [sitting, setSitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [me, setMe] = useState<MeInfo | null>(null);
  const meRef = useRef<MeInfo | null>(null);
  const [panel, setPanel] = useState<"wallet" | "shop" | "info" | "inbox" | null>(null);
  const [writeTo, setWriteTo] = useState<{ sessionId: string; uid: string; nickname: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [writeTree, setWriteTree] = useState(false);          // 소원 쪽지 쓰는 중
  const [treeMode, setTreeMode] = useState<"pick" | "ready" | null>(null); // 사다리 위에서 달 자리 고르는 중
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
    if (r?.ok) { const m = await r.json() as MeInfo; meRef.current = m; setMe(m); if (audioRef.current && m.sound) audioRef.current.levels = m.sound; }
  });
  useEffect(() => {
    refreshMe.current();
    // 결제하고 돌아온 경우 (?charged=1000)
    const charged = Number(new URLSearchParams(location.search).get("charged"));
    if (charged > 0) { sayRef.current(`${charged.toLocaleString("ko-KR")}그린이 충전됐어요`); history.replaceState(null, "", location.pathname); }
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
    const hourParam = Number(new URLSearchParams(location.search).get("hour"));
    const skyHour = Number.isFinite(hourParam) && location.search.includes("hour=") ? hourParam % 24 : undefined;
    const world = buildWorld(scene, q, skyHour);
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
    const coin = new CoinToss(); scene.add(coin.group);
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

    const pos = { x: SPAWN.x, z: SPAWN.z };
    let yaw = SPAWN.yaw, camYaw = SPAWN.yaw, pitch = 0, footY = 0; // yaw = 캐릭터가 보는 쪽, camYaw = 카메라가 보는 쪽
    // 상태: 앉음 / 소원 비는 중 / 꽃잎 들고 있음
    const tree = { pending: null as { strokes: Strokes; covered: boolean } | null, ghost: null as THREE.Vector3 | null, busy: false };
    const st = { sitting: false, onMat: false, wishUntil: 0, holding: false, anim: "idle" as "idle" | "sit" | "sitmat" | "sitbench" | "wish", now: 0, faceCam: false,
      bench: null as BenchSeat | null, stoodAt: -9, waitRelease: false, camTurn: null as number | null };
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
    const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), focus = new THREE.Vector3();
    let showMe = 0; // 0 = 1인칭, 1 = 소원 빌 때 내 얼굴 쪽에서 보는 3인칭 (그 사이는 부드럽게)
    const placeCamera = () => {
      // 1인칭: 내 눈 높이에서 바로 (지연·흔들림 없이 = 멀미 덜함)
      const fx = Math.sin(camYaw), fz = Math.cos(camYaw), cp = Math.cos(pitch);
      const at = st.bench ?? { x: pos.x, y: footY, z: pos.z }; // 벤치에 앉으면 좌판 위에서
      const eyeY = at.y + (st.sitting ? EYE_SIT : EYE) * (preset.kid ? 0.76 : 1);
      const eye = new THREE.Vector3(at.x + fx * 0.25, eyeY, at.z + fz * 0.25);
      const look = eye.clone().add(new THREE.Vector3(fx * cp, -Math.sin(pitch), fz * cp));
      if (showMe > 0.001) { // 소원 빌기: 캐릭터 정면에서 손 모은 모습
        const f = showMe * showMe * (3 - 2 * showMe), sx = Math.sin(yaw), sz = Math.cos(yaw);
        const d = Math.min(2.6, cameraRoom(pos.x, pos.z, sx, sz, 2.6));
        eye.lerp(new THREE.Vector3(pos.x + sx * d, footY + 1.35, pos.z + sz * d), f);
        look.lerp(new THREE.Vector3(pos.x, footY + 0.95, pos.z), f);
      }
      camPos.copy(eye); camLook.copy(look);
      camera.position.copy(camPos); camera.lookAt(camLook);
    };
    placeCamera();

    const inp = new Input(renderer.domElement, coarse); input.current = inp;
    const screen = new THREE.Vector3();
    const drawMini = createMinimap(mini.current!);
    const mp = new Multiplayer(scene);
    mp.onStatus = setNet;
    mpRef.current = mp;
    mp.onNote = (from) => { sayRef.current(`✉️ ${from}님이 쪽지를 건넸어요`); refreshMe.current(); };
    mp.onTreeChanged = refreshTree;
    mp.connect();
    let synced = false;

    // ---------- 행동 ----------
    const stand = () => {
      if (!st.sitting) return;
      st.sitting = false; st.onMat = false; mat.visible = false; setSitting(false); inp.setSteer(true);
      if (st.bench) { st.bench = null; st.stoodAt = st.now; }
      logClient("sit.end", { x: Math.round(pos.x), z: Math.round(pos.z) });
    };
    // 벤치에 걸어 들어가면 자동으로 앉음: 돌아서 벤치가 보는 쪽(강)을 바라봄
    const sitBench = (seat: BenchSeat) => {
      st.sitting = true; st.bench = seat; st.onMat = false; st.wishUntil = 0; st.waitRelease = true;
      setSitting(true); setMenu(null); inp.setSteer(false);
      pos.x = seat.fx; pos.z = seat.fz; yaw = seat.yaw; st.camTurn = seat.yaw; pitch = 0.08;
      logClient("sit.start", { x: Math.round(pos.x), z: Math.round(pos.z), bench: true });
    };
    actions.current = {
      sit: () => {
        setMenu(null);
        if (!canSit(pos.x, pos.z)) { sayRef.current("여기선 앉을 수 없어요. 잔디밭이나 정자로 가 볼까요?"); return; }
        st.sitting = true; st.wishUntil = 0; setSitting(true); inp.setSteer(false);
        camYaw = yaw;
        // 돗자리가 있으면 잔디밭에선 깔고 앉음 (정자 마루에선 그냥 앉음)
        st.onMat = !!meRef.current?.items.mat && groundY(pos.x, pos.z) === 0;
        if (st.onMat) { placeMat(mat, pos.x, pos.z, yaw); mat.visible = true; sayRef.current("돗자리를 깔았어요 · 옆자리에 한 명 더 앉을 수 있어요"); }
        logClient("sit.start", { x: Math.round(pos.x), z: Math.round(pos.z), onPavilion: groundY(pos.x, pos.z) > 0, mat: st.onMat });
      },
      stand: () => { setMenu(null); stand(); },
      wish: () => {
        if (!st.holding) return;
        st.holding = false; setCaught(false);
        st.wishUntil = st.now + WISH_SEC; st.faceCam = true; // 카메라가 정면으로 돌아와 손 모은 모습을 보여줌
        audio.chime();
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
      if (r?.ok) { st.holding = true; setCaught(true); audio.chime(); }
      else sayRef.current(r?.reason === "soldout" ? "아쉽게도 오늘의 소원꽃잎이 모두 떨어졌어요" : r?.reason === "limit" ? "오늘은 소원을 충분히 빌었어요" : "잠시 후 다시 해볼까요?");
      refreshWish(); // 두 번 다 잡았거나 다 떨어졌으면 더는 안 보이게
    };

    const nearKiosk = () => Math.hypot(pos.x - KIOSK.x, pos.z - KIOSK.z) < 9;
    const nearFountain = () => Math.hypot(pos.x - FOUNTAIN.x, pos.z - FOUNTAIN.z) < 9;
    const nearTree = () => Math.hypot(pos.x - WISH_TREE.x, pos.z - WISH_TREE.z) < 8;
    // 분수에 동전: 서버에서 그린 차감 → 동전이 물에 퐁당 → 정면 보고 소원
    const tossCoin = async () => {
      setMenu(null);
      if (meRef.current?.isGuest) { sayRef.current("동전 던지기는 회원 전용이에요"); return; }
      const r = await fetch("/api/fountain", { method: "POST" }).then((x) => x.json() as Promise<{ ok: boolean; reason?: string }>).catch(() => null);
      if (!r?.ok) { sayRef.current(r?.reason === "insufficient" ? "그린이 모자라요" : "동전을 던지지 못했어요"); return; }
      yaw = Math.atan2(FOUNTAIN.x - pos.x, FOUNTAIN.z - pos.z);
      coin.throw(new THREE.Vector3(pos.x, footY + 1.1, pos.z), FOUNTAIN); audio.jingle();
      refreshMe.current();
    };
    coin.onSplash = () => { audio.plop(); setTimeout(() => audio.chime(), 400); st.wishUntil = st.now + WISH_SEC; st.faceCam = true; setTimeout(() => sayRef.current("퐁당! 소원을 빌었어요 🌸"), WISH_SEC * 1000); };
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
          await refreshTree(); mp.notifyTree(); refreshMe.current();
          st.wishUntil = st.now + WISH_SEC; st.faceCam = true;
          sayRef.current("소원 쪽지를 나무에 달았어요 🌸");
        } else sayRef.current(r?.reason === "daily_limit" ? "오늘은 쪽지를 충분히 달았어요" : r?.reason === "no_sheet" ? "노트가 모자라요" : r?.reason === "bad_spot" ? "나뭇가지 사이를 골라 주세요" : "달지 못했어요");
      },
      cancel: () => { tree.pending = null; tree.ghost = null; treeNotes.showGhost(null); setTreeMode(null); },
      refresh: refreshTree,
    };
    const nearNpc = () => Math.hypot(pos.x - NPC.x, pos.z - NPC.z) < 6;
    const openInfo = () => { setMenu(null); setPanel("info"); logClient("info.open", {}); };
    // 다른 사람 돗자리의 빈 옆자리: 1.6m 안이면 같이 앉을 수 있음
    const nearSeat = () => mp.freeSeats().find((s) => Math.hypot(s.x - pos.x, s.z - pos.z) < 1.6);
    const joinMat = (seat: { x: number; z: number; yaw: number; owner: string }) => {
      setMenu(null);
      pos.x = seat.x; pos.z = seat.z; yaw = camYaw = seat.yaw; // 바로 옆이라 서버 이동 판정 안에서 따라옴
      st.sitting = true; st.onMat = false; st.wishUntil = 0; setSitting(true); inp.setSteer(false);
      sayRef.current(`${seat.owner}님 돗자리에 같이 앉았어요`);
      logClient("sit.start", { x: Math.round(pos.x), z: Math.round(pos.z), joinedMatOf: seat.owner });
    };
    const openMenu = (tap: Tap) => {
      const sheets = meRef.current?.items.noteSheets ?? 0;
      const shopItem: MenuItem[] = nearKiosk() ? [{ label: "매점 둘러보기", run: () => setPanel("shop") }]
        : nearNpc() ? [{ label: "안내원과 이야기하기", run: openInfo }]
        : nearTree() ? [meRef.current?.isGuest ? { label: "소원 쪽지는 회원만 달 수 있어요" } : sheets < 1 ? { label: "노트가 있어야 소원 쪽지를 달 수 있어요" }
          : { label: `소원 쪽지 달기 (노트 ${sheets}장)`, run: () => { setPanel(null); setWriteTree(true); logClient("tree.open_editor", {}); } }]
        : nearFountain() ? [{ label: `동전 던지기 (${meRef.current?.fountainPrice ?? 10}그린)`, run: tossCoin }] : [];
      const seat = !st.sitting ? nearSeat() : undefined;
      const items: MenuItem[] = shopItem.length && !st.sitting ? shopItem : [];
      if (seat) items.push({ label: `${seat.owner}님 돗자리에 같이 앉기`, run: () => joinMat(seat) });
      items.push(...(st.sitting ? [{ label: "일어나기", run: () => actions.current!.stand() }]
        : canSit(pos.x, pos.z) ? [{ label: "여기 앉기", run: () => actions.current!.sit() }]
        : [{ label: "여기선 앉을 수 없어요" }]));
      setMenu({ x: tap.x, y: tap.y, items });
    };
    const handleTap = (tap: Tap, rect: DOMRect) => {
      if (tree.pending) { // 사다리 위: 누른 가지 사이에 쪽지 미리보기
        const p = treeNotes.canopyPoint(camera, rect, tap.x, tap.y);
        if (p) { tree.ghost = p; treeNotes.showGhost(p); setTreeMode("ready"); }
        return;
      }
      if (tap.menu) { openMenu(tap); return; }
      if (nearTree() || Math.hypot(pos.x - WISH_TREE.x, pos.z - WISH_TREE.z) < 14) { // 나무에 달린 쪽지 보기
        const n = treeNotes.pick(camera, rect, tap.x, tap.y);
        if (n) { setMenu(null); setTreeDetail(n); logClient("tree.view", { noteId: n.id }); return; }
      }
      screen.set(FOUNTAIN.x, 1.2 * PROP_S, FOUNTAIN.z).project(camera);
      if (screen.z < 1 && nearFountain() && Math.hypot(rect.left + (screen.x + 1) / 2 * rect.width - tap.x, rect.top + (1 - screen.y) / 2 * rect.height - tap.y) < 120) {
        setMenu({ x: tap.x, y: tap.y, items: [{ label: `동전 던지기 (${meRef.current?.fountainPrice ?? 10}그린)`, run: tossCoin }] }); return;
      }
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
      // 안내원을 누르면 안내 창
      screen.set(NPC.x, NPC_Y + 1.3, NPC.z).project(camera);
      if (screen.z < 1 && Math.hypot(pos.x - NPC.x, pos.z - NPC.z) < 13 && Math.hypot(rect.left + (screen.x + 1) / 2 * rect.width - tap.x, rect.top + (1 - screen.y) / 2 * rect.height - tap.y) < 90) {
        openInfo(); return;
      }
      // 매점을 누르면 (가까이 있을 때) 매점 창
      screen.set(KIOSK.x, 1.6 * PROP_S, KIOSK.z).project(camera);
      if (screen.z < 1 && nearKiosk() && Math.hypot(rect.left + (screen.x + 1) / 2 * rect.width - tap.x, rect.top + (1 - screen.y) / 2 * rect.height - tap.y) < 110) {
        setMenu(null); setPanel("shop"); return;
      }
      // 다른 사람을 누르면 그 사람에게 할 수 있는 것
      const other = mp.pick(camera, rect, tap.x, tap.y);
      if (other) {
        const near = Math.hypot(other.x - pos.x, other.z - pos.z) < 5;
        const sheets = meRef.current?.items.noteSheets ?? 0;
        setMenu({ x: tap.x, y: tap.y, items: [
          near && sheets > 0 && !meRef.current?.isGuest
            ? { label: `${other.nickname}님에게 쪽지 건네기 (노트 ${sheets}장)`, run: () => { setPanel(null); setWriteTo(other); logClient("note.open_editor", {}); } }
            : { label: meRef.current?.isGuest ? "쪽지는 회원만 쓸 수 있어요" : sheets <= 0 ? "노트가 없어요 (매점에서 살 수 있어요)" : "조금 더 가까이 가야 건넬 수 있어요" },
        ] });
        return;
      }
      // 빈 곳을 톡: 모바일은 내 메뉴(앉기 등)를 열고, 메뉴가 떠 있으면 닫음 (PC는 우클릭)
      if (coarse && !menuOpen.current) { openMenu(tap); return; }
      setMenu(null);
    };

    const fit = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h); camera.aspect = w / h;
      camera.fov = w / h < 0.8 ? 72 : 60; camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(fit); ro.observe(el); fit();

    // 개발 중 확인용 (운영 빌드엔 없음)
    if (process.env.NODE_ENV === "development") Object.assign(window, { __park: { renderer, scene, camera, pos, petal, mp, audio, face: (y: number) => { yaw = camYaw = y; } } });

    const clock = new THREE.Clock();
    let moved = false, turnVel = 0;
    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
      st.now = t;
      const rect = renderer.domElement.getBoundingClientRect();
      for (const tap of inp.takeTaps()) handleTap(tap, rect);

      let touchTurn = 0;
      if (inp.touch) { // 한 손가락 누르고 있기: 화면 가운데보다 위면 앞으로, 아래면 뒤로, 옆으로 치우치면 그쪽으로 돎
        const dx = inp.touch.x - (rect.left + rect.width / 2), dy = inp.touch.y - (rect.top + rect.height * 0.55);
        const dead = (v: number, d: number, full: number) => Math.abs(v) < d ? 0 : Math.max(-1, Math.min(1, (v - Math.sign(v) * d) / full));
        inp.setJoy(0, dead(dy, 24, 110)); touchTurn = dead(dx, 30, rect.width * 0.35);
      }
      const { forward, right } = inp.axes(), drag = inp.takeDrag();
      if (Math.hypot(forward, right) < 0.05) st.waitRelease = false; // 앉은 뒤엔 키를 한 번 뗐다 눌러야 일어남
      if (st.camTurn !== null) { // 벤치에 앉으면 시야가 벤치 앞쪽으로 천천히 돎
        const d = Math.atan2(Math.sin(st.camTurn - camYaw), Math.cos(st.camTurn - camYaw));
        camYaw += d * (1 - Math.exp(-dt * 4));
        if (Math.abs(d) < 0.01 || drag.x !== 0) st.camTurn = null;
      }
      camYaw -= drag.x * DRAG_YAW + touchTurn * TOUCH_TURN * dt;
      if (tree.pending) camYaw -= right * LOOK_YAW * dt; // 사다리 위: 좌우로 나무를 돌아보기
      else { // 좌우 키 = 몸과 시야가 같이 그쪽으로 돎 (살살 붙었다 살살 멈춤)
        const turnSpeed = ((meRef.current?.controls?.turnSpeed ?? 110) * Math.PI) / 180;
        turnVel += (-right * turnSpeed - turnVel) * (1 - Math.exp(-dt * 10));
        camYaw += turnVel * dt;
      }
      if (st.faceCam && (drag.x !== 0 || t > st.wishUntil + 0.8)) st.faceCam = false; // 소원 장면 끝 (직접 돌리거나 걸어도)
      showMe += ((st.faceCam ? 1 : 0) - showMe) * (1 - Math.exp(-dt * 3));
      let walking = false;
      if (tree.pending) {
        // 사다리 위에선 걷지 않음
      } else if (st.sitting && (Math.hypot(forward, right) < 0.05 || st.waitRelease)) {
        // 앉아 있을 땐 끌어서 둘러보기 (조금 더 내려다볼 수 있게)
        pitch = THREE.MathUtils.clamp(pitch + drag.y * DRAG_PITCH, PITCH_UP, PITCH_DOWN);
      } else {
        if (st.sitting) stand(); // 방향키를 누르면 바로 일어나서 걸어감
        pitch = THREE.MathUtils.clamp(pitch + drag.y * DRAG_PITCH, PITCH_UP, PITCH_DOWN);
        if (!st.faceCam) yaw = camYaw; // 1인칭: 몸은 늘 내가 보는 쪽 (다른 사람 눈에도)
        // 보는 방향 기준 앞/옆으로 걸음
        const amount = Math.min(1, Math.abs(forward));
        walking = amount > 0.05;
        if (walking) {
          st.wishUntil = 0; st.faceCam = false; // 걸으면 소원 동작은 멈춤
          const cf = { x: Math.sin(camYaw), z: Math.cos(camYaw) };
          const dx = cf.x * forward, dz = cf.z * forward, len = Math.hypot(dx, dz); // 앞뒤로만 걷고, 방향은 도는 걸로
          const step = WALK * amount * dt;
          // 다른 사람 자리도 장애물 (서버도 같은 규칙으로 다시 판정)
          const np = move(pos.x, pos.z, pos.x + (dx / len) * step, pos.z + (dz / len) * step, undefined, [...COLLIDERS, ...mp.colliders()]);
          pos.x = np.x; pos.z = np.z;
          // 벤치 앞에서 벤치 쪽으로 걸어 들어가면 앉음 (일어난 직후·남이 앉은 자리는 빼고)
          if (forward > 0 && st.now - st.stoodAt > 1) {
            const others = mp.colliders();
            const seat = BENCH_SEATS.filter((s) => Math.hypot(s.fx - pos.x, s.fz - pos.z) < 0.55
              && Math.sin(yaw) * Math.sin(s.yaw) + Math.cos(yaw) * Math.cos(s.yaw) < -0.4
              && !others.some((o) => Math.hypot(o.x - s.fx, o.z - s.fz) < 0.45))
              .sort((a, b) => Math.hypot(a.fx - pos.x, a.fz - pos.z) - Math.hypot(b.fx - pos.x, b.fz - pos.z))[0];
            if (seat) sitBench(seat);
          }
          if (!moved) { moved = true; setHint(false); }
        }
      }
      // 서버 판정과 1m 넘게 어긋나면(처음 입장 위치 포함) 서버 쪽으로 맞춤
      const srv = mp.mine();
      if (srv && (!synced || Math.hypot(srv.x - pos.x, srv.z - pos.z) > 1)) { pos.x = srv.x; pos.z = srv.z; if (!synced) yaw = camYaw = srv.yaw; synced = true; }

      const mode: Mode = st.sitting ? "sit" : t < st.wishUntil ? "wish" : walking ? "walk" : "idle";
      const anim = mode === "sit" ? (st.onMat ? "sitmat" : st.bench ? "sitbench" : "sit") : mode === "wish" ? "wish" : "idle";
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

      // 창구 직원: 다가오면 바라보고 웃으며 목인사. 안내원 말풍선은 처음 한 번만
      if (npc.update(t, dt, pos.x, pos.z) && !greeted) { greeted = true; sayRef.current(`${NPC_NAME}: 어서 오세요! 저를 누르면 공원 안내를 해 드려요`); }
      clerk.update(t, dt, pos.x, pos.z);

      petal.update(t, dt, { x: pos.x, z: pos.z, yaw }, st.holding || t < st.wishUntil);
      focus.set(pos.x, 0, pos.z);
      const wind = world.update(t, dt, focus, walking, yaw);
      audio.update({
        wind, riverDist: Math.max(0, pos.z + 8), fountainDist: Math.hypot(pos.x - FOUNTAIN.x, pos.z - FOUNTAIN.z),
        nearby: mp.nearCount(pos.x, pos.z, 15), hour: skyHour ?? kstHour(),
      });
      if (tree.pending) { // 나무 둘레를 도는 카메라
        const k = 1 - Math.exp(-dt * 6), fx = Math.sin(camYaw), fz = Math.cos(camYaw);
        camPos.lerp(new THREE.Vector3(WISH_TREE.x - fx * 8.5, 4.2 - pitch * 3, WISH_TREE.z - fz * 8.5), k);
        camLook.lerp(new THREE.Vector3(WISH_TREE.x, 4.2 * PROP_S * 0.6, WISH_TREE.z), k);
        camera.position.copy(camPos); camera.lookAt(camLook);
      } else placeCamera();
      me.root.visible = !!tree.pending || showMe > 0.02; // 1인칭에선 내 몸은 안 보임
      drawMini(pos.x, pos.z, yaw, tree.pending ? yaw : camYaw);
      renderer.render(scene, camera);
    });

    return () => {
      clearInterval(wishTimer);
      window.removeEventListener("pointerdown", wake); window.removeEventListener("keydown", wake); audio.dispose(); audioRef.current = null;
      drawMini.dispose();
      ro.disconnect(); renderer.setAnimationLoop(null); inp.dispose(); input.current = null; actions.current = null; mp.dispose();
      scene.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
      renderer.dispose(); el.removeChild(renderer.domElement);
    };
  }, [presetId]);

  const miniOpen = miniPref ?? !touch; // 모바일은 화면이 좁아 미니맵을 접어 둔 채 시작
  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-sky">
      <div ref={box} className="absolute inset-0" />
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
        <button onClick={() => setPanel(panel === "inbox" ? null : "inbox")} aria-label={`쪽지함${me.unreadNotes ? ` (안 읽은 쪽지 ${me.unreadNotes}개)` : ""}`}
          className="absolute right-28 top-4 rounded-full bg-cream/90 px-3 py-1 text-sm shadow-sm max-sm:right-24">
          ✉️{me.unreadNotes > 0 && <span className="ml-1 rounded-full bg-sakura px-1.5 text-xs text-white">{me.unreadNotes}</span>}
        </button>
      )}
      {me && (
        <button onClick={() => setPanel(panel === "wallet" ? null : "wallet")} aria-label="내 지갑"
          className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-cream/90 px-3 py-1 text-sm shadow-sm tabular-nums">
          <GreenCoin /> {me.isGuest ? "그린" : me.green.toLocaleString("ko-KR")}
        </button>
      )}
      {hint && !sitting && (
        <p className="pointer-events-none absolute inset-x-4 top-16 mx-auto w-fit rounded-full bg-cream/85 px-4 py-1.5 text-center text-sm">
          {touch ? "화면 위쪽을 누르고 있으면 앞으로, 옆으로 치우치면 돌아요 · 빈 곳을 톡 누르면 메뉴" : "↑↓(W·S)로 걷고 ←→(A·D)로 돌아요 · 마우스로 끌어서 둘러보기 · 우클릭하면 메뉴"}
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
            if (r?.ok) { audioRef.current?.paper(); mpRef.current?.notifyNote(writeTo.sessionId); sayRef.current(`${writeTo.nickname}님에게 쪽지를 건넸어요 🌸`); setWriteTo(null); refreshMe.current(); }
            else sayRef.current(r?.reason === "no_sheet" ? "노트가 없어요" : "쪽지를 건네지 못했어요");
          }} />
      )}
      {panel === "info" && <InfoPanel nickname={nickname} touch={touch} onClose={() => setPanel(null)} />}
      {panel === "wallet" && me && <WalletPanel me={me} onClose={() => setPanel(null)} />}
      {panel === "shop" && me && <ShopPanel me={me} onClose={() => setPanel(null)} onBought={(msg) => { audioRef.current?.pop(); sayRef.current(msg); refreshMe.current(); }} />}

      {/* 미니맵: 접었다 펼 수 있음 (모바일은 접힌 채 시작) */}
      <div className="absolute bottom-4 right-4 size-40 max-sm:size-32">
        <canvas ref={mini} aria-label="미니맵 (끌어서 둘러보기, 휠로 확대)" aria-hidden={!miniOpen}
          className={`size-full origin-bottom-right cursor-grab touch-none rounded-2xl shadow-md ring-2 ring-cream transition-[opacity,scale] duration-200 ease-out active:cursor-grabbing ${miniOpen ? "" : "pointer-events-none scale-50 opacity-0"}`} />
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

type InboxNote = { id: number; from: string | null; strokes: Strokes; readAt: string | null; createdAt: string };

/** 받은 쪽지함 */
function Inbox({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<InboxNote[] | null>(null);
  const [open, setOpen] = useState<InboxNote | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/notes", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).then((x: InboxNote[]) => { if (alive) setRows(x); }).catch(() => alive && setRows([]));
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
    <section role="dialog" aria-label="쪽지함" className="absolute inset-x-4 bottom-24 top-16 z-20 mx-auto flex w-[min(100%,26rem)] flex-col overflow-hidden rounded-3xl bg-cream/97 shadow-xl ring-1 ring-sakura/20">
      <header className="flex items-center px-5 pt-4">
        <h2 className="text-lg">{open ? `${open.from ?? "누군가"}님의 쪽지` : "받은 쪽지"}</h2>
        {open && <button onClick={() => setOpen(null)} className="ml-3 text-sm underline opacity-70">목록</button>}
        <button onClick={onClose} aria-label="닫기" className="ml-auto px-2 text-xl opacity-60">×</button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {open ? (
          <div className="flex flex-col items-center gap-2">
            <NoteView strokes={open.strokes} className="w-full max-w-[20rem]" />
            <p className="text-xs opacity-60">{when(open.createdAt)}</p>
          </div>
        ) : !rows ? <p className="text-sm opacity-60">불러오는 중…</p> : rows.length === 0 ? <p className="text-sm opacity-60">아직 받은 쪽지가 없어요</p> : (
          <ul className="grid grid-cols-3 gap-3">
            {rows.map((n) => (
              <li key={n.id}>
                <button onClick={() => view(n)} className="relative flex w-full flex-col items-center gap-1 rounded-2xl bg-white p-2">
                  {!n.readAt && <span className="absolute right-2 top-2 size-2 rounded-full bg-sakura" aria-label="안 읽음" />}
                  <NoteView strokes={n.strokes} className="w-full" />
                  <span className="line-clamp-1 text-xs">{n.from ?? "누군가"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** 소원나무 쪽지 보기 (내 쪽지면 떼기·다시 가리기) */
function TreeNotePanel({ note, sheets, onClose, onChanged }: { note: TreeNote; sheets: number; onClose: () => void; onChanged: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const act = async (action: "peel" | "cover") => {
    if (action === "peel" && !confirm("겹친 장을 떼면 덮개 한 장이 찢어지고, 쪽지는 모두가 볼 수 있게 돼요. 뗄까요?")) return;
    setBusy(true);
    const r = await fetch("/api/tree", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: note.id, action }) })
      .then((x) => x.json() as Promise<{ ok: boolean; reason?: string }>).catch(() => null);
    setBusy(false);
    if (r?.ok) onChanged(action === "peel" ? "겹친 장을 뗐어요" : "새 노트 한 장으로 다시 가렸어요");
    else alert(r?.reason === "no_sheet" ? "노트가 없어요" : "처리하지 못했어요");
  };
  return (
    <section role="dialog" aria-label="소원 쪽지" className="absolute inset-x-4 top-1/2 z-30 mx-auto flex w-[min(100%,22rem)] -translate-y-1/2 flex-col items-center gap-3 rounded-3xl bg-cream/97 p-5 shadow-xl ring-1 ring-sakura/20">
      <div className="flex w-full items-center">
        <h2 className="text-lg">{note.mine ? "내 소원 쪽지" : `${note.from ?? "누군가"}님의 소원`}</h2>
        <button onClick={onClose} aria-label="닫기" className="ml-auto px-2 text-xl opacity-60">×</button>
      </div>
      {note.strokes && !note.covered ? <NoteView strokes={note.strokes as Strokes} className="w-full max-w-[16rem]" /> : (
        <div className="flex aspect-square w-full max-w-[16rem] items-center justify-center rounded-full bg-[#f29bb5]/40 text-center text-sm">두 장을 겹쳐 붙여<br />가려진 쪽지예요</div>
      )}
      {note.mine && note.covered && <p className="text-center text-xs opacity-60">겹친 장을 떼야 내용을 볼 수 있어요. 떼면 모두가 볼 수 있게 돼요</p>}
      {note.mine && (
        note.covered
          ? <button disabled={busy} onClick={() => act("peel")} className="rounded-full bg-white px-5 py-2 text-sm ring-1 ring-sakura/40">겹친 장 떼서 보기</button>
          : <button disabled={busy || sheets < 1} onClick={() => act("cover")} className="rounded-full bg-sakura px-5 py-2 text-sm text-white disabled:opacity-50">다시 가리기 (노트 1장)</button>
      )}
    </section>
  );
}
