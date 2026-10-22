// Cartoon character rigs for the animation mode: chibi people and upright animals drawn as SVG
// with named, separately animated parts (see engine.js). Every rig shares one skeleton, so one
// set of actions (walk, wave, talk…) works for all of them.
//
// Local coordinates: feet at y = 0, top of the head around y = -520, centred on x = 0.
//   .body   whole figure (bob, squash, jump)      .head  pivots at the neck (0, -300)
//   .armL/.armR pivot at the shoulders           .legL/.legR pivot at the hips
//   .eyes-open / .eyes-closed                    .face-<emotion> brows + closed mouth per emotion
//   .mouth-open  talking mouth (scaleY 0 → 1)    .tears / .zzz / .think  effect layers
const INK = "#2B2B33";
const SW = 5; // outline width

export const EMOTIONS = ["neutral", "happy", "sad", "angry", "scared", "surprised", "love"];

const SKIN = { light: "#FFDDBF", tan: "#E8B48C", brown: "#B97E57", dark: "#8A5A3C" };

// Voice styles: edge-tts voice + rate + pitch. Characters pick one; narration uses the project voice.
export const VOICE_STYLES = {
  man: { label: "Đàn ông", voice: "vi-VN-NamMinhNeural", rate: "+0%", pitch: "+0Hz" },
  woman: { label: "Phụ nữ", voice: "vi-VN-HoaiMyNeural", rate: "+0%", pitch: "+0Hz" },
  boy: { label: "Bé trai", voice: "vi-VN-NamMinhNeural", rate: "+8%", pitch: "+45Hz" },
  girl: { label: "Bé gái", voice: "vi-VN-HoaiMyNeural", rate: "+8%", pitch: "+35Hz" },
  old_man: { label: "Ông lão", voice: "vi-VN-NamMinhNeural", rate: "-12%", pitch: "-15Hz" },
  old_woman: { label: "Bà lão", voice: "vi-VN-HoaiMyNeural", rate: "-12%", pitch: "-12Hz" },
  deep: { label: "Trầm, to lớn", voice: "vi-VN-NamMinhNeural", rate: "-8%", pitch: "-28Hz" },
  squeaky: { label: "Lí nhí, nhỏ bé", voice: "vi-VN-HoaiMyNeural", rate: "+15%", pitch: "+65Hz" },
};

