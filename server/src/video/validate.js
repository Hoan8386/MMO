import { findAsset, KIND_OF_INPUT } from "./library.js";
import { sanitizeSvg } from "./illustration.js";
import { motionErrors } from "./motion.js";

// AI-written scenes (frame engine "custom") run inside the render browser, so they may only
// animate their own markup: no network, no timers or randomness (renders must repeat exactly),
// no navigation, and assets only from the project's assets/ folder.
const BAD_HTML = /<\s*(script|style|iframe|object|embed|link|meta|base|form)\b|javascript:|\son[a-z]+\s*=/i;
const BAD_CSS = /@import|url\(\s*['"]?\s*(https?:|\/\/|data:text)|expression\(|<\/style/i;
const BAD_JS = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|eval|Function|localStorage|sessionStorage|indexedDB|setTimeout|setInterval|requestAnimationFrame|navigator|location|cookie|postMessage|Worker)\b|\bimport\s*\(|Math\.random|Date\.now|new\s+Date|<\/script/;

function customSceneErrors(at, inputs) {
  const errors = [];
  const { html = "", css = "", script = "" } = inputs;
  if (BAD_HTML.test(html)) errors.push(`${at}.inputs.html: không được dùng <script>, <style>, <iframe>, <link>, <form>, javascript: hay thuộc tính on…=`);
  if (BAD_CSS.test(css)) errors.push(`${at}.inputs.css: không được dùng @import hay url() trỏ ra ngoài`);
  // Case-sensitive on purpose: `Function` is blocked, the `function` keyword is fine.
  const bad = script.match(BAD_JS) || script.match(/<\/script/i);
  if (bad) errors.push(`${at}.inputs.script: không được dùng "${bad[0]}" (cảnh phải chạy giống hệt mỗi lần render, không mạng, không hẹn giờ, không ngẫu nhiên)`);
  if (!/\btl\.(to|from|fromTo|set|add)\(/.test(script)) errors.push(`${at}.inputs.script: phải thêm chuyển động vào timeline tl (tl.to / tl.fromTo …)`);
  try {
    new Function("P", "R", "$", "$$", "tl", "at", "gsap", script); // parse only, never run
  } catch (e) {
    errors.push(`${at}.inputs.script: lỗi cú pháp JavaScript — ${e.message}`);
  }
  for (const m of `${html} ${css}`.matchAll(/(?:src|href)\s*=\s*["']([^"']*)["']|url\(\s*["']?([^"')]+)/gi)) {
    const ref = (m[1] ?? m[2] ?? "").trim();
    if (!ref || ref.startsWith("#")) continue;
    const icon = ref.match(/^assets\/icons\/([\w-]+)\.svg$/);
    const char = ref.match(/^assets\/characters\/([\w-]+)\.svg$/);
    if (icon && !(inputs.icons || []).includes(icon[1])) errors.push(`${at}.inputs.html: dùng icon "${icon[1]}" thì phải liệt kê nó trong icons`);
    else if (char && !(inputs.characters || []).includes(char[1])) errors.push(`${at}.inputs.html: dùng nhân vật "${char[1]}" thì phải liệt kê nó trong characters`);
    else if (!icon && !char) errors.push(`${at}.inputs.html: chỉ được dùng ảnh assets/icons/<tên>.svg hoặc assets/characters/<tên>.svg (gặp "${ref.slice(0, 60)}")`);
  }
  return errors;
}

// Checks a plan against the frame library. Returns a list of human-readable errors;
// an empty list means the plan can be compiled. Never trusts the AI output.
export function validatePlan(plan, frames, { allowedFrameIds, images = [], cutouts = [] } = {}) {
  const errors = [];
  if (!plan || typeof plan !== "object") return ["plan không phải object"];
  if (typeof plan.title !== "string" || !plan.title.trim()) errors.push("thiếu title");
  if (!Array.isArray(plan.scenes) || plan.scenes.length < 2) return [...errors, "cần ít nhất 2 cảnh"];

  plan.scenes.forEach((sc, i) => {
    const at = `scenes[${i}]`;
    const frame = frames.get(sc.frame_id);
    if (!frame) return errors.push(`${at}: frame_id "${sc.frame_id}" không tồn tại`);
    if (frame.status !== "active") errors.push(`${at}: frame "${sc.frame_id}" không ở trạng thái active`);
    if (allowedFrameIds && !allowedFrameIds.includes(sc.frame_id)) errors.push(`${at}: frame "${sc.frame_id}" không nằm trong danh sách được phép`);
    if (typeof sc.voice_text !== "string" || sc.voice_text.trim().length < 2) errors.push(`${at}: thiếu voice_text`);
    if (sc.voice_text?.length > 400) errors.push(`${at}: voice_text quá dài (${sc.voice_text.length} > 400 ký tự)`);
    if (sc.keywords != null && !Array.isArray(sc.keywords)) errors.push(`${at}: keywords phải là mảng`);
    if (sc.transition_out != null && !["fade", "wipe"].includes(sc.transition_out)) errors.push(`${at}: transition_out phải là fade hoặc wipe`);
    errors.push(...motionErrors(at, sc.motion, Array.isArray(sc.keywords) ? sc.keywords.length : 0));
    // Scene-level photos shown behind the frame and icons popping in at its edge (fx.js).
    if (sc.visuals != null && !Array.isArray(sc.visuals)) errors.push(`${at}.visuals: phải là mảng`);
    else
      (sc.visuals || []).forEach((v, j) => {
        if (typeof v?.image !== "string" || (!images.includes(v.image) && !findAsset("photo", v.image))) errors.push(`${at}.visuals[${j}]: ảnh "${v?.image}" không có trong ảnh của dự án`);
      });
    if (sc.illustration != null && (typeof sc.illustration?.svg !== "string" || !sanitizeSvg(sc.illustration.svg)))
      errors.push(`${at}.illustration: hình minh hoạ không hợp lệ (cần một thẻ <svg viewBox=…> chỉ gồm hình cơ bản) — xoá hình này hoặc sửa lại`);
    if (sc.icons != null && !Array.isArray(sc.icons)) errors.push(`${at}.icons: phải là mảng`);
    else (sc.icons || []).filter((x) => !findAsset("illustration", x)).forEach((x) => errors.push(`${at}.icons: icon "${x}" không có trong thư viện`));

    const inputs = sc.inputs || {};
    for (const key of Object.keys(inputs)) {
      if (!frame.inputs[key]) errors.push(`${at}.inputs: "${key}" không phải biến của ${sc.frame_id}`);
    }
    for (const [key, spec] of Object.entries(frame.inputs)) {
      const v = inputs[key];
      const p = `${at}.inputs.${key}`;
      if (v == null || v === "" || (Array.isArray(v) && !v.length)) {
        if (spec.required) errors.push(`${p}: bắt buộc`);
        continue;
      }
      if (spec.enum && (spec.type === "string" || spec.type === "list")) {
        const bad = [v].flat().filter((x) => !spec.enum.includes(x));
        if (bad.length) errors.push(`${p}: "${bad.join('", "')}" không hợp lệ — chọn một trong: ${spec.enum.join(", ")}`);
      }
      if (spec.type === "string" || spec.type === "code") {
        if (typeof v !== "string") errors.push(`${p}: phải là chuỗi`);
        else if (spec.maxLength && v.length > spec.maxLength)
          errors.push(`${p}: "${v}" dài ${v.length} ký tự, tối đa ${spec.maxLength} — viết lại ngắn hơn`);
      } else if (spec.type === "number") {
        if (typeof v !== "number" || !Number.isFinite(v)) errors.push(`${p}: phải là số`);
      } else if (spec.type === "list") {
        if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) errors.push(`${p}: phải là mảng chuỗi`);
        else {
          if (spec.minItems && v.length < spec.minItems) errors.push(`${p}: cần ít nhất ${spec.minItems} ý`);
          if (spec.maxItems && v.length > spec.maxItems) errors.push(`${p}: tối đa ${spec.maxItems} ý`);
          v.forEach((x, j) => {
            if (spec.itemMaxLength && x.length > spec.itemMaxLength)
              errors.push(`${p}[${j}]: "${x}" dài ${x.length} ký tự, tối đa ${spec.itemMaxLength} — viết lại ngắn hơn`);
          });
        }
      } else if (spec.type === "numbers") {
        if (!Array.isArray(v) || v.some((x) => typeof x !== "number" || !Number.isFinite(x))) errors.push(`${p}: phải là mảng số`);
        else {
          if (spec.minItems && v.length < spec.minItems) errors.push(`${p}: cần ít nhất ${spec.minItems} số`);
          if (spec.maxItems && v.length > spec.maxItems) errors.push(`${p}: tối đa ${spec.maxItems} số`);
        }
      } else if (spec.type === "image") {
        if (!images.includes(v) && !findAsset("photo", v)) errors.push(`${p}: ảnh "${v}" không có trong ảnh của dự án hay thư viện ảnh`);
      } else if (["icon", "logo", "cutout", "character"].includes(spec.type)) {
        const kind = KIND_OF_INPUT[spec.type];
        if (typeof v !== "string" || (!findAsset(kind, v) && !(spec.type === "cutout" && cutouts.includes(v)))) errors.push(`${p}: ${spec.type} "${v}" không có trong thư viện`);
      } else if (spec.type === "icons" || spec.type === "characters") {
        const noun = spec.type === "icons" ? "icon" : "nhân vật";
        if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) errors.push(`${p}: phải là mảng tên ${noun}`);
        else {
          if (spec.minItems && v.length < spec.minItems) errors.push(`${p}: cần ít nhất ${spec.minItems} ${noun}`);
          if (spec.maxItems && v.length > spec.maxItems) errors.push(`${p}: tối đa ${spec.maxItems} ${noun}`);
          v.filter((x) => !findAsset(KIND_OF_INPUT[spec.type], x)).forEach((x) => errors.push(`${p}: ${noun} "${x}" không có trong thư viện`));
        }
      }
    }
    for (const [k, list] of Object.entries(frame.index_of || {})) {
      const n = Array.isArray(inputs[list]) ? inputs[list].length : 0;
      if (inputs[k] != null && (!Number.isInteger(inputs[k]) || inputs[k] < 1 || inputs[k] > n))
        errors.push(`${at}.inputs.${k}: phải là số thứ tự từ 1 đến ${n} trong ${list}`);
    }
    if (frame.engine === "custom") errors.push(...customSceneErrors(at, inputs));
    // e.g. the speaker of an animation shot must be one of the characters in that shot.
    for (const [k, list] of Object.entries(frame.member_of || {})) {
      const v = inputs[k];
      if (v != null && v !== "narrator" && !(inputs[list] || []).includes(v)) errors.push(`${at}.inputs.${k}: "${v}" phải là một trong ${list} (${(inputs[list] || []).join(", ")})`);
    }
    for (const [a, b] of frame.same_length || []) {
      if (Array.isArray(inputs[a]) && Array.isArray(inputs[b]) && inputs[a].length !== inputs[b].length)
        errors.push(`${at}.inputs: ${a} (${inputs[a].length}) và ${b} (${inputs[b].length}) phải có cùng số phần tử`);
    }
  });

  const first = plan.scenes[0]?.frame_id;
  const last = plan.scenes.at(-1)?.frame_id;
  if (frames.get(first)?.scene_type !== "intro") errors.push("cảnh đầu tiên phải là một frame intro");
  if (frames.get(last)?.scene_type !== "outro") errors.push("cảnh cuối cùng phải là một frame outro");
  return errors;
}
