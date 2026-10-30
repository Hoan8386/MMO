// Headless render page. renderer/render.mjs opens it in Chrome, calls window.__render(job)
// and receives every frame through window.__frame (exposed by Puppeteer).
import { bootstrap, MetaFile, ObjectMetaField, Renderer, RendererResult, ValueDispatcher, Vector2, type Exporter, type Project } from "@motion-canvas/core";
import host, { COMPONENTS } from "./host";

declare global {
  interface Window {
    __job: any;
    __frame(frame: number, png: string, box: number[] | null): Promise<void>;
    __render(job: any): Promise<{ ok: boolean; frames: number; errors: string[] }>;
    __components: string[];
  }
}

// Bounding box of the visible (non-transparent) pixels, in frame pixels, from a 1/8 size copy.
const probe = document.createElement("canvas");
function contentBox(canvas: HTMLCanvasElement): number[] | null {
  const w = (probe.width = Math.ceil(canvas.width / 8));
  const h = (probe.height = Math.ceil(canvas.height / 8));
  const g = probe.getContext("2d", { willReadFrequently: true })!;
  g.clearRect(0, 0, w, h);
  g.drawImage(canvas, 0, 0, w, h);
  const a = g.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (a[(y * w + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : [x0 * 8, y0 * 8, (x1 + 1) * 8, (y1 + 1) * 8];
}

class FrameExporter implements Exporter {
  static readonly id = "animlib-frames";
  static readonly displayName = "Frames to the render CLI";
  static meta() {
    return new ObjectMetaField("frames", {});
  }
  static async create() {
    return new FrameExporter();
  }
  async handleFrame(canvas: HTMLCanvasElement, frame: number) {
    await window.__frame(frame, canvas.toDataURL("image/png"), contentBox(canvas));
  }
}

const anyHost = host as any;
anyHost.name = "host";
anyHost.onReplaced = new ValueDispatcher(anyHost.config);
const project: Project = bootstrap(
  "animlib",
  { core: "3.17.2", two: "3.17.2", ui: null, vitePlugin: null } as any,
  [{ name: "animlib-frames", exporters: () => [FrameExporter] } as any],
  { scenes: [host] } as any,
  new MetaFile("project"),
  new MetaFile("settings"),
);

window.__components = Object.keys(COMPONENTS);
window.__render = async (job) => {
  window.__job = job;
  await document.fonts.load('600 40px "Be Vietnam Pro"');
  const errors: string[] = [];
  project.logger.onLogged.subscribe((p: any) => {
    if (p.level === "error") errors.push(String(p.message ?? p));
  });
  let frames = 0;
  const renderer = new Renderer(project);
  renderer.onFrameChanged.subscribe(() => frames++);
  const done = new Promise<RendererResult>((resolve) => renderer.onFinished.subscribe(resolve));
  await renderer.render({
    name: "animlib",
    range: [0, job.duration],
    fps: job.fps,
    size: new Vector2(job.width, job.height),
    resolutionScale: 1,
    colorSpace: "srgb",
    background: job.background ?? null,
    exporter: { name: FrameExporter.id, options: {} },
  } as any);
  const result = await done;
  return { ok: result === RendererResult.Success && !errors.length, frames, errors };
};