// ---------------------------------------------------------------- shared parts
const ol = (extra = "") => `stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round" ${extra}`;
const limb = (x1, y1, x2, y2, color, w) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="${w + SW * 2}" stroke-linecap="round"/>` +
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;

function legs(r) {
  const leg = (s) => {
    const x = s * 32;
    const foot = r.shoe || r.fur2 || "#4A4A55";
    return `<g class="leg${s < 0 ? "L" : "R"}">${limb(x, -175, x, -30, r.legColor, 38)}<ellipse cx="${x + s * 10}" cy="-16" rx="34" ry="18" fill="${foot}" ${ol()}/></g>`;
  };
  return leg(-1) + leg(1);
}

function arms(r) {
  const arm = (s) => {
    const x = s * 74;
    const hand = r.hand || r.skin;
    return `<g class="arm${s < 0 ? "L" : "R"}">${limb(x, -288, x + s * 20, -180, r.sleeve || r.shirt, 30)}<circle cx="${x + s * 22}" cy="-170" r="21" fill="${hand}" ${ol()}/></g>`;
  };
  return { L: arm(-1), R: arm(1) };
}

function torso(r) {
  if (r.dress)
    return `<path d="M-62,-305 Q0,-322 62,-305 L104,-150 Q0,-128 -104,-150 Z" fill="${r.shirt}" ${ol()}/>` + (r.belt ? `<rect x="-60" y="-236" width="120" height="16" rx="6" fill="${r.belt}" ${ol('stroke-width="3"')}/>` : "");
  let s = `<path d="M-70,-305 Q0,-325 70,-305 L80,-165 Q0,-148 -80,-165 Z" fill="${r.shirt}" ${ol()}/>`;
  if (r.belly) s += `<ellipse cx="0" cy="-222" rx="48" ry="62" fill="${r.belly}"/>`;
  if (r.coat) s += `<path d="M-70,-305 L-20,-300 L-10,-160 L-80,-165 Z M70,-305 L20,-300 L10,-160 L80,-165 Z" fill="${r.coat}" ${ol('stroke-width="3"')}/>`;
  if (r.apron) s += `<path d="M-46,-262 L46,-262 L54,-158 L-54,-158 Z" fill="${r.apron}" ${ol('stroke-width="3"')}/>`;
  if (r.tie) s += `<path d="M0,-300 L-10,-288 L0,-230 L10,-288 Z" fill="${r.tie}" ${ol('stroke-width="3"')}/>`;
  if (r.badge) s += `<circle cx="-36" cy="-270" r="11" fill="${r.badge}" ${ol('stroke-width="3"')}/>`;
  if (r.stethoscope) s += `<path d="M-40,-300 Q-44,-230 0,-226 Q44,-230 40,-300" fill="none" stroke="#3E4A5A" stroke-width="6"/><circle cx="0" cy="-222" r="9" fill="#9AA4B2" ${ol('stroke-width="3"')}/>`;
  return s;
}

// Eyes, brows and mouths for every emotion, placed by the rig's face anchors.
function face(r) {
  const { eyeY, eyeDX, mouthY, eyeR = 17 } = r.face;
  const pupil = (x, y, s = 1) => `<ellipse cx="${x}" cy="${y}" rx="${eyeR * 0.62 * s}" ry="${eyeR * 0.78 * s}" fill="${INK}"/><circle cx="${x + 4}" cy="${y - 6}" r="${eyeR * 0.24}" fill="#fff"/>`;
  const open = `<g class="eyes-open">${[-1, 1].map((s) => `<ellipse cx="${s * eyeDX}" cy="${eyeY}" rx="${eyeR}" ry="${eyeR * 1.2}" fill="#fff" ${ol('stroke-width="3.5"')}/>${pupil(s * eyeDX, eyeY + 2)}`).join("")}</g>`;
  const closed = `<g class="eyes-closed" opacity="0">${[-1, 1].map((s) => `<path d="M${s * eyeDX - eyeR},${eyeY} Q${s * eyeDX},${eyeY - eyeR} ${s * eyeDX + eyeR},${eyeY}" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`).join("")}</g>`;
  const by = eyeY - eyeR * 1.6;
  const brow = (s, tilt) => `<line x1="${s * eyeDX - 16}" y1="${by + s * tilt}" x2="${s * eyeDX + 16}" y2="${by - s * tilt}" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
  const brows = (tilt) => brow(-1, tilt) + brow(1, tilt);
  const m = mouthY;
  const blush = `<ellipse cx="${-eyeDX - 14}" cy="${eyeY + 34}" rx="16" ry="9" fill="#FF7A8A" opacity="0.45"/><ellipse cx="${eyeDX + 14}" cy="${eyeY + 34}" rx="16" ry="9" fill="#FF7A8A" opacity="0.45"/>`;
  const faces = {
    neutral: `<path d="M-16,${m} Q0,${m + 9} 16,${m}" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`,
    happy: `${blush}<path d="M-26,${m - 4} Q0,${m + 24} 26,${m - 4} Z" fill="#7A2E3A" ${ol('stroke-width="4"')}/>`,
    sad: `${brows(-6)}<path d="M-18,${m + 8} Q0,${m - 8} 18,${m + 8}" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`,
    angry: `${brows(8)}<path d="M-18,${m + 4} L18,${m + 4}" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`,
    scared: `${brows(-9)}<ellipse cx="0" cy="${m + 4}" rx="10" ry="13" fill="#7A2E3A" ${ol('stroke-width="4"')}/>`,
    surprised: `${brows(-4)}<ellipse cx="0" cy="${m + 6}" rx="15" ry="19" fill="#7A2E3A" ${ol('stroke-width="4"')}/>`,
    love: `${blush}<path d="M-22,${m - 2} Q0,${m + 18} 22,${m - 2}" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`,
  };
  const variants = EMOTIONS.map((e) => `<g class="face-${e}"${e === "neutral" ? "" : ' opacity="0"'}>${faces[e]}</g>`).join("");
  // Closed to a sliver around the mouth line; the engine scales it open while the character speaks.
  const talk = `<g class="mouth-open" transform="matrix(1,0,0,0.08,0,${(0.92 * (m + 2)).toFixed(1)})"><ellipse cx="0" cy="${m + 2}" rx="17" ry="15" fill="#7A2E3A" ${ol('stroke-width="4"')}/><ellipse cx="0" cy="${m + 9}" rx="10" ry="5" fill="#F27C8A"/></g>`;
  const hearts = `<g class="eyes-love" opacity="0">${[-1, 1].map((s) => `<path transform="translate(${s * eyeDX} ${eyeY})" d="M0,10 C-22,-6 -12,-24 0,-12 C12,-24 22,-6 0,10 Z" fill="#E8435A" ${ol('stroke-width="3"')}/>`).join("")}</g>`;
  return open + closed + hearts + variants + talk;
}

