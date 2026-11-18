// Chủ Thầu Tí Hon – luật chơi + màn hình stage (1080×1920)
// ?view=stage        : chạy game thật, phát tiếng, gửi trạng thái lên server
// ?view=stage&mute=1 : như trên nhưng không phát tiếng
// ?mirror=1          : chỉ vẽ lại theo trạng thái server gửi (bản xem trước trong bảng điều khiển)
import * as THREE from 'three';
import { HOUSES, buildStages } from './houses.js';
import { SiteBuilder } from './builder.js';

const qs = new URLSearchParams(location.search);
const MIRROR = qs.get('mirror') === '1';
const MUTE = qs.get('mute') === '1' || MIRROR;
const MY_ID = 'stage-' + Math.random().toString(36).slice(2, 10);
if (MIRROR) document.body.classList.add('mirror');
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

// ---------- Khung 1080×1920 co giãn vừa cửa sổ ----------
const app = $('app');
function fit() {
  const s = Math.min(innerWidth / 1080, innerHeight / 1920);
  app.style.transform = `translate(${(innerWidth - 1080 * s) / 2}px, ${(innerHeight - 1920 * s) / 2}px) scale(${s})`;
}
addEventListener('resize', fit);
fit();

// ---------- Cài đặt (server gửi qua SSE) ----------
let CFG = { voice: 'f', mcOn: true, quality: 'low', buildMinutes: 15, voteSeconds: 30, giftEffects: [] };
let firstQuality = null;

// ---------- three.js ----------
const quality = localStorage.getItem('cth-quality') || 'low';
const HQ = quality === 'high' && !MIRROR;
const RS = HQ ? 1 : MIRROR ? 0.5 : 0.7; // độ phân giải 3D (giảm để máy Intel UHD chạy mượt)
const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: HQ, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(1080 * RS, 1920 * RS, false);
renderer.localClippingEnabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = HQ;
const scene = new THREE.Scene();
{
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#4a90d9');
  grd.addColorStop(0.6, '#a9d4f5');
  grd.addColorStop(1, '#e8f4ff');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
}
scene.fog = new THREE.Fog('#cfe6f7', 60, 160);
scene.add(new THREE.HemisphereLight('#dff0ff', '#6b8f4e', 1.25));
const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
sun.position.set(18, 32, 22);
if (HQ) {
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, far: 90 });
}
scene.add(sun);
const camera = new THREE.PerspectiveCamera(40, 1080 / 1920, 0.5, 400);
const builder = new SiteBuilder(scene, quality);
window.__cth = { builder, scene };
if (HQ) scene.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));

// ---------- Trạng thái game ----------
const SAVE_KEY = 'cth-save-v1';
let saved = {};
try {
  saved = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
} catch {
  saved = {};
}
const G = {
  phase: 'vote', // vote | build | finale
  round: (saved.housesBuilt || 0) + 1,
  housesBuilt: saved.housesBuilt || 0,
  houseId: 0,
  votes: { 1: 0, 2: 0, 3: 0, 4: 0 },
  voters: new Map(),
  phaseEnds: 0,
  stages: [],
  si: 0,
  p: 0,
  paused: false,
  workers: 4,
  likes: [], // [thời điểm, số tim]
  totalLikes: 0,
  users: new Map(Object.entries(saved.users || {})), // user → { nick, pts }
  roundPts: new Map(),
  honors: new Map(), // user → { nick, diamonds }
  need: {},
  matBonus: 0,
  feed: [],
  owner: null,
  mcLine: '',
  speed: 1,
};
const TITLES = [
  [150, 'Kiến trúc sư', '📐'],
  [60, 'Cai thầu', '🦺'],
  [20, 'Thợ chính', '🔨'],
  [0, 'Thợ phụ', '🧱'],
];
const titleOf = (pts) => TITLES.find(([t]) => pts >= t);
function save() {
  if (MIRROR) return;
  const top = [...G.users.entries()].sort((a, b) => b[1].pts - a[1].pts).slice(0, 300);
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ housesBuilt: G.housesBuilt, users: Object.fromEntries(top) }));
  } catch {
    // bỏ qua
  }
}
setInterval(save, 30000);

