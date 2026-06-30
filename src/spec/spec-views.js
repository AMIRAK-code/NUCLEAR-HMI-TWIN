'use strict';
// InRebus Mappatura v5 views grafted into the CORE-SENTINEL shell:
//  - injects "INREBUS SPEC" section into the sidebar nav (library + 14 SCR)
//  - injects one .panel div per view; content renders lazily on activation
//  - re-renders on role/panel change via the existing 'sentinel:render' event
// Navigation itself reuses the app's .nav-s → dispatch(NAVIGATE) wiring, so
// initSpecViews() MUST run before bindAll() (events.js binds .nav-s at startup).
//
// NOTE: the spec defines OL/OD/AS only. The app's extra TR (trainee) role is
// mapped to OL for spec-view access.

import './spec.css';
import {
  SCREENS, getScreen, componentsForScreen, getStandard,
  accessForRole, effectiveMode,
} from '@shared/src/mappatura.js';
import { S } from '@shared/src/model.js';
import { dispatch } from '@shared/src/reducer.js';
import { RBACContext } from '@shared/src/rbac-factory.js';
import { ACTION_TYPES as A } from '../../constants/actionTypes.js';
import { renderAtom } from './atoms.js';
import { initDemoTwin } from './twin.js';
import { renderLibrary } from './library.js';
import { renderSynoptic } from './synoptic.js';
import {
  dataForComponent, alarmSignature, scenarioSignature,
  setSelection, getSelection, selectionSignature,
  criticalVarOptions, criticalVarLayers, criticalVarReadouts,
  sensorTech, sensorAcq, sensorRaw, sensorCalib,
  scr04Signature, scr05Signature, scr06Signature, scr09Signature, scr10Signature,
} from './live-data.js';
import { startChartFeed, getSeries } from './chart-feed.js';
import { dlFile } from '@shared/utils.js';

// Spec mode (default): the 14 Mappatura screens ARE the app — legacy panels
// hidden. Append ?legacy to the URL to restore the old CORE-SENTINEL nav.
export const SPEC_MODE = !new URLSearchParams(location.search).has('legacy');
// Role is authentication, not a view toggle: the OL/OD/AS switcher is OFF by
// default (role is chosen only at the SCR-01 login). Append ?demo to expose a
// topbar switcher for presentations, where flipping roles fast is convenient.
const DEMO_SWITCHER = new URLSearchParams(location.search).has('demo');

const LIBRARY_PANEL = 'panel-spec-library';
const panelIdFor = scrId => `panel-spec-${scrId}`;

function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c !== null && c !== undefined) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

const specRole = () => (S.role === 'TR' ? 'OL' : S.role) || 'OL';

// ── spec screen composer ────────────────────────────────────────────────

const WIDE = new Set(['TREND_STD_01', 'ALARM_STD_01', 'AUDIT_STD_01', 'TABLE_STD_01', 'LAYOUT_STD_01', 'TWIN_3D_STD_01', 'TWIN_COMPARE_STD_01', 'MAP_STD_01', 'TOPOLOGY_STD_01']);

// CMP-73: adopt the REAL legacy twin (full-detail initThreeJS scene) by
// re-parenting its #three-container into the card. Its window-resize handler
// re-reads the container, so one synthetic resize fits it to the new home.
// Only in spec mode (legacy mode still owns it); demo twin as fallback.
// Panel re-renders clear their DOM wholesale — if the twin were inside, it
// would be destroyed (initThreeJS runs once at startup and cannot be revived).
// So before any spec-panel clear, the twin is parked in an off-screen keeper.
let twinPark = null;
function parkTwin(host) {
  const tc = host.querySelector('#three-container');
  if (!tc) return;
  if (!twinPark) {
    twinPark = h('div', { id: 'spec-twin-park', style:
      'position:fixed;left:-10000px;top:0;width:640px;height:360px;overflow:hidden' });
    document.body.appendChild(twinPark);
  }
  twinPark.appendChild(tc);
}

function adoptRealTwin(body) {
  const tc = document.getElementById('three-container');
  if (!SPEC_MODE || !tc || !tc.querySelector('canvas')) return initDemoTwin(body);
  const wrap = h('div', { style:
    'position:relative;aspect-ratio:16/9;overflow:hidden;border-radius:4px;' +
    'background:var(--surface-2);border:1px solid var(--border)' });
  wrap.appendChild(tc); // moves the live node, animation loop untouched
  body.appendChild(wrap);
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  return true;
}

