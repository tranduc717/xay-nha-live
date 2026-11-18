// Dựng công trường 3D bằng three.js.
// Mỗi giai đoạn có hàm apply(p) với p = 0..1, gọi lại bao nhiêu lần cũng ra cùng một hình
// → bảng điều khiển / bản xem trước chỉ cần (mẫu nhà, giai đoạn, tiến độ) là vẽ lại giống hệt.
import * as THREE from 'three';
import { buildStages } from './houses.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const EPS = 0.001;
// phần tử thứ i trong n phần tử: lần lượt nối đuôi nhau (gối đầu một chút)
const wave = (P, i, n, span = 0.35) => {
  if (P >= 1) return 1;
  if (P <= 0 || n <= 1) return Math.max(0, P);
  const v = clamp((P - ((1 - span) * i) / (n - 1)) / span);
  return v > 0.9999 ? 1 : v;
};

function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.repeat.set(rx, ry);
  return t;
}
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- Vật liệu dùng chung ----------
function makeMaterials() {
  const brick = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#cbbfa9';
    g.fillRect(0, 0, w, h);
    const bw = 64, bh = 28;
    for (let r = 0; r < h / 32; r++) {
      for (let c = -1; c < w / bw + 1; c++) {
        const x = c * bw + (r % 2 ? bw / 2 : 0) + 2, y = r * 32 + 2;
        const k = rnd(-18, 18);
        g.fillStyle = `rgb(${178 + k},${82 + k * 0.6},${52 + k * 0.4})`;
        g.fillRect(x, y, bw - 4, bh);
      }
    }
  });
  const dirt = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#9b7653';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) {
      const k = rnd(-30, 30);
      g.fillStyle = `rgba(${120 + k},${90 + k},${60 + k},0.5)`;
      g.fillRect(rnd(0, w), rnd(0, h), 2, 2);
    }
  }, 6, 6);
  const grass = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#6a9f4b';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) {
      const k = rnd(-25, 25);
      g.fillStyle = `rgba(${90 + k},${150 + k},${70 + k},0.6)`;
      g.fillRect(rnd(0, w), rnd(0, h), 2, 3);
    }
  }, 40, 40);
  const tile = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#7a2a18';
    g.fillRect(0, 0, w, h);
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const grd = g.createLinearGradient(c * 16, 0, c * 16 + 16, 0);
        grd.addColorStop(0, 'rgba(255,255,255,0.25)');
        grd.addColorStop(0.5, 'rgba(255,255,255,0.05)');
        grd.addColorStop(1, 'rgba(0,0,0,0.35)');
        g.fillStyle = grd;
        g.fillRect(c * 16, r * 16 + 1, 16, 14);
      }
    }
  });
  const floorTile = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#e9e4da';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c9c1b2';
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo(i * 32, 0);
      g.lineTo(i * 32, h);
      g.moveTo(0, i * 32);
      g.lineTo(w, i * 32);
      g.stroke();
    }
  });
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });
  return {
    brickTex: brick,
    tileTex: tile,
    grass: std({ map: grass }),
    dirt: std({ map: dirt }),
    pit: std({ color: '#3d2a1c' }),
    road: std({ color: '#3a3d42' }),
    walk: std({ color: '#b9b4aa' }),
    conc: std({ color: '#a9aaa6' }),
    concWet: std({ color: '#8d8f8b' }),
    form: std({ color: '#c8935a', transparent: true, opacity: 0.55, depthWrite: false }),
    wood: std({ color: '#a8743f' }),
    steel: std({ color: '#5d6a73', metalness: 0.6, roughness: 0.4 }),
    rebar: new THREE.LineBasicMaterial({ color: '#b5531f' }),
    string: new THREE.LineBasicMaterial({ color: '#ffffff' }),
    scaffold: new THREE.LineBasicMaterial({ color: '#2d6fb5' }),
    plaster: std({ color: '#c9c7c1' }),
    floorTile: std({ map: floorTile }),
    glass: std({ color: '#7fb3d5', metalness: 0.3, roughness: 0.15, emissive: '#ffcc66', emissiveIntensity: 0 }),
    frameDark: std({ color: '#3b2a1e' }),
    white: std({ color: '#f5f5f5' }),
    red: std({ color: '#d0312d' }),
    blue: std({ color: '#2d7dd2' }),
    yellow: std({ color: '#f2b705' }),
    orange: std({ color: '#f07b1d' }),
    fenceTon: std({ color: '#2b6cb0', metalness: 0.3, roughness: 0.6 }),
    leaf: std({ color: '#3f8f3a' }),
    leaf2: std({ color: '#5aa846' }),
    trunk: std({ color: '#6b4a2b' }),
    skin: std({ color: '#f1c27d' }),
    waterproof: std({ color: '#6f8f7a' }),
    inox: std({ color: '#d7dde2', metalness: 0.8, roughness: 0.25 }),
    lamp: std({ color: '#fff3c4', emissive: '#ffd36b', emissiveIntensity: 0.8 }),
  };
}

// Khối hộp: gốc toạ độ ở mặt đáy (lớn lên theo chiều cao)
function boxB(w, h, d, mat) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  return new THREE.Mesh(g, mat);
}

