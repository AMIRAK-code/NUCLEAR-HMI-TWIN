'use strict';
// Per-CMP content providers — bridge the Mappatura CMPs to the app's
// data-abstraction layer (S model fed by the simulated DAO/scenario engine).
// Every provider renders EXACTLY the fields the sheet's "Dati" column lists
// for that component. When the FOS backend API lands, only the DAO transport
// changes; this mapping and the screens stay as they are.
// Returns null when a CMP has no binding yet → the atom keeps its generic stub.

import { S } from '@shared/src/model.js';
import { DAO } from '@shared/src/dao.js';
import { dispatch, scheduleRender } from '@shared/src/reducer.js';
import { ScenarioEngine } from '@shared/src/scenario-engine.js';
import { TelemetryBuffer } from '@shared/src/telemetry-buffer.js';
import { Predictor } from '../predictor.js';
import { getScenario } from '../training-scenarios.js';
import { dlFile } from '@shared/utils.js';
import { fire as fireNotif } from '@shared/src/notification-engine.js';
import { ACTION_TYPES as A } from '../../constants/actionTypes.js';

const SEV = { 1: 'critical', 2: 'warning', 3: 'degraded' };

// alarm type per the Mappatura taxonomy (Process/Sensor/Network/Model)
function alarmTipo(tag) {
  if (/^VS/.test(tag)) return 'Model';
  if (/^(GW|NET|EDGE)/.test(tag)) return 'Network';
  if (/^(TC|PT|FL)/i.test(tag)) return 'Sensor';
  return 'Process';
}

function trendData(series) {
  // layers must share length (the chart maps index → x over full width):
  // predicted = real shifted by the recent slope, with confidence band
  const real = [...series];
  const tail = real.slice(-5);
  const slope = (tail[tail.length - 1] - tail[0]) / Math.max(tail.length - 1, 1);
  const predicted = real.map(v => v + slope * 4);
  return { layers: [
    { kind: 'real', vals: real },
    { kind: 'predicted', vals: predicted, band: Math.max(Math.abs(slope) * 3, 2) },
  ] };
}

function alarmData() {
  return {
    alarms: S.alarms.map(a => ({
      id: a.id,
      sev: a.acked ? 'stale' : (SEV[a.p] || 'warning'),
      sevLabel: a.acked ? 'ACKED' : (a.p === 1 ? 'CRIT' : a.p === 2 ? 'WARN' : 'INFO'),
      ts: a.ts, tag: a.tag, tipo: alarmTipo(a.tag), msg: a.msg, acked: a.acked,
      ackBy: a.ackBy || null,
    })),
    // per-row ack of a single alarm (fixes the old ACK_ALL-on-every-row bug)
    onAckOne: id => dispatch(A.ACK_ONE, { id }),
    // click a row → select that alarm AND expand the detail accordion (CMP-47)
    onRowClick: i => { setSelection('alarmOpen', true); selectRow('alarm', S.alarms[i] && S.alarms[i].id); },
    selectedIndex: S.alarms.findIndex(a => a.id === getSelection('alarm')),
  };
}

const firstAlarm = () => S.alarms.find(a => !a.acked) || S.alarms[0] || null;

// ── cross-card selection (row click → detail panels read this) ───────────
// The spec asks several detail components (CMP-20/21/47) to "appear below the
// table when you click the relevant row". The cards are independent grid items,
// so a click stores the selection here and the detail providers read it back.
const selection = { sensor: null, alarm: null, alarmOpen: false, threat: null, graphVar: null, vars: ['CORE_TEMP', 'PRIM_PRESS'] };
export function getSelection(kind) { return selection[kind]; }
export function setSelection(kind, value) { selection[kind] = value; }
// set selection AND trigger a spec re-render so the detail panels refresh
export function selectRow(kind, value) {
  selection[kind] = value;
  document.dispatchEvent(new CustomEvent('sentinel:render'));
}
// folded into the panel re-render key so a selection change forces a redraw
export function selectionSignature() {
  return `${selection.sensor || ''}|${selection.alarm || ''}|${selection.alarmOpen ? 1 : 0}|${selection.threat || ''}|${selection.vars.join('.')}`;
}

// Live trend bound to a DAO signal: a real trace (chart-feed tracks the live
// sensor value) plus a predicted projection with a confidence band. Charts
// scroll in place via the feed — no rebuild needed.
function liveTrend(sig, base, amp, unit) {
  return {
    showMetric: true,
    unit: unit || '',
    layers: [
      { kind: 'real', key: sig, base, amp },
      { kind: 'predicted', key: `${sig}__pred`, base: base + amp * 0.3, amp: amp * 0.9, band: Math.max(amp * 0.4, 2) },
    ],
  };
}

// status code → semantic badge/dot kind (shared by sensor table + readouts)
function statusKind(st) {
  return st === 'alarm' ? 'critical' : st === 'warning' ? 'warning' : st === 'low' ? 'stale' : 'ok';
}

// CMP-09 Grafici variabili: trend live della pressione + proiezione predetta.
// (spreadsheet COMMENTS FOR US: "Update with mock data. To show historical series")
function cmp09() {
  const s = S.sensors.PRIM_PRESS;
  const base = (s && s.v) ?? 230;
  return liveTrend('PRIM_PRESS', base, Math.max(base * 0.04, 4), (s && s.u) || 'PSI');
}

// ── CMP-05 Variabili critiche: scelta variabili + misure (pick & choose) ──
// (spreadsheet COMMENTS FOR US: "You pick and choose which variables you want
//  to monitor. And see the measurements and data.")
const CRIT_VARS = ['CORE_TEMP', 'PRIM_PRESS', 'COOLANT_OUT', 'NEUTRON_FLUX', 'STEAM_PRESS', 'SEC_FLOW'];
const VAR_KIND = ['real', 'estimated', 'predicted', 'stale', 'warning', 'degraded'];
export function criticalVarOptions() {
  return CRIT_VARS.filter(k => S.sensors[k]).map(k => ({ key: k, label: S.sensors[k].label, unit: S.sensors[k].u }));
}
export function criticalVarLayers(keys) {
  return keys.map((k, i) => {
    const s = S.sensors[k];
    if (!s) return null;
    return { kind: VAR_KIND[i % VAR_KIND.length], key: k, base: s.v, amp: Math.max(Math.abs(s.v) * 0.04, 1), unit: s.u };
  }).filter(Boolean);
}
export function criticalVarReadouts(keys) {
  return keys.map(k => {
    const s = S.sensors[k];
    if (!s) return null;
    return [statusKind(DAO.status(s)), s.label, `${DAO.fmt(s)} ${s.u}`, k];
  }).filter(Boolean);
}

// CMP-20 Scheda tecnica sensore (detail form, single selected sensor)
export function sensorTech(key) {
  const s = S.sensors[key];
  if (!s) return null;
  return {
    banner: ['ok', `${s.label} · ${s.tag}`, s.sys],
    fields: [
      { label: 'Tag', value: s.tag },
      { label: 'Descrizione', value: s.label },
      { label: 'Sistema', value: s.sys },
      { label: 'Unità di misura', value: s.u },
      { label: 'Sorgente dato', value: s.source },
    ],
  };
}
// CMP-21 Configurazione acquisizione (editable, single selected sensor)
export function sensorAcq(key) {
  const s = S.sensors[key];
  if (!s) return null;
  return {
    banner: ['ok', `Acquisizione · ${s.tag}`],
    fields: [
      { label: 'Frequenza acquisizione', value: '800 ms', options: ['500 ms', '800 ms', '1 s', '5 s'] },
      { label: 'Modalità', value: 'Continua', options: ['Continua', 'On-demand', 'Trigger evento'] },
      { label: 'Soglia trip', value: s.trip, type: 'number' },
      { label: 'Soglia bassa', value: s.low, type: 'number' },
      { label: 'Abilitato', value: 'Sì', options: ['Sì', 'No'] },
    ],
    validate: v => {
      const errs = {};
      const trip = parseFloat(v['Soglia trip']);
      const low = parseFloat(v['Soglia bassa']);
      if (!isNaN(trip) && !isNaN(low) && low >= trip) errs['Soglia bassa'] = 'La soglia bassa deve essere inferiore alla soglia trip';
      return errs;
    },
    submit: { label: 'Salva configurazione', onSubmit: () => dispatch(A.LOG, { msg: `Config acquisizione ${s.tag} aggiornata (demo)` }) },
  };
}
// CMP-22 Monitor dati grezzi (live raw stream of the selected sensor)
export function sensorRaw(key) {
  const s = S.sensors[key];
  if (!s) return null;
  return liveTrend(key, s.v, Math.max(Math.abs(s.v) * 0.05, 1), s.u);
}
// CMP-23 Validazione e calibrazione (KPIs scoped to a single selected sensor)
export function sensorCalib(key) {
  const s = S.sensors[key];
  if (!s) return null;
  return {
    kpis: [
      { label: 'Offset', value: '0.0', unit: s.u, badge: ['ok', 'CALIBRATO'] },
      { label: 'Gain', value: '1.00' },
      { label: 'Deviazione vs modello', value: (Math.abs(Math.sin(key.length)) * 2).toFixed(2), unit: '%', badge: ['estimated', 'STIMATO'] },
      { label: 'Ultima calibrazione', value: '2026-05-12' },
    ],
  };
}

// CMP-54 threat list (selectable) → CMP-55 "Dettaglio minaccia" follows the row.
const SEC_THREATS = [
  { id: 'THR-01', sev: 'critical', sevLabel: 'CRIT', asset: 'GW-EDGE-03', tipo: 'Intrusion', msg: 'Tentativi di accesso non autorizzati ripetuti', vector: 'SSH brute-force', src: '10.4.12.88' },
  { id: 'THR-02', sev: 'warning', sevLabel: 'WARN', asset: 'PLC-02', tipo: 'Anomaly', msg: 'Traffico Modbus anomalo fuori finestra operativa', vector: 'Protocol anomaly', src: '10.4.10.21' },
  { id: 'THR-03', sev: 'degraded', sevLabel: 'INFO', asset: 'HMI-01', tipo: 'Policy', msg: 'Certificato TLS in scadenza (7 giorni)', vector: 'Cert expiry', src: '—' },
];

// ─── SCR-02 — Dashboard operativa ───────────────────────────────────────

// CMP-04 Stato sistema: versione, plant mode, twin/pipeline, freshness (live)
function cmp04() {
  const unacked = S.alarms.filter(a => !a.acked).length;
  const rows = [
    [S.scramActive ? 'critical' : 'ok', 'Stato sistema', S.scramActive ? 'SCRAM ATTIVO' : 'Operativo · v4.3.0'],
    ['ok', 'Plant mode', S.autoPilot ? 'Automatico' : 'Manuale'],
    ['ok', 'Digital Twin', 'Sincronizzato · Δ 0.6 %'],
    ['ok', 'Pipeline ingestion', 'Attiva · latenza 0.8 s'],
    [unacked ? 'warning' : 'ok', 'Allarmi non gestiti', String(unacked)],
    ['ok', 'Data freshness', '< 1 s'],
  ];
  // sheet NOTE: "AS vede anche CPU e storage" — extra infra rows for the admin
  if (S.role === 'AS') {
    rows.push(['ok', 'CPU sistema', '38 % · 8 core']);
    rows.push(['ok', 'Storage', '62 % · 1.2 / 2 TB']);
  }
  return { rows };
}

