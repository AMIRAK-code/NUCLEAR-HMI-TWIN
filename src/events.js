import { ACTION_TYPES as A } from '../constants/actionTypes.js';
import { S, setS } from '@shared/src/model.js';
import { DAO } from '@shared/src/dao.js';
import { dispatch, scheduleRender } from '@shared/src/reducer.js';
import { ts, escHtml, dlFile, setText } from '@shared/utils.js';
import { ScenarioEngine, registerScenarioCallbacks } from '@shared/src/scenario-engine.js';
import { renderDiagnostics } from './views/render.js';
import { RBACContext, bindGuardedButton, renderRoleSummary } from '@shared/src/rbac-factory.js';
import { ConfigService }  from '@shared/src/config-service.js';
import { TelemetryBuffer } from '@shared/src/telemetry-buffer.js';
import { UnitConverter }   from '@shared/src/unit-converter.js';


// P5 convergence: the shared scenario-engine is MFE-decoupled — it never imports
// from the shell/monolith. Inject this app's callbacks so its scenarios can drive
// the AI feed, demo bar, and emergency overlay. (Functions below are hoisted.)
registerScenarioCallbacks({ addAIMessage, showDemoBar, setEmergencyOverlay, hideDemoBar });

let _onConfirm = null;

export function showModal({ icon='info', title, content, primary='ACKNOWLEDGE', secondary=null, onConfirm=null }) {
  const modalIcon = document.getElementById('modal-icon');
  if (modalIcon) modalIcon.textContent = icon;
  setText('modal-title', title);
  const modalContent = document.getElementById('modal-content');
  if (modalContent) modalContent.innerHTML = content;
  setText('btn-modal-pri', primary);
  const sec = document.getElementById('btn-modal-sec');
  if (sec) {
    if (secondary) {
      sec.textContent = secondary;
      sec.classList.remove('hidden');
    } else {
      sec.classList.add('hidden');
    }
  }
  _onConfirm = onConfirm;
  const ov = document.getElementById('modal-overlay');
  if (ov) {
    ov.classList.remove('hidden');
    ov.classList.add('flex');
  }
}

export function hideModal() {
  const ov = document.getElementById('modal-overlay');
  if (ov) {
    ov.classList.add('hidden');
    ov.classList.remove('flex');
  }
  _onConfirm = null;
}

export function showDemoBar(msg, col) {
  const bar = document.getElementById('demo-bar');
  const inner = document.getElementById('demo-inner');
  if (!bar || !inner) return;
  bar.style.height = '2.5rem';
  const bg = col==='#e31a1a'?'#fcdcdc':col==='#159647'?'#03140a':col==='#d97d06'?'#141000':'#100c00';
  inner.style.background = bg;
  inner.style.borderColor = col + '40';
  setText('demo-bar-text', msg);
  const blink = document.querySelector('#demo-inner .blink');
  if (blink) blink.style.color = col;
}

export function hideDemoBar() {
  const bar = document.getElementById('demo-bar');
  if (bar) bar.style.height = '0';
}

export function setEmergencyOverlay(opacity) {
  const el = document.getElementById('three-emergency-overlay');
  if (el) el.style.opacity = Math.min(1, opacity);
}