// Per-CMP renderer overrides (else the standard's atom renders)
const OVERRIDES = {
  // The spec splits the classic SCADA synoptic across two CMPs — same engine,
  // two flavors: CMP-34 is the IoT sensor-HEALTH map (its Dati column asks for
  // stato operativo + signal quality), CMP-44 overlays reale-vs-simulato values.
  'CMP-34': body => {
    renderSynoptic(body, { flavor: 'health', onSensorClick: () => dispatch(A.NAVIGATE, { panel: 'panel-spec-SCR-09' }) });
    return true;
  },
  'CMP-44': body => {
    renderSynoptic(body, { flavor: 'twin', onSensorClick: () => dispatch(A.NAVIGATE, { panel: 'panel-spec-SCR-11' }) });
    return true;
  },
  'CMP-73': body => adoptRealTwin(body),                                   // live 3D twin (real scene)
  'CMP-74': (body, ctx) => { renderAtom('TWIN_COMPARE_STD_01', body, ctx); return true; }, // reale vs simulato

  // CMP-04.01 Overview sistema (SCR-02): navigable plant scheme, ¾-width hero.
  // (spreadsheet: "Insert visual scheme of the system. 3/4 of the screen")
  'CMP-04.01': body => {
    renderSynoptic(body, { flavor: 'twin', onSensorClick: () => dispatch(A.NAVIGATE, { panel: 'panel-spec-SCR-11' }) });
    return true;
  },
  // CMP-05 Variabili critiche: pick & choose variables + live measurements.
  'CMP-05': body => { renderCriticalVars(body); return true; },
  // CMP-20/21/22/23 (SCR-03): detail panels that fill in when a sensor row is
  // clicked in CMP-18; a placeholder shows until a row is selected.
  'CMP-20': (body, ctx) => sensorDetail(body, ctx, 'FORM_STD_01', sensorTech),
  'CMP-21': (body, ctx) => sensorDetail(body, ctx, 'FORM_STD_01', sensorAcq),
  'CMP-22': (body, ctx) => { // raw monitor + CSV export (sheet NOTE: "Esportazione CSV")
    sensorDetail(body, ctx, 'TREND_STD_01', sensorRaw);
    if (getSelection('sensor')) appendActionButton(body, 'Esporta CSV', () => exportSensorCsv(getSelection('sensor')));
    return true;
  },
  'CMP-23': (body, ctx) => sensorDetail(body, ctx, 'KPI_STD_01', sensorCalib),
  // CMP-09 (sheet NOTE: "AS può configurare variabili visualizzate")
  'CMP-09': (body, ctx) => { renderConfigurableGraph(body, ctx); return true; },
  // CMP-15 / CMP-16 access buttons (sheet NOTES)
  'CMP-15': (body, ctx) => { renderAtom('AUDIT_STD_01', body, ctx); appendActionButton(body, 'Apri log completi', () => dispatch(A.NAVIGATE, { panel: 'panel-spec-SCR-09' })); return true; },
  'CMP-16': (body, ctx) => { renderAtom('STATE_STD_01', body, ctx); appendActionButton(body, 'Gestione utenti', () => dispatch(A.NAVIGATE, { panel: 'panel-spec-SCR-14' })); return true; },
  // CMP-47 Dettaglio allarme: detail table (with history column) + remediation
  // suggestions + a link to the matching VR training simulation when present.
  'CMP-47': (body, ctx) => { renderAtom('ALARM_STD_01', body, ctx); renderAlarmGuidance(body, ctx.data); return true; },
};

// CMP-47 extras rendered below the detail table: a "how to solve it" panel and,
// when the alarm type maps to a training scenario, a link to the VR simulation
// (navigates to SCR-13 — Training immersivo). "if present" → the link is shown
// only when ctx.data.training is set, otherwise a muted "none" notice.
function renderAlarmGuidance(body, data) {
  if (!data) return;
  if (Array.isArray(data.suggestion) && data.suggestion.length) {
    body.appendChild(h('div', { class: 'alarm-guidance' }, [
      h('div', { class: 'alarm-guidance-head' }, [
        h('span', { class: 'ms material-symbols-outlined', 'aria-hidden': 'true', text: 'lightbulb' }),
        h('strong', { text: 'Come risolvere il problema' }),
      ]),
      h('ol', { class: 'alarm-guidance-list' }, data.suggestion.map(step => h('li', { text: step }))),
    ]));
  }
  const t = data.training;
  if (t) {
    const link = h('button', {
      class: 'btn alarm-train-link',
      title: `Apri la simulazione VR di training ${t.id}`,
      'aria-label': `Apri la simulazione VR di training: ${t.title}`,
    }, [
      h('span', { class: 'ms material-symbols-outlined', 'aria-hidden': 'true', text: 'vrpano' }),
      h('span', { text: `Simulazione VR: ${t.title}` }),
      h('span', { class: 'alarm-train-meta', text: `${t.id} · ${t.difficulty} · ~${t.minutes} min` }),
    ]);
    link.addEventListener('click', () => dispatch(A.NAVIGATE, { panel: 'panel-spec-SCR-13' }));
    body.appendChild(h('div', { class: 'alarm-train-wrap' }, [
      h('span', { class: 'alarm-train-label', text: 'Training VR collegato a questo evento:' }),
      link,
    ]));
  } else {
    body.appendChild(h('div', { class: 'alarm-train-none', text: 'Nessuna simulazione VR di training collegata a questo tipo di evento.' }));
  }
}

