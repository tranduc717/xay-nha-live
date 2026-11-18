// 4 mẫu nhà người xem bình chọn (đơn vị: mét)
// xs / zs: lưới trục cột tính từ góc nhà. Mặt tiền nhìn ra đường (hướng +z).
export const HOUSES = [
  {
    id: 1,
    name: 'Nhà cấp 4 mái ngói',
    short: 'Cấp 4',
    icon: '🏡',
    desc: '1 tầng · mái ngói đỏ · 8×14m',
    w: 8,
    d: 14,
    floors: 1,
    H: 3.6,
    xs: [0, 4, 8],
    zs: [0, 4.5, 9.5, 14],
    roof: 'gable',
    roofColor: '#b4452c',
    wall: '#f4e3c1',
    trim: '#ffffff',
    balcony: 0,
  },
  {
    id: 2,
    name: 'Nhà ống 3 tầng',
    short: 'Nhà ống',
    icon: '🏢',
    desc: '3 tầng · mái bằng có tum · 5×15m',
    w: 5,
    d: 15,
    floors: 3,
    H: 3.4,
    xs: [0, 5],
    zs: [0, 5, 10, 15],
    roof: 'flat',
    roofColor: '#7c8b8f',
    wall: '#dfe9f2',
    trim: '#2f4858',
    balcony: 1.2,
  },
  {
    id: 3,
    name: 'Biệt thự mini 2 tầng',
    short: 'Biệt thự',
    icon: '🏰',
    desc: '2 tầng · mái chóp xám · 10×11m',
    w: 10,
    d: 11,
    floors: 2,
    H: 3.5,
    xs: [0, 5, 10],
    zs: [0, 5.5, 11],
    roof: 'hip',
    rise: 2.2,
    roofColor: '#4a4f57',
    wall: '#fbf5e9',
    trim: '#8a6a4a',
    balcony: 1.2,
  },
  {
    id: 4,
    name: 'Nhà mái Thái 2 tầng',
    short: 'Mái Thái',
    icon: '🛖',
    desc: '2 tầng · mái Thái dốc · 8×10m',
    w: 8,
    d: 10,
    floors: 2,
    H: 3.4,
    xs: [0, 4, 8],
    zs: [0, 5, 10],
    roof: 'hip',
    rise: 3.4,
    roofColor: '#9c3b22',
    wall: '#fff0d6',
    trim: '#ffffff',
    balcony: 0,
  },
];

// Danh sách giai đoạn thi công theo mẫu nhà. weight = tỉ lệ thời gian.
// mats = từ khoá người xem gõ để chở vật liệu.
export function buildStages(h) {
  const st = [
    { key: 'permit', name: 'Xin giấy phép xây dựng', weight: 4, mats: ['ký', 'hồ sơ', 'bản vẽ'] },
    { key: 'survey', name: 'Khảo sát & định vị mặt bằng', weight: 4, mats: ['cọc', 'đo', 'dây'] },
    { key: 'excavate', name: 'Đào móng', weight: 5, mats: ['đào', 'xúc', 'máy xúc'] },
    { key: 'foundation', name: 'Móng & giằng móng', weight: 9, mats: ['thép', 'xi măng', 'cát', 'đá'] },
  ];
  for (let f = 0; f < h.floors; f++) {
    st.push({ key: `col-${f}`, name: `Cột tầng ${f + 1}`, weight: 6, mats: ['thép', 'cốp pha', 'bê tông'], floor: f });
    const top = f === h.floors - 1;
    st.push({
      key: `beam-${f}`,
      name: top ? (h.roof === 'gable' ? 'Dầm mái' : 'Dầm & sàn mái') : `Dầm & sàn tầng ${f + 2}`,
      weight: 8,
      mats: ['thép', 'cốp pha', 'bê tông'],
      floor: f,
    });
  }
  if (h.floors > 1 || h.roof === 'flat') st.push({ key: 'stairs', name: 'Cầu thang', weight: 5, mats: ['bê tông', 'thép', 'tay vịn'] });
  st.push(
    { key: 'walls', name: 'Xây tường', weight: 10, mats: ['gạch', 'vữa'] },
    { key: 'roof', name: h.roof === 'flat' ? 'Tum & chống thấm mái' : 'Lợp mái', weight: 7, mats: h.roof === 'flat' ? ['chống thấm', 'gạch'] : ['ngói', 'xà gồ'] },
    { key: 'mep', name: 'Điện nước', weight: 5, mats: ['dây điện', 'ống nước', 'bồn nước'] },
    { key: 'finish', name: 'Trát, ốp lát & sơn', weight: 9, mats: ['trát', 'ốp lát', 'sơn'] },
    { key: 'doors', name: 'Cửa, nội thất & sân vườn', weight: 7, mats: ['cửa', 'kính', 'cây'] },
    { key: 'handover', name: 'Nghiệm thu & bàn giao', weight: 3, mats: ['chúc mừng', 'cắt băng'] },
  );
  return st;
}
