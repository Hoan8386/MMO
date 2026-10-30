// Timing helpers. Components schedule their steps at absolute times (cues) and drive
// continuous motion from one clock signal, so physics is a pure function of time.
import { createSignal, linear, useThread, waitFor, type SimpleSignal, type ThreadGenerator } from "@motion-canvas/core";

// Waits until the scene reaches time t (seconds). Never waits backwards.
export function* until(t: number): ThreadGenerator {
  const now = useThread().time();
  if (t > now) yield* waitFor(t - now);
}

// A signal that equals the scene time from 0 to `duration`; start it with `yield clockRun(...)`.
export function makeClock(): SimpleSignal<number> {
  return createSignal(0);
}
export function* runClock(clock: SimpleSignal<number>, duration: number): ThreadGenerator {
  clock(0);
  yield* clock(duration, duration, linear);
}

// Seeded random numbers (mulberry32): the same props always render the same frames.
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const smooth = (u: number) => {
  const x = clamp(u, 0, 1);
  return x * x * (3 - 2 * x);
};
