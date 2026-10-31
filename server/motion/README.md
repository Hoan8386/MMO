# server/motion — thư viện hoạt hình khoa học (Motion Canvas)

Mỗi component là một hoạt hình **có mã render thật**, tuỳ chỉnh bằng JSON (props), dùng lại được
trong mọi video. Là một phần của server (chung `package.json`, cài cùng `npm --prefix server install`).
HyperFrames vẫn dựng video tổng thể; thư viện này chỉ tạo các clip minh hoạ chuyên biệt
(mô phỏng vật lý, quỹ đạo, mô hình sinh học, biểu đồ) rồi trao cho HyperFrames dưới dạng video có kênh alpha.

```
components/<chủ đề>/<id>/
  index.tsx      mã Motion Canvas (export default defineAnimation({ *run(ctx) {…} }))
  meta.json      metadata + schema props (AI chỉ thấy file này, không bao giờ thấy mã)
  example.json   cấu hình mẫu { duration, props, cues } — dùng cho kiểm thử và xem trước
  README.md      (tuỳ chọn) tài liệu riêng cho component phức tạp
shared/          context (khung an toàn, theme, cue), ui (nhãn, ghi chú tỉ lệ), time, astro, format
transitions/     chuyển động vào/ra dùng chung (popIn, fadeUp, drawOn, fadeOut)
registry/        schema.mjs (kiểm tra props), registry.mjs (quét component), search.mjs (tìm theo kịch bản), build.mjs
renderer/        app/ (trang render headless) + render.mjs (CLI: PNG có alpha → WebM VP9 alpha)
tests/run.mjs    kiểm thử mọi component ở 16:9, 9:16, 1:1 và tạo previews/<id>.png|webm
previews/        ảnh/clip xem trước (webm không đưa vào git)
```

Thư mục chủ đề hiện có: `science/`, `physics/`, `biology/`, `space/`, `math/`. Thêm chủ đề mới chỉ cần tạo thư mục
mới trong `components/` — không đổi kiến trúc.

## Thư viện khoa học: lĩnh vực, topic, bảng màu

Ngoài `category` (thư mục), mỗi component khoa học ghi **lĩnh vực** và **topic** theo bản đồ `registry/taxonomy.mjs`
(4 lĩnh vực: `astronomy`, `mathematics`, `biology`, `physics`; mỗi lĩnh vực 7–10 topic như `black_holes`,
`calculus`, `genetics`, `quantum`…). Topic chưa có component vẫn được liệt kê để thấy phần còn thiếu.

| file | vai trò |
|---|---|
| `shared/palettes.json` | màu của từng lĩnh vực, tinh chỉnh theo topic, bản nền sáng — dùng chung cho component, server và trang web |
| `shared/palettes.ts` | `look(ctx, domain, topic)`: bảng màu đang dùng (theo props `palette`/`mode`/`backdrop`), màu chữ, `alpha()`, `mix()` |
| `shared/stage.tsx` | `stage(ctx, look)`: phông nền tuỳ chọn, nhóm camera (push_in, pull_out, drift, orbit), cỡ, tốc độ, easing; cắt theo vùng an toàn. `area(ctx, hasTitle)`: vùng vẽ dưới tiêu đề |
| `shared/fx.tsx` | hiệu ứng dùng chung: `glow`, `starfield`, `burst` (nổ hạt), `ripple` (vòng lan / xung năng lượng), `pathAt` + `trail` (vệt sáng chạy theo đường), `typeOn` (hiện công thức), `kinetic` (chữ chuyển động), `callout` (chú thích có đường dẫn), `legend` |
| `shared/raster.tsx` | `Raster`: điểm ảnh tính bằng hàm (giao thoa, điện thế, fractal); `Draw`: vẽ trực tiếp bằng canvas 2D (hàng nghìn hạt, đĩa bồi tụ, cộng sáng) |
| `shared/expr.ts` | bộ đọc công thức an toàn (không eval) cho component toán: `compile("x^2 - 2x")` |
| `registry/common.mjs` | tham số dùng chung: `palette`, `mode`, `backdrop`, `speed`, `scale`, `easing`, `camera` |

Trường metadata thêm (không bắt buộc, dùng để duyệt và cho AI tìm): `domain`, `topic`, `subtopic` (cụm cách nhau bằng
"·", cũng được dùng làm từ khoá tìm kiếm), `styles` (cinematic, scientific, 3d, educational, infographic, minimalist,
futuristic, organic), `dimension` (2d, 2.5d, 3d), `palette`, `limitations`, `example_usage`, `common` (danh sách tham số
dùng chung được gộp vào `inputs` — validator, prompt AI và form web đều thấy).

