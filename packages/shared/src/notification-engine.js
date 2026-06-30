'use strict';
// NotificationEngine — ROADMAP F4. Reads the 20 NOTIFICATION_POLICIES from
// mappatura.js (single source of truth) and dispatches them to channels:
//   - UI bus   (subscribed by the toast renderer in src/spec/notifications.js)
//   - Audit log (via dispatch(LOG))
//   - Email    (stub — wired to FOS later)
//
// Throttling parses the policy's natural-language `throttling` field:
//   "1 notifica per evento"      → fire once per event signature, until cleared
//   "1 notifica al minuto"       → min 60_000 ms between fires
//   "1 notifica ogni 5 min"      → 300_000 ms
//   "Nessun throttling"          → fires every time
//
// Sources today: sensor threshold crossings (via DataService.sensors) and
// alarm intents (via S.alarms diff). Source-agnostic by design — partners can
// fire policies from their own adapters when transport flips.

import { NOTIFICATION_POLICIES } from './mappatura.js';
import { DataService } from './data-service.js';
import { DAO } from './dao.js';
import { TelemetryBuffer } from './telemetry-buffer.js';
import { ScenarioEngine } from './scenario-engine.js';
import { dispatch } from './reducer.js';
import { ACTION_TYPES as A } from '../constants/actionTypes.js';

const policyById = new Map(NOTIFICATION_POLICIES.map(p => [p.id, p]));

// ── UI bus ──────────────────────────────────────────────────────────────

const listeners = new Set();
export function subscribeNotifications(cb) { listeners.add(cb); return () => listeners.delete(cb); }
function emit(notif) {
  for (const cb of listeners) { try { cb(notif); } catch (e) { console.error('[NotificationEngine] listener error:', e); } }
}

// ── Throttling ──────────────────────────────────────────────────────────

const lastFired = new Map();   // sigKey → ts
const activeEvents = new Set(); // sigKey — "1 per evento" tracking

function parseThrottle(text = '') {
  const t = text.toLowerCase();
  if (/nessun/.test(t)) return { mode: 'none' };
  if (/per evento/.test(t)) return { mode: 'event' };
  const minMatch = t.match(/ogni\s+(\d+)\s*min/);
  if (minMatch) return { mode: 'window', windowMs: parseInt(minMatch[1], 10) * 60_000 };
  if (/al\s+minuto/.test(t)) return { mode: 'window', windowMs: 60_000 };
  if (/al\s+giorno/.test(t)) return { mode: 'window', windowMs: 24 * 60 * 60_000 };
  return { mode: 'event' };
}

// ── Public API ──────────────────────────────────────────────────────────

// fire(policyId, { signature, ...payload })
// signature distinguishes events (e.g. sensor key) for throttling.
export function fire(policyId, payload = {}) {
  const policy = policyById.get(policyId);
  if (!policy) { console.warn(`[NotificationEngine] unknown policy "${policyId}"`); return false; }
  const sig = payload.signature || policyId;
  const key = `${policyId}::${sig}`;
  const thr = parseThrottle(policy.throttling);
  const now = Date.now();

  if (thr.mode === 'event' && activeEvents.has(key)) return false;
  if (thr.mode === 'window') {
    const last = lastFired.get(key) || 0;
    if (now - last < thr.windowMs) return false;
  }
  if (thr.mode === 'event') activeEvents.add(key);
  lastFired.set(key, now);

  const notif = {
    id: `${policyId}-${now}`,
    policyId,
    name: policy.name,
    criticita: policy.criticita,
    destinatari: policy.destinatari,
    canale: policy.canale,
    title: payload.title || policy.name,
    message: payload.message || policy.trigger,
    timestamp: now,
  };
  emit(notif);
  try { dispatch(A.LOG, { msg: `📢 ${policyId} [${policy.criticita}] ${notif.title} — ${notif.message}` }); } catch (_) {}
  return true;
}

// clear() — call when the underlying event clears, so "1 per evento" can re-fire next time
export function clear(policyId, signature) {
  activeEvents.delete(`${policyId}::${signature || policyId}`);
}

// ── Built-in watchers ───────────────────────────────────────────────────

let lastSensorStatus = {};      // key → status snapshot
let lastAlarmIds = new Set();
let lastSignalSeen = {};        // key → ts (last non-stale data)
let lastBufferLen = 0;
let lastScenario = null;