export function bindAll() {
  document.getElementById('btn-modal-close')?.addEventListener('click', hideModal);
  document.getElementById('btn-modal-sec')?.addEventListener('click', hideModal);
  document.getElementById('btn-modal-pri')?.addEventListener('click', () => { if(_onConfirm) _onConfirm(); hideModal(); });
  document.getElementById('modal-overlay')?.addEventListener('click', e => { if(e.target.id==='modal-overlay') hideModal(); });

  document.querySelectorAll('.role-btn').forEach(b => {
    b.addEventListener('click', () => {
      const role = b.getAttribute('data-role');
      dispatch(A.SET_ROLE, {role});
      const overlay = document.getElementById('role-overlay');
      if (overlay) overlay.style.display = 'none';
      const aiTs = document.getElementById('ai-init-ts');
      if (aiTs) aiTs.textContent = ts();

      RBACContext.setRole(role);
      const navCyber = document.getElementById('nav-cyber');
      if (navCyber) navCyber.style.display = role === 'AS' ? '' : 'none';
      const navConfig = document.getElementById('nav-config');
      if (navConfig) navConfig.style.display = (role === 'AS' || role === 'OD') ? '' : 'none';
      const navConfigTab = document.getElementById('nav-config-tab');
      if (navConfigTab) navConfigTab.style.display = (role === 'AS' || role === 'OD') ? '' : 'none';
      // Training panel: TR, OD, AS can access
      const navTraining = document.getElementById('nav-training');
      if (navTraining) navTraining.style.display = (role === 'TR' || role === 'OD' || role === 'AS') ? '' : 'none';
      // For TR role, navigate straight to training panel
      if (role === 'TR') dispatch(A.NAVIGATE, { panel: 'panel-training' });
    });
  });

  document.querySelectorAll('.nav-s, .nav-t').forEach(b => {
    b.addEventListener('click', () => {
      const panel = b.getAttribute('data-panel');
      if (panel) dispatch(A.NAVIGATE, {panel});
    });
  });

  document.getElementById('btn-toggle-prediction')?.addEventListener('click', () => dispatch(A.TOGGLE_PREDICTION));

  document.getElementById('btn-ack-all')?.addEventListener('click', () => dispatch(A.ACK_ALL));
  document.getElementById('btn-dismiss-banner')?.addEventListener('click', () => dispatch(A.DISMISS_BANNER));

  ['btn-audit-hdr','btn-logs'].forEach(id => document.getElementById(id)?.addEventListener('click', () => dispatch(A.TOGGLE_AUDIT)));
  document.getElementById('btn-close-audit')?.addEventListener('click', () => dispatch(A.TOGGLE_AUDIT));
  document.getElementById('btn-clear-audit')?.addEventListener('click', () => dispatch(A.CLEAR_AUDIT));
  document.getElementById('btn-export-audit')?.addEventListener('click', () => {
    const csv = 'Timestamp,Role,Event\n' + S.auditLog.map(e=>`"${e.ts}","${e.role}","${e.msg}"`).join('\n');
    dlFile(csv, `audit-${Date.now()}.csv`, 'text/csv');
    dispatch(A.LOG,{msg:'Audit log exported to CSV'});
  });

  document.getElementById('btn-demo')?.addEventListener('click', () => {
    if (S.role === 'OL') {
      showModal({
        icon: 'lock',
        title: 'Access Denied — Emergency Simulator',
        content: `<div class="tv text-sm space-y-3">
          <div style="color:#e31a1a;font-weight:700;font-size:12px;padding:10px;
                      border:1px solid rgba(255,32,32,.2);background:rgba(255,32,32,.05);">
            PERMISSION DENIED — CMP-22
          </div>
          <p style="color:#343a40;font-size:11px;">
            The Emergency Scenario Simulator (CMP-22) requires Diagnostic Operator (OD) or System Admin (AS) role.
          </p>
        </div>`
      });
      return;
    }
    showModal({
      icon: 'science',
      title: 'Emergency Scenario Simulator',
      content: `<div class="tv space-y-3 text-sm">
        <div class="space-y-2 mt-3">
          <button id="demo-btn-a" class="w-full text-left p-3 border border-[rgba(0,0,0,.1)] hover:bg-[#d1d6dc] transition-colors">
            <span class="tv font-bold text-[#d97d06] text-[11px] uppercase tracking-wider">Scenario A — Rising Core Temperature</span>
          </button>
          <button id="demo-btn-b" class="w-full text-left p-3 border border-[rgba(0,0,0,.1)] hover:bg-[#d1d6dc] transition-colors">
            <span class="tv font-bold text-[#cd5c08] text-[11px] uppercase tracking-wider">Scenario B — Loss of Coolant Flow (LOCA)</span>
          </button>
          <button id="demo-btn-c" class="w-full text-left p-3 border border-[rgba(0,0,0,.1)] hover:bg-[#d1d6dc] transition-colors">
            <span class="tv font-bold text-[#e31a1a] text-[11px] uppercase tracking-wider">Scenario C — Station Blackout (SBO)</span>
          </button>
        </div>
      </div>`,
      primary: 'CLOSE',
    });

    setTimeout(() => {
      document.getElementById('demo-btn-a')?.addEventListener('click', () => { hideModal(); ScenarioEngine.runRisingTemp(); dispatch(A.NAVIGATE,{panel:'panel-primary'}); });
      document.getElementById('demo-btn-b')?.addEventListener('click', () => { hideModal(); ScenarioEngine.runLOCA();       dispatch(A.NAVIGATE,{panel:'panel-primary'}); });
      document.getElementById('demo-btn-c')?.addEventListener('click', () => { hideModal(); ScenarioEngine.runBlackout();   dispatch(A.NAVIGATE,{panel:'panel-primary'}); });
    }, 50);
  });

  document.getElementById('btn-demo-reset')?.addEventListener('click', () => ScenarioEngine.resetToNominal());

  document.getElementById('btn-settings')?.addEventListener('click', () => {
    showModal({
      icon:'settings', title:'HMI Configuration',
      content:`<div class="tv text-sm space-y-4">
        <label class="flex items-center justify-between cursor-pointer py-1 border-b border-[rgba(0,0,0,.06)]">
          <span class="text-[#343a40]">High-Contrast Mode</span>
          <input type="checkbox" id="s-hc" class="w-4 h-4 accent-[#495057]" ${S.highContrast ? 'checked' : ''}/>
        </label>
        <label class="flex items-center justify-between cursor-pointer py-1 border-b border-[rgba(0,0,0,.06)]">
          <div>
            <span class="text-[#343a40]">Unit System</span>
            <div class="text-[10px] text-[#6c757d] mt-0.5">Affects all sensor display values (°C↔°F, bar↔PSI, kg/s↔lb/s)</div>
          </div>
          <div class="flex gap-1">
            <button id="s-unit-metric"
              class="tv text-[10px] font-bold px-2.5 py-1 border transition-colors
                ${UnitConverter.mode==='metric'?'bg-[#212529] text-white border-[#212529]':'border-[rgba(0,0,0,.15)] text-[#6c757d] hover:bg-[#e2e6ea]'}">
              METRIC
            </button>
            <button id="s-unit-imperial"
              class="tv text-[10px] font-bold px-2.5 py-1 border transition-colors
                ${UnitConverter.mode==='imperial'?'bg-[#212529] text-white border-[#212529]':'border-[rgba(0,0,0,.15)] text-[#6c757d] hover:bg-[#e2e6ea]'}">
              IMPERIAL
            </button>
          </div>
        </label>
        <div class="pt-2">
          <label class="text-[11px] text-[#6c757d] uppercase tracking-wider">DAO Source Mode</label>
          <select id="s-dao" class="w-full mt-1 bg-[#f4f6f8] border border-[rgba(0,0,0,.1)] px-2 py-1.5 focus:outline-none">
            <option value="SIMULATED" ${DAO.mode==='SIMULATED'?'selected':''}>SIMULATED</option>
            <option value="PHYSICAL" ${DAO.mode==='PHYSICAL'?'selected':''}>PHYSICAL</option>
          </select>
        </div>
      </div>`,
      primary:'SAVE CHANGES', secondary:'CANCEL',
      onConfirm: () => {
        const dao = document.getElementById('s-dao')?.value || 'SIMULATED';
        DAO.mode = dao;
        dispatch(A.LOG,{msg:`Settings saved. DAO mode: ${dao}, Units: ${UnitConverter.mode}`});
        const hcChecked = document.getElementById('s-hc')?.checked ?? false;
        if (hcChecked !== S.highContrast) dispatch(A.TOGGLE_HIGH_CONTRAST);
      }
    });
    setTimeout(() => {
      document.getElementById('s-unit-metric')?.addEventListener('click', () => {
        UnitConverter.setMode('metric');
        dispatch(A.LOG, { msg: 'Unit system set to METRIC' });
        scheduleRender();
        hideModal();
      });
      document.getElementById('s-unit-imperial')?.addEventListener('click', () => {
        UnitConverter.setMode('imperial');
        dispatch(A.LOG, { msg: 'Unit system set to IMPERIAL (°F, PSI, lb/s)' });
        scheduleRender();
        hideModal();
      });
    }, 50);
  });

  document.addEventListener('dao:unit:changed', () => scheduleRender());

  document.getElementById('btn-logout')?.addEventListener('click', () => {
    showModal({
      icon:'logout', title:'Esci dalla sessione',
      content:'<p class="text-[#343a40]">Confermi la chiusura della sessione e il ritorno alla selezione del ruolo?</p>',
      primary:'ESCI', secondary:'ANNULLA',
      onConfirm: () => {
        ScenarioEngine.stop();
        dispatch(A.LOG,{msg:'Sessione terminata — logout utente'});
        setTimeout(() => {
          const overlay = document.getElementById('role-overlay');
          if (overlay) overlay.style.display = 'flex';
          dispatch(A.SET_ROLE, {role: null});
        }, 300);
      }
    });
  });

  document.getElementById('btn-help')?.addEventListener('click', () => {
    showModal({
      icon:'help', title:'Protocol Documentation',
      content:'<p class="tv text-xs text-[#343a40]">Standard Operating Procedures (SOP-74A) for LFR-4G Core Operations.</p>'
    });
  });

  // Safety-critical buttons
  bindGuardedButton('btn-scram', 'CMP-09', 'U', () => {
    if (S.scramActive) return;
    showModal({
      icon:'power_settings_new', title:'⚠ CONFIRM SCRAM',
      content:'<p class="text-sm text-[#343a40]">Immediate reactor shutdown. All control rods will be inserted.</p>',
      primary:'EXECUTE SCRAM', secondary:'ABORT',
      onConfirm: () => {
        dispatch(A.SCRAM);
        dispatch(A.ADD_ALARM,{alarm:{id:'SCRAM-MAN',p:1,tag:'SCRAM',msg:'Manual SCRAM engaged',acked:false,ts:ts()}});
        ScenarioEngine.stop();
      }
    });
  }, showModal);

  bindGuardedButton('btn-depressurize', 'CMP-12', 'U', () => {
    showModal({
      icon:'warning', title:'Emergency Depressurize',
      content:'<p class="tv text-sm text-[#d97d06]">Confirm secondary circuit depressurization?</p>',
      primary:'CONFIRM', secondary:'CANCEL',
      onConfirm: () => {
        dispatch(A.LOG,{msg:'Emergency depressurization — ERV-01 opened'});
      }
    });
  }, showModal);

  bindGuardedButton('btn-reset-locks', 'CMP-13', 'U', () => {
    showModal({
      icon:'settings', title:'Reset Protection Interlocks',
      content:'<p class="tv text-sm text-[#343a40]">Reset all non-SCRAM interlocks to ARMED state.</p>',
      primary:'RESET', secondary:'CANCEL',
      onConfirm: () => dispatch(A.RESET_INTERLOCKS)
    });
  }, showModal);

  bindGuardedButton('btn-auto-pilot', 'CMP-17', 'U', () => {
    dispatch(A.TOGGLE_AUTOPILOT);
  }, showModal);

  bindGuardedButton('btn-diag-export', 'CMP-19', 'R', () => {
    const csv = 'Tag,Label,Value\n' + Object.values(S.sensors).map(s=>`"${s.tag}","${s.label}","${s.v}"`).join('\n');
    dlFile(csv, `sensors-${Date.now()}.csv`, 'text/csv');
  }, showModal);

  document.getElementById('btn-ai-query')?.addEventListener('click', handleAIQuery);
  document.getElementById('ai-query-input')?.addEventListener('keydown', e => { if(e.key==='Enter') handleAIQuery(); });

  document.getElementById('diag-search')?.addEventListener('input', () => renderDiagnostics(S));

  document.getElementById('btn-rbac-info')?.addEventListener('click', () => showModal({
    icon: 'info',
    title: 'Component Permission Matrix',
    content: renderRoleSummary(S.role || 'OL'),
    primary: 'CLOSE'
  }));

  // WP 1.3: Touch gesture layer — additive; all mouse/click handlers remain intact
  bindTouchGestures();
}