Màu không viết cứng trong component: `palette: "auto"` dùng bảng của lĩnh vực/topic, `"theme"` dùng màu chủ đề video,
tên lĩnh vực khác thì đổi sang bảng đó — logic animation giữ nguyên. Cùng loại đối tượng giữ cùng màu qua `series`
(vd. A/T/G/C của DNA, các hành tinh).

**Chọn cho AI:** với video dài (không có chủ đề), `animCatalog` (`server/src/video/anim.js`) chỉ gửi các component kịch
bản nhắc tới cùng các component **cùng lĩnh vực** với chúng; kịch bản không khớp gì mới nhận tất cả.

## Lệnh

```bash
npm --prefix server run anim:test                              # kiểm thử tất cả (hoặc: anim:test -- projectile_motion --no-aspects)
npm --prefix server run anim:render -- --component solar_orbit --webm --poster
npm --prefix server run anim:render -- --job job.json --out out/
npm --prefix server run anim:search -- "Trái Đất quay quanh Mặt Trời và tự quay quanh trục"
npm --prefix server run anim:registry                          # ghi registry/registry.json
```

Trang render được build tự động (Vite) khi mã nguồn đổi; build tay: `npm --prefix server run anim:build`.

Trình render cần Chrome hoặc Edge (tự tìm; hoặc đặt `CHROME_PATH`) và `ffmpeg` có `libvpx-vp9`.

## Chuẩn component

`meta.json` bắt buộc có: `id` (trùng tên thư mục), `name`, `category` (trùng thư mục chủ đề), `description`,
`tags`, `duration` `{default, min, max}`, `inputs` (schema props), `version`, `renderer` (`motion-canvas`),
`output`, `status`. Nên có: `keywords` (cụm từ tiếng Việt/Anh mà kịch bản hay dùng — phục vụ tìm kiếm),
`cues` (mỗi mốc thời gian dùng vào việc gì), `accuracy` (mô hình/công thức đứng sau chuyển động và giới hạn
của nó), `combines_with` (component kết hợp tốt). `preview` do registry tự điền từ `previews/`.

Schema props (`registry/schema.mjs`): `number`/`integer` (`min`, `max`), `boolean`, `string` (`maxLength`, `enum`),
`color`, `array` (`items`, `minItems`, `maxItems`), `object` (`properties`, `required`). Mỗi tham số cần
`description` và nên có `default`. Props không có trong schema là **lỗi** — AI không được bịa tham số.

Registry chỉ liệt kê component có `index.tsx`, schema hợp lệ và `example.json` qua kiểm tra; component chỉ có
metadata sẽ bị loại và in ra lý do.

### Trạng thái

| status | nghĩa | ai đặt |
|---|---|---|
| `dev` | đang phát triển hoặc vừa trượt kiểm thử | `tests/run.mjs` khi trượt |
| `tested` | render đạt mọi kiểm tra ở 3 khung hình | `tests/run.mjs` khi đạt |
| `ready` | đã có người xem bản xem trước và duyệt | sửa tay trong meta.json |

Chỉ `tested` và `ready` được đưa cho AI dùng trong video.

### Kiểm thử (`tests/run.mjs`)

TypeScript không lỗi · không lỗi runtime trong trang render · đúng số khung = thời lượng × fps + 1 ·
nội dung nằm trong vùng an toàn ở 16:9, 9:16 và 1:1 (bộ render đo hộp bao phần không trong suốt của mọi khung) ·
clip không trống.

## Viết component

```tsx
export default defineAnimation<Props>({
  *run(ctx) {
    const { view, props, theme, safe, k, duration } = ctx;
    // safe: vùng được vẽ (toạ độ Motion Canvas, gốc ở tâm); k: hệ số cỡ chữ (1 với khung cao 1080 px)
    // ctx.cue(i, n): thời điểm bước i trên n — từ khoá trong lời thoại, hoặc rải đều nếu không có
    view.add(<Node>…</Node>);
    yield* until(ctx.cue(0, 2));
  },
});
```