// ---------- Âm thanh: giọng MC (Edge TTS qua server) + hiệu ứng ----------
let isSpeaker = !MUTE;
let audioOk = true;
const ttsQ = [];
let ttsBusy = false;
let mcTimer = null;
function say(text, prio = 1) {
  G.mcLine = text;
  showMc(text);
  if (MUTE || !isSpeaker || !CFG.mcOn) return;
  if (ttsQ.length >= 3 && prio < 2) return; // đông quá thì bỏ câu phụ
  if (prio >= 3) ttsQ.unshift(text);
  else ttsQ.push(text);
  nextTts();
}
function nextTts() {
  if (ttsBusy) return;
  const t = ttsQ.shift();
  if (!t) return;
  ttsBusy = true;
  showMc(t);
  const a = new Audio(`/api/tts?v=${CFG.voice}&text=${encodeURIComponent(t)}`);
  const done = () => {
    ttsBusy = false;
    setTimeout(nextTts, 250);
  };
  a.onended = done;
  a.onerror = done;
  a.play().catch(() => {
    audioOk = false;
    $('tapSound').style.display = 'block';
    done();
  });
}
function showMc(t) {
  $('mcName').textContent = CFG.voice === 'm' ? '🎙️ MC Nam Minh' : '🎙️ MC Hoài My';
  $('mcText').textContent = t;
  $('mc').classList.add('on');
  clearTimeout(mcTimer);
  mcTimer = setTimeout(() => $('mc').classList.remove('on'), Math.max(4000, t.length * 75));
}
let actx = null;
function beep(freqs, dur = 0.12, type = 'triangle', vol = 0.15) {
  if (MUTE || !isSpeaker) return;
  try {
    actx ||= new AudioContext();
    let t = actx.currentTime;
    for (const f of freqs) {
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(actx.destination);
      o.start(t);
      o.stop(t + dur);
      t += dur * 0.8;
    }
  } catch {
    // bỏ qua
  }
}
const sfx = {
  ding: () => beep([880, 1320], 0.18),
  done: () => beep([523, 659, 784, 1047], 0.16),
  pop: () => beep([600, 900], 0.08, 'sine', 0.2),
};
addEventListener('click', () => {
  $('tapSound').style.display = 'none';
  audioOk = true;
  actx?.resume?.();
  nextTts();
});

// ---------- Lời MC theo giai đoạn (giải thích quy trình xây nhà thật) ----------
function stageIntro(st) {
  const k = st.key;
  const n = (st.floor ?? 0) + 1;
  const L = {
    permit: 'Bước đầu tiên: xin giấy phép xây dựng. Chủ thầu nộp hồ sơ và bản vẽ thiết kế lên phường. Cả nhà gõ chữ ký để duyệt hồ sơ nhanh nha!',
    survey: 'Có giấy phép rồi! Giờ khảo sát và định vị mặt bằng: đóng cọc mốc, căng dây theo trục cột. Gõ cọc để đóng cọc nha!',
    excavate: 'Đào móng! Máy xúc đào hố ở từng chân cột và rãnh giằng móng. Gõ đào để đào nhanh hơn!',
    foundation: 'Làm móng: buộc thép, ghép cốp pha, rồi đổ bê tông móng và giằng móng. Gõ thép, xi măng, cát, đá để chở vật liệu vào!',
    stairs: 'Đổ cầu thang bê tông nối các tầng. Gõ bê tông hoặc thép nha!',
    walls: 'Xây tường gạch từng lớp một, giàn giáo dựng bao quanh. Gõ gạch và vữa để thợ xây nhanh tay!',
    mep: 'Đi đường điện nước: đi dây điện, ống cấp thoát nước, lắp bồn nước. Gõ dây điện, ống nước nha!',
    finish: 'Hoàn thiện: trát tường, ốp lát rồi sơn màu. Gõ sơn để tô màu cho ngôi nhà!',
    doors: 'Lắp cửa, kính, lan can, làm sân vườn và trồng cây. Sắp xong rồi cả nhà ơi!',
    handover: 'Nghiệm thu công trình! Cả nhà gõ chúc mừng để chuẩn bị cắt băng khánh thành!',
  };
  if (k.startsWith('col-')) return `Dựng cột tầng ${n}: dựng lồng thép, ghép cốp pha rồi đổ bê tông cột. Gõ thép hoặc bê tông nha!`;
  if (k.startsWith('beam-')) return `${st.name}: chống giáo, ghép cốp pha, rải thép rồi đổ bê tông. Gõ bê tông để xe bồn chạy vào!`;
  if (k === 'roof') {
    const h = HOUSES.find((x) => x.id === G.houseId);
    return h?.roof === 'flat' ? 'Xây tum thang, tường chắn mái và quét chống thấm sân thượng. Gõ chống thấm nha!' : 'Lợp mái: dựng vì kèo, xà gồ thép, rồi lợp ngói từ diềm mái lên nóc. Gõ ngói nha!';
  }
  return L[k] || st.name;
}