// Effect layers every rig carries; the engine shows them for some actions.
function effects(r) {
  const { eyeY, eyeDX } = r.face;
  const tears = `<g class="tears" opacity="0">${[-1, 1].map((s) => `<path class="tear" d="M${s * (eyeDX + 4)},${eyeY + 18} q-9,18 0,26 q9,-8 0,-26 Z" fill="#6EC3FF" ${ol('stroke-width="2.5"')}/>`).join("")}</g>`;
  const zzz = `<g class="zzz" opacity="0" font-family="Be Vietnam Pro, sans-serif" font-weight="700" fill="#5B6BD6"><text x="90" y="-500" font-size="46">Z</text><text x="130" y="-560" font-size="36">z</text><text x="160" y="-605" font-size="28">z</text></g>`;
  const think = `<g class="think" opacity="0">${[[96, -470, 10], [124, -520, 15], [160, -580, 22]].map(([x, y, rr]) => `<circle cx="${x}" cy="${y}" r="${rr}" fill="#fff" ${ol('stroke-width="3.5"')}/>`).join("")}</g>`;
  const sweat = `<path class="sweat" opacity="0" d="M${eyeDX + 50},${eyeY - 40} q-10,20 0,28 q10,-8 0,-28 Z" fill="#9AD8FF" ${ol('stroke-width="2.5"')}/>`;
  return tears + sweat + zzz + think;
}

// ---------------------------------------------------------------- heads
const headCircle = (r, rx = 108, ry = 102) => `<ellipse cx="0" cy="-410" rx="${rx}" ry="${ry}" fill="${r.skin}" ${ol()}/>`;
const ear = (r) => `<ellipse cx="-108" cy="-405" rx="16" ry="22" fill="${r.skin}" ${ol()}/><ellipse cx="108" cy="-405" rx="16" ry="22" fill="${r.skin}" ${ol()}/>`;

const HAIR = {
  short: (c) => ({ front: `<path d="M-106,-410 Q-112,-520 0,-522 Q112,-520 106,-410 Q90,-470 46,-468 L30,-448 L14,-470 Q-60,-474 -106,-410 Z" fill="${c}" ${ol()}/>` }),
  spiky: (c) => ({ front: `<path d="M-108,-405 Q-120,-500 -60,-515 L-50,-548 L-20,-520 L0,-560 L22,-522 L56,-546 L58,-512 Q120,-500 108,-405 Q96,-460 40,-462 Q-60,-470 -108,-405 Z" fill="${c}" ${ol()}/>` }),
  long: (c) => ({
    back: `<path d="M-118,-420 Q-128,-280 -96,-245 L96,-245 Q128,-280 118,-420 Q110,-520 0,-524 Q-110,-520 -118,-420 Z" fill="${c}" ${ol()}/>`,
    front: `<path d="M-106,-415 Q-104,-516 0,-520 Q104,-516 106,-415 Q80,-470 0,-462 Q-40,-460 -72,-430 Z" fill="${c}" ${ol()}/>`,
  }),
  pigtails: (c) => ({
    back: `<circle cx="-124" cy="-360" r="42" fill="${c}" ${ol()}/><circle cx="124" cy="-360" r="42" fill="${c}" ${ol()}/>`,
    front: `<path d="M-106,-412 Q-108,-518 0,-520 Q108,-518 106,-412 Q70,-478 0,-470 Q-70,-478 -106,-412 Z" fill="${c}" ${ol()}/><circle cx="-112" cy="-392" r="10" fill="#FF6B8B" ${ol('stroke-width="3"')}/><circle cx="112" cy="-392" r="10" fill="#FF6B8B" ${ol('stroke-width="3"')}/>`,
  }),
  bun: (c) => ({
    front: `<circle cx="0" cy="-525" r="38" fill="${c}" ${ol()}/><path d="M-106,-412 Q-108,-512 0,-514 Q108,-512 106,-412 Q70,-470 0,-466 Q-70,-470 -106,-412 Z" fill="${c}" ${ol()}/>`,
  }),
  bald: (c) => ({
    front: `<path d="M-108,-410 Q-112,-450 -92,-470 L-80,-430 Z M108,-410 Q112,-450 92,-470 L80,-430 Z" fill="${c}" ${ol()}/>`,
  }),
};

const beard = (c) => `<path d="M-80,-380 Q-82,-300 0,-286 Q82,-300 80,-380 Q60,-338 0,-336 Q-60,-338 -80,-380 Z" fill="${c}" ${ol()}/><path d="M-34,-352 Q0,-370 34,-352 Q0,-344 -34,-352 Z" fill="${c}" ${ol('stroke-width="3"')}/>`;
const glasses = `<g fill="none" stroke="${INK}" stroke-width="5"><circle cx="-38" cy="-418" r="27"/><circle cx="38" cy="-418" r="27"/><path d="M-11,-420 L11,-420"/></g>`;

