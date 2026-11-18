// Chủ Thầu Tí Hon – máy chủ game xây nhà TikTok LIVE
// - Nghe bình luận / quà / tim / follow từ TikTok LIVE theo username (tiktok-live-connector, không cần đăng nhập)
// - Đẩy sự kiện sang trang stage + bảng điều khiển qua SSE (/api/events)
// - Đọc giọng MC tiếng Việt bằng Edge TTS (/api/tts)
// Cấu trúc dựa theo repo mẫu lop-hoc-chu (MIT).
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3010;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
// Trên Render (link công khai) nên đặt CONTROL_PIN để người lạ không bấm điều khiển được
const CONTROL_PIN = process.env.CONTROL_PIN || '';
// DEMO_BOT=1: tự sinh người xem ảo (dùng cho bản demo Render)
const DEMO_BOT = process.env.DEMO_BOT === '1';

fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- Cài đặt (lưu settings.json, tắt máy mở lại vẫn còn) ----------
const DEFAULT_SETTINGS = {
  tiktokUser: 'ductranvipp',
  eulerKey: '',
  autoConnect: false,
  voice: 'f', // f = Hoài My (nữ), m = Nam Minh (nam)
  mcOn: true,
  quality: 'low', // low: máy Intel UHD · high: card rời
  buildMinutes: 15,
  voteSeconds: 30,
  // quà → hiệu ứng (quà chỉ tạo hiệu ứng + vinh danh, KHÔNG đẩy tiến độ)
  giftEffects: [
    { gift: 'Rose', label: 'Hoa hồng', effect: 'tim', on: true },
    { gift: 'TikTok', label: 'TikTok', effect: 'khac-ten', on: true },
    { gift: 'Finger Heart', label: 'Bắn tim', effect: 'phao-hoa', on: true },
    { gift: 'Doughnut', label: 'Bánh donut', effect: 'xe-bon', on: true },
    { gift: 'Perfume', label: 'Nước hoa', effect: 'bong-bay', on: true },
    { gift: '*', label: 'Quà khác', effect: 'khac-ten', on: true },
  ],
};
let settings = { ...DEFAULT_SETTINGS };
try {
  settings = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
} catch {
  // chưa có file: dùng mặc định
}
const saveSettings = (patch) => {
  settings = { ...settings, ...patch };
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error('Không lưu được settings.json:', err.message);
  }
  broadcast('settings', publicSettings());
};
const publicSettings = () => ({ ...settings, eulerKey: settings.eulerKey ? '••••' + settings.eulerKey.slice(-4) : '' });

// ---------- SSE ----------
const app = express();
app.use(express.json({ limit: '1mb' }));
let sseClients = [];
let lastState = null; // ảnh chụp trạng thái game mới nhất (stage gửi lên)

function broadcast(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of sseClients) {
    try {
      c.res.write(payload);
    } catch {
      // trình duyệt đã đóng
    }
  }
}

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  const client = { id: String(req.query.id || Date.now() + Math.random()).slice(0, 40), res, role: String(req.query.role || 'dash') };
  sseClients.push(client);
  res.write(`event: status\ndata: ${JSON.stringify(liveStats)}\n\n`);
  res.write(`event: settings\ndata: ${JSON.stringify(publicSettings())}\n\n`);
  if (lastState) res.write(`event: state\ndata: ${JSON.stringify(lastState)}\n\n`);
  announceStages();
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => {
    clearInterval(ping);
    sseClients = sseClients.filter((c) => c !== client);
    announceStages();
  });
});
// Chỉ trang stage mở SAU CÙNG được phát tiếng (tránh 2 giọng đọc đè nhau)
function announceStages() {
  const stages = sseClients.filter((c) => c.role === 'stage');
  broadcast('speaker', { id: stages.at(-1)?.id ?? null, count: stages.length });
}

// ---------- Bảo vệ lệnh điều khiển ----------
const guard = (req, res, next) => {
  if (!CONTROL_PIN) return next();
  if (req.get('x-pin') === CONTROL_PIN) return next();
  return res.status(401).json({ success: false, error: 'Sai mã PIN điều khiển' });
};
app.get('/api/auth', (req, res) => res.json({ needPin: !!CONTROL_PIN, ok: !CONTROL_PIN || req.get('x-pin') === CONTROL_PIN }));

