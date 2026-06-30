/**
 * CORE-SENTINEL — Training Mode Renderer (WP 3.6)
 * ISA-101 §5 / NUREG-0700 — Operator Training & Certification
 *
 * Responsibilities:
 *   renderTraining(s)  — called every render frame from render.js
 *   • Populates #panel-training with scenario list OR active step view
 *   • Manages the fixed bottom overlay (#training-overlay) shown during active scenarios
 *   • Drives the per-step auto-fail timer (module-level setTimeout)
 *   • Checks step checkFn each frame and dispatches TRAINING_STEP_PASS when met
 *   • Applies / removes gold highlight border on the target component
 *
 * Timer contract:
 *   - Timer is started when currentStep changes (tracked via _lastTimedStep)
 *   - Timer fires TRAINING_STEP_FAIL if step.timeout elapses without checkFn returning true
 *   - Timer is cancelled on TRAINING_STEP_PASS, TRAINING_COMPLETE, and TRAINING_ABORT
 */

import { ACTION_TYPES as A } from '../../constants/actionTypes.js';
import { dispatch }           from '@shared/src/reducer.js';
import { TRAINING_SCENARIOS, getScenario, loadScores } from '../training-scenarios.js';

// ─── Module-level timer state ────────────────────────────────────────────────
let _lastTimedStep  = -1;    // step index currently being timed
let _stepTimerId    = null;  // setTimeout id
let _dispatchLock   = false; // guard against double-dispatch of STEP_PASS/FAIL in same frame
let _completeLock   = false; // separate guard for TRAINING_COMPLETE (Bug #6)
let _observeStartMs = null;  // timestamp when observe condition first became true (Bug #4 dwell)

// ─── CSS class for gold highlight ────────────────────────────────────────────
const HIGHLIGHT_CLASS = 'training-highlight';