// ---------- Các pha ----------
function startVote() {
  G.phase = 'vote';
  G.houseId = 0;
  G.votes = { 1: 0, 2: 0, 3: 0, 4: 0 };
  G.voters.clear();
  G.phaseEnds = Date.now() + CFG.voteSeconds * 1000;
  G.stages = [];
  G.si = 0;
  G.p = 0;
  G.owner = null;
  G.roundPts.clear();
  builder.setHouse(null);
  say(`Chào mừng cả nhà đến công trường Chủ Thầu Tí Hon! Bình luận số 1, 2, 3 hoặc 4 để chọn mẫu nhà thứ ${G.round} sẽ xây nha!`, 2);
}
function startBuild(id) {
  const h = HOUSES.find((x) => x.id === id) || HOUSES[0];
  G.phase = 'build';
  G.houseId = h.id;
  const total = CFG.buildMinutes * 60 * 1.15; // tương tác bình thường sẽ rút còn ~15 phút
  const defs = buildStages(h);
  const sumW = defs.reduce((s, d) => s + d.weight, 0);
  G.stages = defs.map((d) => ({ ...d, dur: (d.weight / sumW) * total }));
  G.si = 0;
  G.p = 0;
  builder.setHouse(h);
  if (HQ) builder.root.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
  enterStage();
}
function enterStage() {
  const st = G.stages[G.si];
  G.p = 0;
  G.matBonus = 0;
  G.need = Object.fromEntries(st.mats.map((m) => [m, { n: 0, target: 10, full: false }]));
  say(stageIntro(st));
}
function finishStage() {
  const st = G.stages[G.si];
  sfx.done();
  addFeed('✅', `Xong: <b>${esc(st.name)}</b>`);
  if (G.si >= G.stages.length - 1) return startFinale();
  G.si++;
  enterStage();
}
function startFinale() {
  G.phase = 'finale';
  G.p = 1;
  builder.cutRibbon();
  G.phaseEnds = Date.now() + 28000;
  G.housesBuilt++;
  const best = [...G.roundPts.entries()].sort((a, b) => b[1] - a[1])[0];
  G.owner = best ? G.users.get(best[0])?.nick || best[0] : null;
  const h = HOUSES.find((x) => x.id === G.houseId);
  say(`Chúc mừng! ${h.name} đã hoàn thành và nghiệm thu. ${G.owner ? `Xin trao chìa khoá cho chủ nhà ${G.owner}, người góp công nhiều nhất!` : 'Cảm ơn cả nhà đã cùng xây!'}`, 3);
  for (let i = 0; i < 6; i++) setTimeout(() => fx.firework(), i * 600);
  save();
}

