// Basic test of every component: render its example (and the same props at 9:16 and 1:1),
// then check the result. Passing components move from "dev" to "tested" in meta.json
// ("ready" is set by hand after a human has watched the preview). Writes previews/<id>.png/.webm.
//
//   npm --prefix server run anim:test -- [id…] [--no-aspects]
//
// Checks: no runtime/TypeScript error in the page, exact frame count for duration × fps,
// visible content inside the safe area (nothing cut at the frame edge) in every format,
// and the clip is not empty.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { loadRegistry, listComponents, updateMeta, ROOT, PREVIEWS_DIR } from "../registry/registry.mjs";
import { renderJob, closeBrowser, encode } from "../renderer/render.mjs";

const args = process.argv.slice(2);
const ids = args.filter((a) => !a.startsWith("--"));
const FORMATS = args.includes("--no-aspects") ? [[1920, 1080]] : [[1920, 1080], [1080, 1920], [1080, 1080]];
const SAFE = { top: 60, right: 80, bottom: 60, left: 80 };

// TypeScript first: a type error fails every component.
const tsc = spawnSync(process.execPath, [path.join(path.dirname(createRequire(import.meta.url).resolve("typescript/package.json")), "bin", "tsc"), "-p", "tsconfig.json"], { cwd: ROOT, encoding: "utf8" });
if (tsc.status !== 0) {
  console.log(`LỖI TypeScript:\n${tsc.stdout}${tsc.stderr}`);
  process.exit(1);
}

const { problems } = loadRegistry({ fresh: true });
for (const p of problems) console.log(`registry: ${p}`);
const list = listComponents().filter((c) => !ids.length || ids.includes(c.id));
await fsp.mkdir(PREVIEWS_DIR, { recursive: true });
let failed = 0;
for (const c of list) {
  const errors = [];
  for (const [width, height] of FORMATS) {
    const out = path.join(ROOT, ".cache", "tests", c.id, `${width}x${height}`);
    let m;
    try {
      m = await renderJob({ component: c.id, props: c.example.props, duration: c.example.duration, cues: c.example.cues, width, height, fps: 30, safe: SAFE }, out);
    } catch (e) {
      errors.push(`${width}x${height}: ${e.message}`);
      continue;
    }
    const at = `${width}x${height}`;
    if (!m.ok) errors.push(`${at}: ${m.errors.join(" | ")}`);
    if (m.frames !== m.expectedFrames) errors.push(`${at}: ${m.frames} khung, cần ${m.expectedFrames}`);
    if (!m.contentBox) errors.push(`${at}: clip trống`);
    else {
      // 8 px grid of the probe + a little slack for glows.
      const [x0, y0, x1, y1] = m.contentBox, slack = 24;
      if (x0 < SAFE.left - slack || y0 < SAFE.top - slack || x1 > width - SAFE.right + slack || y1 > height - SAFE.bottom + slack)
        errors.push(`${at}: nội dung ra ngoài vùng an toàn (${m.contentBox.join(",")})`);
    }
    if (width === 1920) {
      // Previews are shown on the default theme background, as they would look in a video.
      const pv = path.join(ROOT, ".cache", "tests", c.id, "preview");
      await renderJob({ component: c.id, props: c.example.props, duration: c.example.duration, cues: c.example.cues, width, height, fps: 30, safe: SAFE, background: "#0B1730" }, pv);
      const files = fs.readdirSync(pv).filter((f) => f.startsWith("frame-")).sort();
      await fsp.copyFile(path.join(pv, files[Math.floor(files.length * 0.85)]), path.join(PREVIEWS_DIR, `${c.id}.png`));
      await encode(pv, 30, path.join(PREVIEWS_DIR, `${c.id}.webm`));
    }
    console.log(`  ${c.id} ${at}: ${m.frames} khung, ${(m.renderMs / 1000).toFixed(1)}s`);
  }
  if (errors.length) {
    failed++;
    console.log(`✗ ${c.id}\n    ${errors.join("\n    ")}`);
    if (c.status !== "dev") updateMeta(c.id, { status: "dev" });
  } else {
    console.log(`✓ ${c.id}`);
    if (c.status === "dev") updateMeta(c.id, { status: "tested" });
  }
}
await closeBrowser();
console.log(`${list.length - failed}/${list.length} component đạt`);
process.exitCode = failed ? 1 : 0;
