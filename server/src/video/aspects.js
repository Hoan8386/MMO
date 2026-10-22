// Output formats a project can target. Frame templates are laid out on a "design canvas"
// (1920×1080 px for 16:9); for other formats each scene is laid out on a canvas of the
// format's shape and scaled by `scale` into the stage, the output area left free of the
// platform's on-screen buttons. Captions sit in the stage's bottom band (the 270–280 design
// px every template keeps empty), so they never cover the scene.
export const ASPECTS = {
  "16:9": {
    label: "Ngang 16:9",
    platforms: "YouTube, Facebook, website",
    width: 1920,
    height: 1080,
    scale: 1,
    stage: { top: 0, bottom: 0 },
    caption: { font: 46, maxWidth: 1560 },
  },
  "9:16": {
    label: "Dọc 9:16",
    platforms: "TikTok, Reels, Shorts",
    width: 1080,
    height: 1920,
    scale: 0.8,
    stage: { top: 150, bottom: 270 },
    caption: { font: 44, maxWidth: 960 },
  },
  "1:1": {
    label: "Vuông 1:1",
    platforms: "Instagram, Facebook feed",
    width: 1080,
    height: 1080,
    scale: 0.72,
    stage: { top: 0, bottom: 0 },
    caption: { font: 36, maxWidth: 960 },
  },
  "4:5": {
    label: "Dọc 4:5",
    platforms: "Instagram, Facebook feed",
    width: 1080,
    height: 1350,
    scale: 0.72,
    stage: { top: 0, bottom: 0 },
    caption: { font: 38, maxWidth: 960 },
  },
};

export const DEFAULT_ASPECT = "16:9";

export const aspectOf = (ratio) => ASPECTS[ratio] || ASPECTS[DEFAULT_ASPECT];

// File-name friendly key: "9:16" → "9x16".
export const aspectKey = (ratio) => ratio.replace(":", "x");

// Geometry the compiler needs: the scene design canvas, where it sits, and the
// whole frame in design pixels (for the background, which fills the full output).
export function layoutFor(ratio, width, height) {
  const a = aspectOf(ratio);
  const W = width || a.width;
  const H = height || a.height;
  const k = a.scale;
  const stageH = H - a.stage.top - a.stage.bottom;
  return {
    W,
    H,
    scale: k,
    scene: { w: Math.round(W / k), h: Math.round(stageH / k), top: a.stage.top },
    full: { w: Math.round(W / k), h: Math.round(H / k) },
    caption: { ...a.caption, bottom: a.stage.bottom + Math.round(70 * k) },
  };
}
