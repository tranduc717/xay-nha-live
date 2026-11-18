# 🏗️ Chủ Thầu Tí Hon – game xây nhà trên TikTok LIVE

Người xem **bình luận để chọn mẫu nhà**, rồi cùng nhau xây từ lúc **xin giấy phép** đến khi **cắt băng bàn giao** cho chủ nhà. Phần dựng hình 3D dùng three.js (khung dọc 1080×1920), giọng MC tiếng Việt đọc bằng Edge TTS.

## Cách chơi
| Người xem làm gì | Kết quả |
|---|---|
| Gõ `1` `2` `3` `4` (lúc bình chọn) | Chọn mẫu nhà: Cấp 4 · Nhà ống 3 tầng · Biệt thự mini · Mái Thái |
| Gõ tên vật liệu (`thép`, `xi măng`, `gạch`, `ngói`, `sơn`…) | Chở vật liệu vào, nhà xây nhanh hơn, được +2 điểm |
| ❤️ Thả tim | Tăng tốc độ thi công (tối đa x1.8) |
| ➕ Follow | Thêm 1 thợ vào công trường, được +10 điểm |
| 🎁 Tặng quà | Hiệu ứng (pháo hoa, xe bồn, bóng bay…) và khắc tên lên **Gạch vinh danh**. Quà **không** làm xây nhanh hơn |

Danh hiệu theo điểm: 🧱 Thợ phụ → 🔨 Thợ chính (20) → 🦺 Cai thầu (60) → 📐 Kiến trúc sư (150). Ai góp công nhiều nhất trong lúc xây căn nào sẽ là **chủ nhà** khi căn đó bàn giao.

**Các giai đoạn xây (tổng khoảng 15 phút):** Xin giấy phép → Khảo sát, định vị → Đào móng → Móng & giằng móng → Cột / dầm & sàn từng tầng (thép → cốp pha → đổ bê tông) → Cầu thang → Xây tường (có giàn giáo) → Mái → Điện nước → Trát, ốp lát & sơn → Cửa, nội thất & sân vườn → Nghiệm thu & bàn giao.

## Lên live trên PC Windows
1. Cài **Node.js LTS**: https://nodejs.org
2. Tải code: bấm nút xanh **Code → Download ZIP** trên GitHub, rồi giải nén.
3. Bấm đúp **`BAT-LIVE.bat`**. Lần đầu phải chờ cài thư viện 1–2 phút, sau đó bảng điều khiển tự mở ra ở `http://localhost:3010`.
4. Trong **TikTok LIVE Studio**: chọn khung dọc → thêm nguồn **Link** → dán `http://localhost:3010/?view=stage`, kích thước **1080×1920**. Nhớ bật âm thanh của nguồn để giọng MC lên live.
5. Bấm **Phát trực tiếp**. Sau đó vào bảng điều khiển → tab **Kết nối TikTok** → nhập `ductranvipp` → bấm **Kết nối**.
6. Muốn điều khiển bằng điện thoại khi đang live: cho điện thoại dùng chung Wi‑Fi với máy tính, rồi mở `http://<IP máy tính>:3010`. Xem IP bằng cách gõ lệnh `ipconfig` trong cửa sổ cmd.

> Máy dùng Intel UHD: để chất lượng 3D ở mức **Thấp** (mặc định). Khi đang live nên tắt ô “Xem trước” trong bảng điều khiển cho máy nhẹ.

## Bảng điều khiển
- **Tổng quan:** trạng thái kết nối, số người xem, tim, kim cương; tiến độ công trình; Top thợ; Gạch vinh danh; diễn biến.
- **Điều khiển game:** mở bình chọn mới, bỏ qua giai đoạn, tạm dừng / tiếp tục, bàn giao ngay, chọn thẳng mẫu nhà, cho MC đọc một câu tuỳ ý.
- **Quà & hiệu ứng:** gán từng quà với một hiệu ứng.
- **Giọng MC & đồ hoạ:** chọn giọng Hoài My (nữ) hoặc Nam Minh (nam), chất lượng 3D, thời gian xây, thời gian bình chọn.
- **Chạy thử:** giả lập bình luận, quà, tim, follow, hoặc bật “người xem ảo” để thử mà không cần live.

## Bản demo trên Render
File `render.yaml` dựng sẵn bản demo, có người xem ảo tự tương tác (`DEMO_BOT=1`). Bản demo đặt `CONTROL_PIN` để người lạ không bấm điều khiển được; xem mã PIN trong mục Environment của dịch vụ trên Render. Gói miễn phí sẽ tự ngủ khi không có ai truy cập, nên **live thật hãy chạy trên PC**.

## Lưu ý
- `tiktok-live-connector` là thư viện không chính thức. Nó cần dịch vụ ký Euler Stream, gói miễn phí bị giới hạn số lần kết nối theo IP. Nếu kết nối hay bị lỗi, hãy lấy API key miễn phí ở eulerstream.com rồi dán vào tab Kết nối TikTok.
- Cấu trúc server, SSE và TTS dựa theo [lop-hoc-chu](https://github.com/workaipvlinh-byte/lop-hoc-chu) (giấy phép MIT).

## Cấu trúc thư mục
```
server.js              máy chủ: TikTok → SSE, Edge TTS, cài đặt, người xem ảo
public/dashboard.*     bảng điều khiển
public/stage.html      màn hình live 1080×1920
public/stage/game.js   luật chơi, MC, hiệu ứng, gửi trạng thái
public/stage/builder.js  dựng công trình 3D theo từng giai đoạn
public/stage/houses.js   4 mẫu nhà + danh sách giai đoạn
```