// CMP-08 Sensori: fleet quality dal DAO snapshot (live)
function cmp08() {
  const sensors = Object.values(S.sensors || {});
  if (!sensors.length) return null;
  const by = { nominal: 0, warning: 0, alarm: 0, low: 0 };
  sensors.forEach(s => { by[DAO.status(s)] = (by[DAO.status(s)] || 0) + 1; });
  const pctNom = Math.round((by.nominal / sensors.length) * 100);
  return { rows: [
    ['Sensori attivi', `${sensors.length} (100 %)`, 'ok'],
    ['% nominali', pctNom + ' %', pctNom >= 90 ? 'ok' : 'warning'],
    ['Tipologie', 'TC · PT · FL · VS', 'ok'],
    ['Latenza media', '740 ms', 'ok'],
    ['Performance 24h', `${by.warning} warning · ${by.alarm} allarmi`, by.alarm ? 'critical' : by.warning ? 'warning' : 'ok'],
  ] };
}

// CMP-07 Eventi recenti: ultimi eventi reali dall'audit log del modello S
function cmp07() {
  const ev = (S.auditLog || []).slice(-5).reverse();
  if (!ev.length) return null;
  return {
    cols: ['Timestamp', 'Evento', 'Asset', 'Severità'],
    rows: ev.map(e => [e.ts, (e.msg || '').slice(0, 60), e.role || 'SYS',
      { b: [/alarm|scram|fail/i.test(e.msg) ? 'warning' : 'ok', /alarm|scram|fail/i.test(e.msg) ? 'WARN' : 'INFO'] }]),
  };
}

// CMP-10 Indicatori salute: SHI, trend, confidence, RUL
const cmp10 = () => ({ kpis: [
  { label: 'SHI', value: '0.94', delta: '▼ 0.02 / 24h', deltaKind: 'down', badge: ['predicted', 'PREDETTO'] },
  { label: 'Trend SHI', value: 'Stabile', badge: ['ok', 'OK'] },
  { label: 'Confidence', value: '0.91', badge: ['estimated', 'MODELLO'] },
  { label: 'RUL', value: '1 240', unit: 'h', badge: ['predicted', 'PREDETTO'] },
] });

// CMP-11 Stato modelli / sensori virtuali
const cmp11 = () => ({ rows: [
  ['ok', 'Modelli attivi', '6 (LSTM ×3 · GBM ×2 · FEM ×1)'],
  ['estimated', 'Sensori virtuali attivi', '4 / 4'],
  ['ok', 'Stato calcolo', 'In esecuzione · ciclo 800 ms'],
  ['ok', 'Ultimo aggiornamento', '0.8 s fa'],
] });

// CMP-12 Monitor componenti AM (additive manufacturing)
const cmp12 = () => ({ kpis: [
  { label: 'Stress', value: '62', unit: '%', badge: ['ok', 'IN LIMITE'] },
  { label: 'Deformazione', value: '0.8', unit: 'mm' },
  { label: 'T locale', value: '412', unit: '°C', delta: 'limite AM 580 °C' },
  { label: 'Integrità', value: 'OK', badge: ['ok', 'VERIFICATO'] },
] });

// CMP-13 Stato rete IoT
const cmp13 = () => ({ rows: [
  ['ok', 'Gateway attivi', '3 / 3'],
  ['degraded', 'Nodi degradati', 'EDGE-03 (packet loss 2.1 %)'],
  ['ok', 'Latenza media', '38 ms · QoS 99.2 %'],
  ['ok', 'Banda utilizzata', '14 / 100 Mbps'],
  ['ok', 'TLS / autenticazione', 'Attivi su tutti i dispositivi'],
] });

// CMP-14 Cybersecurity
const cmp14 = () => ({ rows: [
  ['ok', 'Threat level', 'BASSO'],
  ['ok', 'Allarmi sicurezza 24h', '0'],
  ['warning', 'Vulnerabilità critiche', '1 (patch pianificata)'],
  ['ok', 'Stato patching', '98 % aggiornato'],
] });

// CMP-15 Log configurazione
const cmp15 = () => ({
  cols: ['Timestamp', 'Utente', 'Parametro', 'Modifica'],
  rows: [
    ['10:21:44', 'diag.bianchi (OD)', 'Soglia warning TC-04', '545 → 552 °C'],
    ['09:58:12', 'admin.verdi (AS)', 'Frequenza acquisizione PT-02', '1 s → 800 ms'],
    ['09:12:30', 'admin.verdi (AS)', 'Escalation NP-CRIT-VAR-01', '5 → 3 min'],
    ['08:47:05', 'diag.bianchi (OD)', 'Modello VS-07', 'v2.3 → v2.4'],
  ],
});

// CMP-16 Stato utenti
function cmp16() {
  return { rows: [
    ['ok', 'Utenti attivi', '12 registrati'],
    ['ok', 'Utenti online', `3 (1 ${S.role || 'OL'} — tu)`],
    ['ok', 'Ruoli attivi', 'OL ×1 · OD ×1 · AS ×1'],
  ] };
}

// ─── SCR-07 — Gestione allarmi ──────────────────────────────────────────

// ── CMP-47 alarm detail: remediation guidance + event history ────────────
// No FOS backend yet, so the remediation hints, the linked VR training
// scenario, and the per-sensor event archive are curated/deterministic and
// keyed by the sensor tag. When the backend lands, only these maps move to the
// DAO transport; cmp47() and the CMP-47 view keep their shape.

// Past occurrences of a given alarm type on a specific sensor (newest first).
// Drives the "Storico su questo sensore" column — answers "has this kind of
// event fired on this sensor before?".
const ALARM_HISTORY = {
  'P-PRI-01': [
    { date: '2026-06-20 03:14', value: '+11.8 PSI vs sim', outcome: 'Risolto — spurgo Sub-Valve 04-B' },
    { date: '2026-05-02 17:42', value: '+9.3 PSI vs sim',  outcome: 'Risolto — ritaratura PT-PRI' },
  ],
  'P-STM-01': [
    { date: '2026-06-11 09:58', value: '+0.3 bar/min', outcome: 'Auto-clear dopo riduzione carico' },
  ],
  // 'T-CORE-01', 'F-NEUT-01', … → nessuno storico ⇒ "primo rilevamento"
};
function alarmHistory(tag) { return ALARM_HISTORY[tag] || []; }

// Operator remediation guidance + linked training. `trainingId` references a
// scenario in training-scenarios.js; null when no VR simulation is associated
// (the CMP-47 view hides the link in that case — "if present").
const ALARM_GUIDANCE = {
  'P-PRI-01': {
    suggestion: [
      'Verificare posizione e tenuta della Sub-Valve 04-B sul circuito primario.',
      'Confrontare il valore con il Digital Twin (SCR-11) per escludere una deriva del sensore PT.',
      'Se la deviazione di pressione persiste oltre 5 minuti, avviare la procedura di spurgo controllato.',
      'Annotare l’evento nel registro di turno e notificare il Direttore Operativo (OD).',
    ],
    trainingId: 'SCN-02',
  },
  'P-STM-01': {
    suggestion: [
      'Controllare il trend della pressione vapore secondario sugli ultimi 15 minuti.',
      'Verificare il regime delle pompe di alimento e l’apertura delle valvole di by-pass turbina.',
      'Se il gradiente supera +0.5 bar/min, ridurre il carico termico secondario.',
    ],
    trainingId: null,
  },
  'T-CORE-01': {
    suggestion: [
      'Valutare il rateo di salita sul grafico Core Thermal Load e la proiezione predittiva.',
      'Confermare che gli interlock di protezione (SCR-08) siano in stato ARMED.',
      'Se la proiezione interseca la soglia di trip, predisporre la procedura SCRAM.',
    ],
    trainingId: 'SCN-03',
  },
};
// Generic fallback by alarm taxonomy when the tag has no specific entry.
const GUIDANCE_BY_TYPE = {
  Sensor:  ['Verificare lo stato del sensore e confrontarlo con il valore stimato dal Digital Twin.', 'Controllare alimentazione e qualità del segnale del nodo IoT associato.'],
  Network: ['Verificare la connettività del gateway/nodo EDGE coinvolto.', 'Controllare la latenza e l’ultima sincronizzazione del nodo.'],
  Model:   ['Verificare confidence e versione del modello del sensore virtuale.', 'Confrontare l’output stimato con i sensori fisici di riferimento.'],
  Process: ['Consultare la procedura operativa associata al parametro di processo.', 'Confrontare il valore con il Digital Twin per distinguere evento reale da deriva.'],
};
export function alarmGuidance(a) {
  const g = ALARM_GUIDANCE[a.tag];
  const suggestion = (g && g.suggestion) || GUIDANCE_BY_TYPE[alarmTipo(a.tag)] || GUIDANCE_BY_TYPE.Process;
  const sc = g && g.trainingId ? getScenario(g.trainingId) : null;
  const training = sc
    ? { id: sc.id, title: sc.title, difficulty: sc.difficulty, minutes: sc.estimatedMinutes }
    : null;
  return { suggestion, training };
}

// CMP-47 Dettaglio allarme: l'allarme selezionato nella lista (CMP-46), con
// fallback al primo allarme attivo finché l'operatore non clicca una riga.
// Oltre al dettaglio mostra: colonna storico (eventi pregressi sullo stesso
// sensore), suggerimenti di risoluzione e link alla simulazione VR di training.
function cmp47() {
  const sel = getSelection('alarm');
  const a = (sel && S.alarms.find(x => x.id === sel)) || firstAlarm();
  if (!a) return { cols: ['Campo', 'Valore', 'Storico su questo sensore'], rows: [['Stato', 'Nessun allarme attivo', '—']] };
  const hist = alarmHistory(a.tag);
  const seen = hist.length;
  const histSummary = seen
    ? `Sì · ${seen} ${seen === 1 ? 'evento precedente' : 'eventi precedenti'} (ultimo ${hist[0].date})`
    : 'No · primo rilevamento su questo sensore';
  const det = a.tag.startsWith('P-PRI') ? '+14.2 PSI vs sim' : '+0.4 bar/min';
  const { suggestion, training } = alarmGuidance(a);
  return {
    cols: ['Campo', 'Valore', 'Storico su questo sensore'],
    rows: [
      ['ID allarme', a.id, ''],
      ['Descrizione tecnica', a.msg, ''],
      ['Parametro coinvolto', `${a.tag} (${alarmTipo(a.tag)})`, ''],
      ['Tipo evento', `${a.p === 1 ? 'Critica' : 'Warning'} · ${alarmTipo(a.tag)}`, histSummary],
      ['Valore rilevato', det, seen ? `max precedente ${hist[0].value}` : '—'],
      ['Soglia superata', a.p === 1 ? 'Critica' : 'Warning', seen ? `${seen} superamenti pregressi` : 'nessun precedente'],
      ['Timeline', `Attivato ${a.ts}${a.acked ? ' · Acknowledged' : ' · in attesa di ACK'}`, ''],
    ],
    history: hist,
    suggestion,
    training,
  };
}

