import { describe, test, expect, vi, beforeEach } from 'vitest';
import { reduce } from '../src/reducer.js';
import { mkModel } from '../src/model.js';
import { ACTION_TYPES as A } from '../constants/actionTypes.js';

/**
 * CORE-SENTINEL HMI — Reducer Unit Tests (RECOVERED & REAL)
 * IEC 61511 §11.5: Software validation evidence
 * 
 * These tests IMPORT the actual reducer logic from src/reducer.js.
 * We mock DOM-dependent modules like 'render.js' to ensure Node compatibility.
 */

// ─── Mocks for Browser-specific modules ─────────────────────────────
vi.mock('../src/views/render.js', () => ({
  render: vi.fn(),
  renderRole: vi.fn(),
  renderPanels: vi.fn(),
  renderAlarmBanner: vi.fn(),
  renderHUD: vi.fn(),
  renderSystemHealth: vi.fn(),
  renderCyberPanel: vi.fn(),
  renderCharts: vi.fn(),
  renderAuditPanel: vi.fn(),
  renderSafetyPanel: vi.fn(),
  renderSecondaryStats: vi.fn(),
  renderDiagnostics: vi.fn(),
  renderAIPredictions: vi.fn(),
  renderAnomalyList: vi.fn(),
  renderCopilotSteps: vi.fn(),
}));

// Mock utils if needed (ts and mkEntry are mostly pure, but let's be safe)
vi.mock('../utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ts: () => '11:50:00 UTC',
    // We don't mock mkEntry unless it touches DOM
  };
});

describe('MVI Reducer — RBAC Guards (ISA-101 §6.5)', () => {

  test('SCRAM is denied for OL role', () => {
    const s = { ...mkModel(), role: 'OL', scramActive: false };
    const next = reduce(s, A.SCRAM);
    expect(next.scramActive).toBe(false);
    expect(next.auditLog.at(-1).msg).toMatch(/SECURITY.*SCRAM.*denied/);
  });

  test('SCRAM is denied when no role is set', () => {
    const s = mkModel(); // role is null by default
    const next = reduce(s, A.SCRAM);
    expect(next.scramActive).toBe(false);
    expect(next.auditLog.at(-1).msg).toMatch(/SECURITY/);
  });

  test('SCRAM is permitted for OD role', () => {
    const s = { ...mkModel(), role: 'OD', scramActive: false };
    const next = reduce(s, A.SCRAM);
    expect(next.scramActive).toBe(true);
    expect(next.auditLog.at(-1).msg).toContain('SCRAM INITIATED');
  });

  test('SCRAM is permitted for AS role', () => {
    const s = { ...mkModel(), role: 'AS', scramActive: false };
    const next = reduce(s, A.SCRAM);
    expect(next.scramActive).toBe(true);
  });

  test('RESET_INTERLOCKS is denied for OD', () => {
    const s = { ...mkModel(), role: 'OD' };
    // I005 is OFFLINE by default in mkModel
    const next = reduce(s, A.RESET_INTERLOCKS);
    expect(next.interlocks.find(i => i.id === 'I005').st).toBe('OFFLINE');
    expect(next.auditLog.at(-1).msg).toMatch(/SECURITY/);
  });

  test('RESET_INTERLOCKS is permitted for AS', () => {
    const s = { ...mkModel(), role: 'AS' };
    const next = reduce(s, A.RESET_INTERLOCKS);
    expect(next.interlocks.find(i => i.id === 'I005').st).toBe('ARMED');
  });

  test('TOGGLE_AUTOPILOT is denied for OL', () => {
    const s = { ...mkModel(), role: 'OL', autoPilot: false };
    const next = reduce(s, A.TOGGLE_AUTOPILOT);
    expect(next.autoPilot).toBe(false);
  });
});

