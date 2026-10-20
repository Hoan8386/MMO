// Splits a script into one scene per sentence. Very short fragments are merged
// with the next sentence and very long ones are cut at commas so each scene
// carries roughly one idea and fits a two-line subtitle.
const MIN_CHARS = 18;
const MAX_CHARS = 140;

export function splitScript(script) {
  const sentences = script
    .replace(/\r/g, "")
    .split(/\n+/)
    .flatMap((line) => line.match(/[^.!?…:]+[.!?…:]*["”»)]*\s*/g) || [])
    .map((s) => s.trim())
    .filter(Boolean);

  const pieces = sentences.flatMap((s) => (s.length > MAX_CHARS ? cutAtCommas(s) : [s]));

  const scenes = [];
  for (const piece of pieces) {
    const last = scenes[scenes.length - 1];
    if (last && last.length < MIN_CHARS && last.length + piece.length < MAX_CHARS) {
      scenes[scenes.length - 1] = `${last} ${piece}`;
    } else {
      scenes.push(piece);
    }
  }
  return scenes;
}

function cutAtCommas(sentence) {
  const parts = sentence.split(/(?<=,)\s+/);
  const out = [];
  let cur = "";
  for (const part of parts) {
    if (cur && cur.length + part.length > MAX_CHARS) {
      out.push(cur.trim());
      cur = "";
    }
    cur += `${part} `;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
