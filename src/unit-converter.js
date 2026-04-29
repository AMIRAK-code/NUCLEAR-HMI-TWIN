/**
 * CORE-SENTINEL HMI — Unit Conversion Engine
 * WP 1.2 — Metric ↔ Imperial global toggle
 * Persisted in localStorage; emits 'dao:unit:changed' on toggle.
 *
 * Rules:
 *   °C  → °F    (°F = °C × 9/5 + 32)
 *   K   → °F    (°F = (K − 273.15) × 9/5 + 32)
 *   bar → PSI   (1 bar = 14.5038 PSI)
 *   kg/s → lb/s (1 kg = 2.20462 lb)
 *   All other units pass through unchanged.
 *
 * Thresholds in ConfigService are ALWAYS stored in Metric.
 * This module converts FOR DISPLAY only — stored values are never mutated.
 */

const UC_KEY = 'dao-unit-mode';

const _conversions = {
  '°C':  { toI: v => v * 9 / 5 + 32,               toM: v => (v - 32) * 5 / 9,           iUnit: '°F'   },
  'K':   { toI: v => (v - 273.15) * 9 / 5 + 32,    toM: v => v * 5 / 9 + 273.15,         iUnit: '°F'   },
  'bar': { toI: v => v * 14.5038,                   toM: v => v / 14.5038,                iUnit: 'PSI'  },
  'kg/s':{ toI: v => v * 2.20462,                   toM: v => v / 2.20462,                iUnit: 'lb/s' },
};

export const UnitConverter = {
  _mode: localStorage.getItem(UC_KEY) ?? 'metric',

  /** Current mode: 'metric' | 'imperial' */
  get mode() { return this._mode; },

  /** Toggle between metric and imperial; emits CustomEvent */
  toggle() {
    this._mode = this._mode === 'metric' ? 'imperial' : 'metric';
    localStorage.setItem(UC_KEY, this._mode);
    document.dispatchEvent(new CustomEvent('dao:unit:changed', {
      detail: { mode: this._mode }, bubbles: true,
    }));
  },

  setMode(mode) {
    if (mode !== 'metric' && mode !== 'imperial') return;
    this._mode = mode;
    localStorage.setItem(UC_KEY, mode);
    document.dispatchEvent(new CustomEvent('dao:unit:changed', {
      detail: { mode }, bubbles: true,
    }));
  },

  /**
   * convert(value, unit) → { v: number, u: string }
   * Returns converted value + display unit.
   * If mode is metric OR no conversion rule exists, returns unchanged.
   */
  convert(value, unit) {
    if (this._mode !== 'imperial') return { v: value, u: unit };
    const rule = _conversions[unit];
    if (!rule) return { v: value, u: unit };
    return { v: rule.toI(value), u: rule.iUnit };
  },

  /**
   * convertThreshold(value, unit) — same as convert() but also returns
   * the back-conversion function so the Config Manager can store metric
   * values after the user edits in imperial.
   */
  convertThreshold(value, unit) {
    return this.convert(value, unit);
  },

  /**
   * toMetric(value, displayUnit) — inverse conversion.
   * Used when user edits a threshold displayed in imperial and
   * we must store it back in metric.
   */
  toMetric(value, displayUnit) {
    if (this._mode !== 'imperial') return value;
    const rule = Object.values(_conversions).find(r => r.iUnit === displayUnit);
    return rule ? rule.toM(value) : value;
  },

  /**
   * fmt(value, unit) → "1,045.2 °F"
   * Convenience: convert + format + unit label in one call.
   */
  fmt(value, unit) {
    const { v, u } = this.convert(value, unit);
    let str;
    if      (Math.abs(v) >= 10000) str = Math.round(v).toLocaleString();
    else if (Math.abs(v) >= 1000)  str = v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    else if (Math.abs(v) >= 100)   str = v.toFixed(1);
    else                           str = v.toFixed(2);
    return `${str} ${u}`;
  },

  /** Returns the imperial unit label for a given metric unit (or the original if no conversion). */
  unitLabel(unit) {
    if (this._mode !== 'imperial') return unit;
    return _conversions[unit]?.iUnit ?? unit;
  },
};
