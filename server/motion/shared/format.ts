// Number formatting for labels (Vietnamese: decimal comma, dot for thousands).
export const num = (v: number, digits = 1) =>
  v.toLocaleString("vi-VN", { minimumFractionDigits: 0, maximumFractionDigits: digits });

// A "nice" step (1, 2, 5 × 10^n) giving about `count` ticks over `span`.
export function niceStep(span: number, count = 5) {
  const raw = span / Math.max(1, count);
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}
