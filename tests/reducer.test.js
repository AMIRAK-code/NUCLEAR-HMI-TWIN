import { describe, test, expect } from 'vitest';
/**
 * CORE-SENTINEL HMI — Reducer Unit Tests
 * IEC 61511 §11.5: Software validation evidence
 *
 * Run with: npx vitest run
 * Or:       npx jest
 *
 * These tests cover the pure MVI reducer function.
 * No DOM is required — the reducer is a pure function: (state, intent, payload) => newState
 */

// ─── Minimal stubs for browser globals not present in Node ───────────
const globalMock = {
  ts: () => '00:00:00 UTC',
  mkEntry: (msg, role) => ({ ts: '00:00:00 UTC', role: role || 'SYS', msg }),
};

// ─── Import or inline the functions under test ────────────────────────
// In a proper ES-module setup these would be: import { reduce, mkModel } from '../src/reducer.js'
// For now, we replicate the key logic here for standalone testability.

const INTENT_PERMISSIONS = {
  SCRAM: ['OD', 'AS'],
  RESET_INTERLOCKS: ['AS'],
  TOGGLE_AUTOPILOT: ['OD', 'AS'],
  SHELF_ALARM: ['OD', 'AS'],
  UNSHELVE_ALARM: ['OD', 'AS'],
};

function makeBaseModel() {
  return {
    role: null,
    sessionStart: null,
    lastActivity: null,
    activePanel: 'panel-primary',
    alarms: [],
    bannerOn: false,
    sensors: {},
    controlRods: [],
    interlocks: [
      { id: 'I001', label: 'Hi-Hi Core Temp', tag: 'T-CORE-01', st: 'OFFLINE', sp: '1200°C' },
    ],
    scramActive: false,
    protocolStep: 1,
    autoPilot: false,
    histTemp: [],
    histPress: [],
    auditLog: [],
    auditPanelOpen: false,
    demoMode: false,
  };
}

function reduce(s, intent, p = {}) {
  if (INTENT_PERMISSIONS[intent]) {
    const allowed = INTENT_PERMISSIONS[intent];
    if (!s.role || !allowed.includes(s.role)) {
      const denyMsg = `SECURITY: Intent "${intent}" denied — role ${s.role || 'NONE'} lacks permission`;
      return { ...s, auditLog: [...s.auditLog, globalMock.mkEntry(denyMsg, s.role)] };
    }
  }

  const log = msg => [...s.auditLog, globalMock.mkEntry(msg, s.role)];

  switch (intent) {
    case 'SET_ROLE':
      return { ...s, role: p.role, sessionStart: new Date(), lastActivity: Date.now(), auditLog: log(`Session started. Role: ${p.role}`) };
    case 'NAVIGATE':
      return { ...s, activePanel: p.panel, auditLog: log(`Navigated to: ${p.panel}`) };
    case 'ACK_ALL':
      return { ...s, alarms: s.alarms.map(a => ({ ...a, acked: true })), auditLog: log('All alarms acknowledged') };
    case 'DISMISS_BANNER':
      return { ...s, bannerOn: false };
    case 'ADD_ALARM': {
      // ISA-101: first alarm in quiet state is marked firstOut
      const hasActive = s.alarms.some(a => !a.acked && !a.cleared && !a.shelved);
      const newAlarm = { cleared: false, shelved: false, firstOut: !hasActive, ...p.alarm };
      return { ...s, alarms: [...s.alarms, newAlarm], bannerOn: true, auditLog: log(`ALARM [P${newAlarm.p}] ${newAlarm.tag}: ${newAlarm.msg}${newAlarm.firstOut ? ' [FIRST-OUT]' : ''}`) };
    }
    case 'CLEAR_ALARM':
      return { ...s, alarms: s.alarms.map(a => a.id === p.id ? { ...a, cleared: true } : a), auditLog: log(`Alarm cleared: ${p.id}`) };
    case 'SHELF_ALARM':
      return { ...s, alarms: s.alarms.map(a => a.id === p.id ? { ...a, shelved: true } : a), auditLog: log(`Alarm shelved: ${p.id}`) };
    case 'UNSHELVE_ALARM':
      return { ...s, alarms: s.alarms.map(a => a.id === p.id ? { ...a, shelved: false } : a), auditLog: log(`Alarm unshelved: ${p.id}`) };
    case 'SCRAM':
      return { ...s, scramActive: true, auditLog: log(`⚠ SCRAM INITIATED by ${s.role || 'SYSTEM'}`) };
    case 'RESET_SCRAM':
      return { ...s, scramActive: false, auditLog: log('SCRAM state reset — nominal restored') };
    case 'RESET_INTERLOCKS':
      return { ...s, interlocks: s.interlocks.map(i => i.st === 'OFFLINE' ? { ...i, st: 'ARMED' } : i), auditLog: log('Interlocks reset to ARMED') };
    case 'TOGGLE_AUTOPILOT':
      return { ...s, autoPilot: !s.autoPilot, auditLog: log(`Auto-Pilot ${!s.autoPilot ? 'ENABLED' : 'DISABLED'}`) };
    case 'LOG':
      return { ...s, auditLog: log(p.msg) };
    case 'TOUCH_ACTIVITY':
      return { ...s, lastActivity: Date.now() };
    case 'CLEAR_AUDIT':
      return { ...s, auditLog: [globalMock.mkEntry('Audit log cleared', s.role)] };
    default:
      return s;
  }
}

