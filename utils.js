// ╔══════════════════════════════════════════════════════════════════╗
// ║  CORE-SENTINEL — utils.js                                       ║
// ║  Shared utility helpers — named ES module exports               ║
// ╚══════════════════════════════════════════════════════════════════╝

/** @returns {string} Current UTC timestamp HH:MM:SS UTC */
export function ts() {
  const n = new Date();
  return `${p2(n.getUTCHours())}:${p2(n.getUTCMinutes())}:${p2(n.getUTCSeconds())} UTC`;
}

/** @param {string} msg  @param {string|null} role  @returns {{ts,role,msg}} */
export function mkEntry(msg, role) {
  return { ts: ts(), role: role || 'SYS', msg };
}

export function p2(n) { return String(n).padStart(2, '0'); }
export function p3(n) { return String(n).padStart(3, '0'); }

/**
 * Calculate percentage position of value between lo and hi.
 * @param {number} v  @param {number} lo  @param {number} hi
 */
export function pct(v, lo, hi) { return ((v - lo) / (hi - lo)) * 100; }

/**
 * Set text content of an element by ID.
 * Null/undefined values are ignored (no flash to empty string).
 */
export function setText(id, val) {
  const e = document.getElementById(id);
  if (e && val !== null && val !== undefined) e.textContent = val;
}

/** Set an SVG/HTML attribute by element ID */
export function setAttr(id, a, v) {
  const e = document.getElementById(id);
  if (e) e.setAttribute(a, v);
}

/**
 * XSS escaping for user-supplied strings inserted into innerHTML.
 * Use whenever rendering untrusted input (AI queries, alarm messages from external).
 */
export function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Trigger a file download in the browser.
 * @param {string} content  File body
 * @param {string} name     Suggested filename
 * @param {string} type     MIME type
 */
export function dlFile(content, name, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

