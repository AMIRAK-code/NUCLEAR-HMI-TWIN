'use strict';
// DataService — ROADMAP F1. Unified read/subscribe facade across all data
// domains. Today every provider routes to the simulated adapter (existing DAO +
// ScenarioEngine + S model). Tomorrow the TRANSPORT config swap repoints
// `sensors`/`events`/`twin` at FOS WebSocket/OPC UA, PoliTO twin, or Links AI
// without touching screens or live-data.js.
//
// Uniform provider shape: `{ snapshot(), subscribe(cb) -> unsubscribe, query(opts?) }`.
// Every datum exposed through this layer carries the F3 provenance contract:
//   { value, source, unit, confidence, quality, timestamp }
// `source` ∈ 'Misurato' | 'Stimato' | 'Predetto' | 'Simulato' | 'Aggregato' | 'Manuale'.

import { DAO } from './dao.js';
import { ScenarioEngine } from './scenario-engine.js';
import { S } from './model.js';

// ── Provenance contract ─────────────────────────────────────────────────

export const SOURCE = Object.freeze({
  MISURATO: 'Misurato',
  STIMATO: 'Stimato',
  PREDETTO: 'Predetto',
  SIMULATO: 'Simulato',
  AGGREGATO: 'Aggregato',
  MANUALE: 'Manuale',
});

// Wrap a raw value into the canonical datum shape. Defaults match the
// simulated-transport case: source SIMULATO, quality 'good', confidence 1.
export function datum(value, opts = {}) {
  return {
    value,
    source: opts.source ?? SOURCE.SIMULATO,
    unit: opts.unit ?? null,
    confidence: opts.confidence ?? 1,
    quality: opts.quality ?? 'good',
    timestamp: opts.timestamp ?? Date.now(),
  };
}

// Map DAO's internal `source` tag ('SIM'/'LIVE'/'VIRTUAL'/'STALE') to the
// Mappatura provenance taxonomy.
function provFromDao(daoSource) {
  switch (daoSource) {
    case 'LIVE':    return SOURCE.MISURATO;
    case 'VIRTUAL': return SOURCE.STIMATO;
    case 'STALE':   return SOURCE.AGGREGATO;
    case 'SIM':
    default:        return SOURCE.SIMULATO;
  }
}

// ── Transport config ────────────────────────────────────────────────────

const CONFIG = {
  // 'simulated' = wraps DAO/ScenarioEngine/S (current state).
  // 'websocket' / 'opcua' reserved for FOS swap — adapters land later.
  transport: 'simulated',
};

export function setTransport(t) {
  if (!['simulated', 'websocket', 'opcua'].includes(t)) {
    throw new Error(`DataService: unknown transport "${t}"`);
  }
  CONFIG.transport = t;
}
export function getTransport() { return CONFIG.transport; }

// ── Subscription helper ─────────────────────────────────────────────────
// Tiny pub-sub. Providers expose `.subscribe(cb)` and we plumb the existing
// 'sentinel:render' event as the trigger so subscribers wake up on every
// reducer tick without needing a parallel scheduling loop.

function makeBus() {
  const subs = new Set();
  const fire = payload => { for (const cb of subs) { try { cb(payload); } catch (e) { console.error('[DataService] subscriber error:', e); } } };
  return {
    subscribe(cb) { subs.add(cb); return () => subs.delete(cb); },
    fire,
  };
}

const renderBus = makeBus();
if (typeof document !== 'undefined') {
  document.addEventListener('sentinel:render', e => renderBus.fire(e.detail));
}

// ── Domain providers (simulated transport) ──────────────────────────────

// sensors — wraps DAO. snapshot() returns { [key]: datum } with provenance.
const sensorsProvider = {
  snapshot() {
    const raw = DAO.snapshot();
    const out = {};
    for (const [k, sn] of Object.entries(raw)) {
      out[k] = {
        ...sn,                                  // keep tag/label/sys/u/trip/low for legacy callers
        value: sn.v,
        unit: sn.u,
        source: provFromDao(sn.source),
        confidence: 1,
        quality: DAO.status(sn) === 'alarm' ? 'critical' : DAO.status(sn) === 'warning' ? 'degraded' : 'good',
        timestamp: Date.now(),
      };
    }
    return out;
  },
  subscribe: renderBus.subscribe,
  query({ key } = {}) {
    if (!key) return this.snapshot();
    const sn = DAO._s[key];
    if (!sn) return null;
    return {
      value: sn.v, unit: sn.u, source: provFromDao(sn.source),
      confidence: 1, quality: DAO.status(sn) === 'alarm' ? 'critical' : DAO.status(sn) === 'warning' ? 'degraded' : 'good',
      timestamp: Date.now(),
    };
  },
};

// events — wraps S.alarms + audit log.
const eventsProvider = {
  snapshot() { return { alarms: [...(S.alarms || [])], audit: [...(S.auditLog || [])] }; },
  subscribe: renderBus.subscribe,
  query({ kind = 'alarms', unacked } = {}) {
    if (kind === 'audit') return [...(S.auditLog || [])];
    let xs = [...(S.alarms || [])];
    if (unacked) xs = xs.filter(a => !a.acked);
    return xs;
  },
};

// twin — scenario state + histograms. PoliTO swap-point.
const twinProvider = {
  snapshot() {
    return {
      scenario: { active: ScenarioEngine.active, name: ScenarioEngine.name || null, tripTimeSec: ScenarioEngine.tripTimeSec || null },
      histTemp: [...(S.histTemp || [])],
      histPress: [...(S.histPress || [])],
      // deviation real-vs-sim placeholder until PoliTO ships
      deviationPct: 0.6,
    };
  },
  subscribe: renderBus.subscribe,
};

// Empty-but-shaped providers — partner backends fill these in later. They
// exist now so screens can already bind to `DataService.ai.query(...)` etc.
// and switch transparently when Links/FOS/newcleo land.
const empty = label => ({
  snapshot() { return { _stub: label, items: [] }; },
  subscribe: renderBus.subscribe,
  query() { return { _stub: label, items: [] }; },
});

const aiProvider       = empty('ai');        // Links AI — virtual sensors, predictions
const iotProvider      = empty('iot');       // FOS edge — IoT topology, node health
const securityProvider = empty('security');  // FOS security — cyber alerts, certs
const trainingProvider = empty('training');  // InRebus training engine
const authProvider     = empty('auth');      // FOS Identity — login, MFA, sessions

// ── Public facade ───────────────────────────────────────────────────────

export const DataService = Object.freeze({
  // domain providers
  sensors:  sensorsProvider,
  events:   eventsProvider,
  alarms:   eventsProvider,  // alias — many call sites think "alarms"
  twin:     twinProvider,
  ai:       aiProvider,
  iot:      iotProvider,
  security: securityProvider,
  training: trainingProvider,
  auth:     authProvider,

  // helpers
  datum,
  SOURCE,
  setTransport,
  getTransport,
});
