# Quy tắc viết kịch bản: Bảng tin và Hoạt hình

> Phiên bản 1.1 · 23/10/2026
> Tổng hợp từ prompt `SYSTEM` trong code. Prompt gửi cho AI viết bằng tiếng Anh; tài liệu này là bản dịch và giải thích. Khi sửa quy tắc, sửa trong code rồi cập nhật lại tài liệu này.

---

## Mục lục

1. [Tổng quan hai chế độ](#1-tổng-quan-hai-chế-độ)
2. [Bảng tin (video thường)](#2-bảng-tin-video-thường)
3. [Hoạt hình](#3-hoạt-hình)
4. [Quy tắc thêm cho preset unlimited](#4-quy-tắc-thêm-cho-preset-unlimited)
5. [Kiểm tra và sửa lỗi kịch bản](#5-kiểm-tra-và-sửa-lỗi-kịch-bản)
6. [Giới hạn thời gian của gateway](#6-giới-hạn-thời-gian-của-gateway)
7. [Sửa quy tắc ở đâu](#7-sửa-quy-tắc-ở-đâu)

---

## 1. Tổng quan hai chế độ

| | Bảng tin (video thường) | Hoạt hình |
|---|---|---|
| AI tạo ra | Kế hoạch `plan.json`: danh sách cảnh, mỗi cảnh một frame mẫu | Kịch bản: dàn nhân vật (`cast`) + danh sách shot, mỗi shot một câu nói |
| Đơn vị | Cảnh (scene) = lời đọc + 1 frame + nội dung điền vào | Shot = 1 câu nói của nhân vật hoặc người dẫn truyện |
| Hình ảnh | Frame mẫu có sẵn, icon, logo, ảnh, cutout theo chủ đề | Nhân vật, bối cảnh, hành động, cảm xúc của engine hoạt hình 2D |
| Nội dung | Chỉ dùng thông tin trong tư liệu, không bịa | Được tự viết thoại, nhưng giữ cốt truyện, nhân vật và kết thúc |
| Prompt | `SYSTEM` trong `server/src/video/planner.js` | `SYSTEM` trong `server/src/animation/planner.js` |

Sau khi AI trả lời, kịch bản hoạt hình được chuyển thành một `plan.json` bình thường. Shot dùng các frame `anim-title`, `anim-shot`, `anim-end`. Từ bước giọng đọc trở đi, hai chế độ dùng chung quy trình: timeline, biên dịch, lint, render.

---

## 2. Bảng tin (video thường)

AI chỉ ghép video từ thư viện frame có sẵn, không bao giờ viết HTML. Với mỗi cảnh, AI viết lời đọc (`voice_text`), chọn một frame trong danh sách được phép và điền các input của frame đó.

### 2.1 Lời đọc

- Tiếng Việt, trừ khi được yêu cầu ngôn ngữ khác.
- Văn nói tự nhiên cho máy đọc (TTS), mỗi cảnh 1–2 câu ngắn.
- Số trong lời đọc viết theo cách đọc ("hai mươi lăm phần trăm").
- Lời đọc phải vừa khoảng thời lượng của frame, tính khoảng **2,6 từ tiếng Việt mỗi giây**. Ý dài thì tách thành nhiều cảnh.
- Tổng độ dài nhắm theo thời lượng mục tiêu của dự án (mặc định khoảng 90 giây).

### 2.2 Cấu trúc và chọn frame

- Cảnh đầu dùng frame mở đầu (intro), cảnh cuối dùng frame kết thúc (outro).
- Chọn frame theo nội dung cảnh:

| Nội dung | Frame nên dùng |
|---|---|
| Một con số | Frame thống kê (ví dụ `stat-big`) |
| Liệt kê | Frame danh sách (ví dụ `bullet-list`) |
| So sánh | Frame so sánh (ví dụ `compare-2col`) |
| Lời của một người | Frame trích dẫn (`quote`) |

- Đa dạng frame: hai cảnh liền nhau không dùng cùng frame, mỗi frame dùng **tối đa 2 lần** mỗi video.

### 2.3 Chữ trên màn hình (inputs)

- Ngắn gọn, ấn tượng, **không chép lại lời đọc**.
- Không vượt giới hạn ký tự của từng input. Giới hạn ghi trong prompt và do bộ kiểm tra áp dụng, vì structured output không tự áp dụng `maxLength`.
- Số trên màn hình viết bằng chữ số.

### 2.4 Keywords và chuyển cảnh

- `keywords`: cụm từ **chép nguyên văn** từ `voice_text` của chính cảnh đó, theo thứ tự nói. Dùng để canh lúc hoạt ảnh xuất hiện đúng lúc nói tới. Frame nào không cần thì để `[]`.
- `transition_out`: `wipe` khi cảnh sau sang chủ đề mới, còn lại dùng `fade`.

### 2.5 Icon, logo, ảnh, cutout

- Icon phải thể hiện đúng chủ thể của cảnh (vũ trụ → hành tinh, y tế → viên thuốc). Mỗi icon tối đa 2 lần mỗi video.
- Logo thương hiệu chỉ dùng khi tư liệu có nhắc tới thương hiệu đó.
- Cutout (ảnh một vật đã tách nền) chỉ dùng khi đúng là vật mà cảnh đang nói tới.
- Frame ảnh có thể dùng ảnh của dự án hoặc ảnh thư viện. Ảnh thư viện chỉ dùng khi mô tả ảnh khớp với cảnh, và phải chép credit vào input `credit`. Khi ghép, hệ thống cũng tự thêm credit nếu thiếu.

### 2.6 Không bịa nội dung

- Chỉ dùng thông tin có trong tư liệu của người dùng.
- Không bịa số liệu, trích dẫn, tên, ngày tháng hay tên kênh.
- Không thêm nhận xét, đánh giá mà tư liệu không có (ví dụ "khá cạnh tranh").
- **Ngoại lệ duy nhất:** đáp án sai trong câu đố. Đáp án sai phải hợp lý nhưng rõ ràng là sai.

### 2.7 Giọng văn theo chủ đề

Mỗi chủ đề trong `server/topics/*.json` có trường `tone` được đưa vào prompt. Ví dụ chủ đề **Tin tức và sự kiện nổi bật** (`news-events.json`):

> khách quan, ngắn gọn như bản tin; chỉ dùng thông tin trong tư liệu

Tên kênh lấy từ dự án. Nếu dự án không có tên kênh, mọi input `channel` để trống. Khi ghép, hệ thống tự điền tên kênh vào frame có input `channel`, AI không quyết định giá trị này.

---

## 3. Hoạt hình

AI viết kịch bản phim hoạt hình 2D ngắn bằng tiếng Việt cho engine hoạt hình. AI không vẽ, không viết code, chỉ trả về JSON. Engine có sẵn một bộ nhân vật, bối cảnh, hành động và cảm xúc cố định, được liệt kê trong prompt.

### 3.1 Cấu trúc kịch bản

| Trường | Ý nghĩa |
|---|---|
| `title` | Tên phim |
| `moral` | Bài học, tối đa 110 ký tự |
| `cast` | Dàn nhân vật: `rig` (mã nhân vật), `name` (tên tiếng Việt), `voice` (kiểu giọng) |
| `opening` | Câu dẫn mở đầu, phát trên màn hình tiêu đề |
| `shots` | Danh sách shot, mỗi shot một câu nói |
| `closing` | Câu kết, nêu bài học hoặc kết thúc ấm áp |
| `cards` | (Chỉ ở preset unlimited bật cards) Cảnh khung chèn giữa các shot |

Mỗi shot gồm: `setting`, `time`, `cast`, `speaker`, `actor`, `action`, `emotion`, `camera`, `reactor`, `reaction`, `line`.

### 3.2 Cốt truyện và lời thoại

- Kể đúng câu chuyện người dùng mô tả. AI được tự viết thoại cho phù hợp, nhưng **giữ nguyên cốt truyện, nhân vật và kết thúc** của người dùng.
- Mỗi shot là **đúng một câu nói**: của một nhân vật (`speaker` = mã nhân vật) hoặc của người dẫn truyện (`speaker` = `narrator`).
- Mỗi câu ngắn, tối đa khoảng **22 từ**.
- Câu của nhân vật ghi đúng lời nhân vật nói: không có tên ở đầu, không có ngoặc kép.
- Xen kẽ dẫn truyện và thoại. **Ít nhất một nửa** số shot là thoại.

### 3.3 Nhân vật trong shot (cast, speaker)

- `cast` của shot: 1–3 nhân vật xuất hiện trên màn hình, xếp từ trái sang phải.
- Các shot cùng một cảnh giữ nguyên `setting`, `time` và `cast` để cắt cảnh liền mạch. Đổi bối cảnh khi câu chuyện chuyển sang nơi khác.
- `speaker` phải là nhân vật có trong `cast` của shot, hoặc `narrator`.
- Mọi nhân vật xuất hiện trong shot phải có trong `cast` của phim.

### 3.4 Hành động, cảm xúc, máy quay

- `action`: việc nhân vật làm trong lúc nói câu đó.
  - `actor` = `none` nghĩa là người nói tự làm. Nếu người dẫn truyện nói thì nhân vật đầu tiên trong shot làm.
  - `walk_in` / `run_in` khi nhân vật xuất hiện.
  - `walk_out` / `run_out` khi nhân vật rời đi. Các shot sau bỏ nhân vật đó ra cho đến khi quay lại.
  - `talk` cho lúc nói chuyện bình thường.
  - Hành động biểu cảm khi lời thoại cần: `laugh`, `cry`, `jump`, `shock`, `think`, `sleep`, `hug`, `fall`, `dance`, `wave`, `point`, `nod`, `shake_head`.
- `emotion`: hợp với câu thoại.
- `camera`: chủ yếu `wide`; `close` cho câu nhiều cảm xúc, quan trọng; `pan` khi dẫn truyện tả cảnh.
- `reactor` / `reaction`: một nhân vật khác trong shot phản ứng cùng lúc (người nghe cười, giật mình, gật đầu, khóc…). Dùng `none` khi không ai phản ứng. **Nên dùng thường xuyên** để phim sinh động.

### 3.5 Chọn nhân vật

- Chọn nhân vật hợp với truyện: con vật cho truyện ngụ ngôn; ông, bà, vua, công chúa, cậu bé, cô bé… cho truyện về người.
- Mỗi nhân vật (`rig`) chỉ dùng **một lần** trong cast của phim.
- Mỗi nhân vật có tên tiếng Việt ngắn và kiểu giọng hợp tuổi, vóc dáng.

### 3.6 Mở đầu và kết thúc

- `opening`: một câu của người dẫn truyện bắt đầu câu chuyện ("Ngày xửa ngày xưa…" hoặc tương tự). Câu này phát trên màn hình tiêu đề, nên **shot đầu tiên không được lặp lại nó** mà bắt đầu bằng chuyện xảy ra tiếp theo.
- `closing`: một câu của người dẫn truyện nêu bài học hoặc một kết thúc ấm áp.

---

## 4. Quy tắc thêm cho preset unlimited

Preset tính theo lượt (`billing: "request"`, model `req/...`) không tốn thêm khi prompt dài. Vì vậy AI nhận thêm các phần dưới đây, tùy cấu hình preset trên trang **Cấu hình AI**. **Preset unlimited không thêm frame mới**: AI chỉ dùng các frame trong danh sách gửi lên, và làm video sinh động bằng hoạt ảnh trên chính các frame đó.

| Phần | Bật khi | Áp dụng cho | Nội dung | File |
|---|---|---|---|---|
| Rich mode | `density: "rich"` | Cả hai | Nhiều cảnh hơn | `server/src/video/guides.js` |
| Hoạt ảnh theo câu chuyện | `story_motion` | Bảng tin; các card của hoạt hình | Mỗi cảnh có thêm trường `motion` | `server/src/video/motion.js` |
| Cards | `mix_templates` | Hoạt hình | Chèn frame có sẵn làm thẻ giữa các shot | `server/src/animation/planner.js` |

Preset unlimited còn được dùng toàn bộ thư viện frame phù hợp, không bị giới hạn số frame như preset tính theo token.

### 4.1 Rich mode

- Bảng tin: khoảng 1 cảnh mỗi 4 giây. Hoạt hình: khoảng 1 shot mỗi 3,5 giây.
- Mỗi cảnh một ý, 3–6 giây lời đọc. Không để hai cảnh giống nhau liền nhau.
- Dùng hết sự đa dạng của những gì có sẵn. Cảnh nào cũng có keywords để hoạt ảnh khớp với lời nói.
- Mở đầu bằng một câu gây tò mò, dẫn dắt sự tò mò, kết thúc bằng thông điệp rõ ràng.

### 4.2 Hoạt ảnh theo câu chuyện (`motion`)

Mỗi cảnh có thêm `motion: { effect, camera, actors }`, để hình ảnh diễn lại điều lời đọc đang nói. Motion chỉ là lớp trang trí: dữ kiện và chữ trên màn hình vẫn nằm trong input của frame.

- **effect** — hiệu ứng phủ cả cảnh:

| Giá trị | Hiệu ứng | Dùng khi |
|---|---|---|
| `none` | Không có | Không có gì phù hợp |
| `rain` | Mưa rơi | Bão, lũ, buồn |
| `snow` | Tuyết rơi | Mùa đông, lạnh, tĩnh lặng |
| `leaves` | Lá rơi xoay | Mùa thu, rừng, thời gian trôi |
| `confetti` | Pháo giấy | Ăn mừng, kỷ lục, tin vui |
| `fireworks` | Pháo hoa | Lễ hội, ra mắt, thành tựu lớn |
| `bubbles` | Bong bóng nổi | Biển, dưới nước, hóa học |
| `embers` | Tàn lửa bay lên | Lửa, núi lửa, chiến tranh, nguy hiểm |
| `stars` | Sao lấp lánh | Vũ trụ, đêm, giấc mơ |
| `hearts` | Trái tim bay lên | Tình yêu, lòng tốt, gia đình |
| `lightning` | Chớp sét | Sốc, bão, nguy hiểm bất ngờ |
| `wind` | Vệt tốc độ | Tốc độ, gió, đua |
| `magic` | Chùm lấp lánh tỏa ra | Tiết lộ, phép màu, sự thật bất ngờ |
| `glow` | Quầng sáng nhịp sau nội dung | Nhấn mạnh nhẹ, bí ẩn |

  Không dùng một effect quá 2 cảnh liên tiếp.
- **camera** — `push` (đẩy chậm, mặc định), `zoom_in`, `zoom_out`, `pan_left`, `pan_right`, `tilt` (lắc lư), `shake` (rung ở từ khóa đầu), `static`.
- **actors** — tối đa 2 nhân vật (`kind: "character"`) hoặc icon (`kind: "icon"`) trong thư viện, diễn trong cảnh:
  - `move`: `walk_across`, `run_across`, `fly_across`, `peek`, `pop_in`, `rise`, `fall`, `bounce`.
  - `side`: `left` hoặc `right`, là phía bắt đầu.
  - `at`: chỉ số từ khóa trong `keywords` của cảnh để bắt đầu đúng lúc từ đó được đọc; `-1` là bắt đầu ngay đầu cảnh.
  - Nhân vật đi ở hai mép và làn ngay trên phụ đề để không che chữ của frame.
- AI được khuyến khích dùng hiệu ứng hoặc nhân vật ở phần lớn các cảnh, và cho nhân vật diễn ở khoảng một nửa số cảnh.
- Mọi hoạt ảnh lấy từ thư viện cố định trong code. Vị trí hạt tính sẵn lúc biên dịch, không dùng `Math.random`, nên render lần nào cũng giống nhau.
- Phim hoạt hình: chỉ các card có motion, vì shot hoạt hình đã có engine riêng.

### 4.3 Cards (hoạt hình)

- Cảnh khung bình thường chèn giữa các shot: tiêu đề chương khi truyện chuyển đoạn, sự thật thú vị, câu hỏi cho người xem, trích dẫn, dòng thời gian…
- Do người dẫn truyện đọc (`voice_text`).
- **2–5 card** mỗi phim, không bao giờ hai card liền nhau.
- Frame được dùng làm card: `story-chapter`, `fun-fact`, `big-question`, `quote`, `icon-hero`, `icon-points`, `timeline-steps`, `place-card`, `era-card`, `myth-fact`, `what-if`, `story-cast`, `percent-ring`, `scale-compare`. Chỉ frame đang `active` mới được dùng.

> Trước đây preset unlimited còn chèn shot hoạt hình (`anim-shot`) vào video giải thích và cho AI tự viết cảnh mới (`ai-scene`). Hai tính năng này đã bỏ. Plan cũ có `ai-scene` vẫn biên dịch được.

---

## 5. Kiểm tra và sửa lỗi kịch bản

- AI nhận **JSON schema** của câu trả lời. Gọi thẳng Anthropic thì schema được áp dụng bắt buộc (structured outputs). Gọi qua gateway (có `ANTHROPIC_BASE_URL`) thì schema nằm trong prompt, vì gateway giữ câu trả lời có schema đến khi xong và cắt kết nối im lặng khoảng 90 giây. Biến `AI_STRUCTURED=on|off` để đổi.
- Sau đó `validatePlan` kiểm tra thêm: giới hạn ký tự, frame có được phép không, input bắt buộc có đủ không, `motion` có đúng danh sách và tên nhân vật/icon có trong thư viện không… Với hoạt hình còn kiểm tra:
  - Nhân vật trong shot phải có trong cast của phim.
  - Mỗi nhân vật chỉ có một lần trong cast.
- Nếu có lỗi, danh sách lỗi được gửi lại để AI trả về bản sửa hoàn chỉnh. Mỗi chế độ được **tối đa 3 lần**; lần 3 vẫn lỗi thì báo lỗi.
- Lỗi của hoạt hình được ghi theo vị trí shot và card mà AI viết (`shots[k]`, `cards[j]`), không theo số cảnh sau khi ghép, để AI biết chỗ cần sửa.

---

## 6. Giới hạn thời gian của gateway

Preset unlimited gọi qua gateway `caheoai.com` (biến `ANTHROPIC_BASE_URL` của server). Gateway này cắt mọi lượt trả lời dài quá **300 giây**, và trả lỗi:

```
{"type":"error","error":{"type":"api_error","message":"Lượt gọi đã bị phía khách hủy."}}
```

- Với model `req/...`, gateway không gửi dần câu trả lời mà giữ đến khi xong. Prompt càng dài (rich, cards, motion) và effort càng cao thì càng lâu; Opus ở effort `medium` với video giải thích nhiều cảnh đã mất hơn 6 phút.
- Server ghi log thời gian mỗi 30 giây: số ký tự đã trả lời, số ký tự suy nghĩ, và lần cuối nhận dữ liệu.
- Nếu một lượt gọi unlimited bị lỗi sau ít nhất 240 giây, server coi đó là bị gateway cắt và tự gọi lại với effort thấp hơn một bậc (`high` → `medium` → `low`). Mỗi lần gọi lại có thể bị tính thêm một lượt.
- **Khuyến nghị:** đặt effort của preset unlimited là `low`. Nếu vẫn hay bị cắt, tắt bớt rich hoặc cards.

---

## 7. Sửa quy tắc ở đâu

| Muốn sửa | File |
|---|---|
| Quy tắc bảng tin | `server/src/video/planner.js` — hằng `SYSTEM` |
| Quy tắc hoạt hình | `server/src/animation/planner.js` — hằng `SYSTEM` |
| Danh sách frame dùng làm card | `server/src/animation/planner.js` — hằng `CARD_FRAMES` |
| Rich mode | `server/src/video/guides.js` |
| Hoạt ảnh theo câu chuyện (hiệu ứng, camera, nhân vật) | `server/src/video/motion.js` |
| Giọng văn từng chủ đề | `server/topics/<chủ-đề>.json` — trường `tone` |
| Giới hạn ký tự, input của từng frame | `server/frames/<frame>/meta.json` |
| Effort, max_tokens, bật/tắt rich, hoạt ảnh theo câu chuyện, cards | Trang **Cấu hình AI** |
| Kiểm tra kịch bản sau khi AI trả lời | `server/src/video/validate.js` |

Prompt viết bằng tiếng Anh vì AI làm theo quy tắc chính xác hơn. Lời đọc và lời thoại vẫn bằng tiếng Việt vì quy tắc yêu cầu như vậy. Khi thêm quy tắc mới, nên viết bằng tiếng Anh cho thống nhất.
