// Line icons for long videos: white strokes on black, each drawn centred on 0,0 in about ±50 px,
// so a scene places and scales them with a transform. Text glyphs (Λ, ?, ~) use the scene font.
const S = 'fill="none" stroke="#e8e8e8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';
const FILL = 'fill="#8a8a8a" stroke="none"';

const r = (x) => Math.round(x * 10) / 10;

// Two-armed spiral galaxy seen at a tilt: arms as fading strokes around a bright core.
function galaxy() {
  const arm = (phase, op) => {
    const pts = [];
    for (let a = 0; a <= Math.PI * 3.2; a += 0.18) {
      const rad = 5 + a * 4.6;
      pts.push(`${r(Math.cos(a + phase) * rad)},${r(Math.sin(a + phase) * rad)}`);
    }
    return `<polyline points="${pts.join(" ")}" fill="none" stroke="#d8d8d8" stroke-width="2.4" stroke-linecap="round" opacity="${op}"/>`;
  };
  const halo = `<ellipse rx="56" ry="56" fill="url(#lv-glow)" opacity="0.35"/>`;
  // .arms is what turns when the scene spins the galaxy (build.js), inside the tilt.
  return `<g transform="scale(1 0.5)">${halo}<g class="arms">${arm(0, 0.9)}${arm(Math.PI, 0.9)}${arm(0.5, 0.35)}${arm(Math.PI + 0.5, 0.35)}</g><circle r="6" fill="#fff"/></g>`;
}

const glyph = (ch, size = 72) => `<text y="${r(size * 0.35)}" text-anchor="middle" font-size="${size}" fill="#f2f2f2" font-weight="600">${ch}</text>`;

