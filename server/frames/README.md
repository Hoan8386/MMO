# Thư viện frame

Mỗi thư mục là một frame (template) dùng lại được cho mọi video.

```
<frame_id>/
  meta.json       mô tả, loại cảnh, biến đầu vào, giới hạn, thời lượng — AI chỉ thấy file này
  template.html   sub-composition HyperFrames — AI không bao giờ thấy file này
```

## meta.json

| Trường | Ý nghĩa |
|---|---|
| `frame_id` | trùng tên thư mục |
| `version` | tăng mỗi khi sửa template |
| `status` | `active` mới được đưa cho AI chọn |
| `scene_type`, `category`, `tags` | phục vụ lọc |
| `duration` | `min` / `max` / `recommended` (giây) |
| `inputs` | biến đầu vào: `type` là `string`, `number`, `list` (mảng chuỗi), `image` (tên file ảnh có sẵn), `icon` / `icons` / `logo` (tên trong kho icon, logo) hoặc `cutout` (tên ảnh tách nền, template dùng `assets/cutouts/{{tên}}.png`); `required`, `maxLength`, `minItems`, `maxItems`, `itemMaxLength` |
| `keywords` | hướng dẫn cho AI: từ khoá trong lời thoại dùng để canh chuyển động |
| `sample` | dữ liệu mẫu để render thử |

## template.html

Template được **chép và điền biến lúc biên dịch** thành `compositions/<scene>.html` của từng video,
nên sửa template không làm đổi video cũ.

Biến do bộ biên dịch cung cấp:

| Biến | Giá trị |
|---|---|
| `{{__id}}` | id cảnh (`s01`…), dùng làm `data-composition-id` và key của `window.__timelines` |
| `{{__r}}` | selector gốc `#s01-root`, đặt trước **mọi** rule CSS để các cảnh không đè style nhau |
| `{{__w}}`, `{{__h}}` | kích thước khung hình |
| `{{{__fontface}}}` | `@font-face` dùng chung |
| `{{{__props}}}` | JSON: `D` (thời lượng cảnh), `vo` (giây bắt đầu đọc), `voEnd`, `marks` (thời điểm từng từ khoá, `null` nếu không tìm thấy) cùng toàn bộ input |
| `{{tên_input}}` | giá trị input đã escape HTML; `{{#list}}…{{.}}…{{/list}}` để lặp (`{{@n}}` = số thứ tự); `{{^x}}…{{/x}}` khi rỗng; `{{?list}}…{{/?list}}` bọc một lần khi có dữ liệu |

Quy ước chuyển động: pha **vào** trong khoảng 1 giây đầu, pha **giữ** co giãn theo `P.D`,
pha **ra** bắt đầu ở `P.D - 0.45`. Chừa 260px dưới cùng cho phụ đề.

## Lớp hiệu ứng chung (`server/src/video/fx.js`)

Bộ biên dịch tự thêm vào **mọi** cảnh, template không cần viết gì:

- hạt lấp lánh trôi ở rìa khung (sao, chấm hoặc quầng sáng tuỳ kiểu nền của chủ đề);
- mọi icon thư viện (`assets/icons/…`) nhấp nhô nhẹ trong pha giữ;
- cả cảnh "đẩy máy" chậm (phóng to 2,5%) suốt thời lượng.

Chuyển động dùng biến CSS `--fy`, `--fr`, `--push` qua các thuộc tính `translate` / `rotate` / `scale`,
nên không đụng tới `transform` mà template tự animate.

Input tuỳ chọn `corner_icon` (`"type": "icon"`): khai báo trong meta.json là đủ, bộ biên dịch tự vẽ icon
trong một đĩa sáng ở góc phải trên (khung 16:9, `.wrap` được thu hẹp 340px bên phải) hoặc giữa phía trên
(khung dọc/vuông), bật vào và có vòng sáng nhịp. Chỉ thêm cho frame có `.wrap` và góc trên còn trống.

## Kho ảnh PNG nền trong (`cutout`)

PNG trong suốt của một vật thể, nằm ở `storage/library/cutouts/`, tải từ [PNGImages.com](https://pngimages.com)
(dùng thương mại được, không cần ghi nguồn, không được phát tán lại nguyên bộ file). Không tự tách nền nữa.
Danh sách nằm trong mục `cutouts` của `server/assets/library.json`: `tên: "png:<slug trang ảnh>"` để chọn đúng một ảnh,
một mảng các lựa chọn thử lần lượt, hoặc từ khoá tiếng Anh khớp với tiêu đề ảnh trong sitemap của trang.
Lệnh `npm --prefix server run assets:cutouts` tìm ảnh trong sitemap (lưu đệm 30 ngày, không gọi `/search` mà
robots.txt cấm), bỏ qua file thực ra là JPEG, và tải tối đa 40 ảnh mỗi ngày (`--max-per-day`) vì trang chỉ cho
"vài chục lượt tải mỗi ngày"; phần còn lại chạy lại hôm sau. `--dry-run` chỉ in ảnh sẽ chọn.
Ảnh không ưng thì thêm link trang của nó vào `exclude_cutouts` rồi chạy lại; xoá một mục khỏi danh sách thì
lần chạy sau ảnh đó cũng bị xoá khỏi kho.
Frame dùng: `cutout-hero`, `cutout-pair`.

## Khung hình (16:9, 9:16, 1:1, 4:5)

Template luôn thiết kế theo chuẩn 1920×1080. Với khung hình khác, bộ biên dịch đặt cảnh lên một
"canvas thiết kế" cùng tỷ lệ rồi thu nhỏ vào video (xem `server/src/video/aspects.js`):

| Khung | Video | Canvas thiết kế của cảnh |
|---|---|---|
| 16:9 | 1920×1080 | 1920×1080 |
| 9:16 | 1080×1920 | 1350×1875 (chừa trên 150px, dưới 270px cho nút của TikTok/Reels) |
| 1:1 | 1080×1080 | 1500×1500 |
| 4:5 | 1080×1350 | 1500×1875 |

`{{__w}}`/`{{__h}}` là kích thước canvas thiết kế. Gốc cảnh có `data-aspect="16x9|9x16|1x1|4x5"` để
template tự chỉnh bố cục, vd. xếp chồng hai cột ở khung dọc:

```css
{{__r}}:is([data-aspect="9x16"], [data-aspect="4x5"]) .wrap { flex-direction: column; }
```

`aspect_ratios` trong meta.json liệt kê các khung frame hỗ trợ; AI chỉ được chọn frame hợp với khung của dự án.
Sau khi sửa, kiểm tra bằng `npm --prefix server run preview:frames -- --aspect all`.
