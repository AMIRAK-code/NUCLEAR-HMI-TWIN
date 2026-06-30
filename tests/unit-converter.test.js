import { describe, test, expect, beforeAll, beforeEach, vi } from 'vitest';

/**
 * CORE-SENTINEL HMI — UnitConverter round-trip tests
 * IEC 61511 §11.5: Software validation evidence
 *
 * Safety focus: editing a threshold while in imperial mode must store the
 * EXACT metric value back when the displayed number is unchanged. A bad
 * inverse silently corrupts stored setpoints — including Kelvin coolant
 * temperatures (COOLANT_IN/COOLANT_OUT).
 *
 * Two historical bugs are locked down here:
 *  1. toMetric() reverse-looked-up the inverse by DISPLAY unit ('°F'), which
 *     '°C' and 'K' share — so Kelvin edits applied the °C inverse.
 *  2. The K inverse itself dropped the −32 offset (v*5/9+273.15), off by
 *     ~17.78 K even once the right rule was selected.
 */

// UnitConverter reads localStorage and touches document at module load, so
// stub the browser globals before importing it (suite runs in node env).
let UnitConverter;

beforeAll(async () => {
  const store = {};
  vi.stubGlobal('localStorage', {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  });
  vi.stubGlobal('CustomEvent', class { constructor(type, init) { this.type = type; Object.assign(this, init); } });
  vi.stubGlobal('document', { dispatchEvent: () => true });
  ({ UnitConverter } = await import('@shared/src/unit-converter.js'));
});

beforeEach(() => UnitConverter.setMode('imperial'));

const roundTrip = unit => {
  // metric value -> imperial display -> back to metric (display unchanged)
  return v => UnitConverter.toMetric(UnitConverter.convert(v, unit).v, unit);
};

describe('UnitConverter imperial round-trip (edit unchanged → store exact metric)', () => {
  test('K round-trips (the corrupted-setpoint bug)', () => {
    const k = roundTrip('K');
    expect(k(700)).toBeCloseTo(700, 6);     // typical coolant setpoint
    expect(k(273.15)).toBeCloseTo(273.15, 6); // 0 °C / 32 °F anchor
    expect(k(1000)).toBeCloseTo(1000, 6);
  });

  test('°C round-trips and is NOT broken by the fix', () => {
    const c = roundTrip('°C');
    expect(c(0)).toBeCloseTo(0, 6);
    expect(c(550)).toBeCloseTo(550, 6);
    expect(c(-40)).toBeCloseTo(-40, 6); // °C == °F crossover
  });

  test('bar and kg/s round-trip (guard against regression)', () => {
    expect(roundTrip('bar')(12.5)).toBeCloseTo(12.5, 6);
    expect(roundTrip('kg/s')(340)).toBeCloseTo(340, 6);
  });
});

describe('UnitConverter physical anchors', () => {
  test('32 °F is exactly 273.15 K (proves the −32 offset is present)', () => {
    expect(UnitConverter.toMetric(32, 'K')).toBeCloseTo(273.15, 6);
  });

  test('°C and K with identical display value yield DIFFERENT metric values', () => {
    // Both display as °F, but must invert through their own rule.
    expect(UnitConverter.toMetric(800.33, 'K'))
      .not.toBeCloseTo(UnitConverter.toMetric(800.33, '°C'), 1);
  });

  test('toMetric is a no-op in metric mode', () => {
    UnitConverter.setMode('metric');
    expect(UnitConverter.toMetric(800.33, 'K')).toBe(800.33);
  });

  test('unknown unit passes through unchanged', () => {
    expect(UnitConverter.toMetric(42, 'rpm')).toBe(42);
  });
});
