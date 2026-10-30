// Prop schemas of animation components (the "inputs" of each meta.json) and their validator.
// Pure ES module with no dependencies: the render CLI, the registry, the HyperFrames server and
// the web UI all use the same rules.
//
// Spec of one input: { type, default, description, ... } where type is
//   number | integer   min, max
//   boolean
//   string             maxLength, enum
//   color              CSS colour (#hex, rgb(), named)
//   array              items: <spec>, minItems, maxItems
//   object             properties: { name: <spec> }  (required: true on a property makes it mandatory)

const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|[a-z]+)$/i;

function check(spec, v, at, errors) {
  if (v === undefined || v === null) {
    if (spec.required) errors.push(`${at}: bắt buộc`);
    return spec.default === undefined ? undefined : structuredClone(spec.default);
  }
  switch (spec.type) {
    case "number":
    case "integer":
      if (typeof v !== "number" || !Number.isFinite(v) || (spec.type === "integer" && !Number.isInteger(v))) {
        errors.push(`${at}: phải là ${spec.type === "integer" ? "số nguyên" : "số"}`);
        return spec.default;
      }
      if (spec.min != null && v < spec.min) errors.push(`${at}: ${v} nhỏ hơn tối thiểu ${spec.min}`);
      if (spec.max != null && v > spec.max) errors.push(`${at}: ${v} lớn hơn tối đa ${spec.max}`);
      return v;
    case "boolean":
      if (typeof v !== "boolean") errors.push(`${at}: phải là true/false`);
      return v;
    case "string":
      if (typeof v !== "string") {
        errors.push(`${at}: phải là chuỗi`);
        return spec.default;
      }
      if (spec.enum && !spec.enum.includes(v)) errors.push(`${at}: "${v}" không hợp lệ — chọn một trong: ${spec.enum.join(", ")}`);
      if (spec.maxLength && v.length > spec.maxLength) errors.push(`${at}: dài ${v.length} ký tự, tối đa ${spec.maxLength}`);
      return v;
    case "color":
      if (typeof v !== "string" || !COLOR.test(v.trim())) errors.push(`${at}: "${v}" không phải màu CSS`);
      return v;
    case "array": {
      if (!Array.isArray(v)) {
        errors.push(`${at}: phải là mảng`);
        return structuredClone(spec.default);
      }
      if (spec.minItems != null && v.length < spec.minItems) errors.push(`${at}: cần ít nhất ${spec.minItems} phần tử`);
      if (spec.maxItems != null && v.length > spec.maxItems) errors.push(`${at}: tối đa ${spec.maxItems} phần tử`);
      return v.map((x, i) => check(spec.items, x, `${at}[${i}]`, errors));
    }
    case "object": {
      if (typeof v !== "object" || Array.isArray(v)) {
        errors.push(`${at}: phải là object`);
        return structuredClone(spec.default);
      }
      const out = {};
      for (const k of Object.keys(v)) if (!spec.properties[k]) errors.push(`${at}.${k}: không phải thuộc tính hợp lệ`);
      for (const [k, s] of Object.entries(spec.properties)) {
        const r = check(s, v[k], `${at}.${k}`, errors);
        if (r !== undefined) out[k] = r;
      }
      return out;
    }
    default:
      errors.push(`${at}: kiểu "${spec.type}" chưa được hỗ trợ`);
      return v;
  }
}

// Returns { props (defaults filled in), errors[] }. Unknown props are errors: the AI must not invent them.
export function validateProps(inputs, props = {}) {
  const errors = [];
  if (typeof props !== "object" || props === null || Array.isArray(props)) return { props: {}, errors: ["props phải là object"] };
  for (const k of Object.keys(props)) if (!inputs[k]) errors.push(`${k}: không phải tham số của component (có: ${Object.keys(inputs).join(", ")})`);
  const out = {};
  for (const [k, spec] of Object.entries(inputs)) {
    const v = check(spec, props[k], k, errors);
    if (v !== undefined) out[k] = v;
  }
  return { props: out, errors };
}

// Checks a component's own schema (used when building the registry).
export function schemaErrors(inputs, at = "inputs") {
  const errors = [];
  const TYPES = ["number", "integer", "boolean", "string", "color", "array", "object"];
  for (const [k, s] of Object.entries(inputs || {})) {
    const p = `${at}.${k}`;
    if (!TYPES.includes(s.type)) errors.push(`${p}: kiểu "${s.type}" không hợp lệ`);
    if (!s.description) errors.push(`${p}: thiếu description`);
    if (s.type === "array" && !s.items) errors.push(`${p}: mảng cần items`);
    if (s.type === "array" && s.items?.type === "object") errors.push(...schemaErrors(s.items.properties, `${p}.items`));
    if (s.type === "object") errors.push(...schemaErrors(s.properties, p));
    if (s.default !== undefined) {
      const e = [];
      check({ ...s, required: false }, s.default, p, e);
      errors.push(...e.map((x) => `default ${x}`));
    }
  }
  return errors;
}

// One compact line per input for AI prompts: name*, type, limits, default, meaning.
export function describeInputs(inputs) {
  const obj = (props) => `{${Object.entries(props).map(([k, p]) => `${k}${p.required ? "*" : ""}: ${fmt(p)}`).join(", ")}}`;
  const fmt = (s) =>
    s.type === "array"
      ? `array ${s.minItems ?? 0}-${s.maxItems ?? "n"} of ${s.items.type === "object" ? obj(s.items.properties) : fmt(s.items)}`
      : s.type === "object"
        ? obj(s.properties)
      : s.enum
        ? `one of ${s.enum.join("|")}`
        : `${s.type}${s.min != null || s.max != null ? ` ${s.min ?? ""}..${s.max ?? ""}` : ""}${s.maxLength ? ` ≤${s.maxLength} chars` : ""}`;
  return Object.entries(inputs)
    .map(([k, s]) => `${k}${s.required ? "*" : ""} (${fmt(s)}${s.default !== undefined && typeof s.default !== "object" ? `, default ${JSON.stringify(s.default)}` : ""}; ${s.description})`)
    .join("; ");
}
