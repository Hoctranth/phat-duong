# 🪷 TikTok LIVE Cúng Phật - Bàn Thờ Ảo Tương Tác (9:16 OBS Overlay)

Bộ mã nguồn hoàn chỉnh giúp bạn dựng phòng **TikTok LIVE Bàn Thờ Phật Ảo** tỷ lệ dọc **9:16 (1080×1920)** chuẩn màn hình điện thoại, tự động nhận sự kiện thời gian thực từ **TikTok-Live-Connector (v2)** và hiển thị hiệu ứng dâng hoa, thắp hương, thỉnh Đại Hồng Chung, ghi danh Bảng Vàng Công Đức và Sớ Cầu An.

---

## ✨ Tính năng nổi bật

1. **Giao diện Bàn Thờ Phật 9:16 (1080×1920) Trang Nghiêm**:
   - **Tôn tượng & Hào quang Cửu Long**: Xoay đa tầng, bừng sáng khi có người dâng lễ hoặc thả tim. Hỗ trợ đổi giữa **Đức Phật Bổn Sư Thích Ca**, **Đức Quan Thế Âm Bồ Tát** và **Đức Phật Di Lặc**.
   - **Lư Hương Đồng & Khói Trầm Vật Lý (Canvas)**: Tự động cắm thêm nén hương cháy đỏ trên lư và tăng mật độ khói hương uốn lượn bay lên án tiền.
   - **Lục Bình Hoa Sen, Đôi Đèn Lưu Ly & Mâm Ngũ Quả**: Tự động nở hoa và tăng cấp độ ánh sáng khi có người tặng quà.
   - **Sớ Cầu An Công Đức & Bảng Vàng Công Đức**: Mở cuộn chiếu thư vàng ghi tên tín chủ kèm lời chúc phúc cát tường mỗi khi có người tặng quà.
   - **Dải Lụa Chào Đạo Hữu & Sớ Tâm Nguyện**: Hiển thị người mới vào phòng (`Nam Mô A Di Đà Phật — Hoan hỷ đón...`) và hiển thị bình luận thành lời khấn cầu an.
2. **Âm thanh Pháp Khí Tự Động (Web Audio Synthesizer)**:
   - Tiếng **Đại Hồng Chung** ngân vang trầm ấm, tiếng **Chuông Gia Trì / Chuông Xoay**, tiếng **Mõ Tụng Kinh** và **Nhạc Thiền Tĩnh Tâm** nền (không cần tải file MP3 ngoài).
3. **Bảng Điều Khiển & Giả Lập (`/control.html`)**:
   - Kết nối trực tiếp tới bất kỳ `TikTok Username` nào đang LIVE mà không cần khởi động lại server.
   - Có sẵn bộ nút giả lập **Dâng Hoa**, **Thắp Hương**, **Mâm Ngũ Quả**, **Thỉnh Đại Hồng Chung**, **Gửi Lời Khấn** và chế độ **Auto-Demo** để test ngay khi chưa bật LIVE.

---

## 🚀 Cách chạy Project

```bash
# 1. Cài đặt thư viện (đã cài sẵn)
npm install

# 2. Khởi động Server
npm start
```

Sau khi chạy `npm start`, mở trình duyệt tại:
- **Bảng Điều Khiển & Giả Lập Test**: `http://localhost:3000/control.html`
- **Giao diện Bàn Thờ 9:16 (cho OBS)**: `http://localhost:3000/overlay.html?obs=1`

---

## 🎥 Cách thêm vào OBS Studio / TikTok LIVE Studio

1. Trong **OBS Studio**, vào **File → Settings → Video**:
   - Đặt **Base (Canvas) Resolution** và **Output (Scaled) Resolution** thành `1080x1920` (khung hình dọc 9:16).
2. Trong mục **Sources**, nhấn dấu **`+`** → chọn **Browser**:
   - **URL**: `http://localhost:3000/overlay.html?obs=1`
   - **Width**: `1080`
   - **Height**: `1920`
   - Tích chọn **Control audio via OBS** nếu muốn chỉnh âm lượng chuông/mõ trực tiếp trên thanh Audio Mixer của OBS.
   - *(Mẹo)*: Nếu muốn nền trong suốt để ghép đè lên video cảnh chùa quay sẵn trong OBS, dùng URL: `http://localhost:3000/overlay.html?obs=1&bg=transparent`.

---

## 🎁 Quy tắc quy đổi Quà TikTok sang Nghi thức Dâng Lễ

| Giá trị quà (Xu / Diamonds) | Nghi thức trên Bàn Thờ | Hiệu ứng Hình ảnh & Âm thanh |
| :--- | :--- | :--- |
| **1 – 9 xu** *(Hoa hồng, Hoa sen...)* | **🪷 Dâng Hoa Sen Tươi Thắm** | Hai bình sen nở sáng hồng + Tiếng Chuông Gia Trì + Mở Sớ Cầu An |
| **10 – 49 xu** *(Tim, Hương trầm...)* | **🔥 Dâng Hương Trầm Thượng Hạng** | Cắm thêm nén hương cháy đỏ vào lư + Khói hương dày lên + Tiếng Mõ & Chuông |
| **50 – 199 xu** *(Hoa đăng, Mâm quả...)* | **🏮 Dâng Mâm Ngũ Quả & Đèn Lưu Ly** | Đèn Lưu Ly tăng độ sáng + Mâm quả phát quang + 1 tiếng Đại Hồng Chung |
| **200+ xu** *(Quà lớn / Đại công đức)* | **🔔 Thỉnh Đại Hồng Chung & Đại Công Đức** | Ngân 3 hồi Đại Hồng Chung + Hào quang Phật rực sáng + Mưa hoa sen vàng rơi khắp màn hình |