// ---------- Xử lý sự kiện TikTok ----------
function addPts(user, nick, n) {
  const u = G.users.get(user) || { nick, pts: 0 };
  const before = titleOf(u.pts);
  u.nick = nick || u.nick;
  u.pts += n;
  G.users.set(user, u);
  G.roundPts.set(user, (G.roundPts.get(user) || 0) + n);
  const after = titleOf(u.pts);
  if (after !== before) {
    say(`${u.nick} vừa lên chức ${after[1]}!`);
    addFeed(after[2], `<b>${esc(u.nick)}</b> lên chức ${after[1]}`);
  }
}
const lastHit = new Map();
const throttle = (key, ms) => {
  const now = Date.now();
  if (now - (lastHit.get(key) || 0) < ms) return false;
  lastHit.set(key, now);
  return true;
};
function onChat(e) {
  e.text = String(e.text ?? '');
  const t = norm(e.text);
  if (!t) return;
  if (G.phase === 'vote') {
    const m = t.length <= 12 && t.match(/^(?:mau|nha|so|chon)?\s*([1-4])\b/);
    if (m) {
      const v = Number(m[1]);
      const prev = G.voters.get(e.user);
      if (prev) G.votes[prev]--;
      G.voters.set(e.user, v);
      G.votes[v]++;
      if (!prev) addPts(e.user, e.nick, 2);
      addFeed('🗳️', `<b>${esc(e.nick)}</b> chọn mẫu ${v}`);
      return;
    }
  }
  if (G.phase === 'build') {
    let hit = false;
    for (const [word, s] of Object.entries(G.need)) {
      if (!t.includes(norm(word))) continue;
      if (!throttle(`${e.user}|${word}`, 2000)) continue;
      hit = true;
      s.n++;
      if (G.matBonus < 0.3) {
        G.p += 0.006;
        G.matBonus += 0.006;
      }
      if (!s.full && s.n >= s.target) {
        s.full = true;
        G.p += 0.03;
        sfx.ding();
        say(`Đủ ${word} rồi! Cảm ơn cả nhà, công trình tăng tốc!`);
      }
    }
    if (hit) {
      addPts(e.user, e.nick, 2);
      addFeed('📦', `<b>${esc(e.nick)}</b> ➜ ${esc(e.text.slice(0, 24))}`);
      return;
    }
  }
  if (throttle(`c|${e.user}`, 10000)) addPts(e.user, e.nick, 1);
  addFeed('💬', `<b>${esc(e.nick)}</b>: ${esc(e.text.slice(0, 40))}`);
}
const thanks = { follow: [], gift: [] };
function onFollow(e) {
  G.workers = Math.min(16, G.workers + 1);
  addPts(e.user, e.nick, 10);
  addFeed('➕', `<b>${esc(e.nick)}</b> follow · thêm 1 thợ`);
  thanks.follow.push(e.nick);
}
function onLike(e) {
  G.likes.push([Date.now(), e.count]);
  const before = Math.floor(G.totalLikes / 1000);
  G.totalLikes += e.count;
  if (throttle(`l|${e.user}`, 8000)) addPts(e.user, e.nick, 1);
  if (Math.floor(G.totalLikes / 1000) > before) say(`Cả nhà đã thả ${Math.floor(G.totalLikes / 1000)} nghìn tim! Thợ làm hăng say hẳn lên!`);
  fx.hearts(Math.min(6, 1 + Math.floor(e.count / 10)));
}
function onShare(e) {
  addPts(e.user, e.nick, 5);
  addFeed('🔗', `<b>${esc(e.nick)}</b> chia sẻ live`);
}
function giftEffect(name) {
  const list = CFG.giftEffects || [];
  const n = norm(name);
  return list.find((g) => g.on !== false && norm(g.gift) === n) || list.find((g) => g.on !== false && g.gift === '*');
}
function onGift(e) {
  const h = G.honors.get(e.user) || { nick: e.nick, diamonds: 0, at: 0 };
  h.nick = e.nick;
  h.diamonds += (e.diamond || 1) * (e.count || 1);
  h.at = Date.now();
  G.honors.set(e.user, h);
  sfx.pop();
  const eff = giftEffect(e.giftName);
  showBanner(`🎁 ${esc(e.nick)}`, `tặng ${esc(e.giftName)} ×${e.count} · khắc tên lên gạch vinh danh!`);
  addFeed('🎁', `<b>${esc(e.nick)}</b> tặng ${esc(e.giftName)} ×${e.count}`);
  thanks.gift.push(e.nick);
  const kind = eff?.effect || 'khac-ten';
  if (kind === 'tim') fx.hearts(14);
  else if (kind === 'phao-hoa') for (let i = 0; i < 3; i++) setTimeout(() => fx.firework(), i * 350);
  else if (kind === 'bong-bay') fx.balloons(10);
  else if (kind === 'xe-bon') builder.spawnTruck();
  else fx.hearts(5);
  newHonor = e.user;
}
let newHonor = null;
// gom lời cảm ơn để MC không đọc liên tục
setInterval(() => {
  if (MIRROR) return;
  const join = (arr) => {
    const u = [...new Set(arr)];
    return u.length <= 2 ? u.join(' và ') : `${u.slice(0, 2).join(', ')} và ${u.length - 2} bạn khác`;
  };
  if (thanks.gift.length) {
    say(`Cảm ơn ${join(thanks.gift)} đã tặng quà! Tên được khắc lên gạch vinh danh của ngôi nhà rồi nha!`, 2);
    thanks.gift = [];
  } else if (thanks.follow.length) {
    say(`Cảm ơn ${join(thanks.follow)} đã follow, công trường có thêm thợ mới!`);
    thanks.follow = [];
  }
}, 7000);

