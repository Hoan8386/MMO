/**
 * HyperFrames Typography Utilities
 * =================================
 * Safe text handling for Vietnamese + English.
 * Auto-fit, truncation, XSS protection.
 * Designed for deterministic rendering (no DOM measurement at tween time).
 */

const HF_TYPOGRAPHY = {

  /**
   * Sanitize text for safe HTML injection (prevent XSS)
   * Preserves Vietnamese diacritics.
   * @param {string} text - Raw text
   * @returns {string} Safe text
   */
  safeText: function(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  /**
   * Truncate text to maxChars, adding ellipsis if needed.
   * Respects word boundaries for Vietnamese.
   * @param {string} text
   * @param {number} maxChars
   * @returns {string}
   */
  truncateText: function(text, maxChars) {
    if (!text || text.length <= maxChars) return text || '';
    const truncated = text.substring(0, maxChars);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > maxChars * 0.7 ? truncated.substring(0, lastSpace) : truncated) + '…';
  },

  /**
   * Wrap long text into multiple lines (by inserting <br> equivalents).
   * Returns an array of lines.
   * @param {string} text
   * @param {number} charsPerLine - Approximate characters per line
   * @returns {string[]} Array of lines
   */
  wrapText: function(text, charsPerLine) {
    if (!text) return [''];
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach(function(word) {
      if ((currentLine + ' ' + word).trim().length > charsPerLine && currentLine.length > 0) {
        lines.push(currentLine.trim());
        currentLine = word;
      } else {
        currentLine = currentLine ? currentLine + ' ' + word : word;
      }
    });
    if (currentLine.trim()) lines.push(currentLine.trim());
    return lines;
  },

  /**
   * Calculate optimal font size to fit text within a given width.
   * Uses a pre-computed approximation (no DOM measurement at tween time).
   * @param {string} text
   * @param {number} containerWidth - Width in pixels
   * @param {number} maxFontSize
   * @param {number} minFontSize
   * @param {number} [charWidthRatio=0.55] - Approximate char width / font size ratio
   * @returns {number} Optimal font size
   */
  autoFitFontSize: function(text, containerWidth, maxFontSize, minFontSize, charWidthRatio) {
    if (!text) return maxFontSize;
    const ratio = charWidthRatio || 0.55;
    const len = text.length;
    // Estimate: text width ≈ len * fontSize * ratio
    // We want: len * fontSize * ratio <= containerWidth
    const idealSize = containerWidth / (len * ratio);
    return Math.max(minFontSize, Math.min(maxFontSize, Math.floor(idealSize)));
  },

  /**
   * Format a number with locale-aware separators.
   * @param {number} num
   * @param {number} [decimals=0]
   * @returns {string}
   */
  formatNumber: function(num, decimals) {
    if (typeof num !== 'number') return String(num || 0);
    if (decimals && decimals > 0) {
      return num.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    return Math.round(num).toLocaleString('en-US');
  },

  /**
   * Format a percentage value.
   * @param {number} value
   * @param {string} [suffix='%']
   * @returns {string}
   */
  formatPercent: function(value, suffix) {
    return Math.round(value) + (suffix || '%');
  },

  /**
   * Populate a DOM element with safe text, handling missing data gracefully.
   * @param {string} selector - CSS selector
   * @param {string} text - Text content
   * @param {object} [opts] - Options
   * @param {number} [opts.maxChars] - Truncate if exceeded
   * @param {boolean} [opts.hideIfEmpty] - Hide element if text is empty
   */
  setText: function(selector, text, opts) {
    const el = document.querySelector(selector);
    if (!el) return;

    opts = opts || {};
    const safeVal = HF_TYPOGRAPHY.safeText(text || '');

    if (!safeVal && opts.hideIfEmpty) {
      el.style.display = 'none';
      return;
    }

    const finalText = opts.maxChars
      ? HF_TYPOGRAPHY.truncateText(safeVal, opts.maxChars)
      : safeVal;

    el.textContent = finalText;
  },

  /**
   * Set text with auto-fit font size.
   * @param {string} selector
   * @param {string} text
   * @param {number} containerWidth
   * @param {number} maxFontSize
   * @param {number} minFontSize
   */
  setAutoFitText: function(selector, text, containerWidth, maxFontSize, minFontSize) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.textContent = HF_TYPOGRAPHY.safeText(text || '');
    const size = HF_TYPOGRAPHY.autoFitFontSize(text, containerWidth, maxFontSize, minFontSize);
    el.style.fontSize = size + 'px';
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = HF_TYPOGRAPHY;
}
