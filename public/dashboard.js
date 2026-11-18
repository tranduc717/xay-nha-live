import { HOUSES } from '/stage/houses.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
let PIN = localStorage.getItem('cth-pin') || '';
let SET = {};

function toast(t) {
  $('toast').textContent = t;
  $('toast').classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => $('toast').classList.remove('on'), 2200);
}
async function api(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-pin': PIN }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) {
    PIN = prompt('Nhập mã PIN điều khiển:') || '';
    localStorage.setItem('cth-pin', PIN);
    throw new Error('Sai PIN');
  }
  if (!r.ok || j.success === false) throw new Error(j.error || 'Lỗi');
  return j;
}

// ---------- Menu ----------
const titles = { overview: 'Tổng quan hệ thống', game: 'Điều khiển game', tiktok: 'Kết nối TikTok', gifts: 'Quà & hiệu ứng', mc: 'Giọng MC & đồ hoạ', test: 'Chạy thử không cần LIVE', guide: 'Hướng dẫn lên live' };
$('nav').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  document.querySelectorAll('#nav button').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('main section').forEach((s) => s.classList.toggle('on', s.id === 's-' + b.dataset.s));
  $('title').textContent = titles[b.dataset.s];
});

// ---------- Nút điều khiển ----------
document.addEventListener('click', async (e) => {
  const c = e.target.closest('[data-ctl]');
  if (c) {
    try {
      const r = await api('/api/control', { action: c.dataset.ctl, value: c.dataset.value });
      toast(r.stages ? '✅ Đã gửi lệnh' : '⚠️ Chưa có trang stage nào mở (OBS/LIVE Studio)');
    } catch (err) {
      toast('❌ ' + err.message);
    }
  }
  const em = e.target.closest('[data-emit]');
  if (em) {
    const d = em.dataset;
    api('/api/test/emit', { type: d.emit, text: d.text, count: Number(d.count) || undefined, giftName: d.gift, diamond: Number(d.dia) || undefined, repeat: Number(d.repeat) || 1 }).then(() => toast('✅ Đã gửi')).catch((err) => toast('❌ ' + err.message));
  }
});
$('housePick').innerHTML = HOUSES.map((h) => `<button class="btn" data-ctl="pickHouse" data-value="${h.id}">${h.icon} ${h.id}. ${h.name}</button>`).join('');
$('sayBtn').onclick = () => {
  const v = $('sayText').value.trim();
  if (v) api('/api/control', { action: 'say', value: v }).then(() => toast('📢 MC đang đọc')).catch((e) => toast('❌ ' + e.message));
};

// ---------- TikTok ----------
$('ttConnect').onclick = async () => {
  $('ttErr').textContent = 'Đang kết nối...';
  try {
    if ($('ttKey').value && !$('ttKey').value.startsWith('••')) await api('/api/settings', { eulerKey: $('ttKey').value });
    const r = await api('/api/tiktok/connect', { username: $('ttUser').value });
    $('ttErr').textContent = `✅ Đã vào phòng live ${r.roomId || ''}`;
  } catch (err) {
    $('ttErr').textContent = '❌ ' + err.message;
  }
};
$('ttDisconnect').onclick = () => api('/api/tiktok/disconnect').then(() => toast('Đã ngắt kết nối'));