function watchSensors() {
  const sn = DataService.sensors.snapshot();
  const now = Date.now();
  for (const [k, s] of Object.entries(sn)) {
    const status = DAO.status(s);
    const prev = lastSensorStatus[k];
    if (status === 'alarm' && prev !== 'alarm') {
      fire('NP-CRIT-VAR-01', {
        signature: k,
        title: `${s.tag || k} — soglia critica`,
        message: `${s.label || k}: ${typeof s.value === 'number' ? s.value.toFixed(2) : s.value} ${s.unit || ''} (trip ${s.trip})`,
      });
    } else if (status !== 'alarm' && prev === 'alarm') {
      clear('NP-CRIT-VAR-01', k);
    }
    lastSensorStatus[k] = status;
    // NP-SIGNAL-LOSS-01: data older than 5 s while sensor was previously live
    if (s.quality === 'good') lastSignalSeen[k] = now;
    const lastSeen = lastSignalSeen[k] || now;
    if (now - lastSeen > 5_000) {
      fire('NP-SIGNAL-LOSS-01', {
        signature: k,
        title: `Perdita segnale: ${s.tag || k}`,
        message: `Ultimo dato valido ${Math.round((now - lastSeen) / 1000)} s fa`,
      });
    } else {
      clear('NP-SIGNAL-LOSS-01', k);
    }
  }
}

function watchDataQuality() {
  // NP-DATA-QUALITY-01: buffer completeness vs expected sample count (10-min window, 0.8s tick)
  const buf = TelemetryBuffer.get();
  const expected = 750;
  const completeness = (buf.length / expected) * 100;
  // only judge once the buffer has had enough time to fill (else we always alert at startup)
  if (TelemetryBuffer.durationSec() > 60 && completeness < 80) {
    fire('NP-DATA-QUALITY-01', {
      signature: 'buffer',
      title: 'Qualità dati: completezza < 80%',
      message: `Buffer storico: ${Math.round(completeness)} % vs target 80 %`,
    });
  } else {
    clear('NP-DATA-QUALITY-01', 'buffer');
  }
  lastBufferLen = buf.length;
}

function watchTwinDivergence() {
  // NP-TWIN-DIVERGENCE-01: synthetic divergence based on scenario state
  const t = DataService.twin.snapshot();
  // when a scenario is active, divergence widens — fire once per scenario start
  if (t.scenario.active && lastScenario !== t.scenario.name) {
    fire('NP-TWIN-DIVERGENCE-01', {
      signature: t.scenario.name,
      title: `Divergenza twin: scenario "${t.scenario.name}"`,
      message: `Reale vs simulato: Δ stimato > 3 % durante "${t.scenario.name}"`,
    });
    lastScenario = t.scenario.name;
  } else if (!t.scenario.active && lastScenario) {
    clear('NP-TWIN-DIVERGENCE-01', lastScenario);
    lastScenario = null;
  }
}

function watchAlarms() {
  const alarms = DataService.alarms.snapshot().alarms || [];
  const currentIds = new Set(alarms.map(a => a.id));
  for (const a of alarms) {
    if (!lastAlarmIds.has(a.id) && a.p === 1) {
      fire('NP-ALARM-CRIT-01', {
        signature: a.id,
        title: `Allarme critico ${a.tag}`,
        message: a.msg,
      });
    }
  }
  // clear policies for alarms that have been removed
  for (const id of lastAlarmIds) {
    if (!currentIds.has(id)) clear('NP-ALARM-CRIT-01', id);
  }
  lastAlarmIds = currentIds;
}

let _started = false;
export function startNotificationEngine() {
  if (_started || typeof document === 'undefined') return;
  _started = true;
  // Tick on every render — same cadence as live data, so threshold crossings
  // are caught within one frame of the reducer state that produced them.
  document.addEventListener('sentinel:render', () => {
    try { watchSensors();        } catch (e) { console.error('[NotificationEngine] watchSensors:',        e); }
    try { watchAlarms();         } catch (e) { console.error('[NotificationEngine] watchAlarms:',         e); }
    try { watchDataQuality();    } catch (e) { console.error('[NotificationEngine] watchDataQuality:',    e); }
    try { watchTwinDivergence(); } catch (e) { console.error('[NotificationEngine] watchTwinDivergence:', e); }
  });
}

// silence unused (ScenarioEngine imported for future direct hooks)
void ScenarioEngine;

export const NotificationEngine = Object.freeze({
  fire, clear, subscribe: subscribeNotifications, start: startNotificationEngine,
  policies: NOTIFICATION_POLICIES,
});