const HATS = {
  crown: `<path d="M-62,-500 L-62,-560 L-30,-528 L0,-575 L30,-528 L62,-560 L62,-500 Z" fill="#FFC93C" ${ol()}/><circle cx="0" cy="-528" r="9" fill="#E8435A"/>`,
  tiara: `<path d="M-48,-505 L-30,-540 L-12,-515 L0,-552 L12,-515 L30,-540 L48,-505 Z" fill="#FFD95C" ${ol()}/><circle cx="0" cy="-532" r="7" fill="#7FD3FF"/>`,
  straw: `<ellipse cx="0" cy="-495" rx="160" ry="30" fill="#F2C76B" ${ol()}/><path d="M-78,-500 Q-74,-582 0,-586 Q74,-582 78,-500 Z" fill="#F2C76B" ${ol()}/><path d="M-78,-512 Q0,-500 78,-512" fill="none" stroke="#C0392B" stroke-width="12"/>`,
  chef: `<path d="M-70,-490 L-70,-540 Q-100,-590 -50,-600 Q-30,-640 10,-622 Q60,-650 80,-600 Q110,-580 70,-540 L70,-490 Z" fill="#FFFFFF" ${ol()}/><rect x="-72" y="-505" width="144" height="26" rx="6" fill="#F4F4F4" ${ol('stroke-width="3"')}/>`,
  police: `<path d="M-100,-482 Q0,-462 100,-482 L84,-530 Q0,-560 -84,-530 Z" fill="#23408E" ${ol()}/><path d="M-110,-480 Q0,-450 110,-480 L104,-462 Q0,-436 -104,-462 Z" fill="#1A1A22" ${ol('stroke-width="3"')}/><circle cx="0" cy="-512" r="13" fill="#FFC93C" ${ol('stroke-width="3"')}/>`,
  cap: `<path d="M-100,-470 Q-100,-540 0,-544 Q100,-540 100,-470 Z" fill="#E8435A" ${ol()}/><path d="M60,-475 Q150,-478 160,-458 L70,-455 Z" fill="#E8435A" ${ol()}/>`,
};

