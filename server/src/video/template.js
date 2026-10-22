// Tiny mustache-style filler for frame templates.
//   {{name}}            HTML-escaped value
//   {{{name}}}          raw value (compiler-provided snippets only)
//   {{#name}}…{{/name}} loop over an array ({{.}}, {{@index}}, {{@n}}) or render once if truthy
//   {{^name}}…{{/name}} render when empty / falsy
const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const empty = (v) => v == null || v === false || v === "" || (Array.isArray(v) && v.length === 0);

export function fill(tpl, data) {
  let out = tpl.replace(/\{\{([#^])([\w@.]+)\}\}([\s\S]*?)\{\{\/\2\}\}/g, (_, kind, key, inner) => {
    const v = data[key];
    if (kind === "^") return empty(v) ? fill(inner, data) : "";
    if (empty(v)) return "";
    if (Array.isArray(v)) return v.map((item, i) => fill(inner, { ...data, ".": item, "@index": i, "@n": i + 1 })).join("");
    return fill(inner, data);
  });
  out = out.replace(/\{\{\{([\w@.]+)\}\}\}/g, (_, k) => String(data[k] ?? ""));
  return out.replace(/\{\{([\w@.]+)\}\}/g, (_, k) => esc(data[k]));
}

// JSON that is safe to inline inside a <script> block.
export const scriptJson = (v) =>
  JSON.stringify(v)
    .replace(/</g, "\\u003c")
    .replace(new RegExp("[\u2028\u2029]", "g"), " ");
