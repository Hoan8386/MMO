// Tiny mustache-style filler for frame templates.
//   {{name}}            HTML-escaped value
//   {{{name}}}          raw value (compiler-provided snippets only)
//   {{#name}}…{{/name}} loop over an array ({{.}}, {{@index}}, {{@n}}) or render once if truthy
//   {{^name}}…{{/name}} render when empty / falsy
//   {{?name}}…{{/?name}} render once when not empty (e.g. a wrapper around a {{#name}} loop)
const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const empty = (v) => v == null || v === false || v === "" || (Array.isArray(v) && v.length === 0);

const WRAP_RE = /\{\{\?([\w@.]+)\}\}([\s\S]*?)\{\{\/\?\1\}\}/g;
const SECTION_RE = /\{\{([#^])([\w@.]+)\}\}([\s\S]*?)\{\{\/\2\}\}/g;

export function fill(tpl, data) {
  // Wrappers first: their closing tag differs, so a loop of the same name can sit inside.
  let out = tpl.replace(WRAP_RE, (_, key, inner) => (empty(data[key]) ? "" : inner));
  out = out.replace(SECTION_RE, (_, kind, key, inner) => {
    const v = data[key];
    if (kind === "^") return empty(v) ? fill(inner, data) : "";
    if (empty(v)) return "";
    if (Array.isArray(v)) return v.map((item, i) => fill(inner, { ...data, ".": item, "@index": i, "@n": i + 1 })).join("");
    return fill(inner, data);
  });
  out = out.replace(/\{\{\{([\w@.]+)\}\}\}/g, (_, k) => String(data[k] ?? ""));
  return out.replace(/\{\{([\w@.]+)\}\}/g, (_, k) => esc(data[k]));
}

// JSON that is safe to inline inside a <script> block (no "</script>", no JS line separators).
const LINE_SEP = new RegExp("[" + String.fromCharCode(0x2028, 0x2029) + "]", "g");
export const scriptJson = (v) => JSON.stringify(v).replace(/</g, "\\u003c").replace(LINE_SEP, " ");