function handleAIQuery() {
  const inp = document.getElementById('ai-query-input');
  const q = inp.value.trim(); if (!q) return;
  addAIMessage(q, true); inp.value = '';
  dispatch(A.LOG,{msg:`AI query: "${q}"`});
  setTimeout(() => addAIMessage("Analysis complete. Current state nominal."), 1000);
}

export function startClock() {
  const el = document.getElementById('utc-clock');
  const FMT = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  function tick() {
    if (el) {
      const parts = FMT.formatToParts(new Date());
      const get = t => parts.find(p => p.type === t)?.value ?? '00';
      el.textContent = `${get('hour')}:${get('minute')}:${get('second')} IT`;
    }
  }
  tick();
  setInterval(tick, 1000);
}

const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
const TIMEOUT_WARN_MS    = 1 * 60 * 1000;
let _sessionWarnShown = false;
let _sessionTimer = null;

export function resetSessionTimer() {
  if (!S.role) return;
  _sessionWarnShown = false;
  if (_sessionTimer) clearTimeout(_sessionTimer);
  _sessionTimer = setTimeout(() => {
    ScenarioEngine.stop();
    dispatch(A.SESSION_TIMEOUT);
    const overlay = document.getElementById('role-overlay');
    if (overlay) overlay.style.display = 'flex';
  }, SESSION_TIMEOUT_MS);
}