- Chuyển động liên tục (quỹ đạo, sóng, hạt) viết thành **hàm của một tín hiệu đồng hồ**
  (`const clock = createSignal(0); yield clock(D, D, linear)`), không cộng dồn từng khung — nên mọi khung tính
  lại được chính xác và tua tới đâu cũng đúng.
- Mô phỏng ngẫu nhiên dùng `rng(seed)` (shared/time.ts): cùng props → cùng khung hình.
- Đại lượng định lượng phải tính từ công thức đã ghi trong `accuracy`. Khi thời gian được nén/chiếu chậm hay
  kích thước không theo tỉ lệ, in rõ trên hình (`scaleNote`, "chiếu chậm N lần", "1 giây = 46 ngày").
- Scene host giữ luồng của component sống tới hết thời lượng: các tác vụ chạy nền (`yield task`) không bị huỷ
  khi `run` kết thúc sớm.
- Chữ dùng font Be Vietnam Pro (`shared/ui.tsx`), cỡ chữ nhân `k`.

## Trang web

**Thư viện animation** (`web/src/pages/MotionPage.jsx`, API `server/src/routes/motion.js`): danh sách theo nhóm,
tìm kiếm, lọc theo chủ đề và trạng thái, xem clip xem trước (rê chuột để phát), bảng tham số, trình sửa props JSON
có kiểm tra trực tiếp, **Render thử** với màu chủ đề và khung hình bất kỳ (cache trong `storage/anim-cache/trials`),
nút duyệt `tested → ready`, và ô "Thử với kịch bản" cho thấy AI sẽ nhận những animation nào.

Tab **Animation cho video dài**: duyệt theo lĩnh vực → topic (kèm bảng màu của topic và số component, topic chưa có
được đánh dấu), lọc theo phong cách và 2D/2.5D/3D, ô "Thử với kịch bản video dài" (đúng phép chọn của planner video
dài), và trong bảng chi tiết: nút chỉnh nhanh bảng màu/nền/tốc độ/cỡ/easing/camera, Render thử đúng như trong video
dài (1920×1080, nền đen, chừa chỗ tiêu đề và phụ đề), mô hình khoa học, giới hạn, ví dụ dùng.

## Tích hợp HyperFrames

Hai engine không dùng chung runtime; lớp chuyển đổi là **clip video có alpha**:

1. Planner (`server/src/video/planner.js`) lọc theo **chủ đề video**: chỉ các component có `category` hoặc `tags`
   trùng tag của chủ đề (tag chính tính gấp đôi tag liên quan) — giống cách lọc frame. Trong số đó, component mà
   kịch bản nhắc tới (`registry/search.mjs`) được xếp trước; tối đa 8 cái, chỉ metadata, đi vào prompt; danh sách id
   cũng là `enum` của input `component` trong schema đầu ra. Chủ đề không có component nào → frame `anim-clip` bị bỏ.
   Muốn một chủ đề dùng thêm nhóm animation, thêm tag nhóm đó (vd. `space`, `biology`) vào chủ đề.
   Trang web **Thư viện animation** (`/motion`) hiển thị đúng bộ lọc này, có ô "Thử với kịch bản".
2. AI chọn frame `anim-clip` (`server/frames/anim-clip`) với `component` + `props` (chuỗi JSON).
3. Validator (`server/src/video/validate.js`) kiểm tra id và props theo schema của chính component; lỗi được trả
   cho AI sửa như mọi lỗi khác.
4. Khi biên dịch (`server/src/video/anim.js`), mỗi cảnh `anim-clip` được render headless với:
   - **kích thước** = canvas thiết kế của cảnh (1920×1080 ở 16:9, 1350×1875 ở 9:16…), hệ toạ độ Motion Canvas gốc ở tâm;
   - **thời lượng** = đúng thời lượng cảnh sau khi có giọng đọc, **30 fps**;
   - **mốc** = thời điểm các từ khoá trong lời thoại (`cues`) và khoảng đọc (`speech`);
   - **màu** = theme của chủ đề video; **vùng an toàn** chừa 280 px dưới cho phụ đề;
   - nền trong suốt → PNG RGBA → WebM VP9 `yuva420p` (giữ alpha).
   Clip được cache theo mã băm của mọi thứ ảnh hưởng tới khung hình (`storage/anim-cache/`).
5. Template `anim-clip` phát clip bằng `<video data-start="0">` trong sub-composition của cảnh; HyperFrames tự
   đồng bộ, đặt phụ đề, hiệu ứng nền, nhạc và render như mọi cảnh khác.