// ─── Test Suite ───────────────────────────────────────────────────────

describe('MVI Reducer — RBAC Guards (ISA-101 §6.5)', () => {

  test('SCRAM is denied for OL role', () => {
    const s = { ...makeBaseModel(), role: 'OL' };
    const next = reduce(s, 'SCRAM');
    expect(next.scramActive).toBe(false);
    expect(next.auditLog.at(-1).msg).toMatch(/SECURITY.*SCRAM.*denied/);
  });

  test('SCRAM is denied when no role is set', () => {
    const s = makeBaseModel();
    const next = reduce(s, 'SCRAM');
    expect(next.scramActive).toBe(false);
    expect(next.auditLog.at(-1).msg).toMatch(/SECURITY/);
  });

  test('SCRAM is permitted for OD role', () => {
    const s = { ...makeBaseModel(), role: 'OD' };
    const next = reduce(s, 'SCRAM');
    expect(next.scramActive).toBe(true);
    expect(next.auditLog.at(-1).msg).toContain('SCRAM INITIATED');
  });

  test('SCRAM is permitted for AS role', () => {
    const s = { ...makeBaseModel(), role: 'AS' };
    const next = reduce(s, 'SCRAM');
    expect(next.scramActive).toBe(true);
  });

  test('RESET_INTERLOCKS is denied for OD', () => {
    const s = { ...makeBaseModel(), role: 'OD' };
    const next = reduce(s, 'RESET_INTERLOCKS');
    // Interlocks should NOT change
    expect(next.interlocks[0].st).toBe('OFFLINE');
    expect(next.auditLog.at(-1).msg).toMatch(/SECURITY/);
  });

  test('RESET_INTERLOCKS is permitted for AS', () => {
    const s = { ...makeBaseModel(), role: 'AS' };
    const next = reduce(s, 'RESET_INTERLOCKS');
    expect(next.interlocks[0].st).toBe('ARMED');
  });

  test('TOGGLE_AUTOPILOT is denied for OL', () => {
    const s = { ...makeBaseModel(), role: 'OL', autoPilot: false };
    const next = reduce(s, 'TOGGLE_AUTOPILOT');
    expect(next.autoPilot).toBe(false);
  });
});

describe('MVI Reducer — Session / Auth', () => {

  test('SET_ROLE sets role and logs session start', () => {
    const s = makeBaseModel();
    const next = reduce(s, 'SET_ROLE', { role: 'OD' });
    expect(next.role).toBe('OD');
    expect(next.sessionStart).toBeInstanceOf(Date);
    expect(next.auditLog.at(-1).msg).toContain('OD');
  });

  test('TOUCH_ACTIVITY updates lastActivity timestamp', () => {
    const before = Date.now();
    const s = { ...makeBaseModel(), role: 'OL', lastActivity: 0 };
    const next = reduce(s, 'TOUCH_ACTIVITY');
    expect(next.lastActivity).toBeGreaterThanOrEqual(before);
  });
});