// Checks all 16 sensors each tick and auto-raises/clears alarms against live setpoints
const _activeAutoAlarms = new Set();

function _runAlarmEngine(snapshot) {
  if (ScenarioEngine.active) return;
  const measures = ConfigService.get('measures') ?? {};

  Object.entries(snapshot).forEach(([key, sensor]) => {
    if (sensor?.v == null) return;
    const cfg = measures[key];
    if (!cfg) return;

    const { tripHigh, tripLow, priority = 2, tag, unit } = cfg;
    const v = sensor.v;

    const alarmIdHi = `AUTO-${key}-HI`;
    const alarmIdLo = `AUTO-${key}-LO`;

    if (tripHigh > 0 && v >= tripHigh) {
      if (!_activeAutoAlarms.has(alarmIdHi) && !S.alarms.find(a => a.id === alarmIdHi && !a.cleared)) {
        _activeAutoAlarms.add(alarmIdHi);
        dispatch(A.ADD_ALARM, { alarm: {
          id: alarmIdHi, p: priority,
          tag: tag ?? key,
          msg: `${cfg.label ?? key} exceeded trip high: ${v.toFixed(2)} ${unit} ≥ ${tripHigh} ${unit}`,
          acked: false, ts: ts(),
        }});
      }
    } else {
      if (_activeAutoAlarms.has(alarmIdHi)) {
        _activeAutoAlarms.delete(alarmIdHi);
        dispatch(A.CLEAR_ALARM, { id: alarmIdHi });
      }
    }

    // tripLow only applies where it's set (SCRAM_V, LEAD_LEVEL, etc.)
    if (tripLow > 0 && v <= tripLow) {
      if (!_activeAutoAlarms.has(alarmIdLo) && !S.alarms.find(a => a.id === alarmIdLo && !a.cleared)) {
        _activeAutoAlarms.add(alarmIdLo);
        dispatch(A.ADD_ALARM, { alarm: {
          id: alarmIdLo, p: priority,
          tag: tag ?? key,
          msg: `${cfg.label ?? key} below trip low: ${v.toFixed(2)} ${unit} ≤ ${tripLow} ${unit}`,
          acked: false, ts: ts(),
        }});
      }
    } else {
      if (_activeAutoAlarms.has(alarmIdLo)) {
        _activeAutoAlarms.delete(alarmIdLo);
        dispatch(A.CLEAR_ALARM, { id: alarmIdLo });
      }
    }
  });

  // SCRAM bus undervoltage trips AUTO_SCRAM directly
  const scv = snapshot.SCRAM_V?.v;
  const scvTrip = measures.SCRAM_V?.tripLow ?? 40;
  if (scv != null && scv < scvTrip && !S.scramActive) {
    if (!_activeAutoAlarms.has('AUTO-SCRAM-UV')) {
      _activeAutoAlarms.add('AUTO-SCRAM-UV');
      dispatch(A.ADD_ALARM, { alarm: {
        id: 'AUTO-SCRAM-UV', p: 1,
        tag: 'V-SCR-01',
        msg: `SCRAM bus undervoltage: ${scv.toFixed(1)} V < ${scvTrip} V — Auto-SCRAM initiated`,
        acked: false, ts: ts(),
      }});
      dispatch(A.AUTO_SCRAM);
    }
  }
}

