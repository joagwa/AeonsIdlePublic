/**
 * NumberFormatter — Display-ready number formatting with multiple notation modes.
 *
 * Modes:
 *   'shortSuffix' (default) — K / M / B / T then aa–az, ba–bz, … with scientific fallback
 *   'scientific'             — always use scientific notation
 */

let notationMode = 'shortSuffix';

const SHORT_SUFFIXES = ['', 'K', 'M', 'B', 'T'];

/**
 * Build extended suffixes: aa, ab, … az, ba, bb, … zz  (676 tiers).
 * Tier 0–4 are handled by SHORT_SUFFIXES; extended starts at tier 5.
 */
function extendedSuffix(tier) {
  const idx = tier - SHORT_SUFFIXES.length; // 0-based into aa..zz
  if (idx < 0 || idx >= 676) return null;
  const first = String.fromCharCode(97 + Math.floor(idx / 26)); // a-z
  const second = String.fromCharCode(97 + (idx % 26));           // a-z
  return first + second;
}

/**
 * Format a number for display.
 * @param {number} n
 * @param {string} [mode] — override current notation mode for this call
 * @returns {string}
 */
export function formatNumber(n, mode) {
  const effectiveMode = mode ?? notationMode;

  if (n !== n) return '0';             // NaN
  if (n === Infinity) return '∞';
  if (n === -Infinity) return '-∞';

  if (n < 0) return '-' + formatNumber(-n, effectiveMode);

  if (effectiveMode === 'scientific') {
    return formatScientific(n);
  }

  return formatShortSuffix(n);
}

function formatShortSuffix(n) {
  if (n < 1000) return Math.floor(n).toString();

  // Determine tier (each tier = 3 orders of magnitude)
  const tier = Math.floor(Math.log10(n) / 3);

  if (tier < SHORT_SUFFIXES.length) {
    const scaled = n / Math.pow(10, tier * 3);
    return trimTrailingZeros(scaled.toFixed(2)) + SHORT_SUFFIXES[tier];
  }

  // Extended aa–zz range
  const suffix = extendedSuffix(tier);
  if (suffix !== null) {
    const scaled = n / Math.pow(10, tier * 3);
    return trimTrailingZeros(scaled.toFixed(2)) + suffix;
  }

  // Fallback to scientific
  return formatScientific(n);
}

function formatScientific(n) {
  if (n === 0) return '0';
  if (n < 1000) return Math.floor(n).toString();
  const exp = Math.floor(Math.log10(n));
  const mantissa = n / Math.pow(10, exp);
  return trimTrailingZeros(mantissa.toFixed(2)) + 'e' + exp;
}

function trimTrailingZeros(s) {
  if (!s.includes('.')) return s;
  return s.replace(/\.?0+$/, '');
}

/**
 * Format a per-second rate for display — always shows at least 1 decimal place
 * for values under 1000, so e.g. 0.5 renders as "0.5" not "0".
 * @param {number} n
 * @returns {string}
 */
export function formatRate(n) {
  if (n !== n) return '0.0';
  if (n === Infinity) return '∞';
  if (n < 0) return '-' + formatRate(-n);
  if (n < 10)   return n.toFixed(1);
  if (n < 100)  return n.toFixed(1);
  if (n < 1000) return Math.round(n).toString();
  return formatNumber(n);
}

/**
 * Set the global notation mode.
 * @param {'shortSuffix'|'scientific'} mode
 */
export function setNotationMode(mode) {
  notationMode = mode;
}

/**
 * Get the current notation mode.
 * @returns {string}
 */
export function getNotationMode() {
  return notationMode;
}