// ---------------------------------------------------------------- animal parts
function animalHead(r) {
  const { fur, fur2, light, inner = "#FFB3C1" } = r;
  const base = `<ellipse cx="0" cy="-410" rx="${r.headRx || 106}" ry="${r.headRy || 98}" fill="${fur}" ${ol()}/>`;
  const muzzle = (rx = 52, ry = 38, y = -368) => `<ellipse cx="0" cy="${y}" rx="${rx}" ry="${ry}" fill="${light}" ${ol('stroke-width="3.5"')}/>`;
  const nose = (c = INK, y = -388, rx = 13, ry = 9) => `<ellipse cx="0" cy="${y}" rx="${rx}" ry="${ry}" fill="${c}"/>`;
  const whisk = `<g stroke="${INK}" stroke-width="3" stroke-linecap="round">${[-1, 1].map((s) => `<path d="M${s * 42},-376 L${s * 92},-388 M${s * 42},-366 L${s * 94},-364"/>`).join("")}</g>`;
  const back = [];
  const front = [];
  switch (r.species) {
    case "rabbit":
      back.push([-1, 1].map((s) => `<g transform="rotate(${s * 10} ${s * 44} -490)"><ellipse cx="${s * 44}" cy="-560" rx="30" ry="96" fill="${fur}" ${ol()}/><ellipse cx="${s * 44}" cy="-556" rx="15" ry="72" fill="${inner}"/></g>`).join(""));
      front.push(base, muzzle(46, 34, -366), nose("#F27C8A", -384, 12, 9), whisk, `<rect x="-11" y="-352" width="22" height="18" rx="4" fill="#fff" ${ol('stroke-width="3"')}/>`);
      break;
    case "cat":
      back.push([-1, 1].map((s) => `<path d="M${s * 40},-490 L${s * 92},-560 L${s * 100},-450 Z" fill="${fur}" ${ol()}/><path d="M${s * 56},-488 L${s * 86},-532 L${s * 88},-470 Z" fill="${inner}"/>`).join(""));
      front.push(base, `<path d="M-20,-500 L-14,-470 M0,-506 L0,-474 M20,-500 L14,-470" stroke="${fur2}" stroke-width="7" stroke-linecap="round"/>`, muzzle(44, 30, -368), nose("#F27C8A", -386, 11, 8), whisk);
      break;
    case "fox":
      back.push([-1, 1].map((s) => `<path d="M${s * 34},-488 L${s * 90},-575 L${s * 104},-456 Z" fill="${fur}" ${ol()}/><path d="M${s * 76},-552 L${s * 90},-575 L${s * 96},-540 Z" fill="${INK}"/>`).join(""));
      front.push(base, `<path d="M-104,-400 Q-60,-330 0,-326 Q60,-330 104,-400 Q60,-380 0,-400 Q-60,-380 -104,-400 Z" fill="${light}" ${ol('stroke-width="3.5"')}/>`, nose(INK, -392, 14, 10));
      break;
    case "dog":
      back.push([-1, 1].map((s) => `<ellipse cx="${s * 102}" cy="-410" rx="34" ry="74" transform="rotate(${s * -14} ${s * 102} -470)" fill="${fur2}" ${ol()}/>`).join(""));
      front.push(base, muzzle(56, 42, -364), nose(INK, -390, 18, 13), `<ellipse cx="44" cy="-440" rx="30" ry="26" fill="${fur2}" opacity="0.8"/>`);
      break;
    case "bear":
    case "panda":
      back.push([-1, 1].map((s) => `<circle cx="${s * 80}" cy="-488" r="36" fill="${r.species === "panda" ? INK : fur}" ${ol()}/><circle cx="${s * 80}" cy="-488" r="18" fill="${r.species === "panda" ? "#55555F" : inner}"/>`).join(""));
      front.push(base);
      if (r.species === "panda") front.push([-1, 1].map((s) => `<ellipse cx="${s * 40}" cy="-410" rx="30" ry="36" transform="rotate(${s * -25} ${s * 40} -410)" fill="${INK}"/>`).join(""));
      front.push(muzzle(48, 36, -366), nose(INK, -388, 15, 10));
      break;
    case "lion":
      back.push(`<g>${Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2; return `<circle cx="${(Math.cos(a) * 118).toFixed(1)}" cy="${(-410 + Math.sin(a) * 112).toFixed(1)}" r="44" fill="${fur2}" ${ol()}/>`; }).join("")}</g>`);
      back.push([-1, 1].map((s) => `<circle cx="${s * 74}" cy="-488" r="22" fill="${fur}" ${ol()}/>`).join(""));
      front.push(base, muzzle(50, 36, -366), `<path d="M-14,-394 L14,-394 L0,-378 Z" fill="${INK}"/>`);
      break;
    case "mouse":
      back.push([-1, 1].map((s) => `<circle cx="${s * 92}" cy="-490" r="62" fill="${fur}" ${ol()}/><circle cx="${s * 92}" cy="-490" r="38" fill="${inner}"/>`).join(""));
      front.push(base, muzzle(40, 28, -370), nose("#F27C8A", -386, 11, 9), whisk);
      break;
    case "pig":
      back.push([-1, 1].map((s) => `<path d="M${s * 46},-490 L${s * 98},-540 L${s * 96},-466 Z" fill="${fur2}" ${ol()}/>`).join(""));
      front.push(base, `<ellipse cx="0" cy="-378" rx="38" ry="27" fill="${fur2}" ${ol()}/><ellipse cx="-12" cy="-378" rx="6" ry="9" fill="${INK}"/><ellipse cx="12" cy="-378" rx="6" ry="9" fill="${INK}"/>`);
      break;
    case "monkey":
      back.push([-1, 1].map((s) => `<circle cx="${s * 112}" cy="-410" r="36" fill="${fur}" ${ol()}/><circle cx="${s * 112}" cy="-410" r="20" fill="${light}"/>`).join(""));
      front.push(base, `<path d="M0,-470 Q-30,-500 -64,-470 Q-92,-430 -64,-380 Q-40,-336 0,-334 Q40,-336 64,-380 Q92,-430 64,-470 Q30,-500 0,-470 Z" fill="${light}" ${ol('stroke-width="3.5"')}/>`, nose(INK, -386, 9, 6));
      break;
    case "elephant":
      back.push([-1, 1].map((s) => `<ellipse cx="${s * 120}" cy="-410" rx="70" ry="92" fill="${fur}" ${ol()}/><ellipse cx="${s * 122}" cy="-410" rx="44" ry="64" fill="${inner}"/>`).join(""));
      front.push(base, `<path d="M-26,-400 Q-30,-300 -6,-268 Q20,-250 30,-276 Q12,-282 14,-310 Q22,-360 26,-400 Z" fill="${fur}" ${ol()}/>`, `<path d="M-48,-360 Q-58,-330 -46,-318 L-40,-352 Z M48,-360 Q58,-330 46,-318 L40,-352 Z" fill="#FFFDF0" ${ol('stroke-width="3"')}/>`);
      break;
    case "turtle":
      front.push(base, nose(INK, -386, 6, 4));
      break;
    case "frog":
      back.push([-1, 1].map((s) => `<circle cx="${s * 52}" cy="-488" r="42" fill="${fur}" ${ol()}/>`).join(""));
      front.push(`<ellipse cx="0" cy="-405" rx="118" ry="88" fill="${fur}" ${ol()}/>`, `<ellipse cx="0" cy="-366" rx="70" ry="30" fill="${light}"/>`);
      break;
    case "chicken":
      back.push(`<path d="M-30,-500 Q-36,-548 -12,-540 Q-6,-576 14,-552 Q36,-570 36,-530 Q46,-514 30,-500 Z" fill="#E8435A" ${ol()}/>`);
      front.push(base, `<path d="M-22,-392 L22,-392 L0,-360 Z" fill="#FFB238" ${ol('stroke-width="4"')}/>`, `<path d="M-8,-362 Q0,-330 8,-362 Z" fill="#E8435A" ${ol('stroke-width="3"')}/>`);
      break;
  }
  return { back: back.join(""), front: front.join("") };
}