export function startDataLoop() {
  setInterval(() => {
    if (!S.role) return;
    DAO.tick(S.scramActive);
    const snapshot = DAO.snapshot();
    dispatch(A.TICK, { snapshot });

    if (S.lastActivity && !_sessionWarnShown) {
      const idleMs = Date.now() - S.lastActivity;
      if (idleMs > SESSION_TIMEOUT_MS - TIMEOUT_WARN_MS) {
        _sessionWarnShown = true;
        showModal({
          icon: 'timer',
          title: 'Session Timeout Warning',
          content: '<p class="tv text-sm text-[#343a40]">Your session will expire in 1 minute due to inactivity.</p>',
          primary: 'STAY LOGGED IN',
          onConfirm: () => { dispatch(A.TOUCH_ACTIVITY); resetSessionTimer(); }
        });
      }
    }

    TelemetryBuffer.record(snapshot);
    _runAlarmEngine(snapshot);

    if (snapshot.PRIM_PRESS?.v != null) {
      const nominal = (ConfigService.get('measures')?.PRIM_PRESS?.nominalHigh) ?? 214.8;
      const delta = (snapshot.PRIM_PRESS.v - nominal).toFixed(1);
      const sign  = delta > 0 ? '+' : '';
      const copilotDelta = document.getElementById('copilot-delta');
      if (copilotDelta) copilotDelta.textContent = `${sign}${delta} PSI`;
    }
  }, 800);
}

