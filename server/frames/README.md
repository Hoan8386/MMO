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
| `inputs` | biến đầu vào: `type` là `string`, `number`, `list` (mảng chuỗi) hoặc `image` (tên file ảnh có sẵn); `required`, `maxLength`, `minItems`, `maxItems`, `itemMaxLength` |
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
| `{{tên_input}}` | giá trị input đã escape HTML; `{{#list}}…{{.}}…{{/list}}` để lặp |

Quy ước chuyển động: pha **vào** trong khoảng 1 giây đầu, pha **giữ** co giãn theo `P.D`,
pha **ra** bắt đầu ở `P.D - 0.45`. Chừa 260px dưới cùng cho phụ đề.
