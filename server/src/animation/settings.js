// Backgrounds ("settings") for the animation mode, drawn as SVG on a 1920×1080 world.
// The ground line is y = GROUND; characters stand on it. Layers: .bg-far moves least when the
// camera pans, .bg-mid a little more. `time` (day | sunset | night) changes sky, light and stars.
export const GROUND = 860;
const W = 1920;
const H = 1080;
const INK = "#2B2B33";
const ol = (w = 4) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round"`;

export const TIMES = { day: "ban ngày", sunset: "hoàng hôn", night: "ban đêm" };

const SKY = {
  day: ["#7CC8F8", "#D9F1FF"],
  sunset: ["#FF8A5B", "#FFD8A0"],
  night: ["#0E1A44", "#2E3F7A"],
};

// Small deterministic random so scenery repeats exactly between renders.
const rnd = (seed) => () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

function sky(time, id) {
  const [a, b] = SKY[time];
  let s = `<defs><linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#${id}-sky)"/>`;
  if (time === "night") {
    const r = rnd(7);
    s += Array.from({ length: 70 }, () => `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * 560).toFixed(0)}" r="${(1 + r() * 2.4).toFixed(1)}" fill="#FFFFFF" opacity="${(0.5 + r() * 0.5).toFixed(2)}"/>`).join("");
    s += `<circle class="sun" cx="1560" cy="190" r="70" fill="#FFF6C8"/><circle cx="1590" cy="170" r="62" fill="${a}"/>`;
  } else {
    const [c, y] = time === "sunset" ? ["#FFB347", 520] : ["#FFE066", 170];
    s += `<circle class="sun" cx="1560" cy="${y}" r="80" fill="${c}" opacity="0.95"/><circle cx="1560" cy="${y}" r="120" fill="${c}" opacity="0.25"/>`;
  }
  return s;
}

const cloud = (x, y, s = 1, time = "day") =>
  `<g transform="translate(${x} ${y}) scale(${s})" fill="${time === "night" ? "#5A6AA0" : "#FFFFFF"}" opacity="${time === "night" ? 0.5 : 0.92}"><ellipse cx="0" cy="0" rx="90" ry="40"/><ellipse cx="-60" cy="12" rx="60" ry="30"/><ellipse cx="62" cy="10" rx="66" ry="32"/><ellipse cx="10" cy="-26" rx="56" ry="38"/></g>`;
const clouds = (time) => (time === "night" ? "" : cloud(320, 170, 1, time) + cloud(980, 110, 0.8, time) + cloud(1300, 260, 0.6, time));

const tree = (x, y, s = 1, leaf = "#4CAF50", dark = "#2E7D32") =>
  `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-18" y="-120" width="36" height="130" rx="8" fill="#8B5A2B" ${ol()}/><circle cx="0" cy="-190" r="95" fill="${leaf}" ${ol()}/><circle cx="-62" cy="-140" r="62" fill="${leaf}" ${ol()}/><circle cx="64" cy="-138" r="64" fill="${leaf}" ${ol()}/><circle cx="30" cy="-220" r="34" fill="${dark}" opacity="0.25"/></g>`;
const pine = (x, y, s = 1, c = "#2E8B57") =>
  `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-14" y="-60" width="28" height="70" fill="#7A4E2A" ${ol()}/><path d="M0,-330 L-110,-60 L110,-60 Z M0,-400 L-90,-170 L90,-170 Z" fill="${c}" ${ol()}/></g>`;
const bush = (x, y, s = 1, c = "#5DBB63") => `<g transform="translate(${x} ${y}) scale(${s})" fill="${c}" ${ol()}><circle cx="-40" cy="-30" r="40"/><circle cx="20" cy="-46" r="50"/><circle cx="70" cy="-26" r="36"/></g>`;
const flowers = (seed, y0, y1) => {
  const r = rnd(seed);
  return Array.from({ length: 26 }, () => {
    const x = (r() * W).toFixed(0);
    const y = (y0 + r() * (y1 - y0)).toFixed(0);
    const c = ["#FF6B8B", "#FFD93D", "#FFFFFF", "#B57EDC"][Math.floor(r() * 4)];
    return `<circle cx="${x}" cy="${y}" r="7" fill="${c}" stroke="${INK}" stroke-width="2"/>`;
  }).join("");
};
const hills = (c1, c2) =>
  `<path d="M0,700 Q300,560 640,660 T1300,620 T1920,640 L1920,${H} L0,${H} Z" fill="${c1}"/><path d="M0,760 Q420,660 900,740 T1920,720 L1920,${H} L0,${H} Z" fill="${c2}"/>`;
