// A node whose pixels are computed by a function (interference patterns, field intensities, fractals,
// heat maps). The function fills an RGBA buffer of res × (res·h/w) pixels every frame it is drawn;
// the buffer is scaled up to w × h with smoothing. Keep res modest (≤ 480): it runs in JavaScript.
// Anything the function reads (a clock signal…) is read while drawing, so the picture follows time.
import { Node, type NodeProps } from "@motion-canvas/2d";

export type Paint = (data: Uint8ClampedArray, cols: number, rows: number) => void;

export interface RasterProps extends NodeProps {
  w: number;
  h: number;
  res?: number;
  paint: Paint;
  smoothing?: boolean;
  // Paint once and reuse (static pictures: planetary rings, a fixed field map).
  once?: boolean;
}

export class Raster extends Node {
  private readonly w: number;
  private readonly h: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly paint: Paint;
  private readonly smoothing: boolean;
  private readonly once: boolean;
  private painted = false;
  private canvas: HTMLCanvasElement | null = null;

  public constructor(props: RasterProps) {
    super(props);
    this.w = props.w;
    this.h = props.h;
    this.cols = Math.max(2, Math.round(props.res ?? 320));
    this.rows = Math.max(2, Math.round((this.cols * props.h) / props.w));
    this.paint = props.paint;
    this.smoothing = props.smoothing ?? true;
    this.once = props.once ?? false;
  }

  protected override draw(context: CanvasRenderingContext2D) {
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.canvas.width = this.cols;
      this.canvas.height = this.rows;
    }
    if (!this.once || !this.painted) {
      const g = this.canvas.getContext("2d")!;
      const img = g.createImageData(this.cols, this.rows);
      this.paint(img.data, this.cols, this.rows);
      g.putImageData(img, 0, 0);
      this.painted = true;
    }
    context.save();
    context.imageSmoothingEnabled = this.smoothing;
    context.imageSmoothingQuality = "high";
    context.drawImage(this.canvas, -this.w / 2, -this.h / 2, this.w, this.h);
    context.restore();
    super.draw(context);
  }
}

// A node that draws itself with the canvas 2D API: thousands of particles, accretion disks, glows
// with additive blending ("lighter") — far faster than one Motion Canvas node per particle.
// paint(g) draws in the node's local coordinates (origin at the node); it may read signals, so the
// drawing follows time. The node does not know its own extent: keep drawings inside the safe area.
export class Draw extends Node {
  private readonly painter: (g: CanvasRenderingContext2D) => void;

  public constructor(props: NodeProps & { paint: (g: CanvasRenderingContext2D) => void }) {
    super(props);
    this.painter = props.paint;
  }

  protected override draw(context: CanvasRenderingContext2D) {
    context.save();
    this.painter(context);
    context.restore();
    super.draw(context);
  }
}

// "#RRGGBB" → [r, g, b].
export const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
