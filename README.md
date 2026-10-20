# MMO Video Studio

Làm video vẽ tay bằng AI: viết kịch bản, chọn **loại video** (người que, hoạt hình, khoa học…), hệ thống tự

1. tách kịch bản thành từng cảnh (mỗi câu một cảnh),
2. tạo giọng đọc cho từng câu bằng **edge-tts** (giọng neural tiếng Việt của Microsoft),
3. nhờ **Claude API** vẽ cảnh dưới dạng các nét SVG theo phong cách của loại video,
4. dựng thành dự án **HyperFrames** (bàn tay cầm bút vẽ từng nét, tô màu, phụ đề) và render ra **MP4**.

Mọi thông tin (loại video, video, cảnh) lưu trong **MySQL**; giao diện quản lý viết bằng **React**.

```
web/      React + Vite — giao diện quản lý (cổng 5173 khi dev)
server/   Node.js + Express — API, hàng đợi xử lý, pipeline làm video (cổng 4000)
  sql/schema.sql        bảng video_types, videos, scenes + 3 loại video mẫu
  src/pipeline/         script.js (tách câu) · tts.js · ai.js (Claude) · composer.js (HTML HyperFrames) · render.js · jobs.js
  assets/               bàn tay mặc định, font Be Vietnam Pro
storage/  file sinh ra: videos/<id>/ (dự án HyperFrames + output.mp4), hands/ (ảnh bàn tay tải lên)
```

## Cần có

- Node.js 22+, Python 3.10+, ffmpeg/ffprobe trong PATH
- MySQL 8 đang chạy
- (Tuỳ chọn) API key Claude — không có key thì AI chạy **chế độ mock** (hình người que mẫu) để thử quy trình

## Cài đặt

```bash
npm run install:all
```

Lệnh trên cài thư viện cho root, `server/`, `web/` và tạo `server/.venv` có sẵn edge-tts.

Sửa `server/.env` (copy từ `server/.env.example`):

```
DB_USER=root
DB_PASSWORD=mật_khẩu_mysql_của_bạn
ANTHROPIC_API_KEY=sk-ant-...
```

Database `mmo_video` và các bảng được tạo tự động khi server khởi động.

Dùng cổng API trung gian (ví dụ Caheo AI) thay cho Anthropic: để trống `ANTHROPIC_API_KEY`, điền
`ANTHROPIC_BASE_URL` (không có `/v1` ở cuối) và `ANTHROPIC_AUTH_TOKEN`, rồi kiểm tra bằng `npm --prefix server run test:ai`.
Nếu cổng báo lỗi tham số `fallbacks`, đặt `AI_FALLBACKS=off`.

Giá trị trong `server/.env` luôn được ưu tiên hơn biến môi trường của máy.

## Chạy

```bash
npm run dev
```

Mở http://localhost:5173.

Chạy bản production (một cổng duy nhất):

```bash
npm run build
npm start
```

Rồi mở http://localhost:4000.

## Cách dùng

1. **Loại video** → chỉnh hoặc thêm loại: mô tả phong cách vẽ gửi cho AI, màu nét/nền/phụ đề, bảng màu tô, khổ hình (16:9, 9:16, 1:1), giọng đọc, tốc độ đọc, ảnh bàn tay (PNG nền trong suốt — bấm vào đầu bút trên ảnh để đánh dấu).
2. **Video** → *Tạo video*: nhập tiêu đề, chọn loại, dán kịch bản → *Lưu & tạo cảnh bằng AI*.
3. Ở trang video: xem từng cảnh, nghe giọng đọc, sửa câu rồi *Lưu & vẽ lại* cảnh chưa ưng.
4. Bấm **Render video** → khi xong có trình phát và nút *Tải MP4*.

## Ghi chú

- Mỗi lần chỉ xử lý một video (hàng đợi trong bộ nhớ). Nếu server tắt giữa chừng, video đó chuyển sang trạng thái *Lỗi* — bấm lại là chạy tiếp.
- Mỗi cảnh là một lượt gọi Claude (`claude-opus-5-5`, effort `medium` — đổi trong `.env`), nên chi phí tỉ lệ với số câu trong kịch bản.
- Phần render dùng `npx hyperframes@0.8.181`, lần đầu chạy sẽ tải Chrome headless nên hơi lâu.
