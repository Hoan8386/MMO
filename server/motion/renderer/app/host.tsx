// The one scene of the render project: it plays the component named by the current job.
import { makeScene2D } from "@motion-canvas/2d";
import { until } from "../../shared/time";
import { makeContext, type AnimComponent, type AnimJob } from "../../shared/context";

const modules = import.meta.glob<{ default: AnimComponent }>("../../components/*/*/index.tsx", { eager: true });
export const COMPONENTS: Record<string, AnimComponent> = Object.fromEntries(
  Object.entries(modules).map(([file, m]) => [file.split("/").at(-2)!, m.default]),
);

export default makeScene2D(function* (view) {
  const job = (window as any).__job as AnimJob;
  const comp = COMPONENTS[job.component];
  if (!comp) throw new Error(`Unknown component "${job.component}"`);
  // The clip lasts exactly job.duration. The wait runs in the component's own thread: Motion Canvas
  // cancels a thread's spawned tasks (clocks, orbits…) as soon as the thread ends.
  yield* comp.run(makeContext(view, job));
  yield* until(job.duration);
});