function addFeed(icon, html) {
  G.feed.unshift({ icon, html });
  G.feed.length = Math.min(G.feed.length, 7);
}
let bannerTimer = null;
function showBanner(title, sub) {
  const b = $('banner');
  b.innerHTML = `${title}<small>${sub}</small>`;
  b.classList.add('on');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.remove('on'), 3800);
}

// ---------- Hiệu ứng 2D: tim, pháo hoa, bóng bay ----------
const fx = (() => {
  const cv = $('fx');
  const g = cv.getContext('2d');
  let parts = [];
  const colors = ['#ff3d7f', '#ffd23f', '#4cd964', '#2d9cdb', '#ff9f1c', '#b388ff'];
  return {
    hearts(n) {
      for (let i = 0; i < n; i++) parts.push({ k: 'h', x: 880 + Math.random() * 160, y: 1400 + Math.random() * 100, vx: -40 + Math.random() * 30, vy: -220 - Math.random() * 120, life: 2.6, s: 30 + Math.random() * 30, c: pick(colors) });
    },
    firework() {
      const x = 150 + Math.random() * 780, y = 450 + Math.random() * 500, c = pick(colors);
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2, v = 200 + Math.random() * 220;
        parts.push({ k: 'f', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.4 + Math.random() * 0.4, s: 6, c });
      }
    },
    balloons(n) {
      for (let i = 0; i < n; i++) parts.push({ k: 'b', x: 100 + Math.random() * 880, y: 1950 + Math.random() * 200, vx: 0, vy: -170 - Math.random() * 80, life: 12, s: 40 + Math.random() * 15, c: pick(colors), ph: Math.random() * 6 });
    },
    tick(dt) {
      g.clearRect(0, 0, 1080, 1920);
      parts = parts.filter((p) => (p.life -= dt) > 0 && p.y > -200);
      for (const p of parts) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        g.globalAlpha = Math.min(1, p.life);
        g.fillStyle = p.c;
        if (p.k === 'f') {
          p.vy += 260 * dt;
          p.vx *= 0.98;
          g.fillRect(p.x, p.y, p.s, p.s);
        } else if (p.k === 'h') {
          g.font = `${p.s}px sans-serif`;
          g.fillText('❤', p.x, p.y);
        } else {
          p.x += Math.sin((p.ph += dt * 2)) * 0.8;
          g.beginPath();
          g.ellipse(p.x, p.y, p.s * 0.8, p.s, 0, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = 'rgba(255,255,255,.7)';
          g.beginPath();
          g.moveTo(p.x, p.y + p.s);
          g.lineTo(p.x, p.y + p.s + 70);
          g.stroke();
        }
      }
      g.globalAlpha = 1;
    },
  };
})();