function tail(r) {
  const { fur, fur2, light } = r;
  switch (r.species) {
    case "rabbit": return `<circle cx="78" cy="-180" r="30" fill="#FFFFFF" ${ol()}/>`;
    case "fox": return `<path d="M70,-190 Q190,-200 200,-310 Q170,-260 120,-262 Q90,-240 70,-230 Z" fill="${fur}" ${ol()}/><path d="M188,-282 Q200,-300 200,-310 Q178,-292 168,-292 Z" fill="#FFF" ${ol('stroke-width="3"')}/>`;
    case "cat": return `<path d="M70,-190 Q150,-180 160,-260 Q164,-300 140,-310" fill="none" stroke="${INK}" stroke-width="30" stroke-linecap="round"/><path d="M70,-190 Q150,-180 160,-260 Q164,-300 140,-310" fill="none" stroke="${fur}" stroke-width="20" stroke-linecap="round"/>`;
    case "dog": return `<path d="M72,-200 Q120,-240 130,-290" fill="none" stroke="${INK}" stroke-width="30" stroke-linecap="round"/><path d="M72,-200 Q120,-240 130,-290" fill="none" stroke="${fur2}" stroke-width="20" stroke-linecap="round"/>`;
    case "lion": return `<path d="M70,-190 Q160,-190 170,-250" fill="none" stroke="${INK}" stroke-width="20" stroke-linecap="round"/><path d="M70,-190 Q160,-190 170,-250" fill="none" stroke="${fur}" stroke-width="10" stroke-linecap="round"/><circle cx="172" cy="-258" r="20" fill="${fur2}" ${ol()}/>`;
    case "mouse": return `<path d="M70,-185 Q170,-170 180,-250 Q186,-300 150,-296" fill="none" stroke="#F2A0B0" stroke-width="9" stroke-linecap="round"/>`;
    case "pig": return `<path d="M76,-200 q22,-10 18,-26 q-4,-14 -16,-4 q-8,10 6,18 q16,6 26,-8" fill="none" stroke="${fur2}" stroke-width="8" stroke-linecap="round"/>`;
    case "monkey": return `<path d="M70,-185 Q180,-170 190,-280 Q196,-340 150,-330 Q130,-320 150,-300" fill="none" stroke="${INK}" stroke-width="22" stroke-linecap="round"/><path d="M70,-185 Q180,-170 190,-280 Q196,-340 150,-330 Q130,-320 150,-300" fill="none" stroke="${fur}" stroke-width="12" stroke-linecap="round"/>`;
    case "turtle": return `<ellipse cx="0" cy="-232" rx="128" ry="130" fill="#7A9A3A" ${ol()}/><path d="M-60,-300 L0,-330 L60,-300 L60,-200 L0,-170 L-60,-200 Z M-60,-300 L-110,-260 M60,-300 L110,-260 M-60,-200 L-110,-220 M60,-200 L110,-220 M0,-330 L0,-350 M0,-170 L0,-110" fill="#94B84A" stroke="#4E6A1E" stroke-width="7"/>`;
    case "chicken": return `<path d="M60,-210 Q140,-260 130,-330 Q110,-280 90,-300 Q100,-250 60,-240 Z" fill="${light}" ${ol()}/>`;
    case "elephant": return `<path d="M76,-190 Q110,-200 116,-240" fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round"/>`;
    default: return "";
  }
}

// ---------------------------------------------------------------- rig catalogue
const person = (id, name, voice, look) => ({ id, name, kind: "person", voice, ...look });
const animal = (id, name, voice, look) => ({ id, name, kind: "animal", species: id, voice, ...look });