describe('MVI Reducer — Alarm Management (ISA-101)', () => {

  test('ADD_ALARM: always sets cleared:false', () => {
    const s = { ...makeBaseModel(), role: 'OL' };
    const alarm = { id: 'TEST-01', p: 2, tag: 'T-CORE-01', msg: 'Test alarm', acked: false, ts: '00:00:00 UTC' };
    const next = reduce(s, 'ADD_ALARM', { alarm });
    expect(next.alarms[0].cleared).toBe(false);
    expect(next.bannerOn).toBe(true);
  });

  test('ADD_ALARM: ack:true and cleared:true can coexist independently', () => {
    const s = { ...makeBaseModel(), role: 'OL' };
    const alarm = { id: 'TEST-02', p: 1, tag: 'T-CORE-01', msg: 'Critical', acked: false, ts: '00:00:00 UTC' };
    let next = reduce(s, 'ADD_ALARM', { alarm });
    next = reduce(next, 'ACK_ALL');
    expect(next.alarms[0].acked).toBe(true);
    expect(next.alarms[0].cleared).toBe(false); // still not cleared

    next = reduce(next, 'CLEAR_ALARM', { id: 'TEST-02' });
    expect(next.alarms[0].cleared).toBe(true);
  });

  test('ACK_ALL: acknowledges all unacked alarms', () => {
    const s = {
      ...makeBaseModel(), role: 'OL',
      alarms: [
        { id: 'A1', p: 1, acked: false, cleared: false },
        { id: 'A2', p: 2, acked: false, cleared: false },
      ],
    };
    const next = reduce(s, 'ACK_ALL');
    expect(next.alarms.every(a => a.acked)).toBe(true);
  });

  test('Audit trail logged for ALARM', () => {
    const s = { ...makeBaseModel(), role: 'OD' };
    const alarm = { id: 'TEST-03', p: 1, tag: 'T-CORE-01', msg: 'Test', acked: false, ts: '00:00:00 UTC' };
    const next = reduce(s, 'ADD_ALARM', { alarm });
    expect(next.auditLog.at(-1).msg).toContain('P1');
    expect(next.auditLog.at(-1).msg).toContain('T-CORE-01');
  });
});

describe('MVI Reducer — Navigation', () => {

  test('NAVIGATE updates active panel', () => {
    const s = makeBaseModel();
    const next = reduce(s, 'NAVIGATE', { panel: 'panel-safety' });
    expect(next.activePanel).toBe('panel-safety');
  });

  test('NAVIGATE is logged to audit trail', () => {
    const s = { ...makeBaseModel(), role: 'OL' };
    const next = reduce(s, 'NAVIGATE', { panel: 'panel-ai' });
    expect(next.auditLog.at(-1).msg).toContain('panel-ai');
  });
});

describe('MVI Reducer — Pure function invariants', () => {

  test('State is not mutated — original remains unchanged', () => {
    const s = { ...makeBaseModel(), role: 'OD' };
    const sJson = JSON.stringify(s);
    reduce(s, 'SCRAM');
    expect(JSON.stringify(s)).toBe(sJson);
  });

  test('Unknown intent returns state unchanged', () => {
    const s = makeBaseModel();
    const next = reduce(s, 'UNKNOWN_INTENT_XYZ');
    expect(next).toEqual(s);
  });
});

