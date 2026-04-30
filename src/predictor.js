/**
 * CORE-SENTINEL — Predictive Trend Projector
 * Pure module: no DOM, no side-effects.
 * Least-squares linear regression over TelemetryBuffer readings.
 * ISA-101 §5.3 / IEC 61511 — predictive diagnostics
 */
import { TelemetryBuffer } from './telemetry-buffer.js';

const PROJ_STEPS  = 150;   // 150 × 0.8 s = 120 s (2 min ahead)
const MIN_SAMPLES = 10;
const TICK_S      = 0.8;
const MAX_INPUT   = 150;   // cap regression input to last 2 min

export const Predictor = {
  /**
   * predict(sensorKey, tripHigh, tripLow)
   * Returns:
   *   slope            — units/tick
   *   intercept        — regression y-intercept
   *   projectedValues  — number[PROJ_STEPS], first value = current projected position
   *   timeToTrip       — seconds until first tripHigh/tripLow crossing, or null if safe
   */
  predict(sensorKey, tripHigh, tripLow) {
    const buf = TelemetryBuffer.get();

    // Extract non-null values for this sensor
    const readings = [];
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i].sensors[sensorKey]?.v;
      if (v != null) readings.push(v);
    }

    if (readings.length < MIN_SAMPLES) {
      return { slope: 0, intercept: 0, projectedValues: [], timeToTrip: null };
    }

    // Cap to last MAX_INPUT readings to keep regression fast
    const data = readings.length > MAX_INPUT ? readings.slice(-MAX_INPUT) : readings;
    const n    = data.length;

    // Least-squares linear regression (O(n), 2 variables only)
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX  += i;
      sumY  += data[i];
      sumXY += i * data[i];
      sumX2 += i * i;
    }
    const denom    = n * sumX2 - sumX * sumX;
    const slope    = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    // Project forward PROJ_STEPS ticks from last known index
    const lastIdx       = n - 1;
    const projectedValues = new Array(PROJ_STEPS);
    for (let i = 0; i < PROJ_STEPS; i++) {
      projectedValues[i] = intercept + slope * (lastIdx + i);
    }

    // First crossing of either trip boundary (null = safe within 2-min window)
    let timeToTrip = null;
    for (let i = 0; i < projectedValues.length; i++) {
      const v = projectedValues[i];
      if (tripHigh != null && v >= tripHigh) { timeToTrip = i * TICK_S; break; }
      if (tripLow  != null && v <= tripLow)  { timeToTrip = i * TICK_S; break; }
    }

    return { slope, intercept, projectedValues, timeToTrip };
  },
};
