/**
 * CORE-SENTINEL HMI — MVI Reducer (State Machine)
 * ISA-101 §6.5 / IEC 61511 §11.5 / NUREG-0700
 *
 * Pure function: (state, intent, payload) => newState
 * All state updates use immutable spread patterns — no direct mutation.
 *
 * MFE NOTE: render() is no longer called directly here.
 * dispatch() fires the 'sentinel:render' CustomEvent; each MFE's mount()
 * subscribes independently so a crash in one MFE cannot silence the others.
 */
import { S, setS, mkModel } from './model.js';
import { mkEntry } from '../utils.js';
import { ACTION_TYPES as A } from '../constants/actionTypes.js';

// ── RBAC Permission Matrix (ISA-101 §6.5 / NUREG-0700) ────────────────────
export const INTENT_PERMISSIONS = Object.freeze({
  [A.SCRAM]:             ['OD', 'AS'],
  [A.RESET_SCRAM]:       ['AS'],
  [A.TOGGLE_AUTOPILOT]:  ['OD', 'AS'],
  [A.RESET_INTERLOCKS]:  ['AS'],
  [A.SHELF_ALARM]:       ['OD', 'AS'],
  [A.UNSHELVE_ALARM]:    ['OD', 'AS'],
  [A.ADVANCE_PROTOCOL]:  ['OD', 'AS'],
  [A.CONFIG_UPDATE]:     ['AS'],
  [A.CONFIG_ROLLBACK]:   ['AS'],
  [A.CONFIG_IMPORT]:     ['AS'],
  [A.CONFIG_RESET]:      ['AS'],
});

