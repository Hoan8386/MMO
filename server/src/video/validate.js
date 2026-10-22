import { findAsset } from "./library.js";

// Checks a plan against the frame library. Returns a list of human-readable errors;
// an empty list means the plan can be compiled. Never trusts the AI output.
export function validatePlan(plan, frames, { allowedFrameIds, images = [] } = {}) {
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
      if (spec.type === "string") {
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
      } else if (spec.type === "icon" || spec.type === "logo") {
        const kind = spec.type === "icon" ? "illustration" : "logo";
        if (typeof v !== "string" || !findAsset(kind, v)) errors.push(`${p}: ${spec.type} "${v}" không có trong thư viện`);
      } else if (spec.type === "icons") {
        if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) errors.push(`${p}: phải là mảng tên icon`);
        else {
          if (spec.minItems && v.length < spec.minItems) errors.push(`${p}: cần ít nhất ${spec.minItems} icon`);
          if (spec.maxItems && v.length > spec.maxItems) errors.push(`${p}: tối đa ${spec.maxItems} icon`);
          v.filter((x) => !findAsset("illustration", x)).forEach((x) => errors.push(`${p}: icon "${x}" không có trong thư viện`));
        }
      }
    }
    for (const [k, list] of Object.entries(frame.index_of || {})) {
      const n = Array.isArray(inputs[list]) ? inputs[list].length : 0;
      if (inputs[k] != null && (!Number.isInteger(inputs[k]) || inputs[k] < 1 || inputs[k] > n))
        errors.push(`${at}.inputs.${k}: phải là số thứ tự từ 1 đến ${n} trong ${list}`);
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
