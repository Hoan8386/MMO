/**
 * HyperFrames Template Utilities
 * ================================
 * Data injection, fallbacks, and common helpers for templates.
 */

const HF_UTILS = {

  /**
   * Apply fallback values from schema defaults to data.
   * @param {object} data - Input data
   * @param {object} defaults - Default values from schema
   * @returns {object} Data with fallbacks applied
   */
  applyDefaults: function(data, defaults) {
    const result = Object.assign({}, defaults, data);
    // Deep merge arrays — keep data arrays, only use default if missing
    Object.keys(defaults).forEach(function(key) {
      if (result[key] === undefined || result[key] === null) {
        result[key] = defaults[key];
      }
    });
    return result;
  },

  /**
   * Safely get a nested property from an object.
   * @param {object} obj
   * @param {string} path - Dot-separated path (e.g., 'stats.0.value')
   * @param {*} fallback - Fallback value
   * @returns {*}
   */
  get: function(obj, path, fallback) {
    return path.split('.').reduce(function(acc, key) {
      return acc && acc[key] !== undefined ? acc[key] : undefined;
    }, obj) ?? fallback;
  },

  /**
   * Create a DOM element with attributes and content.
   * @param {string} tag
   * @param {object} attrs
   * @param {string} [textContent]
   * @returns {HTMLElement}
   */
  createElement: function(tag, attrs, textContent) {
    const el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function(key) {
        if (key === 'className') {
          el.className = attrs[key];
        } else if (key === 'style' && typeof attrs[key] === 'object') {
          Object.assign(el.style, attrs[key]);
        } else {
          el.setAttribute(key, attrs[key]);
        }
      });
    }
    if (textContent) el.textContent = textContent;
    return el;
  },

  /**
   * Generate a deterministic unique ID from an index.
   * (No Math.random — uses index-based IDs)
   * @param {string} prefix
   * @param {number} index
   * @returns {string}
   */
  uid: function(prefix, index) {
    return prefix + '-' + index;
  },

  /**
   * Clamp a number between min and max.
   * @param {number} val
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  clamp: function(val, min, max) {
    return Math.min(Math.max(val, min), max);
  },

  /**
   * Calculate the maximum value in an array of numbers.
   * Used for normalizing chart data.
   * @param {number[]} values
   * @returns {number}
   */
  maxValue: function(values) {
    return Math.max.apply(null, values.map(function(v) { return Math.abs(v); }));
  },

  /**
   * Normalize values to 0-1 range based on max.
   * @param {number[]} values
   * @returns {number[]}
   */
  normalize: function(values) {
    var max = HF_UTILS.maxValue(values);
    if (max === 0) return values.map(function() { return 0; });
    return values.map(function(v) { return v / max; });
  },

  /**
   * Check if a value is empty (null, undefined, empty string, empty array).
   * @param {*} val
   * @returns {boolean}
   */
  isEmpty: function(val) {
    if (val === null || val === undefined) return true;
    if (typeof val === 'string') return val.trim().length === 0;
    if (Array.isArray(val)) return val.length === 0;
    return false;
  },

  /**
   * Hide element if condition is true.
   * @param {string} selector
   * @param {boolean} condition
   */
  hideIf: function(selector, condition) {
    var el = document.querySelector(selector);
    if (el && condition) {
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
    }
  },

  /**
   * Generate an array of evenly-spaced stagger times.
   * @param {number} count - Number of items
   * @param {number} totalDuration - Total stagger window
   * @param {number} startTime - Start time offset
   * @returns {number[]} Array of start times
   */
  staggerTimes: function(count, totalDuration, startTime) {
    if (count <= 1) return [startTime || 0];
    var gap = totalDuration / (count - 1);
    var times = [];
    for (var i = 0; i < count; i++) {
      times.push((startTime || 0) + i * gap);
    }
    return times;
  },

  /**
   * Parse color string for use in computed styles.
   * @param {string} color - CSS color value
   * @param {number} [alpha] - Optional alpha override
   * @returns {string}
   */
  colorAlpha: function(color, alpha) {
    if (!color) return 'transparent';
    if (alpha === undefined) return color;
    // Simple hex to rgba conversion
    if (color.startsWith('#') && color.length === 7) {
      var r = parseInt(color.slice(1, 3), 16);
      var g = parseInt(color.slice(3, 5), 16);
      var b = parseInt(color.slice(5, 7), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }
    return color;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = HF_UTILS;
}
