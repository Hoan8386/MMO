// Video styles: the animation know-how (distilled from the HyperFrames animation skill) handed to the
// planner as part of its single call, so each video is made differently depending on what it is about.
// The planner picks one style per video (plan.style); `guide` steers its pacing and frame choices, and
// `fx` drives the shared motion layer (fx.js): camera push, how scene photos enter and move, the
// photo grade and overlay, how icons pop in and how busy the sparkles are.
export const STYLES = {
  documentary: {
    label: "Phim tài liệu",
    guide: "calm and trustworthy, like a documentary: long scenes (7–10 s of narration), fades, photos given time with a slow push-in; facts in data frames, few gimmicks. History, science, culture, nature, true stories, serious topics.",
    fx: { push: 1.03, sparks: 0.5, iconEase: "power3.out", photo: { enter: "fade", dur: 1.0, zoom: [1.02, 1.12], filter: "saturate(0.92) contrast(1.05)" }, overlay: "vignette" },
  },
  news: {
    label: "Bản tin",
    guide: "a sharp news bulletin: brisk scenes (5–7 s of narration, still full sentences), wipes between items, headline and stat frames, photos snapping in with a wipe, steady camera. Current events, announcements, product launches, market news.",
    fx: { push: 1.012, sparks: 0.25, iconEase: "expo.out", photo: { enter: "wipe", dur: 0.45, zoom: [1.0, 1.05], filter: "contrast(1.04)" }, overlay: "none" },
  },
  kinetic: {
    label: "Chữ động, nhịp nhanh",
    guide: "fast kinetic energy for social video: fast scenes (4–6 s of narration in complete sentences, never fragments), punchy on-screen text, a strong hook first, keywords on every beat, photos punching out of a zoom, wipes on every new idea. Viral facts, lists, tips, motivation shorts, vertical formats.",
    fx: { push: 1.06, sparks: 1, iconEase: "back.out(2.4)", photo: { enter: "zoom", dur: 0.5, zoom: [1.18, 1.02], filter: "contrast(1.1) saturate(1.15)" }, overlay: "none" },
  },
  playful: {
    label: "Vui nhộn",
    guide: "bright and playful: bouncy pops, icons and characters acting, quiz or question frames, photos opening in a circle; warm, friendly pacing (5–8 s of narration). Fun facts, kids, animals, food, games, entertainment, everyday science.",
    fx: { push: 1.02, sparks: 1.2, iconEase: "elastic.out(1, 0.5)", photo: { enter: "iris", dur: 0.6, zoom: [1.04, 1.12], filter: "saturate(1.2)" }, overlay: "none" },
  },
  cinematic: {
    label: "Điện ảnh",
    guide: "cinematic and dramatic: letterbox bars, slow heavy camera moves, photos fading up from dark, moody grade, build tension towards a reveal; scenes of 6–10 s of narration, fades, wipes only at big turns. Mysteries, epic history, disasters, space, motivation, emotional true stories.",
    fx: { push: 1.05, sparks: 0.6, iconEase: "power2.out", photo: { enter: "fade", dur: 1.3, zoom: [1.1, 1.22], filter: "contrast(1.12) saturate(0.82) brightness(0.92)" }, overlay: "vignette", bars: true },
  },
  tech: {
    label: "Công nghệ",
    guide: "clean tech look: crisp, precise motion, photos cutting in with a flash, cool grade with scanlines, code/spec/chart frames, steady 5–7 s rhythm with wipes between features. Technology, AI, gadgets, gaming hardware, the future.",
    fx: { push: 1.025, sparks: 0.8, iconEase: "expo.out", photo: { enter: "flash", dur: 0.35, zoom: [1.02, 1.1], filter: "contrast(1.12) saturate(0.9) hue-rotate(-8deg)" }, overlay: "scanlines" },
  },
  storybook: {
    label: "Truyện kể",
    guide: "a warm storybook: gentle pacing (7–10 s of narration), characters and icons acting out the story, soft fades, photos with a warm paper-like grade, chapter frames between parts. Fables, family, love, life lessons, philosophy.",
    fx: { push: 1.02, sparks: 0.9, iconEase: "back.out(1.6)", photo: { enter: "fade", dur: 1.1, zoom: [1.03, 1.1], filter: "sepia(0.22) saturate(1.08)" }, overlay: "vignette" },
  },
};

export const STYLE_IDS = Object.keys(STYLES);

// When the plan names no style (mock plans, older plans): one that suits the topic.
const BY_TOPIC = {
  "news-events": "news", business: "news", finance: "news", technology: "tech", future: "tech", gaming: "tech",
  "fun-facts": "playful", animals: "playful", entertainment: "playful", nutrition: "playful", "everyday-science": "playful",
  storytelling: "storybook", "family-friends": "storybook", love: "storybook", philosophy: "storybook",
  mysteries: "cinematic", space: "cinematic", disasters: "cinematic", motivation: "kinetic", "self-development": "kinetic", habits: "kinetic",
};
export const styleFor = (plan, topicId) => (STYLES[plan?.style] ? plan.style : BY_TOPIC[topicId] || "documentary");

// The prompt section: what each style is for, so the AI picks one per video and plans accordingly.
export const styleGuide = `
VIDEO STYLE: in "style" pick the way this particular video should be made, from what the material is about and how it feels — not from the topic alone (a gaming news story is "news", a gaming fun-fact list is "kinetic"). Then plan every scene in that style: its pacing, frame choices, keywords and transitions. Styles:
${Object.entries(STYLES)
  .map(([id, s]) => `- ${id}: ${s.guide}`)
  .join("\n")}`;
