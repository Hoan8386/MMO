// Turns the plan plus real audio timings into an absolute timeline.
// Scene length always comes from the voiced audio, never from the AI's estimate.
export const LEAD = 0.35; // silence before the voice starts in each scene
export const TAIL = 0.5; // breathing room after the voice ends

const r3 = (x) => Math.round(x * 1000) / 1000;
const norm = (s) => String(s).normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// Flattens edge-tts words into normalized tokens that keep their start time.
function tokens(words) {
  const out = [];
  words.forEach((w, wi) => {
    for (const n of norm(w.w).split(" ").filter(Boolean)) out.push({ n, t: w.t, wi });
  });
  return out;
}

// Start time (scene-local, seconds) of each keyword, searched in spoken order; null when not found.
function keywordTimes(keywords, words) {
  const toks = tokens(words);
  let from = 0;
  return (keywords || []).map((kw) => {
    const want = norm(kw).split(" ").filter(Boolean);
    if (!want.length) return null;
    const match = (len) => {
      for (let i = from; i + len <= toks.length; i++) {
        if (want.slice(0, len).every((w, k) => toks[i + k].n === w)) return i;
      }
      return -1;
    };
    let i = match(want.length);
    if (i < 0) i = match(1); // fall back to the keyword's first word
    if (i < 0) return null;
    from = i + 1;
    return r3(LEAD + toks[i].t);
  });
}

// Groups spoken words into short caption lines: break on pauses or every ~7 words.
function captionChunks(words, sceneStart, sceneEnd) {
  const chunks = [];
  let cur = [];
  const flush = () => cur.length && chunks.push(cur) && (cur = []);
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (prev && (w.t - (prev.t + prev.d) > 0.35 || cur.length >= 7)) flush();
    cur.push({ w: w.w, t: r3(sceneStart + LEAD + w.t) });
  });
  flush();
  // A one- or two-word line flashes by unreadably; fold it into the previous line.
  for (let i = chunks.length - 1; i > 0; i--) {
    if (chunks[i].length < 3 && chunks[i - 1].length + chunks[i].length <= 10) chunks.splice(i - 1, 2, [...chunks[i - 1], ...chunks[i]]);
  }
  if (chunks.length > 1 && chunks[0].length < 3) chunks.splice(0, 2, [...chunks[0], ...chunks[1]]);
  return chunks.map((ws, i) => {
    const start = ws[0].t - 0.05;
    const next = chunks[i + 1]?.[0];
    const lastWord = words.find((w) => r3(sceneStart + LEAD + w.t) === ws.at(-1).t);
    const naturalEnd = ws.at(-1).t + (lastWord?.d ?? 0.4) + 0.35;
    const end = Math.min(next ? next.t - 0.05 - 0.02 : naturalEnd, sceneEnd - 0.1);
    return { start: r3(start), duration: r3(Math.max(0.3, end - start)), words: ws };
  });
}

export function buildTimeline(plan, vo, frames) {
  let t = 0;
  const warnings = [];
  const scenes = plan.scenes.map((sc) => {
    const frame = frames.get(sc.frame_id);
    const audio = vo[sc.id];
    const natural = LEAD + audio.duration + TAIL;
    const D = r3(Math.max(frame.duration.min, natural));
    if (D > frame.duration.max) warnings.push(`${sc.id}: lời thoại dài ${D}s, vượt mức tối đa ${frame.duration.max}s của ${sc.frame_id}`);
    const marks = keywordTimes(sc.keywords, audio.words);
    marks.forEach((m, i) => m == null && warnings.push(`${sc.id}: không tìm thấy từ khoá "${sc.keywords[i]}" trong lời đọc`));
    const start = r3(t);
    t += D;
    return {
      ...sc,
      frame,
      start,
      duration: D,
      audio: { start: r3(start + LEAD), duration: r3(audio.duration) },
      props: {
        ...sc.inputs,
        D,
        vo: LEAD,
        voEnd: r3(LEAD + audio.duration),
        marks,
        // Animation shots flap the speaker's mouth on every spoken word.
        ...(frame.engine === "animation" ? { words: audio.words.map((w) => ({ t: r3(LEAD + w.t), d: r3(w.d) })) } : {}),
      },
      captions: captionChunks(audio.words, start, start + D),
    };
  });
  return { scenes, total: r3(t), warnings };
}