const ground = (c, edge) => `<rect x="0" y="${GROUND - 40}" width="${W}" height="${H - GROUND + 40}" fill="${c}"/><path d="M0,${GROUND - 40} L${W},${GROUND - 40}" stroke="${edge}" stroke-width="6"/>`;
const house = (x, y, s, wall, roof) =>
  `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-120" y="-200" width="240" height="200" fill="${wall}" ${ol()}/><path d="M-150,-195 L0,-320 L150,-195 Z" fill="${roof}" ${ol()}/><rect x="-30" y="-110" width="60" height="110" fill="#8B5A2B" ${ol()}/><rect x="-100" y="-160" width="54" height="50" fill="#BFE6FF" ${ol()}/><rect x="46" y="-160" width="54" height="50" fill="#BFE6FF" ${ol()}/></g>`;
const building = (x, w, h, c, win = "#FFE9A8") => {
  let s = `<rect x="${x}" y="${GROUND - 40 - h}" width="${w}" height="${h}" fill="${c}" ${ol()}/>`;
  for (let yy = GROUND - 40 - h + 30; yy < GROUND - 90; yy += 70)
    for (let xx = x + 22; xx < x + w - 40; xx += 56) s += `<rect x="${xx}" y="${yy}" width="30" height="40" fill="${win}" opacity="0.9"/>`;
  return s;
};

// Night darkens the ground layers; sunset warms them.
const shade = (time) =>
  time === "night" ? `<rect class="shade" width="${W}" height="${H}" fill="#0B1240" opacity="0.38"/>` : time === "sunset" ? `<rect class="shade" width="${W}" height="${H}" fill="#FF7A3D" opacity="0.12"/>` : "";