// ---------- Kết nối TikTok LIVE ----------
const emptyStats = () => ({ isConnected: false, isConnecting: false, username: '', roomId: '', viewerCount: 0, totalLikes: 0, totalDiamonds: 0, error: '' });
let liveStats = emptyStats();
let activeConn = null;
let wantUser = '';
let reconnectTimer = null;
let reconnectTries = 0;

const userOf = (d) => d?.user?.uniqueId || d?.user?.displayId || d?.uniqueId || 'nguoi-xem';
const nickOf = (d) => d?.user?.nickname || d?.nickname || d?.uniqueId || 'Bạn';
const avatarOf = (d) => d?.user?.avatarThumb?.urlList?.[0] || d?.user?.profilePicture?.urls?.[0] || '';

function scheduleReconnect(reason) {
  if (!wantUser || reconnectTimer) return;
  const wait = Math.min(120, 15 * 2 ** reconnectTries) * 1000;
  reconnectTries++;
  liveStats.error = `${reason}. Tự thử lại sau ${wait / 1000} giây`;
  broadcast('status', liveStats);
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      await connectTikTok(wantUser);
    } catch (err) {
      scheduleReconnect(`Chưa kết nối được: ${err.message}`);
    }
  }, wait);
}
function stopReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  reconnectTries = 0;
}

async function connectTikTok(user) {
  if (activeConn) {
    try {
      activeConn.disconnect();
    } catch {
      // bỏ qua
    }
    activeConn = null;
  }
  liveStats = { ...emptyStats(), isConnecting: true, username: user };
  broadcast('status', liveStats);

  const opts = { processInitialData: false, enableExtendedGiftInfo: false };
  if (settings.eulerKey) opts.signApiKey = settings.eulerKey;
  const conn = new TikTokLiveConnection(user, opts);

  conn.on(ControlEvent.CONNECTED, (state) => {
    console.log(`[TikTok] Đã kết nối @${user}, room ${state?.roomId}`);
    liveStats = { ...liveStats, isConnected: true, isConnecting: false, roomId: state?.roomId || '', error: '' };
    broadcast('status', liveStats);
    reconnectTries = 0;
  });
  conn.on(ControlEvent.DISCONNECTED, () => {
    if (activeConn !== conn) return;
    liveStats = { ...liveStats, isConnected: false, isConnecting: false };
    broadcast('status', liveStats);
    scheduleReconnect('Mất kết nối TikTok');
  });
  conn.on(WebcastEvent.STREAM_END, () => {
    if (activeConn !== conn) return;
    liveStats = { ...liveStats, isConnected: false, isConnecting: false, error: 'Phiên live đã kết thúc' };
    broadcast('status', liveStats);
    scheduleReconnect('Phiên live đã kết thúc');
  });
  conn.on(WebcastEvent.CHAT, (d) => {
    emit('chat', { user: userOf(d), nick: nickOf(d), avatar: avatarOf(d), text: d?.comment || d?.content || '' });
  });
  // Quà combo: TikTok gửi lại repeatCount cộng dồn → chỉ chuyển phần mới
  const streak = new Map();
  conn.on(WebcastEvent.GIFT, (d) => {
    const user = userOf(d);
    const key = `${user}_${d?.giftId || 0}`;
    const total = d?.repeatCount || 1;
    const delta = total - (streak.get(key) || 0);
    const streakable = (d?.gift?.type ?? d?.giftDetails?.giftType ?? d?.giftType) === 1;
    if (streakable && !d?.repeatEnd) streak.set(key, total);
    else streak.delete(key);
    if (delta <= 0) return;
    const diamond = d?.gift?.diamondCount || d?.diamondCount || d?.giftDetails?.diamondCount || 1;
    liveStats.totalDiamonds += diamond * delta;
    emit('gift', {
      user,
      nick: nickOf(d),
      avatar: avatarOf(d),
      giftName: d?.gift?.name || d?.giftDetails?.giftName || d?.giftName || 'Quà',
      diamond,
      count: delta,
    });
  });
  conn.on(WebcastEvent.LIKE, (d) => {
    if (typeof d?.totalLikeCount === 'number') liveStats.totalLikes = d.totalLikeCount;
    emit('like', { user: userOf(d), nick: nickOf(d), count: d?.likeCount || 1 });
  });
  conn.on(WebcastEvent.FOLLOW, (d) => emit('follow', { user: userOf(d), nick: nickOf(d), avatar: avatarOf(d) }));
  conn.on(WebcastEvent.SHARE, (d) => emit('share', { user: userOf(d), nick: nickOf(d) }));
  conn.on(WebcastEvent.MEMBER, (d) => emit('member', { user: userOf(d), nick: nickOf(d) }));
  conn.on(WebcastEvent.ROOM_USER, (d) => {
    if (typeof d?.viewerCount === 'number') {
      liveStats.viewerCount = d.viewerCount;
      broadcast('status', liveStats);
    }
  });
  conn.on(ControlEvent.ERROR, (err) => {
    liveStats.error = err?.message || String(err);
    broadcast('status', liveStats);
  });

  activeConn = conn;
  try {
    const live = await conn.fetchIsLive().catch(() => true);
    if (!live) throw new Error('Tài khoản CHƯA LIVE. Bấm Phát trực tiếp trong LIVE Studio trước rồi mới kết nối');
    return await Promise.race([
      conn.connect(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('quá 30 giây không vào được phòng live')), 30000)),
    ]);
  } catch (err) {
    liveStats = { ...liveStats, isConnected: false, isConnecting: false, error: err.message };
    broadcast('status', liveStats);
    if (activeConn === conn) {
      try {
        conn.disconnect();
      } catch {
        // bỏ qua
      }
      activeConn = null;
    }
    throw err;
  }
}