// ---------- Quà ----------
const EFFECTS = [
  ['khac-ten', '🧱 Khắc tên lên gạch'],
  ['tim', '❤️ Mưa tim'],
  ['phao-hoa', '🎆 Pháo hoa'],
  ['xe-bon', '🚛 Xe bồn bê tông chạy vào'],
  ['bong-bay', '🎈 Bóng bay'],
];
function giftRow(g = { gift: '', label: '', effect: 'khac-ten', on: true }) {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><input class="g-gift" value="${esc(g.gift)}" placeholder="Rose" /></td><td><input class="g-label" value="${esc(g.label)}" /></td>
    <td><select class="g-eff">${EFFECTS.map(([v, t]) => `<option value="${v}" ${v === g.effect ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
    <td><label class="switch"><input type="checkbox" class="g-on" ${g.on !== false ? 'checked' : ''} /><span></span></label></td>
    <td><button class="btn g-del">🗑</button></td>`;
  tr.querySelector('.g-del').onclick = () => tr.remove();
  return tr;
}
$('giftAdd').onclick = () => $('giftRows').appendChild(giftRow());
$('giftSave').onclick = () => {
  const giftEffects = [...$('giftRows').children].map((tr) => ({ gift: tr.querySelector('.g-gift').value.trim(), label: tr.querySelector('.g-label').value.trim(), effect: tr.querySelector('.g-eff').value, on: tr.querySelector('.g-on').checked })).filter((g) => g.gift);
  api('/api/settings', { giftEffects }).then(() => toast('💾 Đã lưu cấu hình quà')).catch((e) => toast('❌ ' + e.message));
};

// ---------- MC & đồ hoạ ----------
$('voiceTest').onclick = () => {
  const v = document.querySelector('input[name=voice]:checked')?.value || 'f';
  new Audio(`/api/tts?v=${v}&text=${encodeURIComponent('Xin chào cả nhà, chào mừng đến công trường Chủ Thầu Tí Hon!')}`).play();
};
$('mcSave').onclick = () => {
  api('/api/settings', {
    voice: document.querySelector('input[name=voice]:checked')?.value,
    mcOn: $('mcOn').checked,
    quality: $('quality').value,
    buildMinutes: Number($('buildMinutes').value),
    voteSeconds: Number($('voteSeconds').value),
  })
    .then(() => toast('💾 Đã lưu. Trang stage tự cập nhật'))
    .catch((e) => toast('❌ ' + e.message));
};
$('botOn').onchange = () => api('/api/test/bot', { on: $('botOn').checked }).catch((e) => toast('❌ ' + e.message));

// ---------- Link OBS + xem trước ----------
const stageUrl = `${location.origin}/?view=stage`;
$('obsLink').value = stageUrl;
$('copyLink').onclick = () => navigator.clipboard?.writeText(stageUrl).then(() => toast('📋 Đã chép link'));
$('lanHint').textContent = `http://<IP máy tính>:${location.port || 80}`;
function fitPreview() {
  const box = $('preview');
  const f = box.querySelector('iframe');
  if (f) f.style.transform = `scale(${box.clientWidth / 1080})`;
}
$('pvOn').onchange = () => {
  const box = $('preview');
  if ($('pvOn').checked) {
    box.innerHTML = '<iframe src="/?view=stage&mirror=1"></iframe>';
    fitPreview();
  } else box.innerHTML = '<div class="off">Bật để xem trước hình 3D.<br>Máy yếu thì để tắt khi đang live cho nhẹ.</div>';
};
addEventListener('resize', fitPreview);

// ---------- Nhận dữ liệu thời gian thực ----------
function applySettings(s) {
  SET = s;
  $('mcPill').textContent = s.voice === 'm' ? '🎙️ MC: Nam (Nam Minh)' : '🎙️ MC: Nữ (Hoài My)';
  if (document.activeElement?.closest('#s-mc, #s-tiktok, #s-gifts')) return; // đang sửa thì không ghi đè
  document.querySelectorAll('input[name=voice]').forEach((r) => (r.checked = r.value === s.voice));
  $('mcOn').checked = s.mcOn;
  $('quality').value = s.quality;
  $('buildMinutes').value = s.buildMinutes;
  $('voteSeconds').value = s.voteSeconds;
  $('ttUser').value = s.tiktokUser || '';
  $('ttKey').value = s.eulerKey || '';
  $('giftRows').innerHTML = '';
  (s.giftEffects || []).forEach((g) => $('giftRows').appendChild(giftRow(g)));
}
function applyStatus(st) {
  $('vConn').textContent = st.isConnected ? `@${st.username}` : st.isConnecting ? 'Đang kết nối...' : 'Chưa kết nối';
  $('stConn').style.borderColor = st.isConnected ? 'var(--ok)' : 'var(--line)';
  $('vViewers').textContent = (st.viewerCount || 0).toLocaleString('vi-VN');
  $('vDiamonds').textContent = (st.totalDiamonds || 0).toLocaleString('vi-VN');
  if (st.totalLikes) $('vLikes').textContent = st.totalLikes.toLocaleString('vi-VN');
  if (st.error) $('ttErr').textContent = '⚠️ ' + st.error;
  else if (st.isConnected) $('ttErr').textContent = `✅ Đang nhận sự kiện từ @${st.username}`;
}
const PHASE = { vote: '🗳️ Đang bình chọn', build: '🏗️ Đang xây', finale: '🎉 Bàn giao' };
function applyState(S) {
  $('vPhase').textContent = (S.paused ? '⏸ ' : '') + PHASE[S.phase];
  $('vHouse').textContent = S.houseName ? `${S.houseName} · căn số ${S.round}` : `Căn số ${S.round} – chờ bình chọn (còn ${S.phaseLeft}s)`;
  $('vStage').textContent = S.phase === 'vote' ? `Phiếu: ${Object.entries(S.votes).map(([k, v]) => `#${k}: ${v}`).join(' · ')}` : `Giai đoạn ${S.si + 1}/${S.stageCount}: ${S.stageName}`;
  $('vEta').textContent = S.phase === 'build' ? `Còn ~${fmt(S.eta)}` : '';
  $('vProg').style.width = `${Math.round((S.phase === 'build' ? S.p : S.phase === 'finale' ? 1 : 0) * 100)}%`;
  if ($('vSegs').childElementCount !== S.stageCount) $('vSegs').innerHTML = '<b></b>'.repeat(S.stageCount);
  [...$('vSegs').children].forEach((b, i) => (b.className = i < S.si || S.phase === 'finale' ? 'done' : i === S.si ? 'cur' : ''));
  $('vWorkers').textContent = S.workers;
  $('vSpeed').textContent = `x${S.speed.toFixed(1)}`;
  $('vBuilt').textContent = S.housesBuilt;
  if (!SET.totalLikesFromLive) $('vLikes').textContent = (S.totalLikes || 0).toLocaleString('vi-VN');
  $('vTop').innerHTML = S.top.length ? S.top.map((u, i) => `<div><span>${i + 1}. ${esc(u.nick)} <span class="mut">${u.icon} ${u.title}</span></span><b>${u.pts}</b></div>`).join('') : '<span class="mut">Chưa có ai</span>';
  $('vHonor').innerHTML = S.honors.length ? S.honors.map((h) => `<div><span>🧱 ${esc(h.nick)}</span><b>💎 ${h.diamonds}</b></div>`).join('') : '<span class="mut">Chưa có quà</span>';
  $('vFeed').innerHTML = S.feed.map((f) => `<div>${f.icon} ${f.html}</div>`).join('');
}
function connect() {
  const es = new EventSource('/api/events?role=dash');
  es.addEventListener('settings', (m) => applySettings(JSON.parse(m.data)));
  es.addEventListener('status', (m) => applyStatus(JSON.parse(m.data)));
  es.addEventListener('state', (m) => applyState(JSON.parse(m.data)));
  es.addEventListener('bot', (m) => ($('botOn').checked = JSON.parse(m.data).on));
  es.addEventListener('speaker', (m) => {
    const d = JSON.parse(m.data);
    $('sys').textContent = d.count ? `● Stage đang mở: ${d.count} trang${d.count > 1 ? ' (chỉ trang mới nhất phát tiếng)' : ''}` : '○ Chưa mở trang stage (OBS)';
    $('sys').style.color = d.count ? 'var(--ok)' : 'var(--warn)';
  });
  es.onopen = () => fetch('/api/test/bot').then((r) => r.json()).then((d) => ($('botOn').checked = d.on));
}
connect();