// CMP-48 Acknowledge allarme: stato Active→Acknowledged + utente + timestamp
function cmp48() {
  const unacked = S.alarms.filter(a => !a.acked).length;
  return {
    status: unacked
      ? ['warning', `${unacked} allarmi in stato Active`, `Operatore: ${S.role || '—'}`]
      : ['ok', 'Tutti gli allarmi in stato Acknowledged', `Ultimo ACK: ${S.role || '—'}`],
    actions: [{
      label: 'Acknowledge allarmi attivi', primary: true, enabled: unacked > 0,
      onClick: () => dispatch(A.ACK_ALL),
    }],
  };
}

// CMP-49 Configura soglie — con validazione errori (FORM_STD_01)
const cmp49 = () => ({
  fields: [
    { label: 'Warning threshold (°C)', value: 552, type: 'number' },
    { label: 'Critical threshold (°C)', value: 560, type: 'number' },
    { label: 'Logica attivazione', value: 'Superamento persistente', options: ['Superamento istantaneo', 'Superamento persistente', 'Media mobile'] },
    { label: 'Delay attivazione', value: '5 s', options: ['0 s', '5 s', '30 s'] },
  ],
  validate: v => {
    const w = parseFloat(v['Warning threshold (°C)']);
    const c = parseFloat(v['Critical threshold (°C)']);
    const errs = {};
    if (isNaN(w)) errs['Warning threshold (°C)'] = 'Valore numerico richiesto';
    if (isNaN(c)) errs['Critical threshold (°C)'] = 'Valore numerico richiesto';
    if (!isNaN(w) && !isNaN(c) && w >= c) errs['Critical threshold (°C)'] = 'La soglia critica deve superare quella di warning';
    if (!isNaN(c) && c > 580) errs['Critical threshold (°C)'] = 'Oltre il limite ammesso (max 580 °C)';
    return errs;
  },
  submit: { label: 'Salva soglie', onSubmit: () => dispatch(A.LOG, { msg: 'Soglie allarme aggiornate (demo)' }) },
});

// CMP-50 Storico allarmi: allarmi presi in carico in questa sessione (live)
// in cima, seguiti dallo storico di esempio — mostra il ciclo Active→Ack→Closed.
const cmp50 = () => {
  const acked = S.alarms.filter(a => a.acked).map(a => [
    a.id, a.tag, { b: ['ok', 'ACKNOWLEDGED'] }, 'in sessione', `${a.ackBy || '—'}`,
  ]);
  return {
    cols: ['ID', 'Asset', 'Stato finale', 'Tempo risoluzione', 'Chiusura'],
    rows: [
      ...acked,
      ['A-0409', 'TC-04', { b: ['ok', 'CLOSED'] }, '12 min', 'op.rossi (OL)'],
      ['A-0408', 'VS-07', { b: ['ok', 'CLOSED'] }, '47 min', 'diag.bianchi (OD)'],
      ['A-0405', 'EDGE-03', { b: ['stale', 'AUTO-CLEAR'] }, '3 min', 'sistema'],
    ],
  };
};

// CMP-51 Escalation workflow
const cmp51 = () => ({
  fields: [
    { label: 'Regola escalation', value: 'Severity ≥ Critica non gestita', options: ['Severity ≥ Critica non gestita', 'Qualsiasi allarme > 15 min', 'Allarmi cybersecurity'] },
    { label: 'Tempo escalation', value: '5 min', options: ['3 min', '5 min', '15 min'] },
    { label: 'Ruolo notificato', value: 'AS', options: ['OD', 'AS', 'OD + AS'] },
  ],
  submit: { label: 'Salva workflow', onSubmit: () => dispatch(A.LOG, { msg: 'Workflow escalation aggiornato (demo)' }) },
});

// CMP-53 KPI qualità sistema allarmi
const cmp53 = () => ({ kpis: [
  { label: 'Falsi positivi', value: '4.2', unit: '%', badge: ['estimated', 'STIMATO'] },
  { label: 'Falsi negativi', value: '1.1', unit: '%', badge: ['estimated', 'STIMATO'] },
  { label: 'T. medio rilevamento', value: '2.3', unit: 's' },
  { label: 'Copertura eventi', value: '96', unit: '%', badge: ['ok', 'TARGET OK'] },
] });

// ─── SCR-11 — Digital Twin ──────────────────────────────────────────────

// CMP-74 Confronto reale vs simulato: serie + deviazione/errore medio
function cmp74() {
  const real = [...S.histTemp];
  const sim = real.map((v, i) => v + 4 * Math.sin(i / 3) + 2);
  const devs = real.map((v, i) => Math.abs(sim[i] - v) / v * 100);
  const avg = devs.reduce((a, b) => a + b, 0) / devs.length;
  return {
    unit: (S.sensors.CORE_TEMP && S.sensors.CORE_TEMP.u) || '°C',
    layers: [
      { kind: 'real', vals: real },
      { kind: 'predicted', vals: sim, band: 2.5 },
    ],
    meta: `Δ ${devs[devs.length - 1].toFixed(1)} % · errore medio ${avg.toFixed(1)} %`,
  };
}

// CMP-75 Scenari preconfigurati: parametri + avvio REALE della simulazione
// (il motore scenari muove DAO/allarmi → SCR-02 e SCR-07 reagiscono live)
const SIM_SCENARIOS = {
  'Rising Temperature (rampa termica)': () => ScenarioEngine.runRisingTemp(),
  'LOCA — perdita refrigerante': () => ScenarioEngine.runLOCA(),
  'Station Blackout': () => ScenarioEngine.runBlackout(),
};
const SCN_LABEL = { RISING_TEMP: 'Rising Temperature', LOCA: 'LOCA — perdita refrigerante', BLACKOUT: 'Station Blackout' };
function cmp75() {
  const active = ScenarioEngine.active;
  const data = {
    fields: [
      { label: 'Scenario', value: 'Rising Temperature (rampa termica)', options: Object.keys(SIM_SCENARIOS) },
      { label: 'Condizioni iniziali', value: 'Stato corrente impianto', options: ['Stato corrente impianto', 'Stato nominale'] },
      { label: 'Durata massima (min)', value: 10, type: 'number' },
    ],
    submit: {
      label: active ? 'Simulazione in corso…' : 'Avvia simulazione',
      disabled: active,
      onSubmit: vals => {
        if (ScenarioEngine.active) return;
        const run = SIM_SCENARIOS[vals['Scenario']];
        if (run) { dispatch(A.LOG, { msg: `Twin: avviato scenario "${vals['Scenario']}"` }); run(); }
      },
    },
    secondary: { label: 'Ripristina nominale', onClick: () => ScenarioEngine.resetToNominal() },
  };
  // running-state banner so the operator has clear feedback after "Avvia"
  if (active) {
    const trip = ScenarioEngine.tripTimeSec
      ? `trip previsto a T+${Math.floor(ScenarioEngine.tripTimeSec / 60)}m ${ScenarioEngine.tripTimeSec % 60}s` : '';
    data.banner = ['degraded', `Scenario "${SCN_LABEL[ScenarioEngine.name] || ScenarioEngine.name}" in esecuzione`, trip];
  }
  return data;
}

// signature for SCR-11 re-render: only flips when a scenario starts/stops, so
// the twin animation survives normal ticks (no per-second rebuild churn).
export function scenarioSignature() {
  return `${ScenarioEngine.active ? 1 : 0}:${ScenarioEngine.name || ''}`;
}

// CMP-76 Log simulazioni twin
const cmp76 = () => ({
  cols: ['Timestamp', 'Scenario', 'Parametri input', 'Risultato chiave'],
  rows: [
    ['09:41', 'Rising Temperature', 'rampa +0.8 °C/min', { b: ['warning', 'TRIP a T+9 min'] }],
    ['08:15', 'LOCA', 'perdita 12 %/min', { b: ['critical', 'SCRAM a T+4 min'] }],
    ['Ieri 17:02', 'Station Blackout', 'EDG avvio 12 s', { b: ['ok', 'NESSUN TRIP'] }],
    ['Ieri 15:48', 'Rising Temperature', 'rampa +0.3 °C/min', { b: ['ok', 'NESSUN TRIP'] }],
  ],
});

// ─── SCR-09 — Analisi storica & trending ───────────────────────────────
// Module-local screen state. Keeping it out of S so we don't pollute the
// reducer with view-state that has no audit consequences — re-renders are
// triggered explicitly via scheduleRender().

const SCR09_DEFAULTS = {
  key: 'CORE_TEMP',
  intervalMin: 10,         // window in minutes (clamped to buffered duration)
  granularity: 'raw',      // raw | 5s | 1m
  aggregation: 'mean',     // mean | max | min
};
const scr09 = { ...SCR09_DEFAULTS };

function sensorOptions() {
  return Object.keys(DAO._s).map(k => `${k} — ${DAO._s[k].tag}`);
}
const keyFromOption = opt => opt.split(' — ')[0];

// Pull buffered readings for the active key, clipped to the selected window.
function bufferedSeries(key, windowMs) {
  const buf = TelemetryBuffer.get();
  const cutoff = Date.now() - windowMs;
  const out = [];
  for (let i = 0; i < buf.length; i++) {
    if (buf[i].ts < cutoff) continue;
    const v = buf[i].sensors[key]?.v;
    if (v !== null && v !== undefined) out.push({ ts: buf[i].ts, v });
  }
  return out;
}

// Downsample by averaging within buckets (granularity in ms; 0 = raw).
function bucket(series, bucketMs, agg) {
  if (!bucketMs || series.length < 2) return series.map(p => p.v);
  const out = [];
  let group = [];
  let groupStart = series[0].ts;
  for (const p of series) {
    if (p.ts - groupStart >= bucketMs) {
      out.push(reduceGroup(group, agg));
      group = [];
      groupStart = p.ts;
    }
    group.push(p.v);
  }
  if (group.length) out.push(reduceGroup(group, agg));
  return out;
}
function reduceGroup(g, agg) {
  if (!g.length) return 0;
  if (agg === 'max') return Math.max(...g);
  if (agg === 'min') return Math.min(...g);
  return g.reduce((a, b) => a + b, 0) / g.length;
}

function stats(vals) {
  const n = vals.length;
  if (!n) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const sigma = Math.sqrt(variance);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  // simple trend = slope of first-vs-last over the window
  const trend = n >= 2 ? (vals[n - 1] - vals[0]) / Math.max(n - 1, 1) : 0;
  return { mean, sigma, variance, min, max, trend, n };
}