export const RIGS = [
  person("boy", "Bé trai", "boy", { skin: SKIN.light, hair: "short", hairColor: "#3B2A20", shirt: "#3D8BFF", legColor: "#2E3D6B", shoe: "#E8435A", scale: 0.85 }),
  person("girl", "Bé gái", "girl", { skin: SKIN.light, hair: "pigtails", hairColor: "#5A3825", shirt: "#FF7EB0", dress: true, legColor: SKIN.light, shoe: "#8E44AD", scale: 0.85 }),
  person("man", "Người đàn ông", "man", { skin: SKIN.tan, hair: "short", hairColor: "#22181A", shirt: "#2FA67A", legColor: "#3A3A48", shoe: "#3B2A20" }),
  person("woman", "Người phụ nữ", "woman", { skin: SKIN.light, hair: "long", hairColor: "#3A2418", shirt: "#F28C38", dress: true, belt: "#B5562A", legColor: SKIN.light, shoe: "#7A3E2A" }),
  person("grandpa", "Ông lão", "old_man", { skin: SKIN.tan, hair: "bald", hairColor: "#E8E8EE", beard: "#F2F2F6", glasses: true, shirt: "#8A6A4A", legColor: "#4A4A55", shoe: "#3B2A20", scale: 0.95 }),
  person("grandma", "Bà lão", "old_woman", { skin: SKIN.light, hair: "bun", hairColor: "#DADAE2", glasses: true, shirt: "#8E6BC7", dress: true, legColor: SKIN.light, shoe: "#5A3A60", scale: 0.92 }),
  person("king", "Nhà vua", "deep", { skin: SKIN.light, hair: "short", hairColor: "#6B3E1E", beard: "#6B3E1E", hat: "crown", shirt: "#B23A48", sleeve: "#B23A48", coat: "#FFD95C", legColor: "#4A2A6A", shoe: "#3B2A20" }),
  person("princess", "Công chúa", "girl", { skin: SKIN.light, hair: "long", hairColor: "#F2C14E", hat: "tiara", shirt: "#FF9ECF", dress: true, belt: "#FFD95C", legColor: SKIN.light, shoe: "#E8435A" }),
  person("farmer", "Bác nông dân", "man", { skin: SKIN.brown, hair: "short", hairColor: "#2A1E18", hat: "straw", shirt: "#5B8FD8", apron: "#C9A26B", legColor: "#6B4E2E", shoe: "#3B2A20" }),
  person("doctor", "Bác sĩ", "woman", { skin: SKIN.light, hair: "bun", hairColor: "#2A1E18", glasses: true, shirt: "#FFFFFF", sleeve: "#FFFFFF", stethoscope: true, legColor: "#3D6E9E", shoe: "#2B2B33" }),
  person("police", "Chú công an", "man", { skin: SKIN.tan, hair: "short", hairColor: "#1A1A1A", hat: "police", shirt: "#3D5BA8", sleeve: "#3D5BA8", badge: "#FFC93C", legColor: "#23305A", shoe: "#1A1A1A" }),
  person("chef", "Đầu bếp", "man", { skin: SKIN.light, hair: "short", hairColor: "#3B2A20", hat: "chef", shirt: "#FFFFFF", sleeve: "#FFFFFF", apron: "#F2F2F2", legColor: "#3A3A48", shoe: "#2B2B33" }),
  person("teacher", "Cô giáo", "woman", { skin: SKIN.light, hair: "long", hairColor: "#2A1A14", glasses: true, shirt: "#5BB5A2", dress: true, legColor: SKIN.light, shoe: "#2B2B33" }),
  person("student", "Cậu học sinh", "boy", { skin: SKIN.tan, hair: "spiky", hairColor: "#1E1E24", hat: "cap", shirt: "#FFFFFF", tie: "#E8435A", legColor: "#2E3D6B", shoe: "#FFFFFF", scale: 0.88 }),
  animal("rabbit", "Thỏ", "girl", { fur: "#F4F1F8", fur2: "#D8D2E6", light: "#FFFFFF", scale: 0.85 }),
  animal("turtle", "Rùa", "old_man", { fur: "#8CC85A", fur2: "#6FA53F", light: "#E8F0B0", belly: "#F2E6A0", scale: 0.85 }),
  animal("fox", "Cáo", "man", { fur: "#F2843A", fur2: "#C85F1E", light: "#FFF4E6", belly: "#FFF4E6", hand: "#3A2A24", shoe: "#3A2A24" }),
  animal("cat", "Mèo", "girl", { fur: "#A8A8B8", fur2: "#7C7C8E", light: "#F4F4F8", belly: "#F4F4F8", scale: 0.85 }),
  animal("dog", "Chó", "boy", { fur: "#E3B577", fur2: "#9A6236", light: "#FFF1DD", belly: "#FFF1DD", scale: 0.9 }),
  animal("bear", "Gấu", "deep", { fur: "#9A6236", fur2: "#6E4222", light: "#E8C9A0", belly: "#E8C9A0", scale: 1.08 }),
  animal("panda", "Gấu trúc", "deep", { fur: "#FFFFFF", fur2: INK, light: "#FFFFFF", sleeveColor: INK, legColorOverride: INK, scale: 1.02 }),
  animal("lion", "Sư tử", "deep", { fur: "#F2B84A", fur2: "#B8682A", light: "#FFE7B0", belly: "#FFE7B0", scale: 1.05 }),
  animal("mouse", "Chuột", "squeaky", { fur: "#B9B4C2", fur2: "#8E889C", light: "#F2EEF6", belly: "#F2EEF6", scale: 0.72 }),
  animal("pig", "Heo", "boy", { fur: "#FFB6C6", fur2: "#F28AA4", light: "#FFD6DF", belly: "#FFD6DF", scale: 0.92 }),
  animal("monkey", "Khỉ", "boy", { fur: "#9A6236", fur2: "#6E4222", light: "#F2D2A8", belly: "#F2D2A8", scale: 0.88 }),
  animal("elephant", "Voi", "deep", { fur: "#A9B4C8", fur2: "#7F8BA3", light: "#C9D2E2", inner: "#F2B8C6", belly: "#C9D2E2", scale: 1.12 }),
  animal("frog", "Ếch", "squeaky", { fur: "#6CC24A", fur2: "#3E8E2A", light: "#D8F2B8", belly: "#D8F2B8", scale: 0.78 }),
  animal("chicken", "Gà", "squeaky", { fur: "#FFFFFF", fur2: "#F2F2F2", light: "#FFFFFF", hand: "#FFFFFF", shoe: "#FFB238", legColorOverride: "#FFB238", scale: 0.78 }),
];