// small action button appended under a card's atom content
function appendActionButton(body, label, onClick, primary) {
  const btn = h('button', { class: `btn${primary ? ' primary' : ''}`, style: 'margin-top:10px', text: label });
  btn.addEventListener('click', onClick);
  body.appendChild(btn);
}

// CMP-22 CSV export of the selected sensor's live raw buffer
function exportSensorCsv(key) {
  const sensor = S.sensors[key];
  const series = getSeries(key);
  const lines = ['index,value,unit', ...series.map((v, i) => `${i},${v.toFixed(2)},${(sensor && sensor.u) || ''}`)];
  dlFile(lines.join('\n'), `${(sensor && sensor.tag) || key}_raw.csv`, 'text/csv');
}

// CMP-09 graph: AS gets a variable selector to choose the plotted signal.
function renderConfigurableGraph(body, ctx) {
  const isAS = specRole() === 'AS';
  const chartEl = h('div', {});
  function draw() {
    const sig = (isAS && getSelection('graphVar')) || 'PRIM_PRESS';
    chartEl.textContent = '';
    renderAtom('TREND_STD_01', chartEl, { ...ctx, data: sensorRaw(sig) });
  }
  if (isAS) {
    const cur = getSelection('graphVar') || 'PRIM_PRESS';
    const sel = h('select', {}, criticalVarOptions().map(o =>
      h('option', { value: o.key, text: o.label, ...(o.key === cur ? { selected: 'true' } : {}) })));
    sel.addEventListener('change', e => { setSelection('graphVar', e.target.value); draw(); });
    body.appendChild(h('div', { class: 'graph-config' }, [
      h('span', { class: 'graph-config-label', text: 'Variabile visualizzata' }), sel,
    ]));
  }
  body.appendChild(chartEl);
  draw();
}

// Cards that collapse as a whole accordion (header chevron toggles the body).
// CMP-47 alarm detail is collapsed by default and expands on alarm-row click.
const COLLAPSIBLE = new Set(['CMP-47']);

// Components the spec review marked "Remove" (spreadsheet COMMENTS FOR US).
// Filtered out of every screen; reversible — delete an id to restore it.
const HIDDEN_CMPS = new Set(['CMP-17', 'CMP-48']);

// ── CMP-05 variable picker (pick & choose + measurements) ────────────────
function renderCriticalVars(body) {
  const picker = h('div', { class: 'var-picker' });
  const readout = h('div', { class: 'var-readout' });
  const chart = h('div', {});

  function draw() {
    const keys = getSelection('vars');
    readout.textContent = '';
    // build readouts once; reuse the exact value strings as the chart's end
    // labels (keyed by sensor key) so the on-chart number can never diverge from
    // the readout above — same source, same formatter.
    const labels = {};
    for (const [dot, name, val, key] of criticalVarReadouts(keys)) {
      labels[key] = val;
      readout.appendChild(h('div', { class: 'state-row' }, [
        h('span', { class: `dot ${dot}` }),
        h('span', { text: name }),
        h('strong', { style: 'margin-left:auto', text: val }),
      ]));
    }
    chart.textContent = '';
    const layers = criticalVarLayers(keys);
    // multi-variable: per-line end labels (each var's value in its colour),
    // not a single big metric — which would be ambiguous across several lines.
    if (layers.length) renderAtom('TREND_STD_01', chart, { data: { layers, endLabels: true, showMetric: false, labels } });
    else chart.appendChild(h('p', { style: 'color:var(--muted);font-size:12px;margin:4px 0', text: 'Seleziona almeno una variabile da monitorare.' }));
  }

  picker.textContent = '';
  for (const o of criticalVarOptions()) {
    const on = getSelection('vars').includes(o.key);
    const input = h('input', { type: 'checkbox', ...(on ? { checked: 'true' } : {}) });
    const chip = h('label', { class: `var-chip${on ? ' on' : ''}` }, [input, o.label]);
    input.addEventListener('change', e => {
      const cur = getSelection('vars');
      setSelection('vars', e.target.checked ? [...new Set([...cur, o.key])] : cur.filter(k => k !== o.key));
      chip.classList.toggle('on', e.target.checked);
      draw();
    });
    picker.appendChild(chip);
  }

  body.appendChild(picker);
  body.appendChild(readout);
  body.appendChild(chart);
  draw();
}