describe('MVI Reducer — Session / Auth', () => {

  test('SET_ROLE sets role and logs session start', () => {
    const s = mkModel();
    const next = reduce(s, A.SET_ROLE, { role: 'OD' });
    expect(next.role).toBe('OD');
    expect(next.sessionStart).toBeInstanceOf(Date);
    expect(next.auditLog.at(-1).msg).toContain('OD');
  });

  test('TOUCH_ACTIVITY updates lastActivity timestamp', () => {
    const before = Date.now();
    const s = { ...mkModel(), role: 'OL', lastActivity: 0 };
    const next = reduce(s, A.TOUCH_ACTIVITY);
    expect(next.lastActivity).toBeGreaterThanOrEqual(before);
  });
});

describe('MVI Reducer — Alarm Management (ISA-101)', () => {

  test('ADD_ALARM: always sets cleared:false', () => {
    const s = { ...mkModel(), role: 'OL' };
    const alarm = { id: 'TEST-01', p: 2, tag: 'T-CORE-01', msg: 'Test alarm' };
    const next = reduce(s, A.ADD_ALARM, { alarm });
    expect(next.alarms.at(-1).cleared).toBe(false);
    expect(next.bannerOn).toBe(true);
  });

  test('ADD_ALARM: ack:true and cleared:true can coexist independently', () => {
    const s = { ...mkModel(), role: 'OL', alarms: [] };
    const alarm = { id: 'TEST-02', p: 1, tag: 'T-CORE-01', msg: 'Critical' };
    let next = reduce(s, A.ADD_ALARM, { alarm });
    next = reduce(next, A.ACK_ALL);
    expect(next.alarms[0].acked).toBe(true);
    expect(next.alarms[0].cleared).toBe(false);

    next = reduce(next, A.CLEAR_ALARM, { id: 'TEST-02' });
    expect(next.alarms[0].cleared).toBe(true);
  });

  test('ACK_ALL: acknowledges all unacked alarms', () => {
    const s = {
      ...mkModel(), role: 'OL',
      alarms: [
        { id: 'A1', p: 1, acked: false, cleared: false },
        { id: 'A2', p: 2, acked: false, cleared: false },
      ],
    };
    const next = reduce(s, A.ACK_ALL);
    expect(next.alarms.every(a => a.acked)).toBe(true);
  });

  test('Audit trail logged for ALARM', () => {
    const s = { ...mkModel(), role: 'OD', alarms: [] };
    const alarm = { id: 'TEST-03', p: 1, tag: 'T-CORE-01', msg: 'Test' };
    const next = reduce(s, A.ADD_ALARM, { alarm });
    expect(next.auditLog.at(-1).msg).toContain('P1');
    expect(next.auditLog.at(-1).msg).toContain('T-CORE-01');
  });
});

describe('MVI Reducer — Navigation', () => {

  test('NAVIGATE updates active panel', () => {
    const s = mkModel();
    const next = reduce(s, A.NAVIGATE, { panel: 'panel-safety' });
    expect(next.activePanel).toBe('panel-safety');
  });

  test('NAVIGATE is logged to audit trail', () => {
    const s = { ...mkModel(), role: 'OL' };
    const next = reduce(s, A.NAVIGATE, { panel: 'panel-ai' });
    expect(next.auditLog.at(-1).msg).toContain('panel-ai');
  });
});

describe('MVI Reducer — Pure function invariants', () => {

  test('State is not mutated — original remains unchanged', () => {
    const s = { ...mkModel(), role: 'OD' };
    const sJson = JSON.stringify(s);
    reduce(s, A.SCRAM);
    expect(JSON.stringify(s)).toBe(sJson);
  });

  test('Unknown intent returns state unchanged', () => {
    const s = mkModel();
    const next = reduce(s, 'UNKNOWN_INTENT_XYZ');
    expect(next).toEqual(s);
  });
});