export const ICONS = {
  galaxy,
  person: () => `<circle cy="-26" r="20" ${FILL}/><path d="M-40 46 C-40 6 -22 -2 0 -2 C22 -2 40 6 40 46 Z" ${FILL}/>`,
  earth: () =>
    `<circle r="46" fill="#3a3a3a" stroke="#cfcfcf" stroke-width="2"/><path d="M-30 -20 q12 -14 26 -6 q10 8 -2 18 q-14 4 -24 -12z M6 10 q18 -6 26 8 q-4 16 -20 14 q-10 -8 -6 -22z M-18 22 q6 10 -2 16" fill="#9a9a9a"/>`,
  blackhole: () =>
    `<ellipse rx="70" ry="14" ${S} opacity="0.7"/><circle r="34" fill="#000" stroke="#fff" stroke-width="3"/><path d="M-70 0 A70 14 0 0 0 70 0" ${S}/>`,
  bulb: () => `<path d="M-18 14 C-34 0 -30 -38 0 -38 C30 -38 34 0 18 14 L16 26 L-16 26 Z" ${S}/><path d="M-12 36 h24 M-8 44 h16" ${S}/>`,
  atom: () => {
    const pts = [0, 1, 2, 3, 4, 5].map((i) => [Math.cos((i * Math.PI) / 3) * 40, Math.sin((i * Math.PI) / 3) * 40]);
    return `<polygon points="${pts.map((p) => p.map(r).join(",")).join(" ")}" ${S}/>${pts.map(([x, y]) => `<circle cx="${r(x)}" cy="${r(y)}" r="7" fill="#bbb"/>`).join("")}`;
  },
  question: () => `<circle r="46" ${S}/>${glyph("?", 64)}`,
  check: () => `<path d="M-30 2 L-8 24 L32 -22" ${S} stroke-width="5"/>`,
  cross: () => `<path d="M-26 -26 L26 26 M26 -26 L-26 26" ${S} stroke-width="5"/>`,
  lambda: () => glyph("Λ", 96),
  tilde: () => glyph("~", 96),
  ruler: () => `${glyph("d", 52).replace('y="18', 'y="-14')}<path d="M-44 14 H44 M-44 4 V24 M44 4 V24" ${S}/>`,
  sliders: () => `<path d="M-44 -22 H44 M-44 0 H44 M-44 22 H44" ${S} stroke-width="2"/><circle cx="-6" cy="-22" r="5" fill="#fff"/><circle cx="18" cy="0" r="5" fill="#fff"/><circle cx="-20" cy="22" r="5" fill="#fff"/>`,
  clock: () => `<circle r="44" ${S}/><path d="M0 0 V-28 M0 0 L20 12" ${S}/>`,
  calendar: () =>
    `<rect x="-46" y="-36" width="92" height="80" rx="8" ${S}/><path d="M-46 -14 H46 M-24 -46 V-28 M24 -46 V-28" ${S}/>${[0, 1, 2, 3]
      .flatMap((c) => [0, 1, 2].map((rw) => `<rect x="${-34 + c * 20}" y="${-4 + rw * 15}" width="9" height="8" fill="#9a9a9a"/>`))
      .join("")}`,
  eye: () => `<path d="M-48 0 Q0 -40 48 0 Q0 40 -48 0Z" ${S}/><circle r="12" fill="#fff"/>`,
  orbit: () => `<ellipse rx="48" ry="20" ${S} stroke-width="2"/><circle r="12" fill="#ddd"/><circle cx="40" cy="-11" r="5" fill="#fff"/>`,
  star: () => `<circle r="10" fill="#fff"/><circle r="24" fill="url(#lv-glow)" opacity="0.6"/>`,
  thermometer: () => `<rect x="-10" y="-46" width="20" height="78" rx="10" ${S}/><circle cy="34" r="16" ${S}/><path d="M0 30 V0" stroke="#bbb" stroke-width="8" stroke-linecap="round"/>`,
  telescope: () => `<path d="M-40 -6 L30 -34 L38 -14 L-32 14 Z" ${S}/><path d="M-4 4 L-24 44 M-4 4 L16 44" ${S}/>`,
  dots: () => [[-24, -18], [10, -26], [28, 4], [-8, 8], [-30, 24], [18, 28]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#ddd"/>`).join(""),
  wave: () => `<path d="M-50 0 Q-37 -22 -25 0 T0 0 T25 0 T50 0" ${S}/>`,
  table: () => `<rect x="-60" y="-26" width="120" height="14" rx="4" fill="#666"/><rect x="-46" y="-12" width="10" height="56" rx="3" fill="#555"/><rect x="36" y="-12" width="10" height="56" rx="3" fill="#555"/>`,
  rocket: () => `<path d="M0 -48 C18 -30 18 10 12 26 H-12 C-18 10 -18 -30 0 -48Z" ${S}/><circle cy="-12" r="7" ${S}/><path d="M-12 18 L-26 36 L-12 30 M12 18 L26 36 L12 30" ${S}/>`,
  sun: () => `<circle r="22" ${S}/>${[...Array(8)].map((_, i) => { const a = (i * Math.PI) / 4; return `<path d="M${r(Math.cos(a) * 32)} ${r(Math.sin(a) * 32)} L${r(Math.cos(a) * 46)} ${r(Math.sin(a) * 46)}" ${S}/>`; }).join("")}`,
  book: () => `<path d="M0 -30 C-16 -40 -36 -38 -46 -32 V36 C-36 30 -16 30 0 38 C16 30 36 30 46 36 V-32 C36 -38 16 -40 0 -30Z M0 -30 V38" ${S}/>`,
  chart: () => `<path d="M-44 -40 V40 H46" ${S}/><path d="M-36 26 C-10 22 10 6 40 -30" ${S}/>`,
  heart: () => `<path d="M0 36 C-50 0 -40 -40 -14 -36 C-4 -34 0 -24 0 -20 C0 -24 4 -34 14 -36 C40 -40 50 0 0 36Z" ${S}/>`,
  brain: () => `<path d="M-6 -38 C-30 -44 -46 -24 -40 -6 C-50 8 -38 30 -18 30 C-12 40 -6 40 -6 34 Z M6 -38 C30 -44 46 -24 40 -6 C50 8 38 30 18 30 C12 40 6 40 6 34 Z" ${S}/>`,
  money: () => `<rect x="-50" y="-28" width="100" height="56" rx="6" ${S}/><circle r="14" ${S}/>`,
};

export const ICON_NAMES = Object.keys(ICONS);

// Unknown names fall back to a question mark, so a misspelt icon never breaks a scene.
export const icon = (name) => (ICONS[name] || ICONS.question)();