// ─────────────────────────────────────────────────────────────────────────────
export function renderTraining(s) {
  // ── Role guard — training is restricted to TR, OD, AS (Bug #2) ───────────
  if (!['TR', 'OD', 'AS'].includes(s.role)) {
    const overlay = document.getElementById('training-overlay');
    if (overlay) overlay.style.display = 'none';
    return;
  }

  const t = s.training;

  // ── Always keep overlay in sync ──────────────────────────────────────────
  _renderOverlay(s);

  // ── Step completion check (runs every frame when active) ─────────────────
  if (t.active && !t.completed) {
    _manageTimer(s);
    _checkStepCompletion(s);
  }

  // ── Only paint the panel when it is the active view ──────────────────────
  const panel = document.getElementById('panel-training');
  if (!panel) return;

  if (t.active && !t.completed) {
    _renderActiveStep(s, panel);
  } else if (t.completed) {
    _renderResults(s, panel);
  } else {
    _renderScenarioList(s, panel);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO LIST — shown when no scenario is active
// ─────────────────────────────────────────────────────────────────────────────
function _renderScenarioList(s, panel) {
  const scores     = loadScores();
  const diffColor  = { EASY: '#159647', MEDIUM: '#d97d06', HARD: '#e31a1a' };
  const diffBorder = { EASY: 'rgba(21,150,71,.2)', MEDIUM: 'rgba(217,125,6,.2)', HARD: 'rgba(227,26,26,.2)' };

  const cards = TRAINING_SCENARIOS.map(sc => {
    const best     = scores[sc.id];
    const bestStr  = best != null ? `${best} / ${sc.steps.length * 10}` : '—';
    const col      = diffColor[sc.difficulty];
    const bdr      = diffBorder[sc.difficulty];
    return `
    <div class="border border-[rgba(0,0,0,.06)] bg-[#f4f6f8] p-4 flex flex-col gap-2 hover:border-[rgba(0,0,0,.18)] transition-colors">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="tv text-[10px] text-[#6c757d] uppercase tracking-[.18em] font-bold">${sc.id}</div>
          <div class="tv text-[14px] font-bold text-[#212529] mt-0.5">${sc.title}</div>
          <div class="tv text-[11px] text-[#6c757d] mt-1">${sc.description}</div>
        </div>
        <span class="tv text-[10px] font-bold px-2 py-0.5 border shrink-0" style="color:${col};border-color:${bdr};background:${col}11">
          ${sc.difficulty}
        </span>
      </div>
      <div class="flex items-center gap-4 mt-1">
        <div class="tv text-[11px] text-[#6c757d]">
          <span class="ms material-symbols-outlined text-[13px] align-text-bottom">format_list_numbered</span>
          ${sc.steps.length} steps
        </div>
        <div class="tv text-[11px] text-[#6c757d]">
          <span class="ms material-symbols-outlined text-[13px] align-text-bottom">schedule</span>
          ~${sc.estimatedMinutes} min
        </div>
        <div class="tv text-[11px] text-[#6c757d] ml-auto">
          Best: <span class="font-bold text-[#343a40]">${bestStr}</span>
        </div>
      </div>
      <button
        class="training-start-btn tv text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 mt-1 border border-[rgba(0,0,0,.12)] bg-[#e2e6ea] hover:bg-[#d1d6dc] transition-colors w-full text-left flex items-center gap-2"
        data-scenario-id="${sc.id}" data-step-count="${sc.steps.length}">
        <span class="ms material-symbols-outlined text-[14px]">play_arrow</span>
        START SCENARIO
      </button>
    </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="flex-shrink-0 px-5 py-3 border-b border-[rgba(0,0,0,.08)] bg-[#e2e6ea] flex items-center justify-between">
      <div>
        <h2 class="tv font-bold text-[11px] tracking-widest uppercase">Training Mode — WP 3.6 Operator Certification</h2>
        <p class="tv text-[12px] text-[#6c757d] mt-0.5">ISA-101 / NUREG-0700 guided scenario player · LFR-4G Unit 4</p>
      </div>
      <div class="tv text-[11px] px-2 py-1 border border-[#ffc107]/30 bg-[#ffc107]/10 text-[#b38600] font-bold uppercase tracking-wider">
        TRAINING MODE ACTIVE
      </div>
    </div>
    <div class="flex-1 overflow-y-auto p-5">
      <div class="tv text-[11px] text-[#6c757d] uppercase tracking-widest mb-4">Select a Scenario to Begin</div>
      <div class="grid grid-cols-1 gap-3 max-w-2xl">
        ${cards}
      </div>
      <div class="mt-6 p-4 border border-[rgba(0,0,0,.06)] bg-[#f4f6f8] max-w-2xl">
        <div class="tv text-[11px] text-[#6c757d] uppercase tracking-wider font-bold mb-2">How Training Mode Works</div>
        <ul class="tv text-[11px] text-[#495057] space-y-1 list-disc list-inside">
          <li>Each scenario guides you through an ISA-101 compliant procedure step by step</li>
          <li>A gold-bordered overlay highlights the target component for each step</li>
          <li>Complete each step within the time limit to earn full marks (10 pts/step)</li>
          <li>Use the HINT button if stuck — your step score will still be counted</li>
          <li>Best scores are saved locally and shown on scenario cards</li>
          <li>Alarms remain fully visible and active throughout training</li>
        </ul>
      </div>
    </div>`;

  // Start buttons are handled by the document-level delegation in events.js.
  // No direct binding here — avoids double-dispatch from innerHTML recreation.
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVE STEP — shown while a scenario is in progress
// ─────────────────────────────────────────────────────────────────────────────
function _renderActiveStep(s, panel) {
  const t        = s.training;
  const scenario = getScenario(t.scenarioId);
  if (!scenario) return;

  const step      = scenario.steps[t.currentStep];
  const total     = scenario.steps.length;
  const pct       = Math.round((t.currentStep / total) * 100);
  const diffColor = { EASY: '#159647', MEDIUM: '#d97d06', HARD: '#e31a1a' }[scenario.difficulty];
  const actionLabel = {
    navigate_to:      '⟶ NAVIGATE TO',
    observe:          '👁 OBSERVE',
    acknowledge_alarm:'✓ ACKNOWLEDGE',
    config_change:    '⚙ CONFIGURE',
  }[step?.action] ?? step?.action ?? '';

  // History rows for completed steps
  const historyRows = t.history.slice(-5).reverse().map(h => {
    const sc = scenario.steps[h.step];
    const col = h.passed ? '#159647' : '#e31a1a';
    const icon = h.passed ? 'check_circle' : 'cancel';
    return `<div class="flex items-center gap-2 py-1 border-b border-[rgba(0,0,0,.04)]">
      <span class="ms material-symbols-outlined text-[13px]" style="color:${col}">${icon}</span>
      <span class="tv text-[11px] text-[#6c757d] flex-1 truncate">${sc?.id ?? ''} — ${sc?.instruction?.substring(0,50) ?? ''}…</span>
      <span class="tv text-[11px] font-bold" style="color:${col}">${h.pointsEarned} pts</span>
    </div>`;
  }).join('') || '<div class="tv text-[11px] text-[#6c757d] italic">No completed steps yet</div>';

  panel.innerHTML = `
    <div class="flex-shrink-0 px-5 py-3 border-b border-[rgba(0,0,0,.08)] bg-[#e2e6ea] flex items-center justify-between">
      <div>
        <h2 class="tv font-bold text-[11px] tracking-widest uppercase">Training: ${scenario.title}</h2>
        <div class="flex items-center gap-3 mt-0.5">
          <span class="tv text-[11px] text-[#6c757d]">${scenario.id}</span>
          <span class="tv text-[10px] font-bold px-1.5 py-0.5 border" style="color:${diffColor};border-color:${diffColor}44">${scenario.difficulty}</span>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <div class="tv text-[12px] font-bold text-[#343a40]">SCORE: <span class="text-[#ffc107]">${t.score}</span> / ${t.maxScore}</div>
        <button id="btn-training-abort"
          class="tv text-[11px] font-bold uppercase px-3 py-1.5 border border-[#e31a1a]/30 bg-[#e31a1a]/5 text-[#e31a1a] hover:bg-[#e31a1a]/15 transition-colors">
          ✕ ABORT
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
      <!-- Progress bar -->
      <div>
        <div class="flex justify-between tv text-[10px] text-[#6c757d] uppercase mb-1">
          <span>Step ${t.currentStep + 1} of ${total}</span>
          <span>${pct}% complete</span>
        </div>
        <div class="w-full h-2 bg-[#d1d6dc]">
          <div class="h-full bg-[#ffc107] transition-all duration-500" style="width:${pct}%"></div>
        </div>
      </div>

      <!-- Current step card -->
      ${step ? `
      <div class="border-2 border-[#ffc107]/60 bg-[#fff9e6] p-4">
        <div class="flex items-center gap-2 mb-2">
          <span class="tv text-[10px] font-bold text-[#b38600] uppercase tracking-wider">${actionLabel}</span>
          <span class="tv text-[10px] text-[#6c757d]">${step.id}</span>
          ${step.targetComponentId ? `<span class="tv text-[10px] text-[#6c757d] ml-auto">Target: <code class="bg-[#e2e6ea] px-1">${step.targetComponentId}</code></span>` : ''}
        </div>
        <p class="tv text-[13px] text-[#212529] leading-relaxed">${step.instruction}</p>
      </div>` : ''}

      <!-- Recent steps history -->
      <div>
        <div class="tv text-[10px] text-[#6c757d] uppercase tracking-wider font-bold mb-2">Recent Steps</div>
        <div class="border border-[rgba(0,0,0,.06)] bg-[#f4f6f8] p-3 text-[11px]">
          ${historyRows}
        </div>
      </div>
    </div>`;

  document.getElementById('btn-training-abort')?.addEventListener('click', () => {
    _clearTimer();
    _clearHighlights();
    dispatch(A.TRAINING_ABORT);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULTS — shown after scenario completion
// ─────────────────────────────────────────────────────────────────────────────
function _renderResults(s, panel) {
  const t        = s.training;
  const scenario = getScenario(t.scenarioId);
  if (!scenario) { _renderScenarioList(s, panel); return; }

  const pct      = Math.round((t.score / t.maxScore) * 100);
  const grade    = pct >= 90 ? 'DISTINCTION' : pct >= 75 ? 'PASS' : pct >= 50 ? 'MARGINAL PASS' : 'FAIL';
  const gradeCol = pct >= 90 ? '#159647'     : pct >= 75 ? '#159647'  : pct >= 50 ? '#d97d06'      : '#e31a1a';
  // Bug #5: use endedAt (set by TRAINING_COMPLETE) so elapsed time is frozen
  const elapsed  = (t.endedAt && t.startedAt) ? Math.round((t.endedAt - t.startedAt) / 1000) : 0;
  const mm       = Math.floor(elapsed / 60), ss = elapsed % 60;

  const rows = (t.history ?? []).map(h => {
    const sc  = scenario.steps[h.step];
    const col = h.passed ? '#159647' : '#e31a1a';
    return `<tr>
      <td class="px-4 py-2 tv text-[11px] text-[#343a40] font-bold">${sc?.id ?? `Step ${h.step + 1}`}</td>
      <td class="px-4 py-2 tv text-[11px] text-[#6c757d] max-w-xs truncate">${sc?.instruction?.substring(0, 55) ?? ''}…</td>
      <td class="px-4 py-2 tv text-[11px] font-bold text-center" style="color:${col}">${h.passed ? 'PASS' : 'FAIL'}</td>
      <td class="px-4 py-2 tv text-[11px] font-bold text-right" style="color:${col}">${h.pointsEarned} / 10</td>
    </tr>`;
  }).join('');

  panel.innerHTML = `
    <div class="flex-shrink-0 px-5 py-3 border-b border-[rgba(0,0,0,.08)] bg-[#e2e6ea] flex items-center justify-between">
      <div>
        <h2 class="tv font-bold text-[11px] tracking-widest uppercase">Training Complete — ${scenario.title}</h2>
        <p class="tv text-[12px] text-[#6c757d] mt-0.5">${scenario.id} · Elapsed: ${mm}m ${ss}s</p>
      </div>
    </div>
    <div class="flex-1 overflow-y-auto p-5">
      <div class="flex items-center gap-6 p-5 border border-[rgba(0,0,0,.08)] bg-[#f4f6f8] mb-5 max-w-lg">
        <div class="text-center">
          <div class="tv text-4xl font-black" style="color:${gradeCol}">${t.score}</div>
          <div class="tv text-[10px] text-[#6c757d] uppercase tracking-wider">/ ${t.maxScore} points</div>
        </div>
        <div class="w-px h-12 bg-[rgba(0,0,0,.08)]"></div>
        <div>
          <div class="tv text-[18px] font-bold" style="color:${gradeCol}">${grade}</div>
          <div class="tv text-[11px] text-[#6c757d] mt-0.5">${pct}% · ${t.history.filter(h=>h.passed).length}/${t.history.length} steps passed</div>
        </div>
      </div>
      <div class="tv text-[10px] text-[#6c757d] uppercase tracking-wider font-bold mb-2">Step-by-Step Breakdown</div>
      <table class="w-full border border-[rgba(0,0,0,.06)] mb-5 max-w-2xl">
        <thead>
          <tr class="bg-[#e2e6ea]">
            <th class="px-4 py-2 tv text-[10px] text-[#6c757d] uppercase text-left">Step</th>
            <th class="px-4 py-2 tv text-[10px] text-[#6c757d] uppercase text-left">Instruction</th>
            <th class="px-4 py-2 tv text-[10px] text-[#6c757d] uppercase text-center">Result</th>
            <th class="px-4 py-2 tv text-[10px] text-[#6c757d] uppercase text-right">Score</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="flex gap-3">
        <button id="btn-training-retry"
          class="tv text-[11px] font-bold uppercase tracking-wider px-4 py-2 border border-[rgba(0,0,0,.12)] bg-[#e2e6ea] hover:bg-[#d1d6dc] transition-colors flex items-center gap-2">
          <span class="ms material-symbols-outlined text-[14px]">replay</span> RETRY
        </button>
        <button id="btn-training-back"
          class="tv text-[11px] font-bold uppercase tracking-wider px-4 py-2 border border-[rgba(0,0,0,.12)] bg-[#e2e6ea] hover:bg-[#d1d6dc] transition-colors flex items-center gap-2">
          <span class="ms material-symbols-outlined text-[14px]">arrow_back</span> SCENARIO LIST
        </button>
      </div>
    </div>`;

  document.getElementById('btn-training-retry')?.addEventListener('click', () => {
    dispatch(A.TRAINING_START, {
      scenarioId: t.scenarioId,
      stepCount:  scenario.steps.length,
    });
  });
  document.getElementById('btn-training-back')?.addEventListener('click', () => {
    dispatch(A.TRAINING_ABORT);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// FIXED BOTTOM OVERLAY — always present when training.active === true
// ─────────────────────────────────────────────────────────────────────────────
function _renderOverlay(s) {
  const overlay = _ensureOverlay();
  const t       = s.training;

  if (!t.active || t.completed) {
    overlay.style.display = 'none';
    _clearHighlights();
    return;
  }

  const scenario = getScenario(t.scenarioId);
  const step     = scenario?.steps[t.currentStep];
  if (!step) { overlay.style.display = 'none'; return; }

  // Timer countdown
  const elapsed   = t.stepStartedAt ? (Date.now() - t.stepStartedAt) / 1000 : 0;
  const remaining = step.timeout != null ? Math.max(0, step.timeout - elapsed) : null;
  const timePct   = remaining != null && step.timeout ? (remaining / step.timeout) * 100 : 100;
  const timeCol   = remaining != null && remaining < 10 ? '#e31a1a' : remaining != null && remaining < 20 ? '#d97d06' : '#ffc107';
  const timeStr   = remaining != null
    ? `${Math.floor(remaining / 60)}:${String(Math.floor(remaining % 60)).padStart(2, '0')}`
    : '∞';

  const total     = scenario?.steps.length ?? 1;
  const progPct   = Math.round((t.currentStep / total) * 100);

  const actionLabel = {
    navigate_to:      '⟶ NAVIGATE',
    observe:          '👁 OBSERVE',
    acknowledge_alarm:'✓ ACKNOWLEDGE',
    config_change:    '⚙ CONFIGURE',
  }[step.action] ?? step.action;

  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <div style="flex:1;min-width:0;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">
        <span style="font-family:'Courier New',monospace;font-size:9px;font-weight:700;
                     color:#ffc107;text-transform:uppercase;letter-spacing:.1em;">
          ▶ STEP ${t.currentStep + 1} / ${total}
        </span>
        <div style="flex:1;height:3px;background:rgba(255,255,255,.15);border-radius:2px;">
          <div style="width:${progPct}%;height:100%;background:#ffc107;border-radius:2px;transition:width .5s;"></div>
        </div>
        <span style="font-family:'Courier New',monospace;font-size:9px;color:#adb5bd;">
          SCORE: ${t.score}/${t.maxScore}
        </span>
        <span style="font-family:'Courier New',monospace;font-size:9px;font-weight:700;
                     color:#ffc107;text-transform:uppercase;padding:1px 5px;
                     border:1px solid #ffc10740;background:#ffc10718;">
          ${actionLabel}
        </span>
      </div>
      <div style="font-family:'Courier New',monospace;font-size:12px;color:#f8f9fa;line-height:1.5;
                  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;">
        ${step.instruction}
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;margin-left:16px;">
      ${remaining != null ? `
      <div style="text-align:center;">
        <div style="font-family:'Courier New',monospace;font-size:18px;font-weight:700;color:${timeCol};min-width:42px;">
          ${timeStr}
        </div>
        <div style="width:42px;height:3px;background:rgba(255,255,255,.15);margin-top:2px;">
          <div style="width:${timePct}%;height:100%;background:${timeCol};transition:width 1s linear;"></div>
        </div>
      </div>` : ''}
      <button id="overlay-hint-btn"
        style="font-family:'Courier New',monospace;font-size:10px;font-weight:700;
               padding:6px 10px;border:1px solid rgba(255,193,7,.4);background:rgba(255,193,7,.12);
               color:#ffc107;cursor:pointer;text-transform:uppercase;letter-spacing:.08em;
               ${t.hintUsed ? 'opacity:.5;' : ''}">
        💡 HINT${t.hintUsed ? ' (shown)' : ''}
      </button>
      <button id="overlay-abort-btn"
        style="font-family:'Courier New',monospace;font-size:10px;font-weight:700;
               padding:6px 10px;border:1px solid rgba(227,26,26,.4);background:rgba(227,26,26,.1);
               color:#e31a1a;cursor:pointer;text-transform:uppercase;letter-spacing:.08em;">
        ✕ ABORT
      </button>
    </div>`;

  // Wire overlay buttons (re-bind each frame since innerHTML replaced them)
  document.getElementById('overlay-hint-btn')?.addEventListener('click', () => {
    if (!t.hintUsed) dispatch(A.TRAINING_USE_HINT);
    // Show hint in a small modal-like popup
    _showHintPopup(step.hint);
  });
  document.getElementById('overlay-abort-btn')?.addEventListener('click', () => {
    _clearTimer();
    _clearHighlights();
    dispatch(A.TRAINING_ABORT);
  });

  // Apply gold highlight to the target component
  _applyHighlight(step.targetComponentId);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP TIMER — module-level setTimeout so it is NOT reset on every render call
// ─────────────────────────────────────────────────────────────────────────────
function _manageTimer(s) {
  const t    = s.training;
  const sc   = getScenario(t.scenarioId);
  const step = sc?.steps[t.currentStep];

  if (t.currentStep !== _lastTimedStep) {
    _clearTimer();
    _lastTimedStep = t.currentStep;

    if (step?.timeout) {
      _stepTimerId = setTimeout(() => {
        if (!_dispatchLock) {
          _dispatchLock = true;
          dispatch(A.TRAINING_STEP_FAIL, { stepId: step.id, reason: 'timeout' });
          setTimeout(() => { _dispatchLock = false; }, 200);
        }
      }, step.timeout * 1000);
    }
  }
}

function _clearTimer() {
  if (_stepTimerId != null) { clearTimeout(_stepTimerId); _stepTimerId = null; }
  _lastTimedStep   = -1;
  _observeStartMs  = null;  // Bug #4: reset dwell window on step change
  _completeLock    = false; // Bug #6: allow COMPLETE to fire on next scenario
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP COMPLETION CHECK — pure checkFn evaluated each render frame
// ─────────────────────────────────────────────────────────────────────────────
function _checkStepCompletion(s) {
  const t  = s.training;
  const sc = getScenario(t.scenarioId);
  if (!sc) return;

  // ── Bug #6: TRAINING_COMPLETE uses its own lock — not gated by _dispatchLock ──
  // This allows COMPLETE to fire on the very next render frame (~16 ms) after
  // the last STEP_PASS, instead of waiting up to 800 ms for the data-loop tick.
  if (t.currentStep >= sc.steps.length) {
    if (_completeLock) return;
    _clearTimer();
    _clearHighlights();
    _completeLock = true;
    dispatch(A.TRAINING_COMPLETE, { scenarioId: t.scenarioId });
    return;
  }

  // ── Per-step pass check (gated by _dispatchLock for STEP_PASS/FAIL) ──────
  if (_dispatchLock) return;

  const step = sc.steps[t.currentStep];
  if (!step) return;

  let passed = false;
  try { passed = step.checkFn(s); } catch (_) { /* checkFn safety */ }

  if (passed) {
    // Bug #4: observe steps require a minimum 5-second dwell before passing
    if (step.action === 'observe') {
      if (_observeStartMs === null) _observeStartMs = Date.now();
      if (Date.now() - _observeStartMs < 5000) return; // not yet 5 s
    }
    _clearTimer(); // resets _observeStartMs and _completeLock
    const pts = t.hintUsed ? 5 : 10;
    _dispatchLock = true;
    dispatch(A.TRAINING_STEP_PASS, { stepId: step.id, pointsEarned: pts });
    setTimeout(() => { _dispatchLock = false; }, 200);
  } else {
    // Condition no longer met — reset observe dwell window so it must re-qualify
    if (step.action === 'observe') _observeStartMs = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DOM HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Inject (once) the fixed training overlay into <body> */
function _ensureOverlay() {
  let el = document.getElementById('training-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'training-overlay';
    // Bug #7: z-index 100 keeps us below the modal overlay (z-[200]) so modals
    //         remain fully usable during active training.
    // Bug #8: structural flex properties set once here; display state managed
    //         exclusively by _renderOverlay() to avoid the duplicate display:none
    //         issue that prevented flex layout from applying correctly.
    el.style.cssText = `
      position:fixed; bottom:0; left:0; right:0; z-index:100;
      background:#212529; border-top:2px solid #ffc107;
      padding:10px 20px;
      flex-direction:row; align-items:center; gap:12px;
      box-shadow:0 -4px 20px rgba(0,0,0,.35);
    `;
    el.style.display = 'none'; // initial hidden state — controlled by _renderOverlay()
    document.body.appendChild(el);
  }
  return el;
}

let _currentHighlightId = null;

/** Apply gold pulsing border to target component DOM element */
function _applyHighlight(domId) {
  if (!domId) return;
  if (domId === _currentHighlightId) return;  // already highlighted

  _clearHighlights();
  _currentHighlightId = domId;

  // Bug #3: navigate_to steps point at panel divs which are hidden.
  // Redirect to the matching sidebar nav button so the highlight is visible.
  let el = document.getElementById(domId);
  if (!el || el.offsetParent === null) {
    const navEl = document.querySelector(`.nav-s[data-panel="${domId}"], .nav-t[data-panel="${domId}"]`);
    if (navEl) el = navEl;
  }
  if (el) el.classList.add(HIGHLIGHT_CLASS);
}

/** Remove gold highlight from all elements */
function _clearHighlights() {
  document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(el => el.classList.remove(HIGHLIGHT_CLASS));
  _currentHighlightId = null;
}

/** Show hint in a small floating tooltip anchored to overlay */
function _showHintPopup(hint) {
  // Remove any existing popup
  document.getElementById('training-hint-popup')?.remove();

  const popup = document.createElement('div');
  popup.id = 'training-hint-popup';
  popup.style.cssText = `
    position:fixed; bottom:70px; left:50%; transform:translateX(-50%);
    max-width:480px; width:90%; z-index:10000;
    background:#fff9e6; border:2px solid #ffc107;
    padding:12px 16px; box-shadow:0 4px 16px rgba(0,0,0,.2);
    font-family:'Courier New',monospace; font-size:11px; color:#343a40;
    line-height:1.6;
  `;
  popup.innerHTML = `
    <div style="font-size:9px;font-weight:700;color:#b38600;text-transform:uppercase;
                letter-spacing:.1em;margin-bottom:6px;">💡 HINT</div>
    <div>${hint}</div>
    <button onclick="this.parentElement.remove()" style="
      margin-top:8px;font-family:'Courier New',monospace;font-size:9px;
      font-weight:700;padding:3px 8px;border:1px solid rgba(0,0,0,.1);
      background:#e2e6ea;cursor:pointer;text-transform:uppercase;">DISMISS</button>`;

  document.body.appendChild(popup);

  // Auto-dismiss after 12 seconds
  setTimeout(() => popup.remove(), 12000);
}
