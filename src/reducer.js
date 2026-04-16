import { DAO } from './dao.js';
import { S, setS, mkModel } from './model.js';
import { mkEntry } from '../utils.js';
import { render } from './views/render.js';

export const INTENT_PERMISSIONS = { 'SCRAM':['OD','AS'], 'RESET_SCRAM':['AS'], 'TOGGLE_AUTOPILOT':['OD','AS'], 'RESET_INTERLOCKS':['AS'], 'SHELF_ALARM':['OD','AS'], 'UNSHELVE_ALARM':['OD','AS'] };

// ═══════════════════════════════════════════════════════════════════
export function reduce(s, intent, p = {}) {
  // ── RBAC intent guard (ISA-101 §6.5 / NUREG-0700) ─────────────────
  if (window.INTENT_PERMISSIONS && INTENT_PERMISSIONS[intent]) {
    const allowed = INTENT_PERMISSIONS[intent];
    if (!s.role || !allowed.includes(s.role)) {
      const denyMsg = `SECURITY: Intent "${intent}" denied — role ${s.role||'NONE'} lacks permission`;
      console.warn(`[RBAC] ${denyMsg}`);
      return { ...s, auditLog: [...s.auditLog, mkEntry(denyMsg, s.role)] };
    }
  }

  const log = msg => [...s.auditLog, mkEntry(msg, s.role)];

  switch (intent) {
    case 'SET_ROLE':
      return { ...s, role:p.role, sessionStart:new Date(), lastActivity:Date.now(), auditLog:log(`Session started. Role: ${p.role}`) };
    case 'NAVIGATE':
      return { ...s, activePanel:p.panel, auditLog:log(`Navigated to: ${p.panel}`) };
    case 'ACK_ALL':
      return { ...s, alarms:s.alarms.map(a=>({...a,acked:true})), auditLog:log('All alarms acknowledged') };
    case 'DISMISS_BANNER':
      return { ...s, bannerOn:false };
    case 'ADD_ALARM': {
      // ISA-101: first alarm in a new cascade is marked firstOut
      const hasActive = s.alarms.some(a => !a.acked && !a.cleared && !a.shelved);
      const newAlarm = { cleared:false, shelved:false, firstOut:!hasActive, ...p.alarm };
      return { ...s, alarms:[...s.alarms, newAlarm], bannerOn:true, auditLog:log(`ALARM [P${newAlarm.p}] ${newAlarm.tag}: ${newAlarm.msg}${newAlarm.firstOut?' [FIRST-OUT]':''}`) };
    }
    case 'CLEAR_ALARM':
      return { ...s, alarms:s.alarms.map(a => a.id===p.id ? {...a, cleared:true} : a), auditLog:log(`Alarm cleared: ${p.id}`) };
    case 'SHELF_ALARM':
      // ISA-101 §5.6: Shelving temporarily suppresses a nuisance alarm
      return { ...s, alarms:s.alarms.map(a => a.id===p.id ? {...a, shelved:true} : a), auditLog:log(`Alarm shelved: ${p.id} (OD/AS only)`) };
    case 'UNSHELVE_ALARM':
      return { ...s, alarms:s.alarms.map(a => a.id===p.id ? {...a, shelved:false} : a), auditLog:log(`Alarm unshelved: ${p.id}`) };
    case 'CLEAR_ALARMS_BY_PREFIX':
      return { ...s, alarms:s.alarms.filter(a=>!a.id.startsWith(p.prefix)) };
    case 'TICK':
      return {
        ...s,
        sensors: DAO.snapshot(),
        histTemp:  [...s.histTemp.slice(-19),  s.sensors.CORE_TEMP?.v  ?? 1045],
        histPress: [...s.histPress.slice(-19), s.sensors.PRIM_PRESS?.v ?? 215],
      };
    case 'SCRAM':
      return { ...s, scramActive:true, auditLog:log(`⚠ SCRAM INITIATED by ${s.role || 'SYSTEM'}`) };
    case 'RESET_SCRAM':
      return { ...s, scramActive:false, auditLog:log('SCRAM state reset — nominal restored') };
    case 'ADVANCE_PROTOCOL':
      return { ...s, protocolStep:Math.min(s.protocolStep+1,4), auditLog:log(`SCCP-74A Step ${s.protocolStep} acknowledged`) };
    case 'TOGGLE_AUTOPILOT':
      return { ...s, autoPilot:!s.autoPilot, auditLog:log(`Auto-Pilot ${!s.autoPilot?'ENABLED':'DISABLED'}`) };
    case 'TOGGLE_AUDIT':
      return { ...s, auditPanelOpen:!s.auditPanelOpen };
    case 'CLEAR_AUDIT':
      return { ...s, auditLog:[mkEntry('Audit log cleared',s.role)] };
    case 'RESET_INTERLOCKS':
      return { ...s, interlocks:s.interlocks.map(i=>i.st==='OFFLINE'?{...i,st:'ARMED'}:i), auditLog:log('Interlocks reset to ARMED') };
    case 'LOG':
      return { ...s, auditLog:log(p.msg) };
    case 'TOUCH_ACTIVITY':
      return { ...s, lastActivity:Date.now() };
    case 'SESSION_TIMEOUT':
      return { ...mkModel(), auditLog:[mkEntry('SESSION TIMEOUT: Automatic logout after inactivity', null)] };
    case 'TOGGLE_HIGH_CONTRAST': {
      // NUREG-0700 §11.4.2: High-contrast mode for varied lighting conditions
      const hc = !s.highContrast;
      document.documentElement.setAttribute('data-theme', hc ? 'high-contrast' : 'default');
      return { ...s, highContrast: hc, auditLog:log(`High-contrast mode ${hc ? 'ENABLED' : 'DISABLED'}`) };
    }
    case 'SET_DEMO_MODE':
      return { ...s, demoMode:p.active };
    default:
      return s;
  }
}

export function dispatch(intent, payload = {}) {
  setS(reduce(S, intent, payload));
  scheduleRender();
}

let _rq = false;
export function scheduleRender() {
  if (!_rq) { _rq = true; requestAnimationFrame(() => { _rq = false; render(S); }); }
}