export const RIG_IDS = RIGS.map((r) => r.id);
export const rigById = (id) => RIGS.find((r) => r.id === id);

// Face anchors per head shape (people share one; animals adjust for muzzles).
const FACE = {
  person: { eyeY: -418, eyeDX: 38, mouthY: -355 },
  rabbit: { eyeY: -425, eyeDX: 40, mouthY: -340 },
  turtle: { eyeY: -425, eyeDX: 40, mouthY: -360 },
  fox: { eyeY: -430, eyeDX: 42, mouthY: -352 },
  cat: { eyeY: -425, eyeDX: 40, mouthY: -344 },
  dog: { eyeY: -432, eyeDX: 42, mouthY: -340 },
  bear: { eyeY: -428, eyeDX: 40, mouthY: -342 },
  panda: { eyeY: -414, eyeDX: 40, mouthY: -342, eyeR: 14 },
  lion: { eyeY: -428, eyeDX: 40, mouthY: -346 },
  mouse: { eyeY: -425, eyeDX: 38, mouthY: -350 },
  pig: { eyeY: -438, eyeDX: 44, mouthY: -340 },
  monkey: { eyeY: -425, eyeDX: 32, mouthY: -360, eyeR: 15 },
  elephant: { eyeY: -432, eyeDX: 52, mouthY: -330 },
  frog: { eyeY: -488, eyeDX: 52, mouthY: -362, eyeR: 22 },
  chicken: { eyeY: -425, eyeDX: 40, mouthY: -374 },
};

// Full SVG markup of one character (a <g>, no outer <svg>); `uid` keeps ids unique in a page.
export function rigSvg(id) {
  const base = rigById(id);
  if (!base) throw new Error(`Không có nhân vật ${id}`);
  const r = { ...base };
  r.face = FACE[r.kind === "person" ? "person" : r.species];
  if (r.kind === "animal") {
    r.skin = r.fur;
    r.shirt = r.belly ? r.fur : r.fur;
    r.sleeve = r.sleeveColor || r.fur;
    r.legColor = r.legColorOverride || r.fur;
    r.hand = r.hand || r.fur2;
    r.shoe = r.shoe || r.fur2;
  } else {
    r.sleeve = r.sleeve || r.shirt;
  }
  const a = arms(r);
  let head;
  if (r.kind === "person") {
    const hair = HAIR[r.hair](r.hairColor);
    head = `${hair.back || ""}${ear(r)}${headCircle(r)}${r.beard ? beard(r.beard) : ""}${face(r)}${r.glasses ? glasses : ""}${hair.front}${r.hat ? HATS[r.hat] : ""}`;
  } else {
    const h = animalHead(r);
    head = `${h.back}${h.front}${face(r)}`;
  }
  const behind = r.kind === "animal" && r.species === "turtle" ? tail(r) : "";
  const tailFront = r.kind === "animal" && r.species !== "turtle" ? `<g class="tail">${tail(r)}</g>` : "";
  const torsoMarkup = r.kind === "animal" ? `<path d="M-70,-305 Q0,-325 70,-305 L80,-165 Q0,-148 -80,-165 Z" fill="${r.fur}" ${ol()}/>${r.belly ? `<ellipse cx="0" cy="-226" rx="50" ry="64" fill="${r.belly}"/>` : ""}` : torso(r);
  return `<g class="body">
<ellipse class="shadow" cx="0" cy="0" rx="110" ry="18" fill="rgba(0,0,0,0.18)"/>
${behind}${tailFront}${legs(r)}${a.L}${torsoMarkup}${a.R}
<g class="head">${head}${effects(r)}</g>
</g>`;
}

// A standalone SVG for galleries and previews.
export function rigPreviewSvg(id, size = 260) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-230 -640 460 680" width="${size}" height="${Math.round((size * 680) / 460)}">${rigSvg(id)}</svg>`;
}

export const ACTIONS = {
  talk: "nói chuyện, tay ra hiệu",
  idle: "đứng yên",
  wave: "vẫy tay chào",
  walk_in: "đi vào cảnh từ bên trái",
  walk_out: "đi ra khỏi cảnh sang phải",
  run_in: "chạy vào cảnh",
  run_out: "chạy ra khỏi cảnh",
  jump: "nhảy lên vui mừng",
  dance: "nhảy múa",
  laugh: "cười lớn",
  cry: "khóc",
  think: "suy nghĩ, tay chống cằm",
  sleep: "ngủ",
  point: "chỉ tay về phía nhân vật khác",
  nod: "gật đầu",
  shake_head: "lắc đầu",
  shock: "giật mình hoảng hốt",
  hug: "chạy lại ôm nhân vật bên cạnh",
  fall: "ngã ngồi xuống",
};