const SETTINGS = {
  forest: {
    name: "Khu rừng",
    draw: (t) => ({
      far: hills("#8FCB8A", "#6DB46A") + pine(120, 760, 0.8, "#3E8E5E") + pine(1780, 760, 0.85, "#3E8E5E") + pine(1500, 740, 0.6, "#4E9E6E"),
      mid: tree(260, GROUND - 40, 1.1) + tree(1620, GROUND - 40, 1.2) + pine(560, GROUND - 40, 0.9) + tree(1240, GROUND - 40, 0.9, "#66BB6A") + bush(840, GROUND - 30, 1),
      ground: ground("#7BC46A", "#5AA34A") + flowers(3, GROUND - 20, H - 40),
    }),
  },
  meadow: {
    name: "Cánh đồng hoa",
    draw: (t) => ({
      far: hills("#A8DB8F", "#88C973"),
      mid: tree(1700, GROUND - 40, 0.9) + bush(220, GROUND - 30, 0.9, "#7CCB6A") + `<g transform="translate(980 ${GROUND - 40})"><rect x="-6" y="-120" width="12" height="120" fill="#8B5A2B"/><path d="M0,-120 L60,-100 L0,-80 Z" fill="#E8435A" ${ol(3)}/></g>`,
      ground: ground("#93D27C", "#74B85E") + flowers(11, GROUND - 30, H - 20) + flowers(12, GROUND, H),
    }),
  },
  village: {
    name: "Ngôi làng",
    draw: (t) => ({
      far: hills("#9ED39A", "#82C37C"),
      mid: house(330, GROUND - 40, 1, "#FFE3B3", "#D9534F") + house(1560, GROUND - 40, 0.9, "#E3F0FF", "#4E7AC7") + tree(820, GROUND - 40, 0.8) + bush(1180, GROUND - 30, 0.8),
      ground: ground("#C9B48A", "#A8925E") + `<path d="M760,${H} L900,${GROUND - 40} L1020,${GROUND - 40} L1160,${H} Z" fill="#E2D2A8"/>`,
    }),
  },
  house_inside: {
    name: "Trong nhà",
    indoor: true,
    draw: (t) => ({
      far: `<rect width="${W}" height="${H}" fill="#FFF1D6"/><rect x="0" y="560" width="${W}" height="260" fill="#F4DDB0"/><path d="M0,560 L${W},560" stroke="#C9A26B" stroke-width="8"/>` +
        `<rect x="1300" y="180" width="380" height="300" fill="url(#__sky)" ${ol(8)}/><path d="M1490,180 L1490,480 M1300,330 L1680,330" stroke="${INK}" stroke-width="8"/>` +
        `<rect x="220" y="230" width="260" height="190" fill="#9ED39A" ${ol(6)}/><circle cx="350" cy="320" r="50" fill="#FFD93D"/>`,
      mid: `<g transform="translate(960 ${GROUND - 40})"><rect x="-220" y="-170" width="440" height="34" rx="8" fill="#B5743A" ${ol()}/><rect x="-190" y="-136" width="26" height="136" fill="#8B5A2B" ${ol()}/><rect x="164" y="-136" width="26" height="136" fill="#8B5A2B" ${ol()}/><circle cx="-80" cy="-196" r="26" fill="#FF7E5F" ${ol(3)}/><rect x="40" y="-220" width="60" height="50" rx="6" fill="#FFFFFF" ${ol(3)}/></g>` +
        `<g transform="translate(160 ${GROUND - 40})"><path d="M0,0 L0,-210 Q60,-240 120,-210 L120,0 Z" fill="#7FB7E8" ${ol()}/></g>`,
      ground: `<rect x="0" y="${GROUND - 40}" width="${W}" height="${H - GROUND + 40}" fill="#C98E5A"/>` + Array.from({ length: 12 }, (_, i) => `<path d="M${i * 170},${GROUND - 40} L${i * 170 - 120},${H}" stroke="#B07A48" stroke-width="5"/>`).join(""),
    }),
  },
  classroom: {
    name: "Lớp học",
    indoor: true,
    draw: (t) => ({
      far: `<rect width="${W}" height="${H}" fill="#EAF3E0"/><rect x="560" y="150" width="800" height="380" rx="10" fill="#2F5D46" stroke="#8B5A2B" stroke-width="18"/><path d="M640,260 Q720,230 800,260 M640,330 L1000,330 M640,400 L900,400" stroke="#FFFFFF" stroke-width="6" opacity="0.8" fill="none"/>` +
        `<rect x="1500" y="200" width="300" height="260" fill="url(#__sky)" ${ol(8)}/><circle cx="260" cy="260" r="80" fill="#FFFFFF" ${ol(6)}/><path d="M260,260 L260,210 M260,260 L300,280" stroke="${INK}" stroke-width="6"/>`,
      mid: [300, 1620].map((x) => `<g transform="translate(${x} ${GROUND - 40})"><rect x="-130" y="-130" width="260" height="26" fill="#C98E5A" ${ol()}/><rect x="-110" y="-104" width="20" height="104" fill="#8B5A2B"/><rect x="90" y="-104" width="20" height="104" fill="#8B5A2B"/></g>`).join(""),
      ground: `<rect x="0" y="${GROUND - 40}" width="${W}" height="${H - GROUND + 40}" fill="#D6C3A0"/>`,
    }),
  },
  city: {
    name: "Thành phố",
    draw: (t) => ({
      far: building(60, 220, 380, "#9AB0D6") + building(320, 180, 300, "#B9A6D9") + building(1380, 240, 420, "#8FB8C9") + building(1660, 200, 330, "#C9B0A0") + building(700, 160, 260, "#A8C8B0"),
      mid: tree(560, GROUND - 40, 0.7) + tree(1220, GROUND - 40, 0.7) + `<g transform="translate(980 ${GROUND - 40})"><rect x="-6" y="-200" width="12" height="200" fill="#55555F"/><circle cx="0" cy="-205" r="22" fill="#FFE9A8" ${ol(3)}/></g>`,
      ground: `<rect x="0" y="${GROUND - 40}" width="${W}" height="${H - GROUND + 40}" fill="#B8B8C4"/><rect x="0" y="${GROUND + 70}" width="${W}" height="${H}" fill="#6B6B78"/>` + Array.from({ length: 10 }, (_, i) => `<rect x="${i * 200 + 40}" y="${GROUND + 130}" width="110" height="14" fill="#FFFFFF" opacity="0.8"/>`).join(""),
    }),
  },
  beach: {
    name: "Bãi biển",
    draw: (t) => ({
      far: `<rect x="0" y="560" width="${W}" height="300" fill="#3FA9F5"/><path d="M0,600 Q240,585 480,600 T960,600 T1440,600 T1920,600" stroke="#FFFFFF" stroke-width="6" fill="none" opacity="0.7"/>`,
      mid: `<g transform="translate(1600 ${GROUND - 40})"><path d="M0,0 Q-20,-200 30,-360" stroke="#8B5A2B" stroke-width="30" fill="none"/><path d="M30,-360 Q-80,-400 -160,-330 M30,-360 Q120,-420 200,-340 M30,-360 Q40,-460 -40,-480 M30,-360 Q140,-330 160,-250" stroke="#3E9E4E" stroke-width="34" fill="none" stroke-linecap="round"/></g>` +
        `<g transform="translate(300 ${GROUND - 40})"><path d="M0,0 L0,-220" stroke="#55555F" stroke-width="10"/><path d="M-150,-200 Q0,-300 150,-200 Z" fill="#FF6B6B" ${ol()}/></g>`,
      ground: `<rect x="0" y="${GROUND - 60}" width="${W}" height="${H}" fill="#F6DC9A"/><path d="M0,${GROUND - 60} Q480,${GROUND - 80} 960,${GROUND - 60} T1920,${GROUND - 60}" stroke="#FFFFFF" stroke-width="10" fill="none"/>`,
    }),
  },
  mountain: {
    name: "Núi cao",
    draw: (t) => ({
      far: `<path d="M-100,820 L380,260 L700,640 L1000,320 L1400,760 L1650,420 L2050,820 Z" fill="#8F9BB8"/><path d="M380,260 L300,360 L440,350 Z M1000,320 L920,420 L1080,410 Z M1650,420 L1590,500 L1710,500 Z" fill="#FFFFFF"/>`,
      mid: pine(200, GROUND - 40, 0.8, "#3E7E5E") + pine(1720, GROUND - 40, 0.9, "#3E7E5E") + `<path d="M600,${GROUND - 40} Q700,${GROUND - 120} 820,${GROUND - 40} Z" fill="#9AA0A8" ${ol()}/>`,
      ground: ground("#8DBF73", "#6E9E58"),
    }),
  },
  riverside: {
    name: "Bờ sông",
    draw: (t) => ({
      far: hills("#9ED39A", "#82C37C"),
      mid: `<path d="M0,700 Q600,660 960,700 T1920,690 L1920,770 Q1300,740 960,780 T0,770 Z" fill="#5BB8F0"/><g transform="translate(1250 700)"><path d="M-220,0 Q0,-120 220,0" stroke="#8B5A2B" stroke-width="20" fill="none"/><path d="M-220,0 L220,0" stroke="#8B5A2B" stroke-width="14"/>${[-150, -75, 0, 75, 150].map((x) => `<path d="M${x},${-Math.round(120 * (1 - (x / 220) ** 2) * 0.82)} L${x},0" stroke="#8B5A2B" stroke-width="8"/>`).join("")}</g>` + tree(220, GROUND - 40, 0.9),
      ground: ground("#8DCF77", "#6FB25A") + flowers(21, GROUND - 10, H - 30),
    }),
  },
  castle: {
    name: "Lâu đài",
    draw: (t) => ({
      far: hills("#A8D59A", "#8CC57E"),
      mid: `<g transform="translate(1300 ${GROUND - 40})"><rect x="-260" y="-320" width="520" height="320" fill="#D8D2C4" ${ol()}/>${[-260, -90, 80, 210].map((x) => `<rect x="${x}" y="-360" width="50" height="40" fill="#D8D2C4" ${ol()}/>`).join("")}<rect x="-330" y="-460" width="120" height="460" fill="#CFC8B8" ${ol()}/><path d="M-345,-460 L-270,-580 L-195,-460 Z" fill="#5B6BD6" ${ol()}/><rect x="210" y="-460" width="120" height="460" fill="#CFC8B8" ${ol()}/><path d="M195,-460 L270,-580 L345,-460 Z" fill="#5B6BD6" ${ol()}/><path d="M-60,0 L-60,-130 Q0,-190 60,-130 L60,0 Z" fill="#7A4E2A" ${ol()}/><path d="M-270,-580 L-270,-640 L-220,-625 L-270,-610" fill="#E8435A" stroke="${INK}" stroke-width="3"/></g>` + tree(260, GROUND - 40, 0.9),
      ground: ground("#93CF7E", "#74B460") + `<path d="M1240,${H} L1260,${GROUND - 40} L1340,${GROUND - 40} L1360,${H} Z" fill="#D9CDA8"/>`,
    }),
  },
};