export function addAIMessage(text, isUser=false) {
  const feed = document.getElementById('ai-feed');
  if (!feed) return;
  const div = document.createElement('div');
  div.className = 'flex gap-3 fade-in' + (isUser?' justify-end':'');
  if (isUser) {
    div.innerHTML = `<div class="bg-[#d1d6dc] p-3 border-r-2 border-[#495057] max-w-xs">
      <div class="tv text-[11px] text-[#6c757d] mb-1">${S.role||'OL'} — ${ts()}</div>
      <p class="tv text-xs font-medium text-[#212529]">${escHtml(text)}</p>
    </div>`;
  } else {
    div.innerHTML = `<div class="w-7 h-7 bg-[#d1d6dc] flex items-center justify-center flex-shrink-0">
      <span class="ms material-symbols-outlined text-[#343a40] text-[13px]" style="font-variation-settings:'FILL' 1">psychology</span>
    </div>
    <div class="flex-1 bg-[#e2e6ea] p-3 border-l-2 border-[#495057]">
      <div class="tv text-[11px] text-[#6c757d] mb-1">AI COPILOT — ${ts()}</div>
      <p class="tv text-xs text-[#212529]">${escHtml(text)}</p>
    </div>`;
  }
  feed.appendChild(div);
  feed.scrollTop = feed.scrollHeight;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOUCH GESTURE SUPPORT — WP 1.3 / ISO 9241 industrial touchscreen
// Uses native PointerEvents API only — zero external libraries.
// Fully additive: all existing mouse/click handlers remain untouched.
// ═══════════════════════════════════════════════════════════════════════════════

export function bindTouchGestures() {
  _bindSwipeNavigation();
  _bindPIDPinchZoom();
  _bindLongPressContextMenu();
  _bindPullToRefresh();
}

// ── Ordered list of panels for left/right swipe navigation ──────────────────
const _SWIPE_PANELS = [
  'panel-primary', 'panel-secondary', 'panel-safety',
  'panel-ai', 'panel-diagnostics', 'panel-config',
  'panel-cyber', 'panel-training',
];

// ── 1. Swipe LEFT / RIGHT to navigate between panels ────────────────────────
function _bindSwipeNavigation() {
  const main = document.querySelector('main');
  if (!main) return;

  let _tx = 0, _ty = 0, _swiping = false;

  main.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { _tx = 0; return; }
    // Never hijack swipes that begin on an interactive control
    if (e.target.closest('button,input,select,textarea,.nav-s,.nav-t,[role="button"],a')) return;
    _tx = e.touches[0].clientX;
    _ty = e.touches[0].clientY;
    _swiping = false;
  }, { passive: true });

  main.addEventListener('touchmove', e => {
    if (!_tx || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - _tx;
    const dy = e.touches[0].clientY - _ty;
    // Qualify as a horizontal swipe only when dx dominates
    if (Math.abs(dx) > 15 && Math.abs(dx) > Math.abs(dy) * 1.5) _swiping = true;
  }, { passive: true });

  main.addEventListener('touchend', e => {
    if (!_tx) return;
    const dx = e.changedTouches[0].clientX - _tx;
    const dy = Math.abs(e.changedTouches[0].clientY - _ty);
    _tx = 0;
    if (!_swiping || Math.abs(dx) < 80 || dy > 30) return;
    _swiping = false;

    // Build ordered list of panels whose nav button is currently visible
    const visible = _SWIPE_PANELS.filter(id => {
      const btn = document.querySelector(`.nav-s[data-panel="${id}"],.nav-t[data-panel="${id}"]`);
      return btn && btn.style.display !== 'none';
    });
    const cur = visible.indexOf(S.activePanel);
    if (cur === -1) return;

    if (dx < 0 && cur < visible.length - 1) {
      _swipeHint('▶ NEXT');
      dispatch(A.NAVIGATE, { panel: visible[cur + 1] });
    } else if (dx > 0 && cur > 0) {
      _swipeHint('◀ PREV');
      dispatch(A.NAVIGATE, { panel: visible[cur - 1] });
    }
  }, { passive: true });
}

function _swipeHint(label) {
  let el = document.getElementById('swipe-hint');
  if (!el) {
    el = document.createElement('div');
    el.id = 'swipe-hint';
    document.body.appendChild(el);
  }
  el.textContent = label;
  el.style.display = 'block';
  el.style.opacity = '1';
  el.style.transition = '';
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.style.transition = 'opacity .4s';
    el.style.opacity = '0';
    setTimeout(() => { el.style.display = 'none'; }, 400);
  }, 500);
}

// ── 2. Pinch-to-zoom on P&ID SVG; double-tap to reset ───────────────────────
const _pidPtrs = new Map();
let _pidDist0 = 0, _pidZoom0 = 1;

