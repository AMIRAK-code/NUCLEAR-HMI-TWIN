/**
 * CORE-SENTINEL — Telemetry Buffer
 * Circular buffer storing the last 10 minutes of sensor snapshots (750 entries @ 800ms).
 * Used by Config Manager for Historical Validation and What-If Analysis.
 * ISA-101 §5.3 / IEC 61511 — data traceability
 */

const MAX_SAMPLES = 750;   // 10 min × 60s ÷ 0.8s = 750
const _buf = [];

export const TelemetryBuffer = {
  /** Called every tick — record a snapshot */
  record(snapshot) {
    _buf.push({ ts: Date.now(), sensors: { ...snapshot } });
    if (_buf.length > MAX_SAMPLES) _buf.shift();
  },

  /** Returns a copy of all buffered entries, oldest first */
  get() { return [..._buf]; },

  /** How many seconds of data are buffered */
  durationSec() {
    if (_buf.length < 2) return 0;
    return (_buf[_buf.length - 1].ts - _buf[0].ts) / 1000;
  },

  /** Run a set of measure thresholds against the buffer.
   *  Returns { tripCount, clearCount, byKey: { [sensorKey]: { trips, highTrips, lowTrips } } }
   */
  simulate(measures) {
    const byKey = {};
    let tripCount = 0;

    _buf.forEach(entry => {
      Object.entries(entry.sensors).forEach(([key, sensor]) => {
        const cfg = measures[key];
        if (!cfg || sensor?.v == null) return;
        if (!byKey[key]) byKey[key] = { trips: 0, highTrips: 0, lowTrips: 0 };
        if (cfg.tripHigh > 0 && sensor.v >= cfg.tripHigh) {
          byKey[key].highTrips++;
          byKey[key].trips++;
          tripCount++;
        }
        if (cfg.tripLow > 0 && sensor.v <= cfg.tripLow) {
          byKey[key].lowTrips++;
          byKey[key].trips++;
          tripCount++;
        }
      });
    });

    return { tripCount, sampleCount: _buf.length, byKey };
  },

  clear() { _buf.length = 0; },
};