// ── Renderer Registry — cross-MFE render delegation ──────────────────────
// Each MFE calls registerRenderer(name, fn) from its mount().
// callRenderer(name, s) invokes the fn if loaded; errors are isolated per MFE.
const _renderers = new Map();
export function registerRenderer(name, fn) { _renderers.set(name, fn); }
export function callRenderer(name, ...args) {
  const fn = _renderers.get(name);
  if (fn) {
    try { fn(...args); }
    catch (e) { console.error(`[MFE:${name}] renderer error — isolated, other MFEs unaffected:`, e); }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// reduce — The central state machine.
// ═══════════════════════════════════════════════════════════════════════════
export function reduce(s, intent, p = {}) {
  if (INTENT_PERMISSIONS[intent]) {
    const allowed = INTENT_PERMISSIONS[intent];
    if (!s.role || !allowed.includes(s.role)) {
      const denyMsg = `SECURITY: Intent "${intent}" denied — role ${s.role || 'NONE'} lacks permission`;
      console.warn(`[RBAC] ${denyMsg}`);
      return { ...s, auditLog: [...s.auditLog, mkEntry(denyMsg, s.role)] };
    }
  }

  const log = msg => [...s.auditLog, mkEntry(msg, s.role)];

  switch (intent) {
    case A.SET_ROLE:
      return {
        ...s,
        role: p.role,
        sessionStart: new Date(),
        lastActivity: Date.now(),
        auditLog: log(`Session started. Role: ${p.role}`),
      };

    case A.TOUCH_ACTIVITY:
      return { ...s, lastActivity: Date.now() };

    case A.SESSION_TIMEOUT:
      return {
        ...mkModel(),
        auditLog: [mkEntry('SESSION TIMEOUT: Automatic logout after inactivity', null)],
      };

    case A.NAVIGATE:
      return { ...s, activePanel: p.panel, auditLog: log(`Navigated to: ${p.panel}`) };

    case A.ACK_ALL:
      return {
        ...s,
        alarms: s.alarms.map(a => ({ ...a, acked: true })),
        auditLog: log('All alarms acknowledged'),
      };

    case A.DISMISS_BANNER:
      return { ...s, bannerOn: false };

    case A.ADD_ALARM: {
      const hasActive = s.alarms.some(a => !a.acked && !a.cleared && !a.shelved);
      const newAlarm  = { ...p.alarm, cleared: false, shelved: false, firstOut: !hasActive };
      return {
        ...s,
        alarms:   [...s.alarms, newAlarm],
        bannerOn: true,
        auditLog: log(`ALARM [P${newAlarm.p}] ${newAlarm.tag}: ${newAlarm.msg}${newAlarm.firstOut ? ' [FIRST-OUT]' : ''}`),
      };
    }

    case A.CLEAR_ALARM:
      return {
        ...s,
        alarms:   s.alarms.map(a => a.id === p.id ? { ...a, cleared: true } : a),
        auditLog: log(`Alarm cleared: ${p.id}`),
      };

    case A.SHELF_ALARM:
      return {
        ...s,
        alarms:   s.alarms.map(a => a.id === p.id ? { ...a, shelved: true } : a),
        auditLog: log(`Alarm shelved: ${p.id}`),
      };

    case A.UNSHELVE_ALARM:
      return {
        ...s,
        alarms:   s.alarms.map(a => a.id === p.id ? { ...a, shelved: false } : a),
        auditLog: log(`Alarm unshelved: ${p.id}`),
      };

    case A.CLEAR_ALARMS_BY_PREFIX:
      return {
        ...s,
        alarms: s.alarms.filter(a => !a.id.startsWith(p.prefix)),
      };

    case A.SCRAM:
      return {
        ...s,
        scramActive: true,
        auditLog:    log(`⚠ SCRAM INITIATED by ${s.role || 'SYSTEM'}`),
      };

    case A.AUTO_SCRAM:
      return {
        ...s,
        scramActive: true,
        auditLog:    log('⚠ AUTO-SCRAM by Reactor Protection System'),
      };

    case A.RESET_SCRAM:
      return {
        ...s,
        scramActive: false,
        auditLog:    log('SCRAM state reset — nominal restored'),
      };

    case A.RESET_INTERLOCKS:
      return {
        ...s,
        interlocks: s.interlocks.map(i => i.st === 'OFFLINE' ? { ...i, st: 'ARMED' } : i),
        auditLog:   log('Interlocks reset to ARMED'),
      };

    case A.ADVANCE_PROTOCOL:
      return {
        ...s,
        protocolStep: Math.min(s.protocolStep + 1, 4),
        auditLog:     log(`SCCP-74A Step ${s.protocolStep} acknowledged`),
      };

    case A.TOGGLE_AUTOPILOT:
      return {
        ...s,
        autoPilot: !s.autoPilot,
        auditLog:  log(`Auto-Pilot ${!s.autoPilot ? 'ENABLED' : 'DISABLED'}`),
      };

    case A.TICK: {
      const snap = p.snapshot || s.sensors;
      return {
        ...s,
        sensors:   snap,
        histTemp:  [...s.histTemp.slice(-19),  snap.CORE_TEMP?.v  ?? 1045],
        histPress: [...s.histPress.slice(-19), snap.PRIM_PRESS?.v ?? 215],
      };
    }

    case A.LOG:
      return { ...s, auditLog: log(p.msg) };

    case A.CLEAR_AUDIT:
      return { ...s, auditLog: [mkEntry('Audit log cleared', s.role)] };

    case A.TOGGLE_AUDIT:
      return { ...s, auditPanelOpen: !s.auditPanelOpen };

    case A.TOGGLE_HIGH_CONTRAST: {
      const hc = !s.highContrast;
      return { ...s, highContrast: hc, auditLog: log(`High-contrast mode ${hc ? 'ENABLED' : 'DISABLED'}`) };
    }

    case A.SET_DEMO_MODE:
      return { ...s, demoMode: p.active };

    case A.CONFIG_UPDATE:
      return {
        ...s,
        configActiveTab: s.configActiveTab ?? 'measures',
        auditLog: log(`CONFIG UPDATE [${p.submodel ?? 'measures'}] v${p.version ?? '—'} — ${p.reason ?? ''}`),
      };

    case A.CONFIG_ROLLBACK:
      return {
        ...s,
        configActiveTab: 'versions',
        auditLog: log(`CONFIG ROLLBACK to ${p.targetVersion ?? '—'} — ${p.reason ?? ''}`),
      };

    case A.CONFIG_IMPORT:
      return {
        ...s,
        configActiveTab: 'overview',
        auditLog: log(`CONFIG IMPORT — ${p.reason ?? ''}`),
      };

    case A.CONFIG_RESET:
      return {
        ...s,
        configActiveTab: 'overview',
        auditLog: log('CONFIG FACTORY RESET'),
      };

    case A.CONFIG_TAB_CHANGE:
      return { ...s, configActiveTab: p.tab ?? 'overview' };

    default:
      return s;
  }
}

// ── dispatch — Applies an intent to global state and schedules a re-render ──
export function dispatch(intent, payload = {}) {
  setS(reduce(S, intent, payload));
  scheduleRender();
}

// ── scheduleRender — RAF-throttled; fires 'sentinel:render' CustomEvent ────
// Each MFE's mount() subscribes to this event independently.
// A crash in one MFE render function cannot affect others (errors are caught
// in callRenderer() above, not here).
let _renderQueued = false;
export function scheduleRender() {
  if (!_renderQueued) {
    _renderQueued = true;
    requestAnimationFrame(() => {
      _renderQueued = false;
      document.dispatchEvent(new CustomEvent('sentinel:render', { detail: S }));
    });
  }
}