function _bindPIDPinchZoom() {
  let _lastTap = 0;

  function _pDist() {
    const pts = [..._pidPtrs.values()];
    if (pts.length < 2) return 0;
    const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
    return Math.sqrt(dx*dx + dy*dy);
  }

  document.addEventListener('pointerdown', e => {
    const c = document.getElementById('pid-container');
    if (!c || !c.contains(e.target)) return;
    c.setPointerCapture(e.pointerId);
    _pidPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Double-tap (≤300 ms, single finger) → reset zoom
    const now = Date.now();
    if (_pidPtrs.size === 1 && now - _lastTap < 300) {
      _lastTap = 0;
      _applyPIDZoom(1.0);
    } else {
      _lastTap = now;
    }

    if (_pidPtrs.size === 2) {
      _pidDist0 = _pDist();
      _pidZoom0 = S.ui?.pidZoom ?? 1;
    }
  });

  document.addEventListener('pointermove', e => {
    if (!_pidPtrs.has(e.pointerId)) return;
    _pidPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (_pidPtrs.size >= 2 && _pidDist0 > 0) {
      const ratio = _pDist() / _pidDist0;
      _applyPIDZoom(Math.max(1, Math.min(4, _pidZoom0 * ratio)));
    }
  }, { passive: true });

  const _pidRelease = e => {
    _pidPtrs.delete(e.pointerId);
    if (_pidPtrs.size < 2) _pidDist0 = 0;
  };
  document.addEventListener('pointerup',     _pidRelease);
  document.addEventListener('pointercancel', _pidRelease);
}

function _applyPIDZoom(zoom) {
  dispatch(A.SET_PID_ZOOM, { zoom });
  // Apply immediately to SVG viewBox; render.js will confirm on next frame
  const svg = document.querySelector('#pid-container svg');
  if (!svg) return;
  const w = 660 / zoom, h = 390 / zoom;
  svg.setAttribute('viewBox', `${(660 - w) / 2} ${(390 - h) / 2} ${w} ${h}`);
}

// ── 3. Long-press (500 ms) context menu on HUD sensor cards ─────────────────
const _HUD_META = {
  'hud-card-inlet':  { label: 'Coolant Inlet',  sensorKey: 'COOLANT_IN'   },
  'hud-card-flux':   { label: 'Neutron Flux',   sensorKey: 'NEUTRON_FLUX' },
  'hud-card-pumpa':  { label: 'Pump-A',          sensorKey: 'PUMP_A'       },
  'hud-card-core':   { label: 'Core Temp',       sensorKey: 'CORE_TEMP'    },
  'hud-card-press':  { label: 'Primary Press.',  sensorKey: 'PRIM_PRESS'   },
  'hud-card-margin': { label: 'Core Margin',     sensorKey: 'CORE_TEMP'    },
};
const _HUD_SELECTOR = Object.keys(_HUD_META).map(id => `#${id}`).join(',');

function _bindLongPressContextMenu() {
  let _lpTimer = null, _lpId = null, _lpX = 0, _lpY = 0;

  document.addEventListener('pointerdown', e => {
    const card = e.target.closest(_HUD_SELECTOR);
    if (!card) return;
    _lpId = card.id; _lpX = e.clientX; _lpY = e.clientY;
    clearTimeout(_lpTimer);
    _lpTimer = setTimeout(() => {
      _lpTimer = null;
      _showLPMenu(_lpId, _lpX, _lpY);
    }, 500);
  });

  // Cancel long-press if the pointer moves significantly
  document.addEventListener('pointermove', e => {
    if (_lpTimer && (Math.abs(e.clientX - _lpX) > 8 || Math.abs(e.clientY - _lpY) > 8)) {
      clearTimeout(_lpTimer); _lpTimer = null;
    }
  }, { passive: true });

  document.addEventListener('pointerup',     () => { clearTimeout(_lpTimer); _lpTimer = null; });
  document.addEventListener('pointercancel', () => { clearTimeout(_lpTimer); _lpTimer = null; });
}