// ---------- Ảnh chụp trạng thái (gửi bảng điều khiển + bản xem trước) ----------
function speedNow() {
  const now = Date.now();
  G.likes = G.likes.filter(([t]) => now - t < 15000);
  const likeSum = G.likes.reduce((s, [, c]) => s + c, 0);
  const likeBoost = Math.min(0.8, likeSum / 200);
  const workerBonus = Math.min(0.4, Math.max(0, G.workers - 4) * 0.04);
  return 1 + likeBoost + workerBonus;
}
function etaSec() {
  if (G.phase !== 'build') return 0;
  let rest = G.stages[G.si].dur * (1 - G.p);
  for (let i = G.si + 1; i < G.stages.length; i++) rest += G.stages[i].dur;
  return rest / G.speed;
}
function snapshot() {
  const h = HOUSES.find((x) => x.id === G.houseId);
  const st = G.stages[G.si];
  const top = [...G.users.entries()].sort((a, b) => b[1].pts - a[1].pts).slice(0, 5).map(([, u]) => ({ nick: u.nick, pts: u.pts, title: titleOf(u.pts)[1], icon: titleOf(u.pts)[2] }));
  const honors = [...G.honors.entries()].sort((a, b) => b[1].diamonds - a[1].diamonds).slice(0, 12).map(([k, v]) => ({ key: k, nick: v.nick, diamonds: v.diamonds }));
  return {
    t: Date.now(),
    phase: G.phase,
    round: G.round,
    housesBuilt: G.housesBuilt,
    houseId: G.houseId,
    houseName: h?.name || '',
    si: G.si,
    stageCount: G.stages.length,
    stageName: st?.name || '',
    stageNames: G.stages.map((s) => s.name),
    p: Math.min(1, G.p),
    eta: Math.round(etaSec()),
    phaseLeft: Math.max(0, Math.round((G.phaseEnds - Date.now()) / 1000)),
    votes: G.votes,
    workers: G.workers,
    speed: Math.round(G.speed * 100) / 100,
    need: Object.entries(G.need).map(([w, s]) => ({ w, n: s.n, target: s.target, full: s.full })),
    top,
    honors,
    newHonor,
    feed: G.feed,
    owner: G.owner,
    paused: G.paused,
    totalLikes: G.totalLikes,
    mc: G.mcLine,
    viewers: G.users.size,
  };
}

