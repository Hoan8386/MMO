/**
 * HyperFrames Template Animation Library
 * =======================================
 * Deterministic, seek-safe GSAP animation functions.
 * All animations use gsap.fromTo() for seek-safety.
 * No Math.random(), no Date.now(), no repeat: -1, no CSS transition.
 *
 * Usage inside <template> <script>:
 *   Inline this file or reference shared patterns.
 *   Each function takes (tl, target, startTime, duration, opts?)
 */

const HF_ANIMATIONS = {

  /* =========================================================
   * ENTRANCE ANIMATIONS
   * ========================================================= */

  'fade-in': function(tl, target, start, dur, opts) {
    tl.fromTo(target,
      { opacity: 0 },
      { opacity: 1, duration: dur, ease: opts?.ease || 'power2.out' },
      start
    );
  },

  'slide-up': function(tl, target, start, dur, opts) {
    const dist = opts?.distance || 60;
    tl.fromTo(target,
      { opacity: 0, y: dist },
      { opacity: 1, y: 0, duration: dur, ease: opts?.ease || 'power3.out' },
      start
    );
  },

  'slide-down': function(tl, target, start, dur, opts) {
    const dist = opts?.distance || 60;
    tl.fromTo(target,
      { opacity: 0, y: -dist },
      { opacity: 1, y: 0, duration: dur, ease: opts?.ease || 'power3.out' },
      start
    );
  },

  'slide-left': function(tl, target, start, dur, opts) {
    const dist = opts?.distance || 80;
    tl.fromTo(target,
      { opacity: 0, x: dist },
      { opacity: 1, x: 0, duration: dur, ease: opts?.ease || 'power3.out' },
      start
    );
  },

  'slide-right': function(tl, target, start, dur, opts) {
    const dist = opts?.distance || 80;
    tl.fromTo(target,
      { opacity: 0, x: -dist },
      { opacity: 1, x: 0, duration: dur, ease: opts?.ease || 'power3.out' },
      start
    );
  },

  'scale-in': function(tl, target, start, dur, opts) {
    tl.fromTo(target,
      { opacity: 0, scale: 0 },
      { opacity: 1, scale: 1, duration: dur, ease: opts?.ease || 'back.out(1.7)' },
      start
    );
  },

  'scale-out': function(tl, target, start, dur, opts) {
    tl.fromTo(target,
      { opacity: 1, scale: 1 },
      { opacity: 0, scale: 0.5, duration: dur, ease: opts?.ease || 'power2.in' },
      start
    );
  },

  'zoom-in': function(tl, target, start, dur, opts) {
    tl.fromTo(target,
      { opacity: 0, scale: 0.5 },
      { opacity: 1, scale: 1, duration: dur, ease: opts?.ease || 'power3.out' },
      start
    );
  },

  'zoom-out': function(tl, target, start, dur, opts) {
    tl.fromTo(target,
      { opacity: 1, scale: 1 },
      { opacity: 0, scale: 1.5, duration: dur, ease: opts?.ease || 'power3.in' },
      start
    );
  },

  'spring-pop': function(tl, target, start, dur, opts) {
    tl.fromTo(target,
      { opacity: 0, scale: 0 },
      { opacity: 1, scale: 1, duration: dur, ease: opts?.ease || 'elastic.out(1, 0.5)' },
      start
    );
  },

  'rotate-in': function(tl, target, start, dur, opts) {
    const deg = opts?.rotation || 15;
    tl.fromTo(target,
      { opacity: 0, rotation: deg },
      { opacity: 1, rotation: 0, duration: dur, ease: opts?.ease || 'power3.out' },
      start
    );
  },

  /* =========================================================
   * EXIT ANIMATIONS
   * ========================================================= */

  'fade-out': function(tl, target, start, dur, opts) {
    tl.fromTo(target,
      { opacity: 1 },
      { opacity: 0, duration: dur, ease: opts?.ease || 'power2.in' },
      start
    );
  },

  'exit-up': function(tl, target, start, dur, opts) {
    tl.fromTo(target,
      { opacity: 1, y: 0 },
      { opacity: 0, y: -(opts?.distance || 40), duration: dur, ease: opts?.ease || 'power3.in' },
      start
    );
  },

  'exit-down': function(tl, target, start, dur, opts) {
    tl.fromTo(target,
      { opacity: 1, y: 0 },
      { opacity: 0, y: opts?.distance || 40, duration: dur, ease: opts?.ease || 'power3.in' },
      start
    );
  },

  /* =========================================================
   * REVEAL ANIMATIONS
   * ========================================================= */

  'reveal-up': function(tl, target, start, dur, opts) {
    tl.fromTo(target,
      { clipPath: 'inset(100% 0 0 0)' },
      { clipPath: 'inset(0% 0 0 0)', duration: dur, ease: opts?.ease || 'power3.inOut' },
      start
    );
  },

  'reveal-left': function(tl, target, start, dur, opts) {
    tl.fromTo(target,
      { clipPath: 'inset(0 100% 0 0)' },
      { clipPath: 'inset(0 0% 0 0)', duration: dur, ease: opts?.ease || 'power3.inOut' },
      start
    );
  },

  'wipe-right': function(tl, target, start, dur, opts) {
    tl.fromTo(target,
      { clipPath: 'inset(0 100% 0 0)' },
      { clipPath: 'inset(0 0% 0 0)', duration: dur, ease: opts?.ease || 'power2.out' },
      start
    );
  },

  'mask-reveal': function(tl, target, start, dur, opts) {
    const dir = opts?.direction || 'center';
    const from = dir === 'center'
      ? 'circle(0% at 50% 50%)'
      : 'inset(50% 50% 50% 50%)';
    const to = dir === 'center'
      ? 'circle(75% at 50% 50%)'
      : 'inset(0% 0% 0% 0%)';
    tl.fromTo(target,
      { clipPath: from },
      { clipPath: to, duration: dur, ease: opts?.ease || 'power3.out' },
      start
    );
  },

  /* =========================================================
   * DATA ANIMATIONS
   * ========================================================= */

  'count-up': function(tl, target, start, dur, opts) {
    const from = opts?.from ?? 0;
    const to = opts?.to ?? 100;
    const prefix = opts?.prefix || '';
    const suffix = opts?.suffix || '';
    const decimals = opts?.decimals || 0;
    const obj = { val: from };
    tl.fromTo(obj,
      { val: from },
      {
        val: to,
        duration: dur,
        ease: opts?.ease || 'power2.out',
        onUpdate: function() {
          const v = decimals > 0
            ? obj.val.toFixed(decimals)
            : Math.round(obj.val).toLocaleString();
          if (typeof target === 'string') {
            const el = document.querySelector(target);
            if (el) el.textContent = prefix + v + suffix;
          } else {
            target.textContent = prefix + v + suffix;
          }
        }
      },
      start
    );
  },

  'bar-grow': function(tl, target, start, dur, opts) {
    tl.fromTo(target,
      { scaleY: 0 },
      { scaleY: 1, duration: dur, ease: opts?.ease || 'power3.out', transformOrigin: 'bottom center' },
      start
    );
  },

  'line-draw': function(tl, target, start, dur, opts) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    const length = el.getTotalLength ? el.getTotalLength() : 1000;
    tl.fromTo(el,
      { strokeDasharray: length, strokeDashoffset: length },
      { strokeDashoffset: 0, duration: dur, ease: opts?.ease || 'power2.inOut' },
      start
    );
  },

  'ring-fill': function(tl, target, start, dur, opts) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    const circumference = opts?.circumference || (2 * Math.PI * (opts?.radius || 80));
    const pct = opts?.percentage ?? 75;
    const offset = circumference * (1 - pct / 100);
    tl.fromTo(el,
      { strokeDasharray: circumference, strokeDashoffset: circumference },
      { strokeDashoffset: offset, duration: dur, ease: opts?.ease || 'power3.out' },
      start
    );
  },

  /* =========================================================
   * STAGGER ANIMATIONS
   * ========================================================= */

  'card-stagger': function(tl, targets, start, dur, opts) {
    const stag = opts?.stagger || 0.12;
    tl.fromTo(targets,
      { opacity: 0, y: opts?.distance || 40, scale: opts?.fromScale || 0.95 },
      { opacity: 1, y: 0, scale: 1, duration: dur, ease: opts?.ease || 'power3.out', stagger: stag },
      start
    );
  },

  'text-stagger': function(tl, targets, start, dur, opts) {
    const stag = opts?.stagger || 0.08;
    tl.fromTo(targets,
      { opacity: 0, y: opts?.distance || 20 },
      { opacity: 1, y: 0, duration: dur, ease: opts?.ease || 'power2.out', stagger: stag },
      start
    );
  },

  'node-reveal': function(tl, targets, start, dur, opts) {
    const stag = opts?.stagger || 0.1;
    tl.fromTo(targets,
      { opacity: 0, scale: 0 },
      { opacity: 1, scale: 1, duration: dur, ease: opts?.ease || 'back.out(1.4)', stagger: stag },
      start
    );
  },

  'timeline-reveal': function(tl, targets, start, dur, opts) {
    const stag = opts?.stagger || 0.2;
    tl.fromTo(targets,
      { opacity: 0, x: -(opts?.distance || 30) },
      { opacity: 1, x: 0, duration: dur, ease: opts?.ease || 'power3.out', stagger: stag },
      start
    );
  },

  /* =========================================================
   * TEXT ANIMATIONS
   * ========================================================= */

  'typewriter': function(tl, target, start, dur, opts) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    const text = opts?.text || el.textContent || '';
    const len = text.length;
    el.textContent = '';
    const obj = { progress: 0 };
    tl.fromTo(obj,
      { progress: 0 },
      {
        progress: 1,
        duration: dur,
        ease: opts?.ease || 'none',
        onUpdate: function() {
          const chars = Math.floor(obj.progress * len);
          el.textContent = text.substring(0, chars);
        }
      },
      start
    );
  },

  /* =========================================================
   * AMBIENT ANIMATIONS (finite)
   * ========================================================= */

  'pulse': function(tl, target, start, dur, opts) {
    const count = opts?.count || 3;
    tl.fromTo(target,
      { scale: 1 },
      { scale: opts?.scaleTo || 1.05, duration: dur / (count * 2), ease: 'sine.inOut', repeat: count * 2 - 1, yoyo: true },
      start
    );
  },

  'glow': function(tl, target, start, dur, opts) {
    const color = opts?.color || 'rgba(112, 225, 232, 0.4)';
    const count = opts?.count || 2;
    tl.fromTo(target,
      { boxShadow: `0 0 0px ${color}` },
      { boxShadow: `0 0 ${opts?.spread || 40}px ${color}`, duration: dur / (count * 2), ease: 'sine.inOut', repeat: count * 2 - 1, yoyo: true },
      start
    );
  },

  'parallax-shift': function(tl, target, start, dur, opts) {
    const dist = opts?.distance || 30;
    tl.fromTo(target,
      { y: -dist },
      { y: dist, duration: dur, ease: opts?.ease || 'none' },
      start
    );
  },

  /* =========================================================
   * SVG / PATH ANIMATIONS
   * ========================================================= */

  'path-flow': function(tl, target, start, dur, opts) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    const length = el.getTotalLength ? el.getTotalLength() : 500;
    const dashLen = opts?.dashLength || length * 0.3;
    tl.fromTo(el,
      { strokeDasharray: `${dashLen} ${length}`, strokeDashoffset: length + dashLen },
      { strokeDashoffset: -(length + dashLen), duration: dur, ease: opts?.ease || 'none' },
      start
    );
  },

  /* =========================================================
   * UTILITY: Apply animation by ID
   * ========================================================= */

  apply: function(tl, target, animId, start, dur, opts) {
    const fn = HF_ANIMATIONS[animId];
    if (fn && typeof fn === 'function') {
      fn(tl, target, start, dur, opts);
    } else {
      console.warn('[HF_ANIMATIONS] Unknown animation:', animId);
    }
  }
};

// Export for Node.js compiler usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = HF_ANIMATIONS;
}
