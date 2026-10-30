// Entrance and exit moves shared by components, so every clip enters and leaves the same way.
import type { Line, Node } from "@motion-canvas/2d";
import { all, easeInCubic, easeOutBack, easeOutCubic, type ThreadGenerator } from "@motion-canvas/core";

export function* popIn(node: Node, d = 0.45): ThreadGenerator {
  node.opacity(0).scale(0.6);
  yield* all(node.opacity(1, d * 0.6), node.scale(1, d, easeOutBack));
}

export function* fadeUp(node: Node, d = 0.5, dist = 30): ThreadGenerator {
  const y = node.y();
  node.opacity(0).y(y + dist);
  yield* all(node.opacity(1, d), node.y(y, d, easeOutCubic));
}

// Draws a line from its start like a pen.
export function* drawOn(line: Line, d = 0.7): ThreadGenerator {
  line.end(0);
  yield* line.end(1, d, easeOutCubic);
}

export function* fadeOut(node: Node, d = 0.4): ThreadGenerator {
  yield* node.opacity(0, d, easeInCubic);
}
