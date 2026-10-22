// Browser-side shot engine for the animation mode. The compiler inlines this file into every
// animation scene (anim-shot / anim-title / anim-end) and calls animShot(R, P, tl).
// Everything goes on the paused GSAP timeline `tl`, so a shot renders identically at any seek.
//
// P (from the compiler): D, vo, voEnd, words [{t, d}] (scene-local), cast [rig ids],
// speaker (index, -1 = narrator), actor (index or -1), action, emotion, camera,
// continued (same place as the previous shot), enter [bool per actor], pos [x], scale [s].
/* eslint-disable no-unused-vars */
function animShot(R, P, tl) {
  const EMOS = ["neutral", "happy", "sad", "angry", "scared", "surprised", "love"];
  const world = R.querySelector(".world");
  const fade = R.querySelector(".fade");
  const q = (el, s) => el.querySelector(s);
  // Each .actor is placed by the compiler (translate + scale attribute); its .mover child is what
  // the timeline moves, in the actor's local units (world distance / scale).
  const actors = [...R.querySelectorAll(".actor .mover")].map((el, i) => {
    const mouth = q(el, ".mouth-open");
    // The rig ships with the mouth squashed by a transform attribute (for static previews);
    // the timeline owns it from here.
    mouth.removeAttribute("transform");
    const A = {
      el, i,
      body: q(el, ".body"), head: q(el, ".head"),
      armL: q(el, ".armL"), armR: q(el, ".armR"), legL: q(el, ".legL"), legR: q(el, ".legR"),
      tail: q(el, ".tail"),
      eyesOpen: q(el, ".eyes-open"), eyesClosed: q(el, ".eyes-closed"), eyesLove: q(el, ".eyes-love"),
      faces: Object.fromEntries(EMOS.map((e) => [e, q(el, ".face-" + e)])),
      mouth, tears: q(el, ".tears"), zzz: q(el, ".zzz"), think: q(el, ".think"), sweat: q(el, ".sweat"),
      x: P.pos[i], s: P.scale[i],
    };
    gsap.set([A.armL, A.armR], { transformOrigin: "50% 6%" });
    gsap.set([A.legL, A.legR], { transformOrigin: "50% 4%" });
    gsap.set(A.head, { transformOrigin: "50% 92%" });
    gsap.set(A.body, { transformOrigin: "50% 100%" });
    gsap.set(A.mouth, { scaleY: 0.08, transformOrigin: "50% 0%" });
    gsap.set(A.eyesOpen, { transformOrigin: "50% 50%" });
    if (A.tail) gsap.set(A.tail, { transformOrigin: "0% 100%" });
    return A;
  });
  // fromTo that does not render its start state when the timeline is built (later tweens on
  // the same property would otherwise fight over it); starting states are set explicitly.
  const ft = (el, from, to, at) => el && tl.fromTo(el, from, Object.assign({}, to, { immediateRender: false }), Math.max(0, at));
  const D = P.D;
  const reps = (period, from = 0, to = D) => Math.max(1, Math.floor((to - from) / period));

  // ---------------------------------------------------------------- opening and camera
  if (P.continued) tl.set(fade, { opacity: 0 }, 0);
  else tl.fromTo(fade, { opacity: 1 }, { opacity: 0, duration: 0.4, ease: "power1.out" }, 0);

  const focus = actors[P.speaker >= 0 ? P.speaker : P.actor] || actors[0];
  // A zoomed world must still cover the visible window (x 960 ± vw/2, y 0–1080), or the
  // black outside the backdrop shows.
  const half = (P.vw || 1920) / 2;
  const clampX = (tx, k) => Math.min(960 - half, Math.max(960 + half - 1920 * k, tx));
  const clampY = (ty, k) => Math.min(0, Math.max(1080 - 1080 * k, ty));
  if (P.camera === "close" && focus) {
    const k0 = 1.45, k1 = 1.56;
    const hx = focus.x, hy = 860 - 400 * focus.s;
    tl.fromTo(world, { x: clampX(960 - k0 * hx, k0), y: clampY(520 - k0 * hy, k0), scale: k0, svgOrigin: "0 0" }, { x: clampX(960 - k1 * hx, k1), y: clampY(520 - k1 * hy, k1), scale: k1, svgOrigin: "0 0", duration: D, ease: "sine.inOut" }, 0);
  } else if (P.camera === "pan") {
    tl.fromTo(world, { x: 70, scale: 1.08, svgOrigin: "960 600" }, { x: -70, scale: 1.08, svgOrigin: "960 600", duration: D, ease: "sine.inOut" }, 0);
  } else {
    tl.fromTo(world, { x: 0, y: 0, scale: 1, svgOrigin: "960 600" }, { scale: 1.035, svgOrigin: "960 600", duration: D, ease: "none" }, 0);
  }
  // Clouds and the far layer drift slowly for depth.
  tl.fromTo(R.querySelectorAll(".bg-far"), { x: 0 }, { x: -24, duration: D, ease: "none" }, 0);

  // ---------------------------------------------------------------- face states
  function setFace(A, emo, eyes) {
    EMOS.forEach((e) => tl.set(A.faces[e], { opacity: e === emo ? 1 : 0 }, 0));
    tl.set(A.eyesOpen, { opacity: eyes === "open" ? 1 : 0 }, 0);
    tl.set(A.eyesClosed, { opacity: eyes === "closed" ? 1 : 0 }, 0);
    tl.set(A.eyesLove, { opacity: eyes === "love" ? 1 : 0 }, 0);
    [A.tears, A.zzz, A.think, A.sweat].forEach((el) => tl.set(el, { opacity: 0 }, 0));
  }
  const ACTION_FACE = { laugh: ["happy", "closed"], cry: ["sad", "open"], sleep: ["neutral", "closed"], shock: ["surprised", "open"], hug: ["love", "love"], jump: ["happy", "open"], dance: ["happy", "closed"], fall: ["scared", "open"], think: ["neutral", "open"] };
  actors.forEach((A) => {
    let emo = "neutral", eyes = "open";
    if ((P.group || A.i === P.actor) && ACTION_FACE[P.action]) [emo, eyes] = ACTION_FACE[P.action];
    const emoFor = P.speaker >= 0 ? P.speaker : P.actor;
    if (A.i === emoFor && P.emotion && P.emotion !== "neutral") {
      emo = P.emotion;
      if (emo === "love") eyes = "love";
    }
    setFace(A, emo, eyes);
  });

  // ---------------------------------------------------------------- idle life for everyone
  // A character performing an action owns its arms and head for the whole shot; idle sway on
  // them would take over again as soon as the action's own tween ends.
  const acting = (i) => (P.group || i === P.actor) && P.action && P.action !== "talk" && P.action !== "idle";
  const HEAD_ACTIONS = ["cry", "think", "sleep", "laugh", "nod", "shake_head"];
  actors.forEach((A, i) => {
    tl.set(A.el, { x: 0, y: 0 }, 0);
    tl.set([A.armL, A.armR, A.legL, A.legR, A.head], { rotation: 0, x: 0, y: 0 }, 0);
    tl.set(A.body, { rotation: 0, x: 0, y: 0, scaleX: 1, scaleY: 1 }, 0);
    // Breathing and a gentle sway, phase-shifted per actor so they never move in lockstep.
    const off = i * 0.37;
    ft(A.body, { scaleY: 1 }, { scaleY: 1.018, duration: 1.2, yoyo: true, repeat: reps(1.2, off) * 2 - 1, ease: "sine.inOut" }, off);
    if (!acting(i)) {
      ft(A.armL, { rotation: 0 }, { rotation: 4, duration: 1.6, yoyo: true, repeat: reps(1.6, off) * 2 - 1, ease: "sine.inOut" }, off);
      ft(A.armR, { rotation: 0 }, { rotation: -4, duration: 1.7, yoyo: true, repeat: reps(1.7, off) * 2 - 1, ease: "sine.inOut" }, off);
    }
    if (A.tail) ft(A.tail, { rotation: -6 }, { rotation: 6, duration: 0.9, yoyo: true, repeat: reps(0.9) * 2 - 1, ease: "sine.inOut" }, 0);
    // Blinks every ~3 s.
    for (let t = 1.1 + i * 0.8; t < D - 0.3; t += 2.9 + (i % 2) * 0.6) ft(A.eyesOpen, { scaleY: 1 }, { scaleY: 0.1, duration: 0.07, yoyo: true, repeat: 1 }, t);
    // New arrivals pop in (walk/run entrances are handled by the action).
    const walksIn = A.i === P.actor && /_in$/.test(P.action);
    if (P.enter[i] && !walksIn) ft(A.el, { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.45, ease: "back.out(1.8)" }, 0.1 + i * 0.12);
    else tl.set(A.el, { opacity: 1 }, 0);
  });

  // ---------------------------------------------------------------- speaking
  const S = actors[P.speaker];
  if (S) {
    for (const w of P.words) ft(S.mouth, { scaleY: 0.08 }, { scaleY: 1, duration: Math.max(0.05, Math.min(0.12, w.d / 2)), yoyo: true, repeat: 1, ease: "sine.inOut" }, w.t);
    // Small head bobs while talking; listeners turn toward the speaker.
    if (!(acting(S.i) && HEAD_ACTIONS.includes(P.action))) for (let t = P.vo; t < P.voEnd - 0.3; t += 0.7) ft(S.head, { rotation: 0 }, { rotation: (t * 10) % 2 > 1 ? 4 : -4, duration: 0.35, yoyo: true, repeat: 1, ease: "sine.inOut" }, t);
    actors.forEach((A) => A !== S && ft(A.head, { rotation: 0 }, { rotation: A.x < S.x ? 6 : -6, duration: 0.4, ease: "sine.out" }, P.vo));
    // Talking hands unless the action uses the arms.
    if (!P.action || P.action === "talk" || (P.actor !== P.speaker && P.actor >= 0)) {
      let k = 0;
      for (let t = P.vo + 0.2; t < P.voEnd - 0.5; t += 1.3, k++) {
        const arm = k % 2 ? S.armL : S.armR;
        ft(arm, { rotation: 0 }, { rotation: k % 2 ? 38 : -38, duration: 0.35, yoyo: true, repeat: 1, ease: "power1.inOut" }, t);
      }
    }
  }

  // ---------------------------------------------------------------- the action
  // One actor, or the whole cast for title and end cards (P.group).
  const targets = P.group ? actors : [actors[P.actor]].filter(Boolean);
  targets.forEach((A, k) => act(A, 0.25 + (P.group ? k * 0.15 : 0)));
  function act(A, t0) {
  function walk(Ac, from, dur, step) {
    const n = Math.max(1, Math.round(dur / step));
    ft(Ac.legL, { rotation: -24 }, { rotation: 24, duration: step, yoyo: true, repeat: n - 1, ease: "sine.inOut" }, from);
    ft(Ac.legR, { rotation: 24 }, { rotation: -24, duration: step, yoyo: true, repeat: n - 1, ease: "sine.inOut" }, from);
    ft(Ac.armL, { rotation: 20 }, { rotation: -20, duration: step, yoyo: true, repeat: n - 1, ease: "sine.inOut" }, from);
    ft(Ac.armR, { rotation: 20 }, { rotation: -20, duration: step, yoyo: true, repeat: n - 1, ease: "sine.inOut" }, from);
    ft(Ac.body, { y: 0 }, { y: -12, duration: step / 2, yoyo: true, repeat: n * 2 - 1, ease: "sine.inOut" }, from);
    tl.to([Ac.legL, Ac.legR, Ac.armL, Ac.armR], { rotation: 0, duration: 0.15 }, from + n * step);
  }
  // World x → offset of the mover in local units.
  const dx = (Ac, worldX) => (worldX - Ac.x) / Ac.s;
  const edgeL = -260, edgeR = 2180;
  switch (P.action) {
    case "walk_in":
    case "run_in": {
      const run = P.action === "run_in";
      const dur = Math.min(run ? 1.2 : 2.2, D * 0.6);
      ft(A.el, { x: dx(A, edgeL), opacity: 1 }, { x: 0, duration: dur, ease: "power1.out" }, 0);
      walk(A, 0, dur, run ? 0.18 : 0.32);
      break;
    }
    case "walk_out":
    case "run_out": {
      const run = P.action === "run_out";
      const start = Math.min(run ? 0.4 : 0.6, D * 0.3);
      const dur = Math.max(0.6, D - start - 0.1);
      ft(A.el, { x: 0 }, { x: dx(A, edgeR), duration: dur, ease: "power1.in" }, start);
      walk(A, start, dur, run ? 0.18 : 0.32);
      break;
    }
    case "wave": {
      ft(A.armR, { rotation: 0 }, { rotation: -150, duration: 0.35, ease: "back.out(2)" }, t0);
      ft(A.armR, { rotation: -150 }, { rotation: -118, duration: 0.25, yoyo: true, repeat: reps(0.5, t0 + 0.35, D - 0.5) * 2 - 1, ease: "sine.inOut" }, t0 + 0.35);
      break;
    }
    case "jump":
    case "dance": {
      const dance = P.action === "dance";
      const n = reps(dance ? 0.5 : 0.7, t0, D - 0.3);
      ft(A.armL, { rotation: 0 }, { rotation: 150, duration: 0.25 }, t0);
      ft(A.armR, { rotation: 0 }, { rotation: -150, duration: 0.25 }, t0);
      if (dance) {
        ft(A.body, { rotation: -8 }, { rotation: 8, duration: 0.25, yoyo: true, repeat: n * 2 - 1, ease: "sine.inOut" }, t0);
        ft(A.legL, { rotation: 0 }, { rotation: 30, duration: 0.25, yoyo: true, repeat: n * 2 - 1, ease: "sine.inOut" }, t0);
        ft(A.armL, { rotation: 150 }, { rotation: 110, duration: 0.25, yoyo: true, repeat: n * 2 - 1 }, t0 + 0.25);
      } else {
        for (let k = 0; k < n; k++) {
          const t = t0 + 0.2 + k * 0.7;
          ft(A.body, { scaleY: 1, y: 0 }, { scaleY: 0.86, duration: 0.1 }, t);
          ft(A.body, { scaleY: 0.86 }, { scaleY: 1.06, y: -140, duration: 0.28, ease: "power2.out" }, t + 0.1);
          ft(A.body, { y: -140, scaleY: 1.06 }, { y: 0, scaleY: 1, duration: 0.28, ease: "power2.in" }, t + 0.38);
        }
      }
      break;
    }
    case "laugh": {
      ft(A.head, { rotation: -6 }, { rotation: 6, duration: 0.12, yoyo: true, repeat: reps(0.24, t0, D - 0.3) * 2 - 1 }, t0);
      ft(A.body, { y: 0 }, { y: -8, duration: 0.12, yoyo: true, repeat: reps(0.24, t0, D - 0.3) * 2 - 1 }, t0);
      // Hands on the belly (negative turns the left arm inward, positive the right).
      ft(A.armL, { rotation: 0 }, { rotation: -32, duration: 0.3 }, t0);
      ft(A.armR, { rotation: 0 }, { rotation: 32, duration: 0.3 }, t0);
      break;
    }
    case "cry": {
      tl.set(A.tears, { opacity: 1 }, t0);
      A.tears.querySelectorAll(".tear").forEach((tear, k) => ft(tear, { y: 0, opacity: 1 }, { y: 70, opacity: 0, duration: 0.7, repeat: reps(0.7, t0 + k * 0.3, D) - 1, ease: "power1.in" }, t0 + k * 0.3));
      ft(A.body, { y: 0 }, { y: 6, duration: 0.15, yoyo: true, repeat: reps(0.3, t0, D) * 2 - 1 }, t0);
      // Fists up to the eyes.
      ft(A.armL, { rotation: 0 }, { rotation: -150, duration: 0.4 }, t0);
      ft(A.armR, { rotation: 0 }, { rotation: 150, duration: 0.4 }, t0);
      ft(A.head, { rotation: 0 }, { rotation: 8, duration: 0.5 }, t0);
      break;
    }
    case "think": {
      ft(A.armR, { rotation: 0 }, { rotation: 125, duration: 0.5, ease: "power2.out" }, t0);
      ft(A.head, { rotation: 0 }, { rotation: -8, duration: 0.5 }, t0);
      ft(A.think, { opacity: 0, scale: 0.4, transformOrigin: "0% 100%" }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, t0 + 0.3);
      ft(A.think, { y: 0 }, { y: -10, duration: 0.8, yoyo: true, repeat: reps(1.6, t0 + 0.8, D) * 2 - 1, ease: "sine.inOut" }, t0 + 0.8);
      break;
    }
    case "sleep": {
      ft(A.head, { rotation: 0 }, { rotation: 14, duration: 0.8 }, t0);
      tl.set(A.zzz, { opacity: 1 }, t0);
      ft(A.zzz, { y: 30, opacity: 0 }, { y: -30, opacity: 1, duration: 1.4, repeat: reps(1.4, t0, D) - 1, ease: "sine.out" }, t0);
      break;
    }
    case "point": {
      const other = actors.find((o) => o !== A) || A;
      const right = other.x >= A.x;
      ft(right ? A.armR : A.armL, { rotation: 0 }, { rotation: right ? -88 : 88, duration: 0.35, ease: "back.out(2)" }, t0);
      ft(right ? A.armR : A.armL, { rotation: right ? -88 : 88 }, { rotation: right ? -80 : 80, duration: 0.3, yoyo: true, repeat: 3 }, t0 + 0.4);
      break;
    }
    case "nod": {
      ft(A.head, { y: 0 }, { y: 12, duration: 0.18, yoyo: true, repeat: 5, ease: "sine.inOut" }, t0);
      break;
    }
    case "shake_head": {
      ft(A.head, { rotation: -10 }, { rotation: 10, duration: 0.18, yoyo: true, repeat: 5, ease: "sine.inOut" }, t0);
      break;
    }
    case "shock": {
      tl.set(A.sweat, { opacity: 1 }, t0);
      ft(A.body, { y: 0 }, { y: -70, duration: 0.18, yoyo: true, repeat: 1, ease: "power2.out" }, t0);
      ft(A.el, { x: 0 }, { x: (A.x > 960 ? 50 : -50) / A.s, duration: 0.3, ease: "power2.out" }, t0);
      ft(A.armL, { rotation: 0 }, { rotation: 160, duration: 0.2 }, t0);
      ft(A.armR, { rotation: 0 }, { rotation: -160, duration: 0.2 }, t0);
      ft(A.body, { x: -4 }, { x: 4, duration: 0.06, yoyo: true, repeat: reps(0.12, t0 + 0.4, D) * 2 - 1 }, t0 + 0.4);
      break;
    }
    case "hug": {
      const other = actors.filter((o) => o !== A).sort((a, b) => Math.abs(a.x - A.x) - Math.abs(b.x - A.x))[0];
      if (other) {
        const to = other.x + (other.x > A.x ? -170 * A.s : 170 * A.s);
        ft(A.el, { x: 0 }, { x: dx(A, to), duration: 0.8, ease: "power2.inOut" }, t0);
        walk(A, t0, 0.8, 0.2);
        ft(A.armL, { rotation: 0 }, { rotation: other.x > A.x ? -60 : 60, duration: 0.3 }, t0 + 0.8);
        ft(A.armR, { rotation: 0 }, { rotation: other.x > A.x ? -60 : 60, duration: 0.3 }, t0 + 0.8);
        ft(A.body, { rotation: 0 }, { rotation: other.x > A.x ? 6 : -6, duration: 0.3 }, t0 + 0.8);
      }
      break;
    }
    case "fall": {
      ft(A.body, { rotation: 0, y: 0 }, { rotation: -10, y: 70, duration: 0.35, ease: "bounce.out" }, t0);
      ft(A.legL, { rotation: 0 }, { rotation: 70, duration: 0.35 }, t0);
      ft(A.legR, { rotation: 0 }, { rotation: 60, duration: 0.35 }, t0);
      ft(A.armL, { rotation: 0 }, { rotation: 50, duration: 0.3 }, t0);
      ft(A.armR, { rotation: 0 }, { rotation: -50, duration: 0.3 }, t0);
      tl.set(A.sweat, { opacity: 1 }, t0 + 0.3);
      break;
    }
    default:
      break;
  }
  }
}