// Mọi sự kiện (thật hoặc giả lập) đi qua đây
function emit(type, data) {
  broadcast(type, { ...data, ts: Date.now() });
}

app.post('/api/tiktok/connect', guard, async (req, res) => {
  const user = String(req.body?.username || settings.tiktokUser || '').replace(/^@/, '').trim();
  if (!user) return res.status(400).json({ success: false, error: 'Chưa nhập username TikTok' });
  stopReconnect();
  wantUser = user;
  saveSettings({ tiktokUser: user, autoConnect: true });
  try {
    const state = await connectTikTok(user);
    res.json({ success: true, roomId: state?.roomId });
  } catch (err) {
    scheduleReconnect(`Không kết nối được: ${err.message}`);
    res.status(400).json({ success: false, error: `Không kết nối được @${user}: ${err.message}. Server sẽ tự thử lại.` });
  }
});
app.post('/api/tiktok/disconnect', guard, (_req, res) => {
  wantUser = '';
  stopReconnect();
  saveSettings({ autoConnect: false });
  if (activeConn) {
    try {
      activeConn.disconnect();
    } catch {
      // bỏ qua
    }
  }
  activeConn = null;
  liveStats = emptyStats();
  broadcast('status', liveStats);
  res.json({ success: true });
});

// ---------- Cài đặt / điều khiển ----------
app.get('/api/settings', (_req, res) => res.json(publicSettings()));
app.post('/api/settings', guard, (req, res) => {
  const b = req.body || {};
  const patch = {};
  if (b.voice === 'f' || b.voice === 'm') patch.voice = b.voice;
  if (typeof b.mcOn === 'boolean') patch.mcOn = b.mcOn;
  if (b.quality === 'low' || b.quality === 'high') patch.quality = b.quality;
  if (Number(b.buildMinutes) >= 5 && Number(b.buildMinutes) <= 60) patch.buildMinutes = Number(b.buildMinutes);
  if (Number(b.voteSeconds) >= 10 && Number(b.voteSeconds) <= 120) patch.voteSeconds = Number(b.voteSeconds);
  if (typeof b.tiktokUser === 'string') patch.tiktokUser = b.tiktokUser.replace(/^@/, '').trim();
  if (typeof b.eulerKey === 'string' && !b.eulerKey.startsWith('••')) patch.eulerKey = b.eulerKey.trim();
  if (Array.isArray(b.giftEffects)) {
    patch.giftEffects = b.giftEffects.slice(0, 40).map((g) => ({
      gift: String(g.gift || '').slice(0, 40),
      label: String(g.label || g.gift || '').slice(0, 40),
      effect: ['tim', 'phao-hoa', 'xe-bon', 'khac-ten', 'bong-bay'].includes(g.effect) ? g.effect : 'khac-ten',
      on: g.on !== false,
    }));
  }
  saveSettings(patch);
  res.json({ success: true, settings: publicSettings() });
});