describe('MVI Reducer — ISA-101 Alarm Shelving (§5.6)', () => {

  const makeState = (role = 'OD') => ({ ...mkModel(), role });

  test('SHELF_ALARM: sets shelved:true on the target alarm', () => {
    let s = { ...makeState('OD'), alarms: [] };
    s = reduce(s, A.ADD_ALARM, {
      alarm: { id: 'A-SHELF-01', p: 2, tag: 'P-PRI-01', msg: 'Nuisance alarm' }
    });
    const next = reduce(s, A.SHELF_ALARM, { id: 'A-SHELF-01' });
    expect(next.alarms[0].shelved).toBe(true);
    expect(next.auditLog.at(-1).msg).toContain('shelved');
  });

  test('SHELF_ALARM: denied for OL role', () => {
    let s = { ...makeState('OL'), alarms: [] };
    s = reduce(s, A.ADD_ALARM, {
      alarm: { id: 'A-SHELF-02', p: 2, tag: 'P-PRI-01', msg: 'Alarm' }
    });
    const next = reduce(s, A.SHELF_ALARM, { id: 'A-SHELF-02' });
    expect(next.alarms[0].shelved).toBeFalsy();
    expect(next.auditLog.at(-1).msg).toMatch(/SECURITY/);
  });

  test('UNSHELVE_ALARM: restores shelved alarm to active', () => {
    let s = { ...makeState('AS'), alarms: [] };
    s = reduce(s, A.ADD_ALARM, {
      alarm: { id: 'A-SHELF-03', p: 1, tag: 'T-CORE-01', msg: 'Alarm' }
    });
    s = reduce(s, A.SHELF_ALARM, { id: 'A-SHELF-03' });
    expect(s.alarms[0].shelved).toBe(true);

    const restored = reduce(s, A.UNSHELVE_ALARM, { id: 'A-SHELF-03' });
    expect(restored.alarms[0].shelved).toBe(false);
    expect(restored.auditLog.at(-1).msg).toContain('unshelved');
  });

  test('SHELF_ALARM: does not affect other alarms', () => {
    let s = { ...makeState('AS'), alarms: [] };
    s = reduce(s, A.ADD_ALARM, { alarm: { id: 'A1', p: 1, tag: 'X', msg: 'M' } });
    s = reduce(s, A.ADD_ALARM, { alarm: { id: 'A2', p: 2, tag: 'Y', msg: 'N' } });
    const next = reduce(s, A.SHELF_ALARM, { id: 'A1' });
    expect(next.alarms.find(a => a.id === 'A1').shelved).toBe(true);
    expect(next.alarms.find(a => a.id === 'A2').shelved).toBeFalsy();
  });
});

describe('MVI Reducer — ISA-101 First-Out Tracking', () => {

  test('First alarm in quiet state is marked firstOut:true', () => {
    const s = { ...mkModel(), role: 'OL', alarms: [] };
    const next = reduce(s, A.ADD_ALARM, {
      alarm: { id: 'FO-01', p: 1, tag: 'T-CORE-01', msg: 'Trip' }
    });
    expect(next.alarms[0].firstOut).toBe(true);
  });

  test('Second alarm in active cascade is NOT firstOut', () => {
    let s = { ...mkModel(), role: 'OL', alarms: [] };
    s = reduce(s, A.ADD_ALARM, {
      alarm: { id: 'FO-02a', p: 1, tag: 'T-CORE-01', msg: 'First' }
    });
    const next = reduce(s, A.ADD_ALARM, {
      alarm: { id: 'FO-02b', p: 2, tag: 'P-PRI-01', msg: 'Second' }
    });
    expect(next.alarms[0].firstOut).toBe(true);
    expect(next.alarms[1].firstOut).toBe(false);
  });

  test('New alarm gets firstOut if all previous are cleared/shelved', () => {
    let s = { ...mkModel(), role: 'AS', alarms: [] };
    s = reduce(s, A.ADD_ALARM, {
      alarm: { id: 'FO-03a', p: 2, tag: 'A', msg: 'Old' }
    });
    s = reduce(s, A.SHELF_ALARM, { id: 'FO-03a' });
    const next = reduce(s, A.ADD_ALARM, {
      alarm: { id: 'FO-03b', p: 1, tag: 'B', msg: 'New' }
    });
    expect(next.alarms.at(-1).firstOut).toBe(true);
  });
});
