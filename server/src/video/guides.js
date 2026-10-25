// Extra prompt sections for "unlimited" presets (billed per request, so long prompts cost nothing
// extra). Their other addition, story motion on every scene, lives in motion.js.

// Scene density: how many scenes to aim for.
export const richGuide = (targetSeconds, kind = "scenes") => `
RICH MODE (no token budget — make the video as engaging as you can):
- Aim for about ${Math.round(targetSeconds / 4)} ${kind} (one idea each, 3–6 s of narration), never two similar ${kind} in a row.
- Use the full variety of what is available; give every scene keywords that land its animation on the spoken words.
- Open with a hook, build curiosity, end with a clear takeaway.`;