export const SETTING_IDS = Object.keys(SETTINGS);
export const settingName = (id) => SETTINGS[id]?.name || id;
export const isIndoor = (id) => !!SETTINGS[id]?.indoor;

// The whole background as SVG layers for one shot; `uid` makes gradient ids unique per scene.
export function settingSvg(id, time = "day", uid = "bg") {
  const s = SETTINGS[id] || SETTINGS.meadow;
  const t = TIMES[time] ? time : "day";
  const layers = s.draw(t);
  const skyLayer = s.indoor ? `<defs><linearGradient id="${uid}-win" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SKY[t][0]}"/><stop offset="1" stop-color="${SKY[t][1]}"/></linearGradient></defs>` : sky(t, uid) + clouds(t);
  const fix = (svg) => svg.replace(/url\(#__sky\)/g, `url(#${uid}-win)`);
  return `<g class="bg-sky">${skyLayer}</g><g class="bg-far">${fix(layers.far)}</g><g class="bg-mid">${fix(layers.mid)}</g><g class="bg-ground">${layers.ground}</g>${s.indoor ? "" : shade(t)}`;
}

export function settingPreviewSvg(id, time = "day", width = 480) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${width}" height="${Math.round((width * H) / W)}">${settingSvg(id, time, `p-${id}-${time}`)}</svg>`;
}