// ---------- Vẽ giao diện từ ảnh chụp (dùng chung cho stage thật và bản xem trước) ----------
let lastHonorKeys = '';
let lastFeed = '';
let curHouse = -1;
function renderUI(S) {
  const h = HOUSES.find((x) => x.id === S.houseId);
  $('houseChip').textContent = h ? `${h.icon} ${h.name}` : '🗳️ Đang chọn mẫu nhà';
  $('roundChip').textContent = `Căn số ${S.round}`;
  const building = S.phase === 'build';
  $('vote').style.display = S.phase === 'vote' ? 'block' : 'none';
  $('stagebar').style.visibility = S.phase === 'vote' ? 'hidden' : 'visible';
  $('need').style.display = building ? 'block' : 'none';
  $('finale').style.display = S.phase === 'finale' ? 'flex' : 'none';
  $('paused').style.display = S.paused ? 'block' : 'none';
  $('topbox').style.display = S.phase === 'build' ? 'block' : 'none';
  const permitOn = building && S.stageName === 'Xin giấy phép xây dựng';
  $('permit').style.display = permitOn ? 'flex' : 'none';
  if (permitOn) {
    $('permitHouse').textContent = `Công trình: ${S.houseName}`;
    $('stamp').classList.toggle('on', S.p > 0.7);
  }
  if (S.phase === 'vote') {
    $('voteLeft').textContent = S.phaseLeft;
    const max = Math.max(...Object.values(S.votes));
    $('voteGrid').innerHTML = HOUSES.map((x) => `
      <div class="vcard ${max > 0 && S.votes[x.id] === max ? 'lead' : ''}">
        <div class="num">${x.id}</div><div class="ic">${x.icon}</div>
        <div class="nm">${x.name}</div><div class="ds">${x.desc}</div>
        <div class="ct">${S.votes[x.id]} phiếu</div>
      </div>`).join('');
  } else {
    $('stageNo').textContent = S.phase === 'finale' ? 'HOÀN THÀNH' : `GIAI ĐOẠN ${S.si + 1}/${S.stageCount}`;
    $('eta').textContent = S.phase === 'finale' ? `Căn tiếp theo sau ${S.phaseLeft}s` : `Còn ~${fmt(S.eta)}`;
    $('stageName').textContent = S.phase === 'finale' ? '🎉 Bàn giao công trình' : S.stageName;
    $('stageFill').style.width = `${Math.round(S.p * 100)}%`;
    if ($('segs').childElementCount !== S.stageCount) $('segs').innerHTML = '<b></b>'.repeat(S.stageCount);
    [...$('segs').children].forEach((b, i) => (b.className = i < S.si || S.phase === 'finale' ? 'done' : i === S.si ? 'cur' : ''));
  }
  if (building) {
    $('needList').innerHTML = S.need.map((m) => `
      <div class="need-row ${m.full ? 'full' : ''}"><div class="w"><b>${esc(m.w)}</b><span>${Math.min(m.n, m.target)}/${m.target}</span></div>
      <div class="bar"><i style="width:${Math.min(100, (m.n / m.target) * 100)}%"></i></div></div>`).join('');
    $('boost').textContent = `⚡ Tốc độ x${S.speed.toFixed(1)} · 👷 ${S.workers} thợ`;
  }
  $('topList').innerHTML = S.top.length
    ? S.top.map((u, i) => `<div class="top-row"><span class="rk">${['🥇', '🥈', '🥉', '4', '5'][i]}</span><span class="nm">${esc(u.nick)}<small>${u.icon} ${u.title}</small></span><span class="pt">${u.pts}</span></div>`).join('')
    : '<i class="empty">Bình luận để vào đội thợ!</i>';
  const fk = S.feed.map((f) => f.html).join('|');
  if (fk !== lastFeed) {
    lastFeed = fk;
    $('feed').innerHTML = S.feed.map((f) => `<div class="fe">${f.icon} ${f.html}</div>`).join('');
  }
  const hk = S.honors.map((x) => x.key + x.diamonds).join();
  if (hk !== lastHonorKeys) {
    lastHonorKeys = hk;
    $('honorList').innerHTML = S.honors.length
      ? S.honors.map((x) => `<span class="brick ${x.key === S.newHonor ? 'new' : ''}">🧱 ${esc(x.nick)}</span>`).join('')
      : '<i class="empty">Tặng quà để được khắc tên lên gạch nhà!</i>';
  }
  if (S.phase === 'finale') {
    $('fhouse').textContent = `${h?.icon || ''} ${S.houseName} · căn thứ ${S.round}`;
    $('fowner').textContent = S.owner || 'Cả nhà trên LIVE';
    $('fcredits').innerHTML = S.top.slice(0, 3).map((u) => `${u.icon} ${esc(u.nick)} — ${u.title}`).join('<br>') || 'Cảm ơn cả nhà đã cùng xây!';
  }
  $('guide').textContent = S.phase === 'vote' ? '💬 Gõ 1 · 2 · 3 · 4 để chọn mẫu nhà · ❤️ Thả tim · ➕ Follow · 🎁 Quà = hiệu ứng & khắc tên' : '💬 Gõ tên vật liệu · ❤️ Thả tim = tăng tốc · ➕ Follow = thêm thợ · 🎁 Quà = hiệu ứng & khắc tên';
  if (MIRROR) {
    if (S.houseId !== curHouse) {
      curHouse = S.houseId;
      builder.setHouse(HOUSES.find((x) => x.id === S.houseId) || null);
    }
    if (S.phase === 'finale') builder.cutRibbon();
  }
  builder.update(S.phase === 'finale' ? S.stageCount - 1 : S.si, S.phase === 'finale' ? 1 : S.p);
  builder.setWorkers(S.phase === 'vote' ? 3 : S.workers);
}