// ---------- Cấu kiện bê tông cốt thép: thép → cốp pha → đổ bê tông ----------
// axis: hướng lớn dần. pos: góc bắt đầu (x/z nhỏ nhất theo trục lớn), đáy theo y.
function rcElement(parent, M, { w, h, d, pos, axis = 'y', slab = false, propH = 0 }) {
  const shift = axis === 'y' ? [0, h / 2, 0] : axis === 'x' ? [w / 2, h / 2, 0] : [0, h / 2, d / 2];
  const geo = (gw, gh, gd) => {
    const g = new THREE.BoxGeometry(gw, gh, gd);
    g.translate(...shift);
    return g;
  };
  const group = new THREE.Group();
  group.position.copy(pos);
  parent.add(group);

  // lồng thép (LineSegments: 1 lần vẽ cho cả lồng)
  const pts = [];
  const L = (a, b) => pts.push(a[0] + shift[0], a[1] + shift[1], a[2] + shift[2], b[0] + shift[0], b[1] + shift[1], b[2] + shift[2]);
  if (slab) {
    const y = 0;
    for (let x = -w / 2 + 0.1; x <= w / 2; x += 0.35) L([x, y, -d / 2 + 0.05], [x, y, d / 2 - 0.05]);
    for (let z = -d / 2 + 0.1; z <= d / 2; z += 0.35) L([-w / 2 + 0.05, y, z], [w / 2 - 0.05, y, z]);
  } else {
    const iw = w / 2 - 0.04, ih = h / 2 - 0.04, id = d / 2 - 0.04;
    const len = axis === 'y' ? h : axis === 'x' ? w : d;
    const corners = axis === 'y' ? [[-iw, -id], [iw, -id], [iw, id], [-iw, id]] : axis === 'x' ? [[-ih, -id], [ih, -id], [ih, id], [-ih, id]] : [[-iw, -ih], [iw, -ih], [iw, ih], [-iw, ih]];
    const P3 = (u, v, t) => (axis === 'y' ? [u, t, v] : axis === 'x' ? [t, u, v] : [u, v, t]);
    for (const [u, v] of corners) L(P3(u, v, -len / 2), P3(u, v, len / 2));
    for (let t = -len / 2 + 0.1; t <= len / 2; t += 0.2) {
      for (let k = 0; k < 4; k++) {
        const a = corners[k], b = corners[(k + 1) % 4];
        L(P3(a[0], a[1], t), P3(b[0], b[1], t));
      }
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const rebar = new THREE.LineSegments(lg, M.rebar);
  group.add(rebar);

  const form = new THREE.Mesh(slab ? geo(w, 0.04, d) : geo(w + 0.05, h + (axis === 'y' ? 0 : 0.05), d + 0.05), M.form);
  if (slab) form.position.y = -0.08;
  group.add(form);
  let props = null;
  if (slab && propH > 0.3) {
    props = new THREE.Group();
    for (let x = -w / 2 + 0.5; x < w / 2; x += 1.6) {
      for (let z = -d / 2 + 0.5; z < d / 2; z += 1.6) {
        const p = boxB(0.06, propH, 0.06, M.wood);
        p.position.set(x + shift[0], -propH, z + shift[2]);
        props.add(p);
      }
    }
    group.add(props);
  }
  const conc = new THREE.Mesh(geo(w, h, d), M.conc);
  group.add(conc);

  const el = {
    group,
    conc,
    apply(p) {
      rebar.visible = p > 0 && p < 1;
      rebar.scale[axis] = Math.max(EPS, seg(p, 0, 0.4));
      form.visible = p > 0.4 && p < 1;
      form.scale[axis] = Math.max(EPS, seg(p, 0.4, 0.62));
      if (props) props.visible = p > 0.4 && p < 1;
      conc.visible = p > 0.62;
      conc.scale[axis] = Math.max(EPS, seg(p, 0.62, 1));
      conc.material = p < 1 ? M.concWet : M.conc;
    },
  };
  el.apply(0);
  return el;
}

export class SiteBuilder {
  constructor(scene, quality = 'low') {
    this.scene = scene;
    this.quality = quality;
    this.M = makeMaterials();
    this.root = new THREE.Group();
    scene.add(this.root);
    this.workers = [];
    this.trucks = [];
    this.house = null;
    this.stages = [];
    this.lastP = [];
    this.time = 0;
    this.buildEnvironment();
  }

  // ---------- Khung cảnh cố định: cỏ, đường, nhà hàng xóm, cây ----------
  buildEnvironment() {
    const M = this.M;
    const env = new THREE.Group();
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), M.grass);
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    env.add(grass);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(260, 7), M.road);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.01, 15);
    env.add(road);
    for (let x = -120; x < 120; x += 6) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.18), M.white);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.02, 15);
      env.add(dash);
    }
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(260, 2.2), M.walk);
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(0, 0.015, 10.9);
    env.add(walk);
    // nhà hàng xóm
    const nGlass = this.M.glass.clone();
    const nb = [
      [-22, 9, 10, 7, '#e8d9c4'],
      [23, 10, 9, 8.5, '#d9e4e8'],
      [-34, 8, 9, 6, '#f0e1d0'],
      [35, 9, 9, 11, '#e3dccd'],
    ];
    for (const [x, w, d, h, c] of nb) {
      const b = boxB(w, h, d, new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
      b.position.set(x, 0, -4);
      env.add(b);
      const r = boxB(w + 0.4, 0.3, d + 0.4, this.M.walk);
      r.position.set(x, h, -4);
      env.add(r);
      for (let fy = 1; fy < h - 1; fy += 3.2) {
        for (let fx = -w / 2 + 1.5; fx < w / 2 - 1; fx += 2.5) {
          const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.3), nGlass);
          win.position.set(x + fx, fy + 0.8, -4 + d / 2 + 0.01);
          env.add(win);
        }
      }
    }
    for (let i = 0; i < 26; i++) {
      const t = this.makeTree(rnd(0.8, 1.4));
      const side = i % 2 ? 1 : -1;
      t.position.set(side * rnd(22, 70), 0, rnd(-60, -8));
      env.add(t);
    }
    for (let x = -60; x <= 60; x += 12) {
      const t = this.makeTree(0.9);
      t.position.set(x + 5, 0, 19.5);
      env.add(t);
    }
    this.scene.add(env);
  }

  makeTree(s = 1) {
    const g = new THREE.Group();
    const trunk = boxB(0.25 * s, 1.6 * s, 0.25 * s, this.M.trunk);
    g.add(trunk);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3 * s, 0), Math.random() < 0.5 ? this.M.leaf : this.M.leaf2);
    crown.position.y = 2.3 * s;
    g.add(crown);
    return g;
  }

  clear() {
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.stages = [];
    this.lastP = [];
    this.house = null;
  }

  // ---------- Dựng toàn bộ công trình (ẩn hết), mỗi giai đoạn hiện dần theo p ----------
  setHouse(h) {
    this.clear();
    if (!h) {
      this.plotOnly();
      return;
    }
    this.house = h;
    const M = this.M;
    const R = this.root;
    const ox = -h.w / 2, oz = -h.d / 2; // góc nhà
    const X = (x) => ox + x, Z = (z) => oz + z;
    const baseY = 0.5;
    const topY = baseY + h.floors * h.H;
    this.topY = topY;
    this.totalH = topY + (h.roof === 'flat' ? 3.3 : h.roof === 'gable' ? 2.4 : h.rise);
    const S = {}; // apply theo key
    const pts = [];
    for (const x of h.xs) for (const z of h.zs) pts.push([X(x), Z(z)]);

    // khu đất
    const plot = new THREE.Mesh(new THREE.PlaneGeometry(h.w + 8, h.d + 7), M.dirt);
    plot.rotation.x = -Math.PI / 2;
    plot.position.set(0, 0.02, 0.5);
    R.add(plot);

    // --- 1. Giấy phép: biển báo công trình + hàng rào tôn ---
    const board = new THREE.Group();
    const boardTex = canvasTex(512, 320, (g, w, hh) => {
      g.fillStyle = '#f7f7f2';
      g.fillRect(0, 0, w, hh);
      g.fillStyle = '#c62828';
      g.fillRect(0, 0, w, 64);
      g.fillStyle = '#fff';
      g.font = 'bold 34px sans-serif';
      g.textAlign = 'center';
      g.fillText('BIỂN BÁO CÔNG TRÌNH', w / 2, 44);
      g.fillStyle = '#1b2a4a';
      g.font = 'bold 30px sans-serif';
      g.fillText(h.name.toUpperCase(), w / 2, 120);
      g.font = '24px sans-serif';
      g.fillText('Giấy phép XD số 2026/GPXD', w / 2, 170);
      g.fillText('Chủ đầu tư: Chủ Thầu Tí Hon', w / 2, 210);
      g.fillText(`Quy mô: ${h.desc}`, w / 2, 250);
      g.fillText('Đơn vị thi công: Cả nhà trên LIVE', w / 2, 290);
    });
    const bp = boxB(4.2, 2.6, 0.08, new THREE.MeshStandardMaterial({ map: boardTex }));
    bp.position.y = 1.4;
    board.add(bp);
    for (const sx of [-1.8, 1.8]) {
      const leg = boxB(0.12, 1.5, 0.12, M.steel);
      leg.position.x = sx;
      board.add(leg);
    }
    board.position.set(h.w / 2 + 1.8, 0, h.d / 2 + 2.8);
    board.rotation.y = -0.35;
    R.add(board);
    const fence = [];
    const fx0 = -h.w / 2 - 3.6, fx1 = h.w / 2 + 3.6, fz0 = -h.d / 2 - 3, fz1 = h.d / 2 + 3.5;
    const addPanel = (x, z, rotY, len) => {
      const p = boxB(len, 2.0, 0.05, M.fenceTon);
      p.position.set(x, 0, z);
      p.rotation.y = rotY;
      R.add(p);
      fence.push(p);
    };
    for (let x = fx0; x < fx1 - 0.1; x += 2) addPanel(x + 1, fz0, 0, 2);
    for (let z = fz0; z < fz1 - 0.1; z += 2) {
      addPanel(fx0, z + 1, Math.PI / 2, 2);
      addPanel(fx1, z + 1, Math.PI / 2, 2);
    }
    S.permit = (p) => {
      board.visible = p > 0.1;
      board.scale.y = Math.max(EPS, seg(p, 0.1, 0.4));
      fence.forEach((f, i) => {
        f.visible = wave(p, i, fence.length, 0.2) > 0 && p > 0.35;
        f.scale.y = Math.max(EPS, wave(seg(p, 0.35, 1), i, fence.length, 0.2));
      });
    };
    this.fence = fence;
    this.board = board;

    // --- 2. Khảo sát: cọc mốc, dây căng, máy kinh vĩ ---
    const stakes = pts.map(([x, z]) => {
      const s = boxB(0.06, 0.7, 0.06, M.wood);
      s.position.set(x, 0, z);
      R.add(s);
      return s;
    });
    const lp = [];
    for (const x of h.xs) lp.push(X(x), 0.45, Z(0) - 1, X(x), 0.45, Z(h.d) + 1);
    for (const z of h.zs) lp.push(X(0) - 1, 0.45, Z(z), X(h.w) + 1, 0.45, Z(z));
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    const strings = new THREE.LineSegments(lg, M.string);
    R.add(strings);
    const tripod = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const leg = boxB(0.04, 1.5, 0.04, M.yellow);
      leg.rotation.z = 0.25;
      leg.rotation.y = (i * Math.PI * 2) / 3;
      leg.position.set(Math.cos((i * Math.PI * 2) / 3) * 0.35, 0, Math.sin((i * Math.PI * 2) / 3) * 0.35);
      tripod.add(leg);
    }
    const inst = boxB(0.25, 0.3, 0.2, M.orange);
    inst.position.y = 1.45;
    tripod.add(inst);
    tripod.position.set(h.w / 2 + 2.2, 0, h.d / 2 + 1);
    R.add(tripod);
    S.survey = (p) => {
      stakes.forEach((s, i) => {
        const q = wave(seg(p, 0, 0.7), i, stakes.length, 0.3);
        s.visible = q > 0;
        s.scale.y = Math.max(EPS, q);
      });
      strings.visible = p > 0.7;
      tripod.visible = p > 0 && p < 1;
    };
    this.stakes = stakes;
    this.strings = strings;

    // --- 3. Đào móng: hố móng, rãnh giằng, đống đất ---
    const pits = pts.map(([x, z]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), M.pit);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.03, z);
      R.add(m);
      return m;
    });
    const trenches = [];
    for (const x of h.xs) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, h.d), M.pit);
      m.rotation.x = -Math.PI / 2;
      m.position.set(X(x), 0.025, 0);
      R.add(m);
      trenches.push(m);
    }
    for (const z of h.zs) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(h.w, 0.6), M.pit);
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, 0.025, Z(z));
      R.add(m);
      trenches.push(m);
    }
    const piles = [];
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.3, 7), M.pit);
      c.position.set(-h.w / 2 - 2.2, 0.65, -h.d / 2 + 1 + i * (h.d / 4));
      R.add(c);
      piles.push(c);
    }
    S.excavate = (p) => {
      pits.forEach((m, i) => {
        const q = wave(seg(p, 0, 0.7), i, pits.length, 0.3);
        m.visible = q > 0;
        m.scale.set(Math.max(EPS, q), Math.max(EPS, q), 1);
      });
      trenches.forEach((m) => {
        m.visible = p > 0.65;
        m.scale.set(1, 1, 1);
      });
      piles.forEach((c, i) => {
        const q = wave(p, i, piles.length);
        c.visible = q > 0;
        c.scale.setScalar(Math.max(EPS, q));
      });
    };
    this.pits = pits;
    this.trenches = trenches;
    this.piles = piles;

    // --- 4. Móng đơn + giằng móng + nền ---
    const fEls = [];
    for (const [x, z] of pts) fEls.push(rcElement(R, M, { w: 1.3, h: 0.3, d: 1.3, pos: new THREE.Vector3(x, 0, z) }));
    for (const x of h.xs) for (let k = 0; k < h.zs.length - 1; k++) fEls.push(rcElement(R, M, { w: 0.25, h: 0.35, d: h.zs[k + 1] - h.zs[k], pos: new THREE.Vector3(X(x), 0.15, Z(h.zs[k])), axis: 'z' }));
    for (const z of h.zs) for (let k = 0; k < h.xs.length - 1; k++) fEls.push(rcElement(R, M, { w: h.xs[k + 1] - h.xs[k], h: 0.35, d: 0.25, pos: new THREE.Vector3(X(h.xs[k]), 0.15, Z(z)), axis: 'x' }));
    const ground = rcElement(R, M, { w: h.w + 0.2, h: 0.1, d: h.d + 0.2, pos: new THREE.Vector3(-h.w / 2 - 0.1, 0.4, 0), axis: 'x', slab: true });
    fEls.push(ground);
    S.foundation = (p) => fEls.forEach((e, i) => e.apply(wave(p, i, fEls.length, 0.25)));
    this.groundSlab = ground;

    // --- 5..: Cột / dầm / sàn từng tầng ---
    const frame = []; // các cấu kiện lộ ra ngoài (sơn màu khi hoàn thiện)
    const slabs = [];
    for (let f = 0; f < h.floors; f++) {
      const y0 = baseY + f * h.H;
      const cols = pts.map(([x, z]) => rcElement(R, M, { w: 0.25, h: h.H, d: 0.25, pos: new THREE.Vector3(x, y0, z) }));
      frame.push(...cols);
      S[`col-${f}`] = (p) => cols.forEach((e, i) => e.apply(wave(p, i, cols.length, 0.3)));
      const yb = y0 + h.H - 0.4;
      const beams = [];
      for (const x of h.xs) for (let k = 0; k < h.zs.length - 1; k++) beams.push(rcElement(R, M, { w: 0.22, h: 0.4, d: h.zs[k + 1] - h.zs[k], pos: new THREE.Vector3(X(x), yb, Z(h.zs[k])), axis: 'z' }));
      for (const z of h.zs) for (let k = 0; k < h.xs.length - 1; k++) beams.push(rcElement(R, M, { w: h.xs[k + 1] - h.xs[k], h: 0.4, d: 0.22, pos: new THREE.Vector3(X(h.xs[k]), yb, Z(z)), axis: 'x' }));
      frame.push(...beams);
      const top = f === h.floors - 1;
      const els = [...beams];
      if (!(top && h.roof === 'gable')) {
        const bal = !top && h.balcony ? h.balcony : 0;
        const sd = h.d + 0.2 + bal;
        const slab = rcElement(R, M, { w: h.w + 0.2, h: 0.12, d: sd, pos: new THREE.Vector3(-h.w / 2 - 0.1, y0 + h.H - 0.12, (bal) / 2), axis: 'x', slab: true, propH: h.H - 0.12 });
        els.push(slab);
        slabs.push(slab);
        frame.push(slab);
      }
      S[`beam-${f}`] = (p) => els.forEach((e, i) => e.apply(wave(p, i, els.length, i === els.length - 1 ? 0.45 : 0.3)));
    }
    this.frame = frame;

    // --- Cầu thang: bậc bê tông nối các tầng, góc sau bên trái ---
    const flights = h.floors - 1 + (h.roof === 'flat' ? 1 : 0);
    const steps = [];
    for (let f = 0; f < flights; f++) {
      const y0 = baseY + f * h.H;
      const n = 18;
      const rise = h.H / n, tread = 0.24;
      const flip = f % 2 === 1;
      for (let i = 0; i < n; i++) {
        const s = boxB(1.0, (i + 1) * rise, tread, M.conc);
        const z = flip ? Z(0.6) + n * tread - i * tread : Z(0.6) + i * tread;
        s.position.set(X(0) + 0.75 + (flip ? 1.05 : 0), y0, z);
        R.add(s);
        steps.push(s);
      }
    }
    S.stairs = (p) =>
      steps.forEach((s, i) => {
        const q = wave(p, i, steps.length, 0.15);
        s.visible = q > 0;
        s.scale.y = Math.max(EPS, q);
        s.material = q < 1 ? M.concWet : M.conc;
      });

    // --- Tường gạch (bao quanh + 1 vách giữa), giàn giáo ---
    const walls = [];
    const wallMat = (len, hh) => {
      const t = M.brickTex.clone();
      t.needsUpdate = true;
      t.repeat.set(len / 1.0, hh / 0.5);
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
    };
    this.paint = new THREE.MeshStandardMaterial({ color: h.wall, roughness: 0.8 });
    this.trimMat = new THREE.MeshStandardMaterial({ color: h.trim, roughness: 0.7 });
    for (let f = 0; f < h.floors; f++) {
      const y0 = baseY + f * h.H;
      const wh = h.H - 0.4;
      const addWall = (x, z, len, alongX, front = false) => {
        if (front && f === 0 && h.id === 2) return; // nhà ống: tầng 1 mặt tiền để trống làm cửa cuốn
        const w = boxB(alongX ? len : 0.2, wh, alongX ? 0.2 : len, null);
        w.material = wallMat(len, wh);
        w.userData.brick = w.material;
        w.position.set(x, y0, z);
        R.add(w);
        walls.push(w);
      };
      for (const z of [0, h.d]) for (let k = 0; k < h.xs.length - 1; k++) addWall(X((h.xs[k] + h.xs[k + 1]) / 2), Z(z), h.xs[k + 1] - h.xs[k] - 0.25, true, z === h.d);
      for (const x of [0, h.w]) for (let k = 0; k < h.zs.length - 1; k++) addWall(X(x), Z((h.zs[k] + h.zs[k + 1]) / 2), h.zs[k + 1] - h.zs[k] - 0.25, false);
      if (h.zs.length > 2) {
        const zm = h.zs[Math.floor(h.zs.length / 2)];
        for (let k = 0; k < h.xs.length - 1; k++) addWall(X((h.xs[k] + h.xs[k + 1]) / 2), Z(zm), h.xs[k + 1] - h.xs[k] - 0.25, true);
      }
    }
    S.walls = (p) =>
      walls.forEach((w, i) => {
        const q = wave(p, i, walls.length, 0.25);
        w.visible = q > 0;
        w.scale.y = Math.max(EPS, Math.ceil(q * 12) / 12); // lên từng lớp gạch
      });
    this.walls = walls;

    const sp = [];
    const sx0 = X(0) - 0.9, sx1 = X(h.w) + 0.9, sz0 = Z(0) - 0.9, sz1 = Z(h.d) + 0.9 + (h.balcony || 0);
    const sTop = topY + 1;
    const ring = [];
    for (let x = sx0; x <= sx1 + 0.01; x += (sx1 - sx0) / Math.ceil((sx1 - sx0) / 1.8)) ring.push([x, sz0], [x, sz1]);
    for (let z = sz0; z <= sz1 + 0.01; z += (sz1 - sz0) / Math.ceil((sz1 - sz0) / 1.8)) ring.push([sx0, z], [sx1, z]);
    for (const [x, z] of ring) sp.push(x, 0, z, x, sTop, z);
    for (let y = 1.8; y <= sTop; y += 1.8) {
      sp.push(sx0, y, sz0, sx1, y, sz0, sx0, y, sz1, sx1, y, sz1, sx0, y, sz0, sx0, y, sz1, sx1, y, sz0, sx1, y, sz1);
      sp.push(sx0, y - 1.8, sz1, sx1, y, sz1, sx0, y - 1.8, sz0, sx1, y, sz0);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.scaffold = new THREE.LineSegments(sg, M.scaffold);
    R.add(this.scaffold);

    // --- Mái ---
    const roofParts = this.buildRoof(h, topY, R, X, Z);
    S.roof = roofParts.apply;

    // --- Điện nước: dây điện đỏ, ống nước xám (đi nổi trước khi trát), bồn nước, công tơ ---
    const mep = [];
    for (let f = 0; f < h.floors; f++) {
      const y0 = baseY + f * h.H;
      for (let k = 0; k < h.xs.length - 1; k++) {
        const e = boxB(0.05, h.H - 1.6, 0.05, M.red);
        e.position.set(X((h.xs[k] + h.xs[k + 1]) / 2) + 0.6, y0 + 1.2, Z(h.d) + 0.11);
        R.add(e);
        mep.push(e);
        const hz = boxB(h.xs[k + 1] - h.xs[k] - 0.6, 0.05, 0.05, M.red);
        hz.position.set(X((h.xs[k] + h.xs[k + 1]) / 2), y0 + h.H - 0.65, Z(h.d) + 0.11);
        R.add(hz);
        mep.push(hz);
      }
      const pipe = boxB(0.1, h.H, 0.1, M.white);
      pipe.position.set(X(h.w) + 0.16, y0, Z(0.8));
      R.add(pipe);
      mep.push(pipe);
    }
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.5, 14), M.inox);
    tank.rotation.z = Math.PI / 2;
    tank.position.set(X(h.w) - 1, (h.roof === 'flat' ? topY + 3.2 : topY + 0.9), Z(0.9));
    if (h.roof !== 'flat') tank.position.set(X(h.w) + 1.2, 2.4, Z(1));
    R.add(tank);
    const tankStand = boxB(1.4, h.roof === 'flat' ? 0.4 : 1.8, 1, M.steel);
    tankStand.position.set(tank.position.x, h.roof === 'flat' ? topY + 2.75 : 0, tank.position.z);
    R.add(tankStand);
    const meter = boxB(0.5, 0.6, 0.2, M.white);
    meter.position.set(X(h.w) - 0.6, 1.3, Z(h.d) + 0.15);
    R.add(meter);
    S.mep = (p) => {
      mep.forEach((m, i) => {
        const q = wave(seg(p, 0, 0.75), i, mep.length, 0.3);
        m.visible = q > 0;
        m.scale.y = Math.max(EPS, q);
      });
      tank.visible = tankStand.visible = p > 0.75;
      meter.visible = p > 0.85;
    };
    this.mep = mep;

    // --- Hoàn thiện: trát (xám) → sơn màu; khung sơn viền; nền lát gạch ---
    S.finish = (p) => {
      walls.forEach((w, i) => {
        const q = wave(p, i, walls.length, 0.4);
        w.material = q <= 0 ? w.userData.brick : q < 0.55 ? M.plaster : this.paint;
      });
      const q2 = seg(p, 0.5, 1);
      if (p > 0) {
        frame.forEach((e, i) => (e.conc.material = q2 > 0 && wave(q2, i, frame.length, 0.5) > 0 ? this.trimMat : M.conc));
        this.groundSlab.conc.material = p > 0.6 ? M.floorTile : M.conc;
      }
      if (roofParts.finish) roofParts.finish(p);
    };

    // --- Cửa, lan can, sân vườn ---
    const doors = [];
    const glassMats = [];
    const addOpening = (x, y, z, w, hh, rotY = 0, isDoor = false) => {
      const g = new THREE.Group();
      const frameM = isDoor ? M.frameDark : this.trimMat;
      const fr = boxB(w + 0.16, hh + 0.16, 0.08, frameM);
      fr.position.y = -0.08;
      g.add(fr);
      const gl = boxB(w, hh, 0.1, isDoor ? M.frameDark : M.glass);
      g.add(gl);
      if (!isDoor) {
        const bar = boxB(0.05, hh, 0.12, frameM);
        g.add(bar);
      }
      g.position.set(x, y, z);
      g.rotation.y = rotY;
      R.add(g);
      doors.push(g);
    };
    for (let f = 0; f < h.floors; f++) {
      const y0 = baseY + f * h.H;
      const bays = h.xs.length - 1;
      for (let k = 0; k < bays; k++) {
        const cx = X((h.xs[k] + h.xs[k + 1]) / 2);
        const bw = h.xs[k + 1] - h.xs[k];
        if (f === 0 && h.id === 2) {
          const shutter = boxB(bw - 0.5, 2.8, 0.1, M.steel);
          shutter.position.set(cx, y0, Z(h.d) + 0.05);
          R.add(shutter);
          doors.push(shutter);
        } else if (f === 0 && k === Math.floor(bays / 2)) addOpening(cx, y0, Z(h.d) + 0.12, Math.min(1.6, bw - 1), 2.3, 0, true);
        else if (f > 0 && h.balcony) addOpening(cx, y0, Z(h.d) + 0.12, Math.min(2.6, bw - 1), 2.4);
        else addOpening(cx, y0 + 0.9, Z(h.d) + 0.12, Math.min(1.6, bw - 1.2), 1.4);
        addOpening(cx, y0 + 1.0, Z(0) - 0.12, Math.min(1.2, bw - 1.4), 1.2, Math.PI);
      }
      for (let k = 0; k < h.zs.length - 1; k++) {
        const cz = Z((h.zs[k] + h.zs[k + 1]) / 2);
        const span = h.zs[k + 1] - h.zs[k];
        if (h.id === 2 && span > 0) continue; // nhà ống: 2 bên giáp nhà hàng xóm, không mở cửa sổ
        addOpening(X(0) - 0.12, y0 + 1.0, cz, Math.min(1.4, span - 1.6), 1.3, -Math.PI / 2);
        addOpening(X(h.w) + 0.12, y0 + 1.0, cz, Math.min(1.4, span - 1.6), 1.3, Math.PI / 2);
      }
      if (f > 0 && h.balcony) {
        const rail = boxB(h.w, 1.0, 0.06, M.glass);
        rail.position.set(0, y0, Z(h.d) + h.balcony + 0.05);
        R.add(rail);
        doors.push(rail);
        const cap = boxB(h.w + 0.1, 0.06, 0.12, this.trimMat);
        cap.position.set(0, y0 + 1.0, Z(h.d) + h.balcony + 0.05);
        R.add(cap);
        doors.push(cap);
      }
    }
    const yard = [];
    const pave = new THREE.Mesh(new THREE.PlaneGeometry(h.w + 6, 3), M.floorTile);
    pave.rotation.x = -Math.PI / 2;
    pave.position.set(0, 0.04, Z(h.d) + 1.5 + (h.balcony ? 0 : 0));
    R.add(pave);
    yard.push(pave);
    for (const side of [-1, 1]) {
      const lw = boxB(0.25, 0.9, h.d + 5.5, this.paint);
      lw.position.set(side * (h.w / 2 + 3.2), 0, 0.25);
      R.add(lw);
      yard.push(lw);
      const gp = boxB(0.5, 1.9, 0.5, this.trimMat);
      gp.position.set(side * 1.8, 0, Z(h.d) + 3.2);
      R.add(gp);
      yard.push(gp);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), M.lamp);
      lamp.position.set(side * 1.8, 2.1, Z(h.d) + 3.2);
      R.add(lamp);
      yard.push(lamp);
      const fw = boxB((h.w + 6.4) / 2 - 2.05, 0.9, 0.25, this.paint);
      fw.position.set(side * ((h.w + 6.4) / 4 + 1.03), 0, Z(h.d) + 3.2);
      R.add(fw);
      yard.push(fw);
    }
    for (const [tx, tz] of [[-h.w / 2 - 2, Z(h.d) + 1.6], [h.w / 2 + 2, Z(h.d) + 1.6], [-h.w / 2 - 2, -h.d / 2 - 1], [h.w / 2 + 2.1, -h.d / 2 - 1.2]]) {
      const t = this.makeTree(0.75);
      t.position.set(tx, 0, tz);
      R.add(t);
      yard.push(t);
    }
    this.glass = M.glass;
    S.doors = (p) => {
      doors.forEach((d, i) => {
        const q = wave(seg(p, 0, 0.7), i, doors.length, 0.3);
        d.visible = q > 0;
        d.scale.y = Math.max(EPS, q);
      });
      yard.forEach((y, i) => {
        const q = wave(seg(p, 0.5, 1), i, yard.length, 0.4);
        y.visible = q > 0;
        y.scale.y = Math.max(EPS, q);
      });
    };

    // --- Bàn giao: băng khánh thành đỏ ở cổng ---
    const ribbon = new THREE.Group();
    const band = boxB(3.6, 0.18, 0.04, M.red);
    band.position.y = 1.2;
    ribbon.add(band);
    const bow = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), M.red);
    bow.position.y = 1.29;
    ribbon.add(bow);
    ribbon.position.set(0, 0, Z(h.d) + 3.2);
    R.add(ribbon);
    this.ribbon = ribbon;
    this.ribbonCut = false;
    S.handover = (p) => {
      ribbon.visible = p > 0 && !this.ribbonCut;
      M.glass.emissiveIntensity = p > 0 ? 0.25 + 0.35 * p : 0;
    };

    // --- Cần trục tháp ---
    const crane = new THREE.Group();
    const mastH = this.totalH + 5;
    const mast = boxB(0.7, mastH, 0.7, M.yellow);
    crane.add(mast);
    const mastLines = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.72, mastH, 0.72, 1, Math.ceil(mastH / 1.2), 1)), new THREE.LineBasicMaterial({ color: '#333' }));
    mastLines.position.y = mastH / 2;
    crane.add(mastLines);
    const jib = new THREE.Group();
    const arm = boxB(15, 0.6, 0.6, M.yellow);
    arm.position.set(-5, 0, 0);
    jib.add(arm);
    const cw = boxB(1.4, 1.2, 1.2, M.conc);
    cw.position.set(-11.5, -0.6, 0);
    jib.add(cw);
    const cab = boxB(1.2, 1.1, 1.1, M.white);
    cab.position.set(0.3, -1.1, 0.9);
    jib.add(cab);
    const cable = boxB(0.03, 6, 0.03, M.steel);
    cable.position.set(1.8, -6, 0);
    jib.add(cable);
    const hook = boxB(0.8, 0.5, 0.8, M.orange);
    hook.position.set(1.8, -6.4, 0);
    jib.add(hook);
    jib.position.y = mastH;
    crane.add(jib);
    crane.position.set(h.w / 2 + 3, 0, -h.d / 2 - 1.8);
    R.add(crane);
    this.crane = crane;
    this.jib = jib;

    this.stageDefs = buildStages(h);
    this.stages = this.stageDefs.map((s) => ({ key: s.key, apply: S[s.key] || (() => {}) }));
    this.roofParts = roofParts;
    this.update(-1, 0, true);
  }

  // Mái: dàn vì kèo/xà gồ hiện trước → ngói lợp dần từ diềm lên đỉnh (mặt phẳng cắt)
  buildRoof(h, topY, R, X, Z) {
    const M = this.M;
    const group = new THREE.Group();
    R.add(group);
    if (h.roof === 'flat') {
      // tường chắn mái + tum thang + lớp chống thấm
      const par = [];
      const ph = 1.0;
      const add = (w, d, x, z) => {
        const m = boxB(w, ph, d, null);
        const t = M.brickTex.clone();
        t.needsUpdate = true;
        t.repeat.set(Math.max(w, d), 2);
        m.material = new THREE.MeshStandardMaterial({ map: t });
        m.userData.brick = m.material;
        m.position.set(x, topY, z);
        group.add(m);
        par.push(m);
      };
      add(h.w + 0.2, 0.15, 0, Z(h.d) + 0.03);
      add(0.15, h.d, X(0), 0);
      add(0.15, h.d, X(h.w), 0);
      const tumD = 4.2;
      const tum = boxB(h.w - 0.4, 2.8, tumD, null);
      const t2 = M.brickTex.clone();
      t2.needsUpdate = true;
      t2.repeat.set(h.w, 5.6);
      tum.material = new THREE.MeshStandardMaterial({ map: t2 });
      tum.userData.brick = tum.material;
      tum.position.set(0, topY, Z(tumD / 2 + 0.1));
      group.add(tum);
      par.push(tum);
      const tumSlab = boxB(h.w + 0.3, 0.15, tumD + 0.6, M.conc);
      tumSlab.position.set(0, topY + 2.8, Z(tumD / 2 + 0.1));
      group.add(tumSlab);
      const wp = new THREE.Mesh(new THREE.PlaneGeometry(h.w - 0.1, h.d - tumD), M.waterproof);
      wp.rotation.x = -Math.PI / 2;
      wp.position.set(0, topY + 0.02, Z(tumD + (h.d - tumD) / 2));
      group.add(wp);
      return {
        apply: (p) => {
          par.forEach((m, i) => {
            const q = wave(seg(p, 0, 0.6), i, par.length, 0.4);
            m.visible = q > 0;
            m.scale.y = Math.max(EPS, Math.ceil(q * 8) / 8);
          });
          tumSlab.visible = p > 0.6;
          wp.visible = p > 0.75;
          wp.scale.set(Math.max(EPS, seg(p, 0.75, 1)), 1, 1);
        },
        finish: (p) => {
          par.forEach((m, i) => {
            const q = wave(p, i, par.length, 0.4);
            m.material = q <= 0 ? m.userData.brick : q < 0.55 ? M.plaster : this.paint;
          });
          tumSlab.material = p > 0.6 ? this.trimMat : M.conc;
        },
      };
    }

    // Hình học mái: gable (2 mái, nóc chạy theo chiều dài z) hoặc hip (4 mái)
    const ov = 0.6;
    const W = h.w / 2 + ov, D = h.d / 2 + ov;
    const rise = h.roof === 'gable' ? 2.4 : h.rise;
    const y0 = topY, y1 = topY + rise;
    const tris = [];
    const T = (a, b, c) => tris.push(a, b, c);
    let ridge;
    if (h.roof === 'gable') {
      ridge = [[0, y1, -D], [0, y1, D]];
      T([-W, y0, D], [0, y1, D], [0, y1, -D]);
      T([-W, y0, D], [0, y1, -D], [-W, y0, -D]);
      T([W, y0, -D], [0, y1, -D], [0, y1, D]);
      T([W, y0, -D], [0, y1, D], [W, y0, D]);
    } else {
      const alongZ = D >= W;
      const r = alongZ ? D - W : W - D;
      const a = alongZ ? [0, y1, -r] : [-r, y1, 0];
      const b = alongZ ? [0, y1, r] : [r, y1, 0];
      ridge = [a, b];
      const c1 = [-W, y0, -D], c2 = [W, y0, -D], c3 = [W, y0, D], c4 = [-W, y0, D];
      if (alongZ) {
        T(c4, c3, b); // trước (tam giác)
        T(c2, c1, a); // sau
        T(c1, c4, b); T(c1, b, a); // trái
        T(c3, c2, a); T(c3, a, b); // phải
      } else {
        T(c4, c3, b); T(c4, b, a); // trước
        T(c2, c1, a); T(c2, a, b); // sau
        T(c1, c4, a); // trái
        T(c3, c2, b); // phải
      }
    }
    const pos = [], uv = [];
    for (let i = 0; i < tris.length; i += 3) {
      const tri = tris.slice(i, i + 3);
      const nx = Math.abs(tri[0][0] - tri[1][0]) + Math.abs(tri[1][0] - tri[2][0]);
      const nz = Math.abs(tri[0][2] - tri[1][2]) + Math.abs(tri[1][2] - tri[2][2]);
      for (const v of tri) {
        pos.push(...v);
        const u = nx >= nz ? v[0] : v[2];
        const slope = Math.hypot(rise, nx >= nz ? D : W) / rise;
        uv.push(u / 1.0, ((v[1] - y0) * slope) / 0.5);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    const tex = M.tileTex.clone();
    tex.needsUpdate = true;
    const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), y0);
    const tileMat = new THREE.MeshStandardMaterial({ map: tex, color: h.roofColor, side: THREE.DoubleSide, roughness: 0.7, clippingPlanes: [clip] });
    const roof = new THREE.Mesh(g, tileMat);
    roof.castShadow = true;
    group.add(roof);

    // vì kèo / xà gồ (thép hộp)
    const members = [];
    const beamBetween = (a, b, th = 0.08) => {
      const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
      const len = va.distanceTo(vb);
      const m = new THREE.Mesh(new THREE.BoxGeometry(th, th, len), M.steel);
      m.position.copy(va).add(vb).multiplyScalar(0.5);
      m.lookAt(vb);
      group.add(m);
      members.push(m);
    };
    beamBetween(ridge[0], ridge[1], 0.12);
    if (h.roof === 'gable') {
      for (const z of h.zs) {
        const zz = Z(z);
        beamBetween([-W, y0, zz], [0, y1, zz]);
        beamBetween([W, y0, zz], [0, y1, zz]);
        beamBetween([-W + 0.3, y0 + 0.1, zz], [W - 0.3, y0 + 0.1, zz]);
        beamBetween([0, y0, zz], [0, y1, zz]);
      }
      for (let k = 1; k < 5; k++) {
        const t = k / 5;
        for (const s of [-1, 1]) beamBetween([s * W * (1 - t), y0 + rise * t, -D], [s * W * (1 - t), y0 + rise * t, D], 0.06);
      }
      // 2 đầu hồi xây gạch
      for (const zz of [Z(0), Z(h.d)]) {
        const sh = new THREE.Shape();
        sh.moveTo(-h.w / 2, 0);
        sh.lineTo(h.w / 2, 0);
        sh.lineTo(0, rise - 0.15);
        sh.closePath();
        const gg = new THREE.ShapeGeometry(sh);
        const t = M.brickTex.clone();
        t.needsUpdate = true;
        t.repeat.set(1, 1);
        const gm = new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide });
        const gable = new THREE.Mesh(gg, gm);
        gable.userData.brick = gm;
        gable.position.set(0, y0, zz);
        group.add(gable);
        members.push(gable);
        (this.gables ||= []).push(gable);
      }
    } else {
      const c = [[-W, y0, -D], [W, y0, -D], [W, y0, D], [-W, y0, D]];
      beamBetween(c[0], ridge[0]);
      beamBetween(c[1], h.w >= h.d ? ridge[1] : ridge[0]);
      beamBetween(c[2], ridge[1]);
      beamBetween(c[3], h.w >= h.d ? ridge[0] : ridge[1]);
      for (let k = 0; k < 4; k++) beamBetween(c[k], c[(k + 1) % 4], 0.1);
    }
    const gables = this.gables || [];
    this.gables = null;
    return {
      apply: (p) => {
        members.forEach((m, i) => {
          const q = wave(seg(p, 0, 0.45), i, members.length, 0.3);
          m.visible = q > 0;
        });
        roof.visible = p > 0.45;
        clip.constant = y0 + 0.02 + (rise + 0.1) * seg(p, 0.45, 1); // lợp từ diềm mái lên nóc
      },
      finish: (p) => {
        gables.forEach((gm) => (gm.material = p > 0.5 ? this.paint : p > 0 ? M.plaster : gm.userData.brick));
      },
    };
  }

  plotOnly() {
    const plot = new THREE.Mesh(new THREE.PlaneGeometry(16, 20), this.M.dirt);
    plot.rotation.x = -Math.PI / 2;
    plot.position.set(0, 0.02, 0);
    this.root.add(plot);
    const sign = boxB(3, 1.6, 0.1, this.M.yellow);
    sign.position.set(0, 0.8, 7);
    this.root.add(sign);
    this.totalH = 8;
    this.topY = 6;
  }

  // Vẽ trạng thái: giai đoạn < si: xong, = si: p, > si: chưa làm
  update(si, p, force = false) {
    if (!this.house) return;
    for (let i = 0; i < this.stages.length; i++) {
      const v = i < si ? 1 : i === si ? p : 0;
      if (!force && this.lastP[i] === v) continue;
      this.lastP[i] = v;
      this.stages[i].apply(v);
    }
    const P = (key) => {
      const i = this.stages.findIndex((s) => s.key === key);
      return i < 0 ? 0 : i < si ? 1 : i === si ? p : 0;
    };
    const pWalls = P('walls'), pDoors = P('doors'), pFound = P('foundation'), pFinish = P('finish'), pExc = P('excavate');
    this.scaffold.visible = pWalls > 0 && pDoors < 0.25;
    this.crane.visible = pExc > 0.3 && pDoors < 0.4;
    const fenceOn = pDoors < 0.5;
    this.fence.forEach((f) => (f.visible = f.visible && fenceOn));
    this.board.visible = this.board.visible && pDoors < 0.5;
    this.stakes.forEach((s) => (s.visible = s.visible && pFound < 0.3));
    this.strings.visible = this.strings.visible && pFound < 0.15;
    const backfill = pFound >= 1;
    this.pits.forEach((m) => (m.visible = m.visible && !backfill));
    this.trenches.forEach((m) => (m.visible = m.visible && !backfill));
    this.piles.forEach((m) => (m.visible = m.visible && pFound < 0.8));
    this.mep.forEach((m) => (m.visible = m.visible && pFinish < 0.3));
  }

  cutRibbon() {
    this.ribbonCut = true;
    if (this.ribbon) this.ribbon.visible = false;
  }

  // ---------- Thợ ----------
  setWorkers(n) {
    const target = Math.max(0, Math.min(16, n));
    while (this.workers.length < target) {
      const g = new THREE.Group();
      const vest = Math.random() < 0.5 ? this.M.orange : this.M.yellow;
      const legs = boxB(0.32, 0.7, 0.2, this.M.blue);
      g.add(legs);
      const body = boxB(0.42, 0.65, 0.26, vest);
      body.position.y = 0.7;
      g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), this.M.skin);
      head.position.y = 1.52;
      g.add(head);
      const hat = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), this.M.yellow);
      hat.position.y = 1.58;
      g.add(hat);
      const arm = boxB(0.1, 0.55, 0.1, vest);
      arm.position.set(0.27, 0.8, 0);
      g.add(arm);
      g.userData = { arm, target: new THREE.Vector3(), wait: 0, speed: rnd(1.1, 1.7) };
      g.position.set(rnd(-6, 6), 0, rnd(6, 9));
      this.scene.add(g);
      this.workers.push(g);
    }
    while (this.workers.length > target) this.scene.remove(this.workers.pop());
  }

  pickTarget(w) {
    const h = this.house || { w: 10, d: 12 };
    const side = Math.floor(Math.random() * 4);
    const x = side < 2 ? rnd(-h.w / 2 - 2.2, h.w / 2 + 2.2) : (side === 2 ? -1 : 1) * (h.w / 2 + rnd(1, 2.4));
    const z = side >= 2 ? rnd(-h.d / 2 - 1.5, h.d / 2 + 2) : (side === 0 ? -1 : 1) * (h.d / 2 + rnd(1, 2.3));
    w.userData.target.set(x, 0, z);
  }

  // ---------- Xe bồn bê tông (hiệu ứng quà) ----------
  spawnTruck() {
    const M = this.M;
    const g = new THREE.Group();
    const cab = boxB(2, 2, 2.2, M.red);
    cab.position.x = 3.2;
    g.add(cab);
    const chassis = boxB(6.4, 0.5, 2.2, M.steel);
    chassis.position.y = 0.5;
    g.add(chassis);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.7, 3.6, 10), M.white);
    drum.rotation.z = Math.PI / 2 + 0.2;
    drum.position.set(-0.6, 2.0, 0);
    g.add(drum);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 0.95, 0.4, 10), M.orange);
    stripe.rotation.z = Math.PI / 2 + 0.2;
    stripe.position.set(-0.3, 2.06, 0);
    g.add(stripe);
    for (const x of [-2.2, -0.8, 2.6]) {
      for (const z of [-1.1, 1.1]) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 12), M.road);
        wh.rotation.x = Math.PI / 2;
        wh.position.set(x, 0.45, z);
        g.add(wh);
      }
    }
    g.position.set(-45, 0, 14);
    this.scene.add(g);
    this.trucks.push({ g, drum, t: 0 });
  }

  tick(dt) {
    this.time += dt;
    if (this.jib && this.crane.visible) this.jib.rotation.y = Math.sin(this.time * 0.15) * 1.2;
    for (const w of this.workers) {
      const u = w.userData;
      if (u.wait > 0) {
        u.wait -= dt;
        u.arm.rotation.x = Math.sin(this.time * 9) * 0.9; // đang làm việc
        continue;
      }
      if (u.target.lengthSq() === 0) this.pickTarget(w);
      const d = u.target.clone().sub(w.position);
      d.y = 0;
      const dist = d.length();
      if (dist < 0.2) {
        u.wait = rnd(1.5, 4);
        this.pickTarget(w);
        continue;
      }
      d.normalize();
      w.position.addScaledVector(d, Math.min(dist, u.speed * dt));
      w.rotation.y = Math.atan2(d.x, d.z);
      w.position.y = Math.abs(Math.sin(this.time * 8 + w.id)) * 0.05;
      u.arm.rotation.x = Math.sin(this.time * 8) * 0.5;
    }
    this.trucks = this.trucks.filter((tr) => {
      tr.t += dt;
      tr.drum.rotation.x += dt * 3;
      const stopX = (this.house ? this.house.w / 2 : 4) + 4;
      if (tr.t < 5) tr.g.position.x = -45 + (stopX + 45) * (1 - (1 - tr.t / 5) ** 2);
      else if (tr.t < 10) tr.g.position.x = stopX;
      else tr.g.position.x = stopX + (tr.t - 10) ** 2 * 3;
      if (tr.t > 16) {
        this.scene.remove(tr.g);
        return false;
      }
      return true;
    });
  }
}