// ── SCR-03 detail panels: render selected sensor, else a placeholder ─────
function sensorDetail(body, ctx, standard, dataFn) {
  const key = getSelection('sensor');
  if (!key) {
    body.appendChild(h('div', { class: 'coming-soon', style: 'padding:22px' }, [
      h('div', { style: 'font-weight:600', text: 'Nessun sensore selezionato' }),
      h('div', { style: 'font-size:12px;margin-top:4px', text: 'Seleziona una riga in “Lista sensori registrati”.' }),
    ]));
    return true;
  }
  renderAtom(standard, body, { ...ctx, data: dataFn(key) });
  return true;
}

// Screens considered "complete" for the coverage footer
const BUILT = ['SCR-01', 'SCR-02', 'SCR-03', 'SCR-04', 'SCR-05', 'SCR-06', 'SCR-07', 'SCR-08', 'SCR-09', 'SCR-10', 'SCR-11', 'SCR-12', 'SCR-13', 'SCR-14'];

function cmpCard(cmp, role) {
  const mode = effectiveMode(cmp, role);
  if (mode === 'hidden') return null;
  const std = getStandard(cmp.standard_viz);
  const body = h('div', { class: 'body' });

  const collapsible = COLLAPSIBLE.has(cmp.id);
  const open = collapsible ? !!getSelection('alarmOpen') : true;

  const header = h('header', {}, [
    collapsible ? h('span', { class: 'card-chevron', text: '▸' }) : null,
    h('span', { class: 'spec-chip cmp', text: cmp.id }),
    cmp.standard_viz ? h('span', {
      class: 'spec-chip std',
      title: std ? `${std.name} — ${std.id}` : cmp.standard_viz,
      text: cmp.standard_viz,
    }) : null,
    h('h3', { text: cmp.label }),
    h('span', {
      class: 'spec-chip',
      title: `Accesso ${role}: ${cmp.access[role]} · Editabile: ${cmp.editabile} → ${mode}`,
      text: `${role}: ${cmp.access[role]}${mode === 'interactive' ? ' ✎' : ''}`,
    }),
  ]);

  const card = h('article', {
    class: `atom-card${WIDE.has(cmp.standard_viz) ? ' wide' : ''}${cmp.id === 'CMP-04.01' ? ' hero' : ''}` +
      `${collapsible ? ' collapsible' : ''}${collapsible && !open ? ' collapsed' : ''}`,
    id: `spec-${cmp.id}`,
  }, [header, body]);

  // whole-card accordion: clicking the header toggles the body (no extra text)
  if (collapsible) {
    header.addEventListener('click', () => {
      const willOpen = card.classList.contains('collapsed');
      card.classList.toggle('collapsed', !willOpen);
      setSelection('alarmOpen', willOpen);
    });
  }

  const ctx = { component: cmp, standard: std, mode, data: dataForComponent(cmp) };
  const custom = OVERRIDES[cmp.id];
  if (!custom || !custom(body, ctx)) {
    renderAtom(cmp.standard_viz, body, ctx);
  }
  return card;
}

function renderDenied(root, scr, role) {
  root.appendChild(h('div', { class: 'spec-page' }, [
    h('div', { class: 'coming-soon' }, [
      h('div', { style: 'font-size:26px', text: '🔒' }),
      h('div', { style: 'font-weight:700;font-size:14px;margin-top:6px;text-transform:uppercase', text: 'Accesso negato' }),
      h('p', { style: 'margin:8px auto 0;max-width:62ch', text:
        `La schermata ${scr.id} — ${scr.name} non è accessibile al ruolo ${role}. ` +
        `Accesso da Mappatura: OL=${scr.access.OL}, OD=${scr.access.OD}, AS=${scr.access.AS}.` }),
    ]),
  ]));
}