function _showLPMenu(cardId, x, y) {
  const meta = _HUD_META[cardId];
  if (!meta) return;

  let menu = document.getElementById('lp-menu');
  if (!menu) { menu = document.createElement('div'); menu.id = 'lp-menu'; document.body.appendChild(menu); }

  const sensorTag = S.sensors[meta.sensorKey]?.tag;
  const inAlarm   = !!(sensorTag && S.alarms.some(a => a.tag === sensorTag && !a.acked && !a.cleared && !a.shelved));

  menu.innerHTML = `
    <div style="padding:8px 12px;font-family:'Courier New',monospace;font-size:9px;
                font-weight:700;color:#6c757d;text-transform:uppercase;letter-spacing:.12em;
                border-bottom:1px solid rgba(0,0,0,.08);">${meta.label}</div>
    <div class="lp-item" data-action="trend">
      <span class="ms material-symbols-outlined" style="font-size:16px">show_chart</span>
      View Trend
    </div>
    <div class="lp-item" data-action="diagnostics">
      <span class="ms material-symbols-outlined" style="font-size:16px">analytics</span>
      View in Diagnostics
    </div>
    ${inAlarm ? `<div class="lp-item" data-action="ack" style="color:#e31a1a">
      <span class="ms material-symbols-outlined" style="font-size:16px;color:#e31a1a">notifications_off</span>
      Acknowledge Alarm
    </div>` : ''}`;

  // Position menu near the press point, kept within viewport
  const vw = window.innerWidth, vh = window.innerHeight;
  const mw = 175, mh = 36 + 44 * (inAlarm ? 3 : 2);
  menu.style.cssText = [
    `position:fixed`,
    `left:${Math.min(x, vw - mw - 8)}px`,
    `top:${Math.min(y, vh - mh - 8)}px`,
    `display:block`,
    `z-index:600`,
    `background:#e2e6ea`,
    `border:1px solid rgba(0,0,0,.12)`,
    `box-shadow:0 4px 20px rgba(0,0,0,.20)`,
    `min-width:${mw}px`,
  ].join(';');

  menu.querySelectorAll('.lp-item').forEach(item => {
    item.addEventListener('pointerdown', () => {
      const act = item.dataset.action;
      if      (act === 'trend')       dispatch(A.NAVIGATE, { panel: 'panel-primary' });
      else if (act === 'diagnostics') dispatch(A.NAVIGATE, { panel: 'panel-diagnostics' });
      else if (act === 'ack')         dispatch(A.ACK_ALL);
      dispatch(A.LOG, { msg: `HUD context menu: ${act} — ${meta.label}` });
      menu.style.display = 'none';
    }, { once: true });
  });

  // Dismiss on next pointer outside the menu
  setTimeout(() => {
    document.addEventListener('pointerdown', e => {
      if (!menu.contains(e.target)) menu.style.display = 'none';
    }, { once: true, capture: true });
  }, 0);
}

// ── 4. Pull-to-refresh gesture on alarm panel ────────────────────────────────
// Swipe down ≥ 60 px from the top of the active panel → re-renders alarms.
function _bindPullToRefresh() {
  const main = document.querySelector('main');
  if (!main) return;

  let _pyStart = 0, _pulling = false;
  const THRESH = 60;

  function _ind() {
    let el = document.getElementById('ptr-indicator');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ptr-indicator';
      el.innerHTML = `<span id="ptr-icon" class="ms material-symbols-outlined" style="font-size:16px">sync</span><span id="ptr-text">PULL TO REFRESH</span>`;
      document.body.appendChild(el);
    }
    return el;
  }

  main.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    // Only activate when the panel's scrollable area is at the top
    const panel   = document.getElementById(S.activePanel);
    const scrollEl = panel?.querySelector('[class*="overflow-y-auto"]') ?? panel?.querySelector('[class*="overflow-y"]');
    if (scrollEl && scrollEl.scrollTop > 5) return;
    _pyStart = e.touches[0].clientY;
    _pulling = true;
  }, { passive: true });

  main.addEventListener('touchmove', e => {
    if (!_pulling || !_pyStart || e.touches.length !== 1) return;
    const dy = e.touches[0].clientY - _pyStart;
    if (dy < 0) { _pulling = false; return; }
    if (dy > 20) {
      const ind = _ind();
      ind.style.display    = 'flex';
      ind.style.transition = '';
      ind.style.top        = `${Math.min(dy - 20, 52)}px`;
      const txt = document.getElementById('ptr-text');
      if (txt) txt.textContent = dy > THRESH ? 'RELEASE TO REFRESH' : 'PULL TO REFRESH';
    }
  }, { passive: true });

  main.addEventListener('touchend', e => {
    if (!_pulling) return;
    const dy = e.changedTouches[0].clientY - _pyStart;
    _pulling = false; _pyStart = 0;
    const ind = _ind();

    if (dy > THRESH) {
      const icon = document.getElementById('ptr-icon');
      const txt  = document.getElementById('ptr-text');
      if (icon) icon.className = 'ms material-symbols-outlined spinning';
      if (txt)  txt.textContent = 'REFRESHING ALARMS…';
      ind.style.top = '6px';
      setTimeout(() => {
        ind.style.transition = 'top .3s ease';
        ind.style.top        = '-52px';
        setTimeout(() => {
          ind.style.display = 'none';
          if (icon) icon.className = 'ms material-symbols-outlined';
        }, 350);
        dispatch(A.LOG, { msg: 'Alarm list manually refreshed via pull gesture' });
        scheduleRender();
      }, 800);
    } else {
      ind.style.transition = 'top .2s ease';
      ind.style.top        = '-52px';
      setTimeout(() => { ind.style.display = 'none'; }, 250);
    }
  }, { passive: true });
}