// CMP-60 — Selezione variabili storiche (FORM_STD_01)
function cmp60() {
  return {
    fields: [
      { label: 'Variabile', value: `${scr09.key} — ${DAO._s[scr09.key]?.tag}`, options: sensorOptions() },
      { label: 'Intervallo (min)', value: scr09.intervalMin, type: 'number' },
      { label: 'Granularità', value: scr09.granularity, options: ['raw', '5s', '1m'] },
      { label: 'Aggregazione', value: scr09.aggregation, options: ['mean', 'max', 'min'] },
    ],
    submit: {
      label: 'Aggiorna analisi',
      onSubmit: v => {
        scr09.key = keyFromOption(v['Variabile']);
        scr09.intervalMin = Math.max(1, Math.min(10, parseInt(v['Intervallo (min)'], 10) || 10));
        scr09.granularity = v['Granularità'];
        scr09.aggregation = v['Aggregazione'];
        dispatch(A.LOG, { msg: `SCR-09: ${scr09.key} · ${scr09.intervalMin} min · ${scr09.granularity} · ${scr09.aggregation}` });
        scheduleRender();
      },
    },
  };
}

function granularityMs() {
  return { raw: 0, '5s': 5_000, '1m': 60_000 }[scr09.granularity] || 0;
}

// CMP-61 — Grafico storico (TREND_STD_01) with moving-average overlay
function cmp61() {
  const series = bufferedSeries(scr09.key, scr09.intervalMin * 60_000);
  const reals = bucket(series, granularityMs(), scr09.aggregation);
  if (reals.length < 2) {
    return { layers: [{ kind: 'stale', vals: [0, 0] }], meta: 'Buffer in riempimento — attendere 10+ campioni' };
  }
  // moving average (window 5)
  const w = Math.min(5, Math.max(2, Math.floor(reals.length / 6)));
  const ma = reals.map((_, i) => {
    const start = Math.max(0, i - w + 1);
    const slice = reals.slice(start, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
  const sn = DAO._s[scr09.key];
  return {
    layers: [
      { kind: 'real', vals: reals },
      { kind: 'estimated', vals: ma },
    ],
    threshold: sn?.trip,
    meta: `${scr09.key} · ${reals.length} campioni · MA(${w})`,
  };
}

// CMP-62 — Trend predittivo (TREND_STD_01) — OD/AS only per spec
function cmp62() {
  const sn = DAO._s[scr09.key];
  if (!sn) return null;
  const series = bufferedSeries(scr09.key, scr09.intervalMin * 60_000);
  if (series.length < 10) {
    return { layers: [{ kind: 'stale', vals: [0, 0] }], meta: 'Buffer insufficiente per regressione (min 10 campioni)' };
  }
  const reals = series.map(p => p.v);
  const { slope, projectedValues, timeToTrip } = Predictor.predict(scr09.key, sn.trip, sn.low);
  // band proportional to noise σ over the visible window
  const st = stats(reals);
  const band = st ? Math.max(st.sigma * 1.5, 0.5) : 1;
  const projected = projectedValues.slice(0, Math.min(60, projectedValues.length));
  // share a single x-axis: pad real with NaN-equivalent (replicate last) so both layers span the chart
  const padded = [...reals, ...new Array(projected.length).fill(reals[reals.length - 1])];
  const predLayer = [...new Array(reals.length).fill(reals[reals.length - 1]), ...projected];
  const ttp = (timeToTrip !== null && timeToTrip !== undefined) ? `· trip previsto T+${Math.floor(timeToTrip / 60)}m ${Math.floor(timeToTrip % 60)}s` : '· nessun trip previsto a 2 min';
  return {
    layers: [
      { kind: 'real', vals: padded },
      { kind: 'predicted', vals: predLayer, band },
    ],
    threshold: sn.trip,
    meta: `slope ${slope.toFixed(3)} ${sn.u}/tick ${ttp}`,
  };
}

// CMP-63 — Integrità serie storiche (DATA_QUALITY_STD_01)
function cmp63() {
  const dur = TelemetryBuffer.durationSec();
  const series = bufferedSeries(scr09.key, scr09.intervalMin * 60_000);
  const expected = Math.max(1, Math.floor((scr09.intervalMin * 60) / 0.8));
  const completeness = Math.min(100, Math.round((series.length / expected) * 100));
  const lastAgeMs = series.length ? Date.now() - series[series.length - 1].ts : Infinity;
  const gaps = countGaps(series, 2_000);
  return {
    rows: [
      ['Completezza', `${completeness} %`, completeness >= 90 ? 'ok' : completeness >= 60 ? 'warning' : 'critical'],
      ['Freschezza', lastAgeMs < 2_000 ? `${(lastAgeMs / 1000).toFixed(1)} s` : 'STALE', lastAgeMs < 2_000 ? 'ok' : 'stale'],
      ['Gap rilevati', `${gaps}`, gaps === 0 ? 'ok' : gaps < 3 ? 'warning' : 'critical'],
      ['Durata buffer', `${dur.toFixed(0)} s / 600 s`, dur >= 60 ? 'ok' : 'warning'],
      ['Campioni utili', `${series.length} / ${expected}`, 'ok'],
    ],
  };
}
function countGaps(series, thresholdMs) {
  let g = 0;
  for (let i = 1; i < series.length; i++) {
    if (series[i].ts - series[i - 1].ts > thresholdMs) g++;
  }
  return g;
}

// CMP-64 — Analisi deviazione baseline (KPI_STD_01) — ≥5 stats
function cmp64() {
  const sn = DAO._s[scr09.key];
  const series = bufferedSeries(scr09.key, scr09.intervalMin * 60_000);
  const st = stats(series.map(p => p.v));
  if (!st) {
    return { kpis: [{ label: 'Buffer', value: '—', badge: ['stale', 'IN ATTESA'] }] };
  }
  const baseline = DAO.NOMINAL[scr09.key] ?? st.mean;
  const deviation = ((st.mean - baseline) / Math.max(Math.abs(baseline), 1)) * 100;
  const trendPerMin = (st.trend * 75); // 75 ticks per minute approx
  return { kpis: [
    { label: 'Mean', value: st.mean.toFixed(2), unit: sn?.u, badge: ['ok', 'MISURATO'] },
    { label: 'σ (stddev)', value: st.sigma.toFixed(3), unit: sn?.u },
    { label: 'Varianza', value: st.variance.toFixed(3) },
    { label: 'Min / Max', value: `${st.min.toFixed(1)} / ${st.max.toFixed(1)}`, unit: sn?.u },
    { label: 'Trend', value: `${trendPerMin >= 0 ? '+' : ''}${trendPerMin.toFixed(2)}`, unit: `${sn?.u || ''}/min`, deltaKind: trendPerMin >= 0 ? 'up' : 'down' },
    { label: 'Deviazione baseline', value: `${deviation >= 0 ? '+' : ''}${deviation.toFixed(1)}`, unit: '%', badge: [Math.abs(deviation) < 2 ? 'ok' : Math.abs(deviation) < 5 ? 'warning' : 'critical', 'BASELINE'] },
  ] };
}

// CMP-65 — Export dataset (ACTION_STD_01) — CSV/JSON download
function cmp65() {
  const series = bufferedSeries(scr09.key, scr09.intervalMin * 60_000);
  const exportCsv = () => {
    const lines = ['timestamp,iso,key,value,unit'];
    const u = DAO._s[scr09.key]?.u || '';
    for (const p of series) {
      lines.push(`${p.ts},${new Date(p.ts).toISOString()},${scr09.key},${p.v},${u}`);
    }
    dlFile(lines.join('\n'), `scr09-${scr09.key}-${Date.now()}.csv`, 'text/csv');
    dispatch(A.LOG, { msg: `SCR-09 export CSV: ${scr09.key} (${series.length} righe)` });
  };
  const exportJson = () => {
    const payload = {
      key: scr09.key,
      unit: DAO._s[scr09.key]?.u,
      intervalMin: scr09.intervalMin,
      generatedAt: new Date().toISOString(),
      stats: stats(series.map(p => p.v)),
      samples: series,
    };
    dlFile(JSON.stringify(payload, null, 2), `scr09-${scr09.key}-${Date.now()}.json`, 'application/json');
    dispatch(A.LOG, { msg: `SCR-09 export JSON: ${scr09.key} (${series.length} righe)` });
  };
  return {
    status: ['ok', `${series.length} campioni pronti`, `Variabile: ${scr09.key}`],
    actions: [
      { label: 'Esporta CSV', primary: true, enabled: series.length > 0, onClick: exportCsv },
      { label: 'Esporta JSON', enabled: series.length > 0, onClick: exportJson },
    ],
  };
}

// signature so SCR-09 re-renders when selection changes or buffer grows
export function scr09Signature() {
  return `${scr09.key}|${scr09.intervalMin}|${scr09.granularity}|${scr09.aggregation}|${TelemetryBuffer.get().length}`;
}

// ─── SCR-04 — Sensori virtuali (Links AI stub) ─────────────────────────
// Virtual sensors compute estimates from real inputs. They MUST never trigger
// SCRAM/alarms (per spec) — provenance is always 'Stimato' (dashed blue).

const VS_CATALOG = [
  { id: 'VS-01', label: 'Stress termico locale', inputs: ['CORE_TEMP', 'COOLANT_OUT'], formula: '0.6·CORE_TEMP + 0.4·COOLANT_OUT', unit: '°C', model: 'LSTM-v2.4', rmsePct: 1.2, conf: 0.93, active: true,  twinNode: 'CORE-NODE-A' },
  { id: 'VS-02', label: 'Flusso secondario stimato', inputs: ['PUMP_B', 'SEC_FLOW'], formula: '0.85·PUMP_B + 0.15·SEC_FLOW', unit: 'kg/s', model: 'GBM-v1.7', rmsePct: 2.1, conf: 0.88, active: true,  twinNode: 'PUMP-B-LOOP' },
  { id: 'VS-03', label: 'Pressione equivalente coolant', inputs: ['PRIM_PRESS', 'LEAD_LEVEL'], formula: 'PRIM_PRESS·(0.9 + 0.001·LEAD_LEVEL)', unit: 'PSI', model: 'FEM-fusion', rmsePct: 0.9, conf: 0.95, active: true,  twinNode: 'PRIMARY-VESSEL' },
  { id: 'VS-04', label: 'Output turbina previsto', inputs: ['STEAM_PRESS', 'TURBINE_RPM'], formula: '0.5·STEAM_PRESS + 0.5·TURBINE_RPM/15', unit: 'MWe', model: 'LSTM-v2.4', rmsePct: 1.8, conf: 0.90, active: false, twinNode: 'TURBINE-A' },
];
const vs04 = { selected: 'VS-01' };
const getVS = () => VS_CATALOG.find(v => v.id === vs04.selected) || VS_CATALOG[0];

function vsCompute(v) {
  // simple linear blend of inputs against their nominal — enough to track real
  if (v.id === 'VS-01') return 0.6 * (S.sensors.CORE_TEMP?.v || 0) + 0.4 * (S.sensors.COOLANT_OUT?.v || 0);
  if (v.id === 'VS-02') return 0.85 * (S.sensors.PUMP_B?.v || 0) + 0.15 * (S.sensors.SEC_FLOW?.v || 0);
  if (v.id === 'VS-03') return (S.sensors.PRIM_PRESS?.v || 0) * (0.9 + 0.001 * (S.sensors.LEAD_LEVEL?.v || 0));
  if (v.id === 'VS-04') return 0.5 * (S.sensors.STEAM_PRESS?.v || 0) + 0.5 * (S.sensors.TURBINE_RPM?.v || 0) / 15;
  return 0;
}

// CMP-27 Lista sensori virtuali (TABLE_STD_01)
function cmp27() {
  return {
    cols: ['ID', 'Etichetta', 'Modello', 'Input', 'Stato', 'Confidence', 'RMSE'],
    rows: VS_CATALOG.map(v => [
      v.id,
      v.label,
      v.model,
      v.inputs.join(' + '),
      { b: [v.active ? 'estimated' : 'stale', v.active ? 'ATTIVO' : 'INATTIVO'] },
      v.conf.toFixed(2),
      `${v.rmsePct.toFixed(1)} %`,
    ]),
  };
}

// CMP-28 Definizione logica (FORM_STD_01)
function cmp28() {
  const v = getVS();
  return {
    fields: [
      { label: 'Sensore virtuale', value: `${v.id} — ${v.label}`, options: VS_CATALOG.map(x => `${x.id} — ${x.label}`) },
      { label: 'Formula / logica', value: v.formula },
      { label: 'Input sensori', value: v.inputs.join(', ') },
      { label: 'Unità', value: v.unit },
    ],
    validate: vals => {
      const errs = {};
      if (!String(vals['Formula / logica'] || '').trim()) errs['Formula / logica'] = 'Logica obbligatoria';
      return errs;
    },
    submit: {
      label: 'Salva configurazione',
      onSubmit: vals => {
        vs04.selected = (vals['Sensore virtuale'] || '').split(' — ')[0] || vs04.selected;
        dispatch(A.LOG, { msg: `SCR-04: salvata logica per ${vs04.selected} (demo)` });
        scheduleRender();
      },
    },
  };
}

// CMP-29 Monitor output virtuale (TREND_STD_01) — dashed blue (estimated)
function cmp29() {
  const v = getVS();
  const real = bufferedSeries(v.inputs[0], 10 * 60_000).map(p => p.v);
  if (real.length < 2) return { layers: [{ kind: 'stale', vals: [0, 0] }], meta: 'Buffer in riempimento' };
  // virtual = noisy linear combination of buffered inputs
  const buf = TelemetryBuffer.get();
  const virt = [];
  for (let i = 0; i < buf.length; i++) {
    const inputs = buf[i].sensors;
    let val = 0;
    if (v.id === 'VS-01') val = 0.6 * (inputs.CORE_TEMP?.v || 0) + 0.4 * (inputs.COOLANT_OUT?.v || 0);
    else if (v.id === 'VS-02') val = 0.85 * (inputs.PUMP_B?.v || 0) + 0.15 * (inputs.SEC_FLOW?.v || 0);
    else if (v.id === 'VS-03') val = (inputs.PRIM_PRESS?.v || 0) * (0.9 + 0.001 * (inputs.LEAD_LEVEL?.v || 0));
    else if (v.id === 'VS-04') val = 0.5 * (inputs.STEAM_PRESS?.v || 0) + 0.5 * (inputs.TURBINE_RPM?.v || 0) / 15;
    if (val) virt.push(val);
  }
  return {
    layers: [{ kind: 'estimated', vals: virt, band: virt.length ? Math.max(...virt) * v.rmsePct / 100 : 1 }],
    meta: `${v.id} · ${v.model} · output stimato (mai genera allarmi)`,
  };
}

// CMP-30 Confronto reale vs virtuale (TREND_STD_01)
function cmp30() {
  const v = getVS();
  const buf = TelemetryBuffer.get();
  if (buf.length < 2) return { layers: [{ kind: 'stale', vals: [0, 0] }], meta: 'Buffer insufficiente' };
  const realKey = v.inputs[0];
  const real = [], virt = [];
  for (const entry of buf) {
    const r = entry.sensors[realKey]?.v;
    if (r === null || r === undefined) continue;
    real.push(r);
    let est = 0;
    const inp = entry.sensors;
    if (v.id === 'VS-01') est = 0.6 * (inp.CORE_TEMP?.v || 0) + 0.4 * (inp.COOLANT_OUT?.v || 0);
    else if (v.id === 'VS-02') est = 0.85 * (inp.PUMP_B?.v || 0) + 0.15 * (inp.SEC_FLOW?.v || 0);
    else if (v.id === 'VS-03') est = (inp.PRIM_PRESS?.v || 0) * (0.9 + 0.001 * (inp.LEAD_LEVEL?.v || 0));
    else if (v.id === 'VS-04') est = 0.5 * (inp.STEAM_PRESS?.v || 0) + 0.5 * (inp.TURBINE_RPM?.v || 0) / 15;
    virt.push(est);
  }
  const errs = real.map((r, i) => Math.abs(r - virt[i]) / Math.max(Math.abs(r), 1) * 100);
  const avgErr = errs.reduce((a, b) => a + b, 0) / Math.max(errs.length, 1);
  return {
    layers: [
      { kind: 'real', vals: real },
      { kind: 'estimated', vals: virt },
    ],
    meta: `errore medio ${avgErr.toFixed(2)} % · RMSE atteso ${v.rmsePct} %`,
  };
}

// CMP-31 Parametri modello AI (KPI_STD_01)
function cmp31() {
  const v = getVS();
  const current = vsCompute(v);
  const sn = DAO._s[v.inputs[0]];
  const realRef = sn?.v ?? 0;
  const err = Math.abs(current - realRef) / Math.max(Math.abs(realRef), 1) * 100;
  return { kpis: [
    { label: 'Modello', value: v.model, badge: ['estimated', 'AI'] },
    { label: 'Confidence', value: v.conf.toFixed(2), badge: ['estimated', 'STIMATO'] },
    { label: 'RMSE atteso', value: `${v.rmsePct.toFixed(1)}`, unit: '%' },
    { label: 'Output corrente', value: current.toFixed(2), unit: v.unit, badge: ['estimated', 'STIMATO'] },
    { label: 'Errore istante', value: `${err.toFixed(2)}`, unit: '%', badge: [err < v.rmsePct * 1.5 ? 'ok' : 'warning', err < v.rmsePct * 1.5 ? 'IN TARGET' : 'OLTRE RMSE'] },
    { label: 'Drift 24h', value: '0.4', unit: '%', badge: ['ok', 'STABILE'] },
  ] };
}

// CMP-32 Associazione al Twin (TWIN_COMPARE_STD_01)
// Atom expects either generic stub or ctx.data trend layers — give it both real
// and virtual against the associated twin node.
function cmp32() {
  // Reuse CMP-30's data but tagged with twin node + association status
  const base = cmp30();
  const v = getVS();
  base.meta = `Associato al nodo twin "${v.twinNode}" · ${base.meta || ''}`;
  return base;
}

// CMP-33 Log eventi modello (AUDIT_STD_01)
function cmp33() {
  // synthetic + live: any audit entry that mentions SCR-04 or VS- gets surfaced
  const recent = (S.auditLog || []).slice(-50).reverse()
    .filter(e => /SCR-04|VS-\d|modello/i.test(e.msg || ''))
    .slice(0, 5)
    .map(e => [e.ts, e.msg.slice(0, 60), e.role || 'SYS', { b: ['ok', 'OK'] }]);
  return {
    cols: ['Timestamp', 'Evento', 'Utente', 'Esito'],
    rows: [
      ...recent,
      ['10:22:08', 'VS-01: retraining completato (epoche 42)', 'diag.bianchi (OD)', { b: ['ok', 'OK'] }],
      ['09:47:11', 'VS-04: deattivato per drift > 3 %', 'admin.verdi (AS)', { b: ['warning', 'DRIFT'] }],
      ['09:15:44', 'VS-02: aggiornamento modello GBM v1.6 → v1.7', 'diag.bianchi (OD)', { b: ['ok', 'OK'] }],
      ['Ieri 18:01', 'VS-03: calibrazione su dataset Q2', 'diag.bianchi (OD)', { b: ['ok', 'OK'] }],
    ],
  };
}

export function scr04Signature() {
  return `${vs04.selected}|${TelemetryBuffer.get().length}`;
}

// ─── SCR-05 — Rete sensori & IoT ────────────────────────────────────────

const IOT_NODES = [
  { id: 'EDGE-01', label: 'Edge Gateway 01', kind: 'gateway',  status: 'ok',       latencyMs: 24, packetLoss: 0.1, area: 'Primary' },
  { id: 'EDGE-02', label: 'Edge Gateway 02', kind: 'gateway',  status: 'ok',       latencyMs: 31, packetLoss: 0.2, area: 'Secondary' },
  { id: 'EDGE-03', label: 'Edge Gateway 03', kind: 'gateway',  status: 'degraded', latencyMs: 142, packetLoss: 2.1, area: 'Grid' },
  { id: 'NODE-A1', label: 'Field Node A1',   kind: 'sensor',   status: 'ok',       latencyMs: 18, packetLoss: 0.0, area: 'Primary' },
  { id: 'NODE-A2', label: 'Field Node A2',   kind: 'sensor',   status: 'ok',       latencyMs: 22, packetLoss: 0.1, area: 'Primary' },
  { id: 'NODE-B1', label: 'Field Node B1',   kind: 'sensor',   status: 'warning',  latencyMs: 58, packetLoss: 0.8, area: 'Secondary' },
  { id: 'NODE-C1', label: 'Field Node C1',   kind: 'sensor',   status: 'critical', latencyMs: 0,  packetLoss: 100, area: 'Grid' },
];
const scr05 = { selectedNode: 'EDGE-03', areaFilter: 'Tutti', kindFilter: 'Tutti', search: '' };

const filteredNodes = () => IOT_NODES.filter(n => {
  if (scr05.areaFilter !== 'Tutti' && n.area !== scr05.areaFilter) return false;
  if (scr05.kindFilter !== 'Tutti' && n.kind !== scr05.kindFilter) return false;
  if (scr05.search && !`${n.id} ${n.label}`.toLowerCase().includes(scr05.search.toLowerCase())) return false;
  return true;
});

// CMP-36 Dettaglio nodo rete (STATE_STD_01)
function cmp36() {
  const n = IOT_NODES.find(x => x.id === scr05.selectedNode) || IOT_NODES[0];
  return { rows: [
    [n.status, 'ID nodo', n.id],
    ['ok', 'Etichetta', n.label],
    ['ok', 'Tipo', n.kind === 'gateway' ? 'Gateway' : 'Field node'],
    ['ok', 'Area', n.area],
    [n.latencyMs > 100 ? 'critical' : n.latencyMs > 50 ? 'warning' : 'ok', 'Latenza', `${n.latencyMs} ms`],
    [n.packetLoss > 1 ? 'warning' : 'ok', 'Packet loss', `${n.packetLoss.toFixed(2)} %`],
    ['ok', 'Ultimo heartbeat', n.status === 'critical' ? '12 min fa' : '< 1 s'],
  ] };
}

// CMP-37 Performance comunicazione (TREND_STD_01) — latency over time
function cmp37() {
  // Synthesize a latency series biased by the selected node's current latency
  const n = IOT_NODES.find(x => x.id === scr05.selectedNode) || IOT_NODES[0];
  const base = Math.max(n.latencyMs, 5);
  const vals = Array.from({ length: 40 }, (_, i) => base + 6 * Math.sin(i / 3) + (Math.random() - 0.5) * 4);
  return {
    layers: [{ kind: 'real', vals }],
    threshold: 100,
    meta: `${n.id} · latenza ms (soglia QoS 100 ms) · packet loss ${n.packetLoss.toFixed(2)} %`,
  };
}

// CMP-38 Stato sicurezza rete (STATE_STD_01, AS only)
function cmp38() {
  return { rows: [
    ['ok',       'TLS / mTLS su tutti i nodi', 'Attivo'],
    ['ok',       'Certificati validi',         '7 / 7'],
    ['warning',  'Certificati in scadenza',    '1 (EDGE-03 — 18 giorni)'],
    ['ok',       'Firmware aggiornato',        '6 / 7 nodi'],
    ['degraded', 'Anomalie traffico 24h',      '2 (EDGE-03 spike a T-09:14)'],
    ['ok',       'Score conformità',           '94 / 100'],
  ] };
}

// CMP-39 Filtro / ricerca asset (FORM_STD_01)
function cmp39() {
  return {
    fields: [
      { label: 'Area', value: scr05.areaFilter, options: ['Tutti', 'Primary', 'Secondary', 'Grid'] },
      { label: 'Tipo', value: scr05.kindFilter, options: ['Tutti', 'gateway', 'sensor'] },
      { label: 'Cerca (ID / etichetta)', value: scr05.search },
      { label: 'Nodo selezionato', value: scr05.selectedNode, options: IOT_NODES.map(n => n.id) },
    ],
    submit: {
      label: 'Applica filtri',
      onSubmit: v => {
        scr05.areaFilter = v['Area'];
        scr05.kindFilter = v['Tipo'];
        scr05.search = (v['Cerca (ID / etichetta)'] || '').trim();
        scr05.selectedNode = v['Nodo selezionato'];
        const visible = filteredNodes().length;
        dispatch(A.LOG, { msg: `SCR-05: filtro applicato — ${visible} nodi visibili (sel. ${scr05.selectedNode})` });
        scheduleRender();
      },
    },
  };
}

export function scr05Signature() {
  return `${scr05.selectedNode}|${scr05.areaFilter}|${scr05.kindFilter}|${scr05.search}`;
}

// ─── SCR-01 — Login ─────────────────────────────────────────────────────
// CMP-01 Login form, CMP-02 system status, CMP-03 MFA. RBAC-light: the
// existing SCR-01 login cards in the legacy panel handle real role selection;
// here we render the spec representation faithfully.
function cmp01() {
  return {
    fields: [
      { label: 'Username', value: '' },
      { label: 'Password', value: '', type: 'password' },
      { label: 'Ruolo (demo)', value: 'OL', options: ['OL', 'OD', 'AS'] },
    ],
    submit: {
      label: 'Accedi',
      onSubmit: vals => {
        const role = vals['Ruolo (demo)'];
        if (!vals['Username']?.trim()) { dispatch(A.LOG, { msg: 'SCR-01: login negato — username mancante' }); return; }
        dispatch(A.SET_ROLE, { role });
        dispatch(A.LOG, { msg: `SCR-01: login spec-view come ${role}` });
      },
    },
  };
}

function cmp02() {
  const unacked = (S.alarms || []).filter(a => !a.acked).length;
  return { rows: [
    [S.scramActive ? 'critical' : 'ok', 'Stato impianto', S.scramActive ? 'SCRAM ATTIVO' : 'Operativo · v4.3.0'],
    ['ok', 'Pipeline acquisizione', 'Attiva · 16/16 sensori'],
    ['ok', 'Servizio autenticazione', 'Disponibile · MFA richiesto'],
    [unacked ? 'warning' : 'ok', 'Allarmi non gestiti', String(unacked)],
    ['ok', 'Ultimo backup', '02:14 UTC oggi'],
  ] };
}

function cmp03() {
  return {
    fields: [
      { label: 'Codice OTP (6 cifre)', value: '' },
      { label: 'Metodo MFA', value: 'TOTP', options: ['TOTP', 'SMS', 'Hardware key'] },
    ],
    validate: v => {
      const errs = {};
      const otp = (v['Codice OTP (6 cifre)'] || '').trim();
      if (otp && !/^\d{6}$/.test(otp)) errs['Codice OTP (6 cifre)'] = 'Codice numerico a 6 cifre';
      return errs;
    },
    submit: {
      label: 'Verifica OTP',
      onSubmit: v => dispatch(A.LOG, { msg: `SCR-01: MFA verifica via ${v['Metodo MFA']} (demo)` }),
    },
  };
}

// ─── SCR-03 — Acquisizione & configurazione sensori ────────────────────
const scr03 = { selectedKey: 'CORE_TEMP' };
// CMP-18 Lista sensori registrati: tabella selezionabile (riga → dettaglio)
function cmp18() {
  const keys = Object.keys(S.sensors);
  return {
    cols: ['Tag', 'Sensore', 'Sistema', 'Valore', 'Stato'],
    rows: keys.map(k => {
      const s = S.sensors[k];
      const st = DAO.status(s);
      const label = st === 'alarm' ? 'ALLARME' : st === 'warning' ? 'WARNING' : st === 'low' ? 'BASSO' : 'NOMINALE';
      return [s.tag, s.label, s.sys, `${DAO.fmt(s)} ${s.u}`, { b: [statusKind(st), label] }];
    }),
    onRowClick: i => selectRow('sensor', keys[i]),
    selectedIndex: keys.indexOf(getSelection('sensor')),
  };
}
function cmp19() {
  return { rows: [
    ['ok', 'Pipeline ingestion', 'Attiva · 800 ms/tick'],
    ['ok', 'Sensori online', `${Object.keys(DAO._s).length} / 16`],
    ['ok', 'Buffer storico', `${TelemetryBuffer.get().length} / 750 campioni`],
    ['ok', 'Latenza media', '740 ms'],
    ['ok', 'Errori 24h', '0'],
  ] };
}
function cmp20() {
  const s = DAO._s[scr03.selectedKey] || DAO._s.CORE_TEMP;
  return {
    fields: [
      { label: 'Sensore', value: scr03.selectedKey, options: Object.keys(DAO._s) },
      { label: 'Tag', value: s.tag },
      { label: 'Descrizione', value: s.label },
      { label: 'Sistema', value: s.sys },
      { label: 'Unità', value: s.u },
    ],
    submit: {
      label: 'Aggiorna scheda',
      onSubmit: v => { scr03.selectedKey = v['Sensore']; dispatch(A.LOG, { msg: `SCR-03: scheda sensore ${scr03.selectedKey}` }); scheduleRender(); },
    },
  };
}
function cmp21() {
  const s = DAO._s[scr03.selectedKey] || DAO._s.CORE_TEMP;
  return {
    fields: [
      { label: 'Frequenza (Hz)', value: 1.25, type: 'number' },
      { label: 'Soglia warning', value: (s.trip * 0.85).toFixed(1), type: 'number' },
      { label: 'Soglia trip', value: s.trip, type: 'number' },
      { label: 'Range minimo', value: s.low, type: 'number' },
      { label: 'Logica', value: 'Superamento persistente', options: ['Superamento istantaneo', 'Superamento persistente', 'Media mobile'] },
    ],
    validate: v => {
      const errs = {};
      const trip = parseFloat(v['Soglia trip']);
      const low = parseFloat(v['Range minimo']);
      if (!isNaN(trip) && !isNaN(low) && low >= trip) errs['Range minimo'] = 'Deve essere < soglia trip';
      return errs;
    },
    submit: { label: 'Salva configurazione', onSubmit: () => dispatch(A.LOG, { msg: `SCR-03: configurazione acquisizione ${scr03.selectedKey} aggiornata (demo)` }) },
  };
}
function cmp22() {
  const reals = bufferedSeries(scr03.selectedKey, 5 * 60_000).map(p => p.v);
  if (reals.length < 2) return { layers: [{ kind: 'stale', vals: [0, 0] }], meta: 'Buffer in riempimento' };
  const s = DAO._s[scr03.selectedKey];
  return {
    layers: [{ kind: 'real', vals: reals }],
    threshold: s?.trip,
    meta: `${scr03.selectedKey} · grezzo · ${reals.length} campioni · trip ${s?.trip} ${s?.u}`,
  };
}
function cmp23() {
  const s = DAO._s[scr03.selectedKey] || DAO._s.CORE_TEMP;
  const series = bufferedSeries(scr03.selectedKey, 5 * 60_000).map(p => p.v);
  const st = stats(series);
  return { kpis: [
    { label: 'Calibrazione', value: 'OK', badge: ['ok', 'VALIDA'] },
    { label: 'Ultima calibrazione', value: '12 giorni fa' },
    { label: 'Deviazione std', value: st ? st.sigma.toFixed(3) : '—', unit: s.u },
    { label: 'Drift stimato', value: '0.08', unit: `${s.u}/giorno`, badge: ['ok', 'IN TARGET'] },
  ] };
}
function cmp25() {
  const key = getSelection('sensor') || scr03.selectedKey;
  return {
    cols: ['Timestamp', 'Sensore', 'Evento', 'Esito'],
    rows: [
      ['10:22:01', key, 'Calibrazione completata', { b: ['ok', 'OK'] }],
      ['09:58:14', key, 'Configurazione soglia aggiornata', { b: ['ok', 'OK'] }],
      ['09:12:08', key, 'Connessione ripristinata', { b: ['ok', 'RIPRISTINATA'] }],
      ['Ieri 17:44', key, 'Anomalia campionamento (recovered)', { b: ['warning', 'WARN'] }],
    ],
  };
}
function cmp26() {
  return { rows: [
    ['ok', 'TLS comunicazione', 'mTLS attivo'],
    ['ok', 'Firmware', 'v3.4.2 (aggiornato)'],
    ['ok', 'Certificato dispositivo', 'Valido fino al 2027-03-12'],
    ['ok', 'Tamper detection', 'Nessun evento'],
  ] };
}
export function scr03Signature() { return `${scr03.selectedKey}|${TelemetryBuffer.get().length}`; }

// ─── SCR-06 — Visualizzazione multisensore ──────────────────────────────
const scr06 = { keys: ['CORE_TEMP', 'COOLANT_OUT', 'PRIM_PRESS'] };
function cmp40() {
  return {
    fields: [
      { label: 'Variabile 1', value: scr06.keys[0], options: Object.keys(DAO._s) },
      { label: 'Variabile 2', value: scr06.keys[1], options: Object.keys(DAO._s) },
      { label: 'Variabile 3', value: scr06.keys[2], options: Object.keys(DAO._s) },
    ],
    submit: {
      label: 'Applica selezione',
      onSubmit: v => {
        scr06.keys = [v['Variabile 1'], v['Variabile 2'], v['Variabile 3']];
        dispatch(A.LOG, { msg: `SCR-06: variabili ${scr06.keys.join(', ')}` });
        scheduleRender();
      },
    },
  };
}
function normalize(vals) {
  if (!vals.length) return vals;
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  return vals.map(v => ((v - min) / range) * 100);
}
function cmp41() {
  const layers = [];
  const kinds = ['real', 'estimated', 'predicted'];
  for (let i = 0; i < scr06.keys.length; i++) {
    const reals = bufferedSeries(scr06.keys[i], 5 * 60_000).map(p => p.v);
    if (reals.length < 2) continue;
    layers.push({ kind: kinds[i], vals: normalize(reals) });
  }
  if (!layers.length) return { layers: [{ kind: 'stale', vals: [0, 0] }], meta: 'Buffer in riempimento' };
  return { layers, meta: `Normalizzato 0-100 · ${scr06.keys.join(' / ')}` };
}
function cmp44() {
  // Already overridden via OVERRIDES in spec-views.js to synoptic. Skip provider.
  return null;
}
function cmp45() {
  const exportCsv = () => {
    const rows = ['ts,iso,' + scr06.keys.join(',')];
    const buf = TelemetryBuffer.get();
    for (const e of buf) {
      const cells = scr06.keys.map(k => e.sensors[k]?.v ?? '');
      rows.push(`${e.ts},${new Date(e.ts).toISOString()},${cells.join(',')}`);
    }
    dlFile(rows.join('\n'), `scr06-multi-${Date.now()}.csv`, 'text/csv');
    dispatch(A.LOG, { msg: `SCR-06: export comparativo CSV (${buf.length} righe)` });
  };
  return {
    status: ['ok', `${TelemetryBuffer.get().length} campioni pronti`, `${scr06.keys.length} variabili`],
    actions: [{ label: 'Esporta CSV multisensore', primary: true, onClick: exportCsv }],
  };
}
export function scr06Signature() { return scr06.keys.join('|') + '|' + Math.floor(TelemetryBuffer.get().length / 5); }

// ─── SCR-08 — Allarmi cybersecurity (AS only) ──────────────────────────
// CMP-54 threat list (selectable) → CMP-55 "Dettaglio minaccia" follows the row.
function cmp54() {
  return {
    cols: ['Sev.', 'ID', 'Asset', 'Tipo', 'Messaggio'],
    rows: SEC_THREATS.map(t => [{ b: [t.sev, t.sevLabel] }, t.id, t.asset, t.tipo, t.msg]),
    onRowClick: i => selectRow('threat', SEC_THREATS[i] && SEC_THREATS[i].id),
    selectedIndex: SEC_THREATS.findIndex(t => t.id === getSelection('threat')),
  };
}
function cmp55() {
  const sel = getSelection('threat');
  const t = SEC_THREATS.find(x => x.id === sel) || SEC_THREATS[0];
  return {
    cols: ['Campo', 'Valore'],
    rows: [
      ['ID minaccia', t.id],
      ['Severità', t.sevLabel],
      ['Asset coinvolto', t.asset],
      ['Tipo', t.tipo],
      ['Vettore', t.vector],
      ['Sorgente', t.src],
      ['Descrizione', t.msg],
    ],
  };
}
function cmp56() {
  return {
    status: ['warning', 'CYB-0021 in attesa di mitigazione', 'Operatore: AS'],
    actions: [
      { label: 'Blocca IP', primary: true, onClick: () => dispatch(A.LOG, { msg: 'CYB-0021: IP 203.0.113.45 bloccato (demo)' }) },
      { label: 'Acknowledge', onClick: () => dispatch(A.LOG, { msg: 'CYB-0021: ack da AS' }) },
      { label: 'Escala a SOC', danger: true, onClick: () => dispatch(A.LOG, { msg: 'CYB-0021: escalation a SOC esterno' }) },
    ],
  };
}
function cmp57() {
  return { rows: [
    ['warning',  'Vulnerabilità critiche aperte', '1 (CVE-2026-04812)'],
    ['ok',       'Vulnerabilità chiuse 30g',     '4'],
    ['ok',       'Patch pendenti',                '2 (pianificate)'],
    ['warning',  'Certificati in scadenza < 30g', '1 (EDGE-03)'],
    ['ok',       'Compliance ISA-101 §6.5',       'Conforme'],
  ] };
}
function cmp58() {
  return {
    cols: ['KPI', 'Valore', 'Target', 'Stato'],
    rows: [
      ['MTTR sicurezza',      '8 min',  '≤ 15 min', { b: ['ok', 'OK'] }],
      ['Tasso falsi positivi','2.1 %', '≤ 5 %',   { b: ['ok', 'OK'] }],
      ['Copertura monitoring','98 %',  '≥ 95 %',   { b: ['ok', 'OK'] }],
      ['Alert ack < 5 min',   '94 %',  '≥ 90 %',   { b: ['ok', 'OK'] }],
      ['Login falliti 24h',   '54',    '≤ 20',     { b: ['critical', 'OLTRE'] }],
    ],
  };
}
function cmp59() {
  return { rows: [
    ['critical', '203.0.113.45', '54 tentativi · 5 min · API /auth/login'],
    ['warning',  '198.51.100.12', '6 tentativi · 1 ora · API /api/admin'],
    ['ok',       '10.0.4.18', 'Login OK · admin.verdi (AS) · 09:58'],
    ['ok',       '10.0.4.22', 'Login OK · diag.bianchi (OD) · 09:42'],
  ] };
}

// ─── SCR-10 — Manutenzione predittiva ──────────────────────────────────
const scr10 = { selectedAsset: 'PUMP-A' };
function cmp66() {
  return {
    cols: ['Asset', 'Tipo', 'Rischio', 'RUL (h)', 'P(failure 30g)', 'Stato'],
    rows: [
      ['PUMP-A', 'Pompa primaria', { b: ['warning', 'MEDIO'] }, '1240', '4 %', { b: ['warning', 'MONITOR'] }],
      ['EDGE-03', 'Edge gateway', { b: ['critical', 'ALTO'] }, '320', '18 %', { b: ['critical', 'INTERVENTO'] }],
      ['TURB-01', 'Turbina', { b: ['ok', 'BASSO'] }, '4800', '0.8 %', { b: ['ok', 'OK'] }],
      ['SG-01', 'Scambiatore', { b: ['ok', 'BASSO'] }, '3200', '1.2 %', { b: ['ok', 'OK'] }],
      ['VS-04', 'Sensore virtuale', { b: ['warning', 'MEDIO'] }, '—', 'drift 3 %', { b: ['warning', 'DRIFT'] }],
    ],
  };
}
function cmp67() {
  return { kpis: [
    { label: 'Asset', value: scr10.selectedAsset, badge: ['ok', 'SELEZIONATO'] },
    { label: 'SHI', value: '0.81', badge: ['warning', 'IN CALO'] },
    { label: 'RUL (h)', value: '1 240', badge: ['predicted', 'PREDETTO'] },
    { label: 'P(failure 30g)', value: '4', unit: '%', badge: ['estimated', 'STIMATO'] },
    { label: 'Modalità guasto', value: 'Erosione girante', badge: ['warning', 'PRINCIPALE'] },
    { label: 'Confidence modello', value: '0.89', badge: ['estimated', 'AI'] },
  ] };
}
function cmp68() {
  return {
    cols: ['Data', 'Asset', 'Tipo intervento', 'Esito', 'Tecnico'],
    rows: [
      ['2026-05-14', 'PUMP-A', 'Sostituzione cuscinetti', 'OK', 'team.A'],
      ['2026-04-22', 'EDGE-03', 'Aggiornamento firmware', 'OK', 'admin.verdi'],
      ['2026-03-08', 'TURB-01', 'Lubrificazione', 'OK', 'team.B'],
      ['2026-01-19', 'PUMP-A', 'Bilanciamento girante', 'OK', 'team.A'],
    ],
  };
}
function cmp69() {
  return {
    fields: [
      { label: 'Asset', value: scr10.selectedAsset, options: ['PUMP-A', 'EDGE-03', 'TURB-01', 'SG-01', 'VS-04'] },
      { label: 'Tipo intervento', value: 'Manutenzione preventiva', options: ['Manutenzione preventiva', 'Sostituzione', 'Calibrazione', 'Ispezione'] },
      { label: 'Data pianificata', value: '2026-07-15', type: 'date' },
      { label: 'Tecnico assegnato', value: 'team.A', options: ['team.A', 'team.B', 'team.C', 'extern'] },
      { label: 'Note', value: '' },
    ],
    submit: {
      label: 'Pianifica intervento',
      onSubmit: v => {
        scr10.selectedAsset = v['Asset'];
        dispatch(A.LOG, { msg: `SCR-10: intervento ${v['Tipo intervento']} su ${v['Asset']} per ${v['Data pianificata']}` });
        fireNotif('NP-MAINT-REMINDER-01', {
          signature: `${v['Asset']}-${v['Data pianificata']}`,
          title: `Intervento pianificato: ${v['Asset']}`,
          message: `${v['Tipo intervento']} il ${v['Data pianificata']} (${v['Tecnico assegnato']})`,
        });
        scheduleRender();
      },
    },
  };
}
function cmp70() {
  return { kpis: [
    { label: 'MTBF',  value: '14 200', unit: 'h', badge: ['ok', 'TARGET'] },
    { label: 'MTTR',  value: '3.2', unit: 'h', badge: ['ok', 'TARGET'] },
    { label: 'Availability 90g', value: '99.6', unit: '%' },
    { label: 'Interventi pianificati 30g', value: '7' },
  ] };
}
function cmp71() {
  return { kpis: [
    { label: 'Precision', value: '0.92', badge: ['ok', 'OK'] },
    { label: 'Recall',    value: '0.88', badge: ['ok', 'OK'] },
    { label: 'F1 score',  value: '0.90' },
    { label: 'Falsi positivi 30g', value: '3' },
    { label: 'Falsi negativi 30g', value: '1', badge: ['warning', 'DA INDAGARE'] },
  ] };
}
function cmp72() {
  return {
    cols: ['Timestamp', 'Asset', 'Sessione', 'Operatore', 'Esito'],
    rows: [
      ['10:24:11', 'PUMP-A', 'Sessione diagnostica vibrazione', 'diag.bianchi (OD)', { b: ['ok', 'CHIUSA'] }],
      ['09:42:08', 'EDGE-03', 'Audit firmware', 'admin.verdi (AS)', { b: ['ok', 'CHIUSA'] }],
      ['Ieri 18:01', 'VS-04', 'Indagine drift modello', 'diag.bianchi (OD)', { b: ['warning', 'APERTA'] }],
    ],
  };
}
export function scr10Signature() { return scr10.selectedAsset; }

// ─── SCR-13 — Training ─────────────────────────────────────────────────
const TRAINING_CATALOG = [
  ['🎓', 'Normal Operations', 'EASY · 5 min'],
  ['🌡', 'Rising Temperature', 'MEDIUM · 10 min'],
  ['💧', 'LOCA Drill', 'HARD · 15 min'],
  ['⚡', 'Station Blackout', 'HARD · 12 min'],
  ['🛰', 'Sensor Fault Triage', 'MEDIUM · 8 min'],
  ['🔐', 'Cyber Incident', 'HARD · 10 min'],
];
function cmp83() { return { items: TRAINING_CATALOG }; }
function cmp84() {
  return { items: [
    ['📘', 'Operatore Locale base', 'Completato 100%'],
    ['📗', 'Diagnostica avanzata', 'In corso 64%'],
    ['📕', 'Cybersecurity essentials', 'Da iniziare'],
  ] };
}
function cmp85() {
  return {
    fields: [
      { label: 'Titolo simulazione', value: '' },
      { label: 'Difficoltà', value: 'MEDIUM', options: ['EASY', 'MEDIUM', 'HARD'] },
      { label: 'Durata stimata (min)', value: 10, type: 'number' },
      { label: 'Ruolo destinatario', value: 'OD', options: ['OL', 'OD', 'AS'] },
      { label: 'Tipo asset training', value: 'SCORM', options: ['SCORM', 'Video', 'VR'] },
    ],
    validate: v => {
      const errs = {};
      if (!String(v['Titolo simulazione'] || '').trim()) errs['Titolo simulazione'] = 'Titolo obbligatorio';
      return errs;
    },
    submit: { label: 'Crea simulazione', onSubmit: v => dispatch(A.LOG, { msg: `SCR-13: nuova simulazione "${v['Titolo simulazione']}" (${v['Difficoltà']}) per ${v['Ruolo destinatario']}` }) },
  };
}
function cmp86() {
  return { kpis: [
    { label: 'Score medio', value: '87', unit: '%', badge: ['ok', 'OK'] },
    { label: 'Scenari completati', value: '12' },
    { label: 'Tempo medio', value: '8.4', unit: 'min' },
    { label: 'Errori critici', value: '0', badge: ['ok', 'PERFETTO'] },
  ] };
}
function cmp87() {
  const csv = () => {
    const lines = ['user,role,scenario,score,duration_min,date'];
    lines.push('op.rossi,OL,Rising Temperature,92,9.2,2026-06-15');
    lines.push('diag.bianchi,OD,LOCA Drill,88,14.6,2026-06-14');
    lines.push('admin.verdi,AS,Cyber Incident,95,9.8,2026-06-12');
    dlFile(lines.join('\n'), `scr13-training-results-${Date.now()}.csv`, 'text/csv');
    dispatch(A.LOG, { msg: 'SCR-13: export risultati training (CSV)' });
  };
  return {
    status: ['ok', '3 utenti · 12 sessioni totali', 'Periodo: ultimi 30 giorni'],
    actions: [{ label: 'Esporta risultati CSV', primary: true, onClick: csv }],
  };
}

// ─── SCR-14 — Configurazione & amministrazione (AS only) ───────────────
function cmp88() {
  return {
    cols: ['Username', 'Nome', 'Ruolo', 'Ultimo accesso', 'Stato'],
    rows: [
      ['op.rossi',     'Marco Rossi',     'OL', '10:24 oggi', { b: ['ok', 'ATTIVO'] }],
      ['diag.bianchi', 'Anna Bianchi',    'OD', '09:42 oggi', { b: ['ok', 'ATTIVO'] }],
      ['admin.verdi',  'Luca Verdi',      'AS', '08:51 oggi', { b: ['ok', 'ATTIVO'] }],
      ['op.neri',      'Carla Neri',      'OL', 'Ieri 17:33', { b: ['stale', 'OFFLINE'] }],
      ['ext.contractor','Service Account','OD', '— (3g)',     { b: ['warning', 'INATTIVO'] }],
    ],
  };
}
function cmp89() {
  return {
    cols: ['Ruolo', 'Schermate accessibili', 'Componenti CRUD', 'Utenti assegnati'],
    rows: [
      ['OL', '11 / 14', '12', '2'],
      ['OD', '13 / 14', '34', '2'],
      ['AS', '14 / 14', '62', '1'],
    ],
  };
}
function cmp90() {
  return {
    fields: [
      { label: 'Session timeout (min)', value: 15, type: 'number' },
      { label: 'Lockout dopo N tentativi', value: 5, type: 'number' },
      { label: 'MFA obbligatoria', value: 'true', options: ['true', 'false'] },
      { label: 'Audit retention (giorni)', value: 365, type: 'number' },
      { label: 'Lingua interfaccia', value: 'it', options: ['it', 'en'] },
    ],
    submit: { label: 'Salva configurazione globale', onSubmit: () => {
      dispatch(A.LOG, { msg: 'SCR-14: configurazione sistema aggiornata (demo)' });
      fireNotif('NP-USER-ADMIN-01', { signature: `cfg-${Date.now()}`, title: 'Configurazione globale aggiornata', message: 'Parametri di sistema salvati (demo).' });
    } },
  };
}
function cmp91() {
  return { rows: [
    ['ok',       'mfe-telemetry',  'Caricato · v4.3.0'],
    ['ok',       'mfe-3d-twin',    'Caricato · v4.3.0'],
    ['ok',       'mfe-config',     'Caricato · v4.3.0'],
    ['ok',       'shell',          'Attivo · v4.3.0'],
    ['ok',       'shared package', 'v4.3.0'],
    ['estimated', 'Module Federation', 'In-process (monolith mode)'],
  ] };
}
function cmp92() {
  return {
    cols: ['Timestamp', 'Utente', 'Azione', 'Esito'],
    rows: (S.auditLog || []).slice(-10).reverse().map(e => [
      e.ts || '—', e.role || 'SYS', (e.msg || '').slice(0, 70),
      /fail|denied|error/i.test(e.msg) ? { b: ['critical', 'FAIL'] } : { b: ['ok', 'OK'] },
    ]),
  };
}
function cmp93() {
  return {
    status: ['ok', 'Ultimo backup: 02:14 UTC oggi', 'Prossimo: 02:14 UTC domani'],
    actions: [
      { label: 'Esegui backup ora', primary: true, onClick: () => {
        dispatch(A.LOG, { msg: 'SCR-14: backup manuale avviato (demo)' });
        fireNotif('NP-BACKUP-01', { signature: `manual-${Date.now()}`, title: 'Backup manuale completato', message: 'Snapshot salvato su archivio sicuro (demo).' });
      } },
      { label: 'Ripristina snapshot', onClick: () => {
        dispatch(A.LOG, { msg: 'SCR-14: avvio procedura ripristino (demo)' });
        fireNotif('NP-BACKUP-01', { signature: `restore-${Date.now()}`, title: 'Ripristino avviato', message: 'Ripristino da snapshot in corso (demo).' });
      } },
      { label: 'Esporta archivio', onClick: () => dlFile('demo backup archive placeholder', `core-sentinel-backup-${Date.now()}.txt`, 'text/plain') },
    ],
  };
}

// ─── SCR-12 — Ispezione ottica remota ──────────────────────────────────
function cmp81() {
  return { kpis: [
    { label: 'Stream', value: 'LIVE', badge: ['ok', 'STABILE'] },
    { label: 'Risoluzione', value: '1080p' },
    { label: 'Bitrate', value: '4.2', unit: 'Mbps' },
    { label: 'Latenza', value: '380', unit: 'ms', badge: ['ok', 'OK'] },
    { label: 'Drop frames 5min', value: '0', badge: ['ok', 'OK'] },
    { label: 'Uptime stream 24h', value: '99.8', unit: '%' },
  ] };
}

// ─── dispatcher ─────────────────────────────────────────────────────────

const PROVIDERS = {
  // SCR-02
  'CMP-04': cmp04,
  'CMP-05': () => trendData(S.histTemp),
  'CMP-06': alarmData,
  'CMP-07': cmp07,
  'CMP-08': cmp08,
  'CMP-09': cmp09,
  'CMP-10': cmp10,
  'CMP-11': cmp11,
  'CMP-12': cmp12,
  'CMP-13': cmp13,
  'CMP-14': cmp14,
  'CMP-15': cmp15,
  'CMP-16': cmp16,
  // SCR-07
  'CMP-46': alarmData,
  'CMP-47': cmp47,
  'CMP-48': cmp48,
  'CMP-49': cmp49,
  'CMP-50': cmp50,
  'CMP-51': cmp51,
  'CMP-53': cmp53,
  // SCR-01
  'CMP-01': cmp01,
  'CMP-02': cmp02,
  'CMP-03': cmp03,
  // SCR-03
  'CMP-18': cmp18,
  'CMP-19': cmp19,
  'CMP-20': cmp20,
  'CMP-21': cmp21,
  'CMP-22': cmp22,
  'CMP-23': cmp23,
  'CMP-25': cmp25,
  'CMP-26': cmp26,
  // SCR-06
  'CMP-40': cmp40,
  'CMP-41': cmp41,
  'CMP-45': cmp45,
  // SCR-08
  'CMP-54': cmp54,
  'CMP-55': cmp55,
  'CMP-56': cmp56,
  'CMP-57': cmp57,
  'CMP-58': cmp58,
  'CMP-59': cmp59,
  // SCR-10
  'CMP-66': cmp66,
  'CMP-67': cmp67,
  'CMP-68': cmp68,
  'CMP-69': cmp69,
  'CMP-70': cmp70,
  'CMP-71': cmp71,
  'CMP-72': cmp72,
  // SCR-12
  'CMP-81': cmp81,
  // SCR-13
  'CMP-83': cmp83,
  'CMP-84': cmp84,
  'CMP-85': cmp85,
  'CMP-86': cmp86,
  'CMP-87': cmp87,
  // SCR-14
  'CMP-88': cmp88,
  'CMP-89': cmp89,
  'CMP-90': cmp90,
  'CMP-91': cmp91,
  'CMP-92': cmp92,
  'CMP-93': cmp93,
  // SCR-05
  'CMP-36': cmp36,
  'CMP-37': cmp37,
  'CMP-38': cmp38,
  'CMP-39': cmp39,
  // SCR-04
  'CMP-27': cmp27,
  'CMP-28': cmp28,
  'CMP-29': cmp29,
  'CMP-30': cmp30,
  'CMP-31': cmp31,
  'CMP-32': cmp32,
  'CMP-33': cmp33,
  // SCR-09
  'CMP-60': cmp60,
  'CMP-61': cmp61,
  'CMP-62': cmp62,
  'CMP-63': cmp63,
  'CMP-64': cmp64,
  'CMP-65': cmp65,
  // SCR-11
  'CMP-74': cmp74,
  'CMP-75': cmp75,
  'CMP-76': cmp76,
};

export function dataForComponent(cmp) {
  const fn = PROVIDERS[cmp.id];
  return fn ? fn() : null;
}

// signature of the alarm state — when it changes, alarm screens re-render
export function alarmSignature() {
  return S.alarms.length + ':' + S.alarms.filter(a => !a.acked).length;
}
