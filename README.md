# MMO Video Studio

## Luồng mới: thư viện frame (mặc định)

Thiết kế đầy đủ ở [docs/THIET-KE-HE-THONG.md](docs/THIET-KE-HE-THONG.md).

1. Tạo **dự án video** ở trang chủ, dán tư liệu hoặc kịch bản.
2. **Lập kế hoạch bằng AI**: AI chia cảnh, viết lời đọc và chọn template trong `server/frames/`. Mỗi video chỉ tốn khoảng 3–5 nghìn token.
3. **Sửa và duyệt kế hoạch** ngay trên trang, rồi bấm **Duyệt & render**. Hệ thống tạo giọng đọc bằng edge-tts, dựng dự án HyperFrames và xuất MP4.
4. Muốn chỉnh tay thì bấm **Chỉnh sửa trong Studio** để mở HyperFrames Studio, rồi bấm **Render** để xuất kèm các chỉnh sửa.

Chạy không cần giao diện: `npm --prefix server run make:video -- samples/tin-cong-nghe.txt --slug thu`.

Mọi thông tin (dự án, phiên bản render, lượt gọi AI, job) lưu trong **MySQL**; giao diện quản lý viết bằng **React**.

```
web/      React + Vite — giao diện quản lý (cổng 5173 khi dev)
server/   Node.js + Express — API, hàng đợi xử lý, pipeline làm video (cổng 4000)
  sql/schema.sql        bảng projects, project_versions, ai_calls, jobs
  frames/               thư viện template frame
  src/video/            catalog · planner (AI) · validate · tts · timeline · compile · render · jobs · studio
  assets/               font Be Vietnam Pro
storage/  file sinh ra: projects/<slug>/ (kế hoạch, dự án HyperFrames, renders/)
```

## Cần có

- Node.js 22+, Python 3.10+, ffmpeg/ffprobe trong PATH
- MySQL 8 đang chạy
- (Tuỳ chọn) API key Claude — không có key thì AI chạy **chế độ mock** (kế hoạch mẫu) để thử quy trình

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

## Ghi chú

- Hàng đợi nằm trong bộ nhớ. Nếu server tắt giữa chừng, dự án đó chuyển sang trạng thái *Lỗi* — bấm lại là chạy tiếp.
- Bước lập kế hoạch dùng `PLAN_MODEL` (mặc định `claude-sonnet-5-5`, effort `low`) — đổi trong `.env`.
- Phần render dùng `npx hyperframes@0.8.181`, lần đầu chạy sẽ tải Chrome headless nên hơi lâu.