function renderSpecScreen(root, scrId) {
  root.textContent = '';
  const role = specRole();
  const scr = getScreen(scrId);
  if (!scr) return;
  if (accessForRole(scr, role) === 'hidden') { renderDenied(root, scr, role); return; }

  const cmps = componentsForScreen(scrId).filter(c => !HIDDEN_CMPS.has(c.id));
  const cards = cmps.map(c => cmpCard(c, role)).filter(Boolean);
  const hidden = cmps.length - cards.length;

  root.appendChild(h('div', { class: 'spec-page' }, [
    h('div', { class: 'page-head' }, [
      h('h1', {}, [
        h('span', { class: 'spec-chip scr', text: scr.id }), ' ', scr.name,
        h('span', { class: 'spec-chip', style: 'margin-left:6px', title: 'Backend FOS non ancora disponibile: tutti i dati provengono dal layer di simulazione (DAO)', text: 'DATI SIMULATI' }),
      ]),
      h('p', { text:
        `Modulo: ${scr.module} · Dominio: ${scr.dataDomain} · Operatività ${role}: ${scr.operativita[role] || '—'}` +
        (hidden ? ` · ${hidden} componenti nascosti per il ruolo ${role}` : '') }),
    ]),
    h('div', { class: 'lib-grid scr-grid' }, cards),
    h('div', { class: 'coverage-footer', text:
      `${scr.id} — ${cards.length}/${cmps.length} componenti visibili al ruolo ${role} · ` +
      `componenti: ${cmps.map(c => c.id).join(', ')}` }),
  ]));
}

// ── shell injection ─────────────────────────────────────────────────────

function injectPanels() {
  const host = document.getElementById('panel-primary')?.parentElement;
  if (!host || document.getElementById(LIBRARY_PANEL)) return;
  host.appendChild(h('div', { id: LIBRARY_PANEL, class: 'panel' }));
  for (const scr of SCREENS) host.appendChild(h('div', { id: panelIdFor(scr.id), class: 'panel' }));
}

function navBtn(panelId, label, title) {
  return h('button', {
    class: 'nav-s w-full flex items-center gap-3 px-4 py-2 tv text-[11px] text-[#6c757d] hover:text-[#343a40] hover:bg-[#d1d6dc] text-left border-r-4 border-transparent',
    'data-panel': panelId,
    title,
    'aria-label': `Apri schermata ${label}`,
  }, [h('span', { class: 'flex-1', text: label }), h('span', { class: 'spec-lock', 'aria-hidden': 'true' })]);
}

function injectNav() {
  const sideNav = document.querySelector('.nav-s')?.closest('nav');
  if (!sideNav || document.getElementById('spec-nav-head')) return;
  const frag = document.createDocumentFragment();
  frag.appendChild(h('div', { id: 'spec-nav-head', class: 'spec-nav-head', text: SPEC_MODE ? 'Schermate · Mappatura v5' : 'InRebus Spec · Mappatura v5' }));
  frag.appendChild(navBtn(LIBRARY_PANEL, 'Libreria componenti', 'Standard di visualizzazione'));
  for (const scr of SCREENS) {
    frag.appendChild(navBtn(panelIdFor(scr.id), `${scr.id.replace('SCR-', 'S')} · ${scr.name}`, scr.name));
  }
  // spec mode: spec screens lead the sidebar; legacy mode: appended below
  if (SPEC_MODE) sideNav.insertBefore(frag, sideNav.firstChild);
  else sideNav.appendChild(frag);
}

// Hide every legacy nav entry + the TR role card (the spec defines OL/OD/AS only).
function applySpecMode() {
  if (!SPEC_MODE) return;
  document.querySelectorAll('.nav-s, .nav-t').forEach(b => {
    const p = b.getAttribute('data-panel') || '';
    if (!p.startsWith('panel-spec-')) b.style.display = 'none';
  });
  const tr = document.querySelector('.role-btn[data-role="TR"]');
  if (tr) tr.style.display = 'none';
}