describe('MVI Reducer — ISA-101 Alarm Shelving (§5.6)', () => {

  const makeState = (role = 'OD') => ({ ...makeBaseModel(), role });

  test('SHELF_ALARM: sets shelved:true on the target alarm', () => {
    let s = makeState('OD');
    s = reduce(s, 'ADD_ALARM', {
      alarm: { id: 'A-SHELF-01', p: 2, tag: 'P-PRI-01', msg: 'Nuisance alarm', acked: false, ts: '00:00:00 UTC' }
    });
    const next = reduce(s, 'SHELF_ALARM', { id: 'A-SHELF-01' });
    expect(next.alarms[0].shelved).toBe(true);
    expect(next.auditLog.at(-1).msg).toContain('shelved');
  });

  test('SHELF_ALARM: denied for OL role', () => {
    let s = makeState('OL');
    s = reduce(s, 'ADD_ALARM', {
      alarm: { id: 'A-SHELF-02', p: 2, tag: 'P-PRI-01', msg: 'Alarm', acked: false, ts: '00:00:00 UTC' }
    });
    const next = reduce(s, 'SHELF_ALARM', { id: 'A-SHELF-02' });
    // OL cannot shelf — alarm should remain unshelved
    expect(next.alarms[0].shelved).toBeFalsy();
    expect(next.auditLog.at(-1).msg).toMatch(/SECURITY/);
  });

  test('UNSHELVE_ALARM: restores shelved alarm to active', () => {
    let s = makeState('AS');
    s = reduce(s, 'ADD_ALARM', {
      alarm: { id: 'A-SHELF-03', p: 1, tag: 'T-CORE-01', msg: 'Alarm', acked: false, ts: '00:00:00 UTC' }
    });
    s = reduce(s, 'SHELF_ALARM', { id: 'A-SHELF-03' });
    expect(s.alarms[0].shelved).toBe(true);

    const restored = reduce(s, 'UNSHELVE_ALARM', { id: 'A-SHELF-03' });
    expect(restored.alarms[0].shelved).toBe(false);
    expect(restored.auditLog.at(-1).msg).toContain('unshelved');
  });

  test('SHELF_ALARM: does not affect other alarms', () => {
    let s = makeState('AS');
    s = reduce(s, 'ADD_ALARM', { alarm: { id: 'A1', p: 1, tag: 'X', msg: 'M', acked: false, ts: '00:00:00 UTC' } });
    s = reduce(s, 'ADD_ALARM', { alarm: { id: 'A2', p: 2, tag: 'Y', msg: 'N', acked: false, ts: '00:00:00 UTC' } });
    const next = reduce(s, 'SHELF_ALARM', { id: 'A1' });
    expect(next.alarms.find(a => a.id === 'A1').shelved).toBe(true);
    expect(next.alarms.find(a => a.id === 'A2').shelved).toBeFalsy();
  });
});

describe('MVI Reducer — ISA-101 First-Out Tracking', () => {

  test('First alarm in quiet state is marked firstOut:true', () => {
    const s = { ...makeBaseModel(), role: 'OL' };
    const next = reduce(s, 'ADD_ALARM', {
      alarm: { id: 'FO-01', p: 1, tag: 'T-CORE-01', msg: 'Trip', acked: false, ts: '00:00:00 UTC' }
    });
    expect(next.alarms[0].firstOut).toBe(true);
  });

  test('Second alarm in active cascade is NOT firstOut', () => {
    let s = { ...makeBaseModel(), role: 'OL' };
    s = reduce(s, 'ADD_ALARM', {
      alarm: { id: 'FO-02a', p: 1, tag: 'T-CORE-01', msg: 'First', acked: false, ts: '00:00:00 UTC' }
    });
    const next = reduce(s, 'ADD_ALARM', {
      alarm: { id: 'FO-02b', p: 2, tag: 'P-PRI-01', msg: 'Second', acked: false, ts: '00:00:00 UTC' }
    });
    expect(next.alarms[0].firstOut).toBe(true);  // original first-out preserved
    expect(next.alarms[1].firstOut).toBe(false);  // subsequent alarm is not first-out
  });

  test('New alarm gets firstOut if all previous are cleared/shelved', () => {
    let s = { ...makeBaseModel(), role: 'AS' };
    s = reduce(s, 'ADD_ALARM', {
      alarm: { id: 'FO-03a', p: 2, tag: 'A', msg: 'Old', acked: true, ts: '00:00:00 UTC' }
    });
    s = reduce(s, 'SHELF_ALARM', { id: 'FO-03a' }); // shelve it
    // Now state has no active unshelved alarm
    const next = reduce(s, 'ADD_ALARM', {
      alarm: { id: 'FO-03b', p: 1, tag: 'B', msg: 'New', acked: false, ts: '00:00:00 UTC' }
    });
    expect(next.alarms.at(-1).firstOut).toBe(true);
  });
});