const CONTROL_ACTIONS = ['start', 'skip', 'pause', 'resume', 'reset', 'say', 'pickHouse', 'handover'];
app.post('/api/control', guard, (req, res) => {
  const { action, value } = req.body || {};
  if (!CONTROL_ACTIONS.includes(action)) return res.status(400).json({ success: false, error: 'Lệnh không hợp lệ' });
  broadcast('control', { action, value });
  res.json({ success: true, stages: sseClients.filter((c) => c.role === 'stage').length });
});

// Trang stage gửi ảnh chụp trạng thái → bảng điều khiển vẽ lại (xem trước luôn khớp live)
app.post('/api/state', (req, res) => {
  lastState = req.body;
  for (const c of sseClients) {
    if (c.role === 'stage') continue;
    try {
      c.res.write(`event: state\ndata: ${JSON.stringify(lastState)}\n\n`);
    } catch {
      // bỏ qua
    }
  }
  res.json({ success: true });
});

// ---------- Người xem ảo (chạy thử không cần LIVE) ----------
const FAKE_NAMES = ['Minh Quang', 'Ngọc Trân', 'Huy Hoàng', 'Bảo Trâm', 'Thu Trang', 'Đức Anh', 'Lan Anh', 'Gia Huy', 'Khánh Linh', 'Văn Toàn', 'Hải Yến', 'Quốc Bảo', 'Thanh Hà', 'Minh Tuấn', 'Ngọc Hân'];
const FAKE_WORDS = ['thép', 'xi măng', 'cát', 'đá', 'gạch', 'ngói', 'sơn', 'gỗ', 'kính', 'ống nước', 'dây điện', 'bê tông', 'hay quá', 'xây nhanh lên', 'nhà đẹp ghê'];
const FAKE_GIFTS = [['Rose', 1], ['Finger Heart', 5], ['TikTok', 1], ['Doughnut', 30], ['Perfume', 20]];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const fakeUser = () => {
  const n = pick(FAKE_NAMES);
  return { user: 'ao_' + n.replace(/\s/g, '').toLowerCase(), nick: n, avatar: '' };
};
function fakeEvent(type, extra = {}) {
  const u = fakeUser();
  if (type === 'chat') emit('chat', { ...u, text: extra.text || pick(FAKE_WORDS) });
  else if (type === 'vote') emit('chat', { ...u, text: String(extra.value || 1 + Math.floor(Math.random() * 4)) });
  else if (type === 'gift') {
    const [g, d] = extra.giftName ? [extra.giftName, extra.diamond || 1] : pick(FAKE_GIFTS);
    emit('gift', { ...u, giftName: g, diamond: d, count: extra.count || 1 });
  } else if (type === 'like') emit('like', { ...u, count: extra.count || 15 });
  else if (type === 'follow') emit('follow', u);
  else if (type === 'share') emit('share', u);
}
app.post('/api/test/emit', guard, (req, res) => {
  const { type, ...extra } = req.body || {};
  if (!['chat', 'vote', 'gift', 'like', 'follow', 'share'].includes(type)) return res.status(400).json({ success: false, error: 'Loại sự kiện không hợp lệ' });
  const n = Math.min(200, Number(extra.repeat) || 1);
  for (let i = 0; i < n; i++) setTimeout(() => fakeEvent(type, extra), i * 60);
  res.json({ success: true });
});
let botTimer = null;
function setBot(on) {
  if (botTimer) clearInterval(botTimer);
  botTimer = null;
  if (on) {
    botTimer = setInterval(() => {
      const r = Math.random();
      const phase = lastState?.phase;
      if (phase === 'vote') fakeEvent('vote');
      else if (r < 0.55) fakeEvent('chat', { text: lastState?.need?.length && Math.random() < 0.7 ? pick(lastState.need).w : undefined });
      else if (r < 0.85) fakeEvent('like', { count: 5 + Math.floor(Math.random() * 30) });
      else if (r < 0.93) fakeEvent('follow');
      else if (r < 0.985) fakeEvent('share');
      else fakeEvent('gift');
    }, 900);
  }
  broadcast('bot', { on: !!botTimer });
}
app.post('/api/test/bot', guard, (req, res) => {
  setBot(!!req.body?.on);
  res.json({ success: true, on: !!botTimer });
});
app.get('/api/test/bot', (_req, res) => res.json({ on: !!botTimer }));