// Compact OL/OD/AS switcher in the topbar — presentation aid only (?demo).
// Same side effects as the login cards (SET_ROLE + RBACContext).
function injectRoleSwitcher() {
  if (!DEMO_SWITCHER) return; // role is set at login; not a runtime toggle
  const badge = document.getElementById('role-badge')?.closest('div');
  if (!badge || document.getElementById('spec-role-switch')) return;
  const wrap = h('span', { id: 'spec-role-switch', class: 'spec-role-switch' },
    ['OL', 'OD', 'AS'].map(r => h('button', {
      'data-spec-role': r,
      title: `Visualizza come ${r}`,
      text: r,
    })));
  wrap.addEventListener('click', e => {
    const r = e.target?.getAttribute?.('data-spec-role');
    if (!r || r === S.role) return;
    dispatch(A.SET_ROLE, { role: r });
    RBACContext.setRole(r);
  });
  badge.insertAdjacentElement('afterend', wrap);
}

function updateRoleSwitcher() {
  document.querySelectorAll('#spec-role-switch button').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-spec-role') === S.role);
  });
}

function updateNavLocks() {
  const role = specRole();
  for (const scr of SCREENS) {
    const btn = document.querySelector(`.nav-s[data-panel="${panelIdFor(scr.id)}"]`);
    if (!btn) continue;
    const locked = accessForRole(scr, role) === 'hidden';
    btn.querySelector('.spec-lock').textContent = locked ? '🔒' : '';
    btn.style.opacity = locked ? '.45' : '';
  }
}

// ── lazy render on state change ─────────────────────────────────────────

let lastKey = '';
let prevRole = null;

function maybeRender() {
  const panel = S.activePanel;
  const role = specRole();
  updateNavLocks();
  updateRoleSwitcher();
  // logout (role cleared) → reset so the next login re-navigates to SCR-02
  if (!S.role) { prevRole = null; lastKey = ''; return; }
  // first login in spec mode → land on the spec dashboard, not a legacy panel
  if (SPEC_MODE && S.role && !prevRole) {
    prevRole = S.role;
    if (!String(panel || '').startsWith('panel-spec-')) {
      dispatch(A.NAVIGATE, { panel: 'panel-spec-SCR-02' });
      return;
    }
  }
  prevRole = S.role;
  if (!panel || !panel.startsWith('panel-spec-')) return;
  // re-render keys: role/panel always; alarm signature for alarm screens;
  // a 3s time bucket for the live-trend dashboard. SCR-11 stays static so the
  // twin's animation loop survives. Forms (SCR-07) only re-render on alarm changes.
  let liveSig = '';
  if (panel === 'panel-spec-SCR-02') liveSig = alarmSignature() + '|' + Math.floor(Date.now() / 3000);
  else if (panel === 'panel-spec-SCR-03') liveSig = selectionSignature() + '|' + Math.floor(Date.now() / 2000);
  else if (panel === 'panel-spec-SCR-04') liveSig = scr04Signature() + '|' + Math.floor(Date.now() / 2000);
  else if (panel === 'panel-spec-SCR-05') liveSig = scr05Signature();
  else if (panel === 'panel-spec-SCR-06') liveSig = scr06Signature() + '|' + Math.floor(Date.now() / 3000);
  else if (panel === 'panel-spec-SCR-08') liveSig = selectionSignature();          // threat row-click → detail
  else if (panel === 'panel-spec-SCR-07') liveSig = alarmSignature() + '|' + selectionSignature();
  else if (panel === 'panel-spec-SCR-09') liveSig = scr09Signature() + '|' + Math.floor(Date.now() / 2000);
  else if (panel === 'panel-spec-SCR-10') liveSig = scr10Signature();
  // SCR-11 rebuilds only when a scenario starts/stops (twin survives via parkTwin)
  else if (panel === 'panel-spec-SCR-11') liveSig = scenarioSignature();
  const key = `${panel}|${role}|${liveSig}`;
  if (key === lastKey) return; // avoid re-render churn (keeps twin animation alive)
  lastKey = key;
  const host = document.getElementById(panel);
  if (!host) return;
  // live refreshes rebuild the panel DOM — keep the user's scroll position
  // and rescue the live twin before the clear destroys it
  parkTwin(host);
  const scrollTop = host.querySelector('.spec-page')?.scrollTop || 0;
  if (panel === LIBRARY_PANEL) {
    host.textContent = '';
    renderLibrary(host, { role, builtScreens: BUILT });
  } else {
    renderSpecScreen(host, panel.replace('panel-spec-', ''));
  }
  if (scrollTop) {
    const page = host.querySelector('.spec-page');
    if (page) page.scrollTop = scrollTop;
  }
}

export function initSpecViews() {
  injectPanels();
  injectNav();
  applySpecMode();
  injectRoleSwitcher();
  startChartFeed(); // live mock feed: charts scroll in place ~1/s
  document.addEventListener('sentinel:render', maybeRender);
}