// ---------- Vòng lặp chính (giới hạn 30 khung hình/giây) ----------
let camA = 0.5;
let last = performance.now();
let acc = 0;
let uiAcc = 0;
let postAcc = 0;
let mirrorState = null;
function logic(dt) {
  if (MIRROR || G.paused) return;
  G.speed = speedNow();
  const now = Date.now();
  if (G.phase === 'vote' && now >= G.phaseEnds) {
    const entries = Object.entries(G.votes);
    const max = Math.max(...entries.map(([, v]) => v));
    const win = max > 0 ? Number(pick(entries.filter(([, v]) => v === max))[0]) : 1 + Math.floor(Math.random() * 4);
    const h = HOUSES.find((x) => x.id === win);
    say(max > 0 ? `Mẫu số ${win}, ${h.name}, thắng với ${max} phiếu! Khởi công thôi!` : `Chưa ai bình chọn, công trường chọn luôn mẫu số ${win}, ${h.name}!`, 3);
    startBuild(win);
  } else if (G.phase === 'build') {
    const st = G.stages[G.si];
    G.p += (dt / st.dur) * G.speed;
    if (G.p >= 1) finishStage();
  } else if (G.phase === 'finale' && now >= G.phaseEnds) {
    G.round++;
    startVote();
  }
}
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  acc += dt;
  if (acc < 1 / 31) return; // ~30 fps cho nhẹ máy
  const step = acc;
  acc = 0;
  logic(step);
  builder.tick(step);
  fx.tick(step);
  uiAcc += step;
  if (uiAcc > 0.25) {
    uiAcc = 0;
    const S = MIRROR ? mirrorState : snapshot();
    if (S) renderUI(S);
  }
  postAcc += step;
  if (!MIRROR && postAcc > 0.5) {
    postAcc = 0;
    fetch('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot()) }).catch(() => {});
  }
  // máy quay bay vòng quanh công trình
  camA += step * (G.phase === 'finale' || mirrorState?.phase === 'finale' ? 0.12 : 0.07);
  const h = builder.house;
  const size = h ? Math.max(h.w, h.d) : 12;
  const H = builder.totalH || 8;
  const R = size * 1.7 + H * 1.25 + 12;
  const ang = Math.sin(camA) * 1.0 + 0.15; // quay qua lại phía mặt tiền, không bị nhà hàng xóm che
  camera.position.set(Math.sin(ang) * R, H * 0.6 + R * 0.42, Math.cos(ang) * R + 1);
  camera.lookAt(0, H * 0.32 - 1.5, 0.5);
  renderer.render(scene, camera);
}

// ---------- Kết nối server (SSE) ----------
function connect() {
  const es = new EventSource(`/api/events?role=${MIRROR ? 'mirror' : 'stage'}&id=${MY_ID}`);
  es.addEventListener('settings', (m) => {
    CFG = { ...CFG, ...JSON.parse(m.data) };
    if (firstQuality === null) firstQuality = CFG.quality;
    if (!MIRROR && CFG.quality !== quality) {
      localStorage.setItem('cth-quality', CFG.quality);
      location.reload(); // đổi chất lượng đồ hoạ cần dựng lại
    }
  });
  es.addEventListener('speaker', (m) => {
    const d = JSON.parse(m.data);
    isSpeaker = !MUTE && d.id === MY_ID;
  });
  if (MIRROR) {
    es.addEventListener('state', (m) => (mirrorState = JSON.parse(m.data)));
    return;
  }
  es.addEventListener('chat', (m) => onChat(JSON.parse(m.data)));
  es.addEventListener('gift', (m) => onGift(JSON.parse(m.data)));
  es.addEventListener('like', (m) => onLike(JSON.parse(m.data)));
  es.addEventListener('follow', (m) => onFollow(JSON.parse(m.data)));
  es.addEventListener('share', (m) => onShare(JSON.parse(m.data)));
  es.addEventListener('control', (m) => {
    const { action, value } = JSON.parse(m.data);
    if (action === 'pause') G.paused = true;
    else if (action === 'resume') G.paused = false;
    else if (action === 'say' && value) say(String(value), 3);
    else if (action === 'reset' || action === 'start') startVote();
    else if (action === 'pickHouse') startBuild(Number(value) || 1);
    else if (action === 'handover' && G.phase === 'build') {
      G.si = G.stages.length - 1;
      startFinale();
    } else if (action === 'skip') {
      if (G.phase === 'vote') G.phaseEnds = 0;
      else if (G.phase === 'build') finishStage();
      else if (G.phase === 'finale') G.phaseEnds = 0;
    }
  });
}
connect();
if (!MIRROR) startVote();
requestAnimationFrame(frame);