// ---------- Giọng đọc Edge TTS ----------
const VOICES = { f: 'vi-VN-HoaiMyNeural', m: 'vi-VN-NamMinhNeural' };
const escapeXml = (s) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);
async function edgeTts(text, voice, rate) {
  let last;
  for (let i = 0; i < 3; i++) {
    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(escapeXml(text), { rate: `${rate >= 1 ? '+' : ''}${Math.round((rate - 1) * 100)}%` });
      const chunks = [];
      const read = (async () => {
        for await (const c of audioStream) chunks.push(c);
      })();
      await Promise.race([read, new Promise((_, rej) => setTimeout(() => rej(new Error('Edge TTS quá giờ')), 15000))]);
      if (!chunks.length) throw new Error('Edge TTS không trả âm thanh');
      return Buffer.concat(chunks);
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    } finally {
      try {
        tts.close();
      } catch {
        // bỏ qua
      }
    }
  }
  throw last;
}
async function googleTts(text) {
  const parts = [];
  for (let i = 0; i < text.length; i += 190) {
    const q = text.slice(i, i + 190);
    const r = await fetch(`https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://translate.google.com/' },
    });
    if (!r.ok) throw new Error(`Google TTS lỗi ${r.status}`);
    parts.push(Buffer.from(await r.arrayBuffer()));
  }
  return Buffer.concat(parts);
}
const ttsCache = new Map();
app.get('/api/tts', async (req, res) => {
  const text = String(req.query.text || '').trim().slice(0, 600);
  if (!text) return res.status(400).send('Thiếu text');
  const voice = VOICES[req.query.v] || VOICES[settings.voice] || VOICES.f;
  const rate = Math.min(1.4, Math.max(0.7, Number(req.query.rate) || 1.08));
  const key = `${voice}|${rate}|${text}`;
  try {
    let audio = ttsCache.get(key);
    if (!audio) {
      try {
        audio = await edgeTts(text, voice, rate);
        ttsCache.set(key, audio);
        if (ttsCache.size > 300) ttsCache.delete(ttsCache.keys().next().value);
      } catch (err) {
        console.warn('[TTS] Edge lỗi, dùng giọng dự phòng Google:', err.message);
        audio = await googleTts(text);
      }
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(audio);
  } catch (err) {
    console.error('[TTS] lỗi:', err.message);
    res.status(500).json({ error: 'TTS lỗi' });
  }
});

// ---------- Trang web ----------
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three'), { maxAge: '7d' }));
app.get('/', (req, res, next) => {
  if (req.query.view === 'stage') return res.sendFile(path.join(__dirname, 'public/stage.html'));
  next();
});
app.get('/stage', (_req, res) => res.sendFile(path.join(__dirname, 'public/stage.html')));
app.use(express.static(path.join(__dirname, 'public'), { index: 'dashboard.html' }));
app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log('');
  console.log('  🏗️  CHỦ THẦU TÍ HON đang chạy');
  console.log(`  ▶ Bảng điều khiển : http://localhost:${PORT}`);
  console.log(`  ▶ Link cho OBS/LIVE Studio (1080x1920): http://localhost:${PORT}/?view=stage`);
  console.log('');
  if (DEMO_BOT) setBot(true);
  if (settings.autoConnect && settings.tiktokUser) {
    wantUser = settings.tiktokUser;
    connectTikTok(wantUser).catch((err) => scheduleReconnect(`Chưa kết nối được: ${err.message}`));
  }
});
