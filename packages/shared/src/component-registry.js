'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT REGISTRY
//
// NOTE ON IDs (compliance / traceability):
//   `id` + `screen` below are this code's OWN demo identifiers (the nuclear LFR
//   demo). They are NOT the official InRebus DAO spec IDs — the numbers collide
//   numerically but mean different things (code SCR-01 = Primary Circuit, but
//   spec SCR-01 = Login). To make the C1 traceability matrix correct, each entry
//   carries non-breaking cross-reference fields pointing at the official spec
//   (14 screens SCR-01..14, 93 components CMP-01..93 — see ROADMAP.md §5 / _ref_dump.txt):
//
//     specScreenId : official screen id, or null if no spec equivalent
//     specCmpId    : official component id, or null if no spec equivalent
//     specNote     : (optional) rationale, esp. for null / many-to-one mappings
//
//   These are metadata only — no runtime code reads them yet. The full renumber
//   to the official scheme is deferred to Foundation task F6 (ROADMAP.md).
//   Mapping confidence varies; low-confidence rows are flagged in specNote.
// ─────────────────────────────────────────────────────────────────────────────

const COMPONENT_REGISTRY = [

  // SCR-01: Primary Circuit
  {
    id: 'CMP-01',
    label: 'Digital Twin 3D Viewport',
    specScreenId: 'SCR-11',
    specCmpId: 'CMP-73',
    screen: 'SCR-01',
    tipologia_ui: 'ThreeJSTwin',
    standard_viz: 'TWIN_STD_01',
    fonte_dati: 'CORE_TEMP,COOLANT_IN,COOLANT_OUT,PRIM_PRESS,PUMP_A,ROD_POS',
    frequenza: '800ms',
    access: { OL: 'R', OD: 'R', AS: 'R' },
    fallback: { degraded: 'STATIC_MESH', offline: 'GREY_MESH' },
    dom_id: 'three-container',
    panel: 'panel-primary',
  },
  {
    id: 'CMP-02',
    label: 'Core Thermal Trend Chart',
    specScreenId: 'SCR-02',
    specCmpId: 'CMP-09',
    specNote: 'Dashboard variable chart; shares spec CMP-09 with CMP-03 (many-to-one).',
    screen: 'SCR-01',
    tipologia_ui: 'TrendChart',
    standard_viz: 'TREND_STD_01',
    fonte_dati: 'CORE_TEMP',
    frequenza: '800ms',
    access: { OL: 'R', OD: 'R', AS: 'R' },
    fallback: { degraded: 'DEGRADED_BADGE', offline: 'LAST_KNOWN' },
    dom_id: 'svg-temp',
    panel: 'panel-primary',
  },
  {
    id: 'CMP-03',
    label: 'Primary Pressure Trend Chart',
    specScreenId: 'SCR-02',
    specCmpId: 'CMP-09',
    specNote: 'Dashboard variable chart; shares spec CMP-09 with CMP-02 (many-to-one).',
    screen: 'SCR-01',
    tipologia_ui: 'TrendChart',
    standard_viz: 'TREND_STD_01',
    fonte_dati: 'PRIM_PRESS',
    frequenza: '800ms',
    access: { OL: 'R', OD: 'R', AS: 'R' },
    fallback: { degraded: 'DEGRADED_BADGE', offline: 'LAST_KNOWN' },
    dom_id: 'svg-press',
    panel: 'panel-primary',
  },
  {
    id: 'CMP-04',
    label: 'HMI Coolant Inlet HUD',
    specScreenId: 'SCR-02',
    specCmpId: 'CMP-05',
    specNote: 'Maps to Dashboard critical-variables display (CMP-05).',
    screen: 'SCR-01',
    tipologia_ui: 'HUDValue',
    standard_viz: 'STATE_STD_01',
    fonte_dati: 'COOLANT_IN',
    frequenza: '800ms',
    access: { OL: 'R', OD: 'R', AS: 'R' },
    fallback: { degraded: 'DEGRADED_BADGE', offline: '---' },
    dom_id: 'hud-inlet',
    panel: 'panel-primary',
  },
  {
    id: 'CMP-05',
    label: 'AI Copilot Sidebar',
    specScreenId: 'SCR-02',
    specCmpId: 'CMP-11',
    specNote: 'Maps to Dashboard model/virtual-sensor status (CMP-11); shares with CMP-14.',
    screen: 'SCR-01',
    tipologia_ui: 'AICopilotPanel',
    standard_viz: 'AI_STD_01',
    fonte_dati: 'AI',
    frequenza: 'event',
    access: { OL: 'R', OD: 'R/U', AS: 'R/U' },
    fallback: { degraded: 'READ_ONLY', offline: 'DISABLED' },
    dom_id: 'copilot-steps',
    panel: 'panel-primary',
  },
  {
    id: 'CMP-06',
    label: 'Thermal Margin Bar',
    specScreenId: 'SCR-02',
    specCmpId: 'CMP-05',
    specNote: 'Low confidence: approximate to Dashboard critical-variables (CMP-05).',
    screen: 'SCR-01',
    tipologia_ui: 'StatusBar',
    standard_viz: 'STATE_STD_01',
    fonte_dati: 'CORE_TEMP',
    frequenza: '800ms',
    access: { OL: 'R', OD: 'R', AS: 'R' },
    fallback: { degraded: 'DEGRADED_BADGE', offline: 'GREYED' },
    dom_id: 'margin-bar',
    panel: 'panel-primary',
  },

  // SCR-02: Secondary Circuit
  {
    id: 'CMP-07',
    label: 'P&ID Secondary Loop Schematic',
    specScreenId: 'SCR-06',
    specCmpId: 'CMP-41',
    specNote: 'Low confidence: closest spec fit is Multisensor comparative chart (CMP-41).',
    screen: 'SCR-02',
    tipologia_ui: 'PIDSchematic',
    standard_viz: 'PID_STD_01',
    fonte_dati: 'SG_INLET,STEAM_PRESS,TURBINE_RPM,GRID_OUT,PUMP_B,SEC_FLOW',
    frequenza: '800ms',
    access: { OL: 'R', OD: 'R', AS: 'R' },
    fallback: { degraded: 'STATIC_PID', offline: 'GREY_PID' },
    dom_id: 'pid-svg',
    panel: 'panel-secondary',
  },
  {
    id: 'CMP-08',
    label: 'Secondary Loop Parameters Table',
    specScreenId: 'SCR-02',
    specCmpId: 'CMP-08',
    specNote: 'Low confidence: approximate to Dashboard sensors summary (CMP-08).',
    screen: 'SCR-02',
    tipologia_ui: 'ParameterCards',
    standard_viz: 'STATE_STD_01',
    fonte_dati: 'SG_INLET,STEAM_PRESS,TURBINE_RPM,GRID_OUT,PUMP_B,SEC_FLOW',
    frequenza: '800ms',
    access: { OL: 'R', OD: 'R', AS: 'R' },
    fallback: { degraded: 'DEGRADED_BADGE', offline: 'LAST_KNOWN' },
    dom_id: 'sec-stats',
    panel: 'panel-secondary',
  },

  // SCR-03: Safety Systems
  {
    id: 'CMP-09',
    label: 'SCRAM Control Button',
    specScreenId: null,
    specCmpId: null,
    specNote: 'Demo-only (nuclear safety actuator). No equivalent in the plant-agnostic DAO spec.',
    screen: 'SCR-03',
    tipologia_ui: 'ActuatorControl',
    standard_viz: 'ACTION_STD_01',
    fonte_dati: 'SCRAM_V',
    frequenza: 'event',
    access: { OL: 'X', OD: 'R/U', AS: 'R/U' },
    fallback: { degraded: 'READ_ONLY', offline: 'DISABLED' },
    dom_id: 'btn-scram',
    panel: 'panel-safety',
  },
  {
    id: 'CMP-10',
    label: 'Control Rod Position Table',
    specScreenId: null,
    specCmpId: null,
    specNote: 'Demo-only (nuclear-specific). No equivalent in the DAO spec.',
    screen: 'SCR-03',
    tipologia_ui: 'RodPositionTable',
    standard_viz: 'STATE_STD_01',
    fonte_dati: 'ROD_POS',
    frequenza: '800ms',
    access: { OL: 'R', OD: 'R', AS: 'R' },
    fallback: { degraded: 'DEGRADED_BADGE', offline: 'LAST_KNOWN' },
    dom_id: 'rod-table',
    panel: 'panel-safety',
  },
  {
    id: 'CMP-11',
    label: 'Protection Interlocks Table',
    specScreenId: 'SCR-07',
    specCmpId: 'CMP-46',
    specNote: 'Low confidence: maps to Alarm active list (CMP-46) as an alarm/interlock view.',
    screen: 'SCR-03',
    tipologia_ui: 'InterlockTable',
    standard_viz: 'ALARM_STD_01',
    fonte_dati: 'SCRAM_V,CORE_TEMP,PRIM_PRESS,NEUTRON_FLUX',
    frequenza: '800ms',
    access: { OL: 'R', OD: 'R', AS: 'R/U' },
    fallback: { degraded: 'DEGRADED_BADGE', offline: 'READ_ONLY' },
    dom_id: 'interlock-table',
    panel: 'panel-safety',
  },
  {
    id: 'CMP-12',
    label: 'Emergency Depressurize Control',
    specScreenId: null,
    specCmpId: null,
    specNote: 'Demo-only (nuclear safety actuator). No equivalent in the DAO spec.',
    screen: 'SCR-03',
    tipologia_ui: 'ActuatorControl',
    standard_viz: 'ACTION_STD_01',
    fonte_dati: 'PRIM_PRESS',
    frequenza: 'event',
    access: { OL: 'X', OD: 'R/U', AS: 'C/R/U/D' },
    fallback: { degraded: 'READ_ONLY', offline: 'DISABLED' },
    dom_id: 'btn-depressurize',
    panel: 'panel-safety',
  },
  {
    id: 'CMP-13',
    label: 'Reset Interlocks Control',
    specScreenId: null,
    specCmpId: null,
    specNote: 'Demo-only (nuclear safety actuator). No equivalent in the DAO spec.',
    screen: 'SCR-03',
    tipologia_ui: 'ActuatorControl',
    standard_viz: 'ACTION_STD_01',
    fonte_dati: 'SCRAM_V',
    frequenza: 'event',
    access: { OL: 'X', OD: 'X', AS: 'C/R/U/D' },
    fallback: { degraded: 'DISABLED', offline: 'DISABLED' },
    dom_id: 'btn-reset-locks',
    panel: 'panel-safety',
  },

  // SCR-04: AI Copilot
  {
    id: 'CMP-14',
    label: 'AI Analysis Feed',
    specScreenId: 'SCR-02',
    specCmpId: 'CMP-11',
    specNote: 'Maps to Dashboard model/virtual-sensor status (CMP-11); shares with CMP-05.',
    screen: 'SCR-04',
    tipologia_ui: 'AIFeed',
    standard_viz: 'AI_STD_01',
    fonte_dati: 'AI',
    frequenza: 'event',
    access: { OL: 'R', OD: 'R/U', AS: 'R/U' },
    fallback: { degraded: 'READ_ONLY', offline: 'DISABLED' },
    dom_id: 'ai-feed',
    panel: 'panel-ai',
  },
  {
    id: 'CMP-15',
    label: 'Anomaly List',
    specScreenId: 'SCR-07',
    specCmpId: 'CMP-46',
    specNote: 'Maps to Alarm active list (CMP-46).',
    screen: 'SCR-04',
    tipologia_ui: 'AnomalyList',
    standard_viz: 'ALARM_STD_01',
    fonte_dati: 'ALARMS',
    frequenza: '800ms',
    access: { OL: 'R', OD: 'R', AS: 'R' },
    fallback: { degraded: 'DEGRADED_BADGE', offline: 'LAST_KNOWN' },
    dom_id: 'anomaly-list',
    panel: 'panel-ai',
  },
  {
    id: 'CMP-16',
    label: 'AI Predictions Panel',
    specScreenId: 'SCR-09',
    specCmpId: 'CMP-62',
    specNote: 'Maps to Historical predictive trend (CMP-62).',
    screen: 'SCR-04',
    tipologia_ui: 'PredictionPanel',
    standard_viz: 'TREND_STD_01',
    fonte_dati: 'CORE_TEMP,PRIM_PRESS,NEUTRON_FLUX,GRID_OUT',
    frequenza: '800ms',
    access: { OL: 'R', OD: 'R', AS: 'R' },
    fallback: { degraded: 'DEGRADED_BADGE', offline: 'DISABLED' },
    dom_id: 'ai-predictions',
    panel: 'panel-ai',
  },
  {
    id: 'CMP-17',
    label: 'Auto-Pilot Enable Toggle',
    specScreenId: null,
    specCmpId: null,
    specNote: 'Demo-only (autonomous control toggle). No equivalent in the DAO spec.',
    screen: 'SCR-04',
    tipologia_ui: 'ToggleControl',
    standard_viz: 'ACTION_STD_01',
    fonte_dati: 'AI',
    frequenza: 'event',
    access: { OL: 'X', OD: 'R/U', AS: 'C/R/U/D' },
    fallback: { degraded: 'DISABLED', offline: 'DISABLED' },
    dom_id: 'btn-auto-pilot',
    panel: 'panel-ai',
  },

  // SCR-05: System Diagnostics
  {
    id: 'CMP-18',
    label: 'Full Sensor Diagnostics Table',
    specScreenId: 'SCR-03',
    specCmpId: 'CMP-18',
    specNote: 'Maps to Sensor registry (CMP-18). Numeric match is coincidental.',
    screen: 'SCR-05',
    tipologia_ui: 'SensorTable',
    standard_viz: 'TABLE_STD_01',
    fonte_dati: 'ALL_SENSORS',
    frequenza: '500ms',
    access: { OL: 'R', OD: 'R', AS: 'R' },
    fallback: { degraded: 'DEGRADED_BADGE', offline: 'LAST_KNOWN' },
    dom_id: 'sensor-tbody',
    panel: 'panel-diagnostics',
  },
  {
    id: 'CMP-19',
    label: 'Diagnostic Export Control',
    specScreenId: 'SCR-09',
    specCmpId: 'CMP-65',
    specNote: 'Maps to Historical analysis export (CMP-65).',
    screen: 'SCR-05',
    tipologia_ui: 'ExportControl',
    standard_viz: 'ACTION_STD_01',
    fonte_dati: 'ALL_SENSORS',
    frequenza: 'event',
    access: { OL: 'X', OD: 'R/U', AS: 'C/R/U/D' },
    fallback: { degraded: 'DISABLED', offline: 'DISABLED' },
    dom_id: 'btn-diag-export',
    panel: 'panel-diagnostics',
  },

  // System-wide
  {
    id: 'CMP-20',
    label: 'Alarm Banner',
    specScreenId: 'SCR-07',
    specCmpId: 'CMP-46',
    specNote: 'Maps to Alarm active list/banner (CMP-46). Cross-screen (panel: ALL).',
    screen: 'ALL',
    tipologia_ui: 'AlarmBanner',
    standard_viz: 'ALARM_STD_01',
    fonte_dati: 'ALARMS',
    frequenza: 'event',
    access: { OL: 'R', OD: 'R/U', AS: 'C/R/U/D' },
    fallback: { degraded: 'READ_ONLY', offline: 'READ_ONLY' },
    dom_id: 'alarm-banner',
    panel: 'ALL',
  },
  {
    id: 'CMP-21',
    label: 'Audit Trail Panel',
    specScreenId: 'SCR-14',
    specCmpId: 'CMP-92',
    specNote: 'Maps to Config audit log (CMP-92).',
    screen: 'ALL',
    tipologia_ui: 'AuditPanel',
    standard_viz: 'TABLE_STD_01',
    fonte_dati: 'AUDIT',
    frequenza: 'event',
    access: { OL: 'R', OD: 'R', AS: 'C/R/U/D' },
    fallback: { degraded: 'READ_ONLY', offline: 'DISABLED' },
    dom_id: 'audit-panel',
    panel: 'ALL',
  },
  {
    id: 'CMP-22',
    label: 'Emergency Scenario Simulator',
    specScreenId: 'SCR-13',
    specCmpId: 'CMP-82',
    specNote: 'Maps to Training scenario player (CMP-82); shares with CMP-25.',
    screen: 'ALL',
    tipologia_ui: 'ScenarioControl',
    standard_viz: 'ACTION_STD_01',
    fonte_dati: 'SCENARIO',
    frequenza: 'event',
    access: { OL: 'X', OD: 'R/U', AS: 'C/R/U/D' },
    fallback: { degraded: 'DISABLED', offline: 'DISABLED' },
    dom_id: 'btn-demo',
    panel: 'ALL',
  },
  {
    id: 'CMP-23',
    label: 'Cybersecurity Status Panel',
    specScreenId: 'SCR-08',
    specCmpId: 'CMP-54',
    specNote: 'Maps to Cybersecurity alert list (CMP-54).',
    screen: 'ALL',
    tipologia_ui: 'CyberSecPanel',
    standard_viz: 'STATE_STD_01',
    fonte_dati: 'SYSTEM',
    frequenza: 'event',
    access: { OL: 'X', OD: 'X', AS: 'R/U' },
    fallback: { degraded: 'DISABLED', offline: 'DISABLED' },
    dom_id: 'cyber-panel',
    panel: 'ALL',
  },
  {
    id: 'CMP-24',
    label: 'Platform Configuration Manager',
    specScreenId: 'SCR-14',
    specCmpId: 'CMP-90',
    specNote: 'Maps to Config system-config (CMP-90).',
    screen: 'SCR-14',
    tipologia_ui: 'ConfigPanel',
    standard_viz: 'ACTION_STD_01',
    fonte_dati: 'CONFIG',
    frequenza: 'event',
    access: { OL: 'X', OD: 'R', AS: 'C/R/U/D' },
    fallback: { degraded: 'DISABLED', offline: 'DISABLED' },
    dom_id: 'panel-config',
    panel: 'panel-config',
    description: 'No-code graphical configuration — sensors, streams, taxonomy, versioning. AAS IEC 63278 / ISA-101 §5.4',
  },

  // ─── SCREEN SCR-15: TRAINING MODE (WP 3.6) ──────────────────────
  {
    id: 'CMP-25',
    label: 'Training Mode — Guided Scenario Player',
    specScreenId: 'SCR-13',
    specCmpId: 'CMP-82',
    specNote: 'Maps to Training current-scenario player (CMP-82); shares with CMP-22.',
    screen: 'SCR-15',
    tipologia_ui: 'TrainingPanel',
    standard_viz: 'ACTION_STD_01',
    fonte_dati: 'TRAINING',
    frequenza: 'event',
    // WP 3.6: OL=no access, OD=read only, AS=full, TR=full trainee access
    access: { OL: 'X', OD: 'R', AS: 'C/R/U/D', TR: 'R/U' },
    fallback: { degraded: 'DISABLED', offline: 'DISABLED' },
    dom_id: 'panel-training',
    panel: 'panel-training',
    description: 'Guided step-by-step scenario player for trainee certification. ISA-101 WP 3.6.',
  },
];

const DESIGN_TOKENS = {
  TREND_STD_01: {
    bg:              '#f4f6f8',
    border:          'rgba(0,0,0,.06)',
    line_rt:         '#212529',
    line_pred:       '#343a40',
    line_trip:       '#e31a1a',
    stroke_w_rt:     1.8,
    stroke_w_pred:   1.3,
    text_label:      '#6c757d',
    text_value:      '#212529',
  },

  STATE_STD_01: {
    bg:           '#f4f6f8',
    border:       'rgba(0,0,0,.06)',
    border_alarm: 'rgba(227,26,26,.3)',
    bg_alarm:     'rgba(227,26,26,.06)',
    text_label:   '#6c757d',
    text_value:   '#212529',
    text_alarm:   '#e31a1a',
    text_warn:    '#d97d06',
    text_nominal: '#212529',
    bar_nominal:  '#159647',
    bar_warn:     '#d97d06',
    bar_alarm:    '#e31a1a',
  },

  ALARM_STD_01: {
    p1_color:    '#e31a1a',
    p1_bg:       '#fcdcdc',
    p2_color:    '#d97d06',
    p2_bg:       '#fcecd5',
    p3_color:    '#cd5c08',
    p3_bg:       '#fce3d5',
    acked_color: '#adb5bd',
    text_label:  '#6c757d',
    text_msg:    '#212529',
  },

  PID_STD_01: {
    pipe_cold:  '#343a40',
    pipe_hot:   '#cd5c08',
    pipe_steam: '#cd5c08',
    box_fill:   '#ced4da',
    box_stroke: '#495057',
    text_label: '#343a40',
    text_value: '#6c757d',
    label_hot:  '#cd5c08',
    label_cold: '#343a40',
  },

  ACTION_STD_01: {
    scram_bg:          '#e31a1a',
    scram_border:      '#e31a1a',
    warn_border:       '#d97d06',
    warn_text:         '#d97d06',
    neutral_bg:        '#d1d6dc',
    neutral_border:    'rgba(0,0,0,.1)',
    neutral_text:      '#343a40',
    disabled_opacity:  0.25,
    locked_color:      '#6c757d',
  },

  AI_STD_01: {
    bg_panel:      '#e2e6ea',
    border_normal: '#495057',
    border_warn:   '#d97d06',
    border_crit:   '#e31a1a',
    text_ts:       '#6c757d',
    text_msg:      '#212529',
    icon_color:    '#343a40',
    active_dot:    '#159647',
  },

  TABLE_STD_01: {
    bg_header:     '#d1d6dc',
    bg_row_even:   'transparent',
    bg_row_alarm:  'rgba(227,26,26,.05)',
    bg_row_warn:   'rgba(217,125,6,.04)',
    border_row:    'rgba(0,0,0,.04)',
    text_header:   '#6c757d',
    text_tag:      '#212529',
    text_meta:     '#6c757d',
    status_nominal:'#159647',
    status_warn:   '#d97d06',
    status_alarm:  '#e31a1a',
  },

  TWIN_STD_01: {
    bg_container:   '#f4f6f8',
    hud_bg:         'rgba(226,230,234,.85)',
    hud_border:     'rgba(0,0,0,.1)',
    emergency_glow: 'rgba(227,26,26,.12)',
    wire_nominal:   0x495057,
    wire_danger:    0xe31a1a,
    text_value:     '#212529',
    text_unit:      '#6c757d',
  },
};

function parseAccess(accessStr) {
  if (!accessStr || accessStr === 'X') return new Set();
  return new Set(accessStr.split('/'));
}

/**
 * Check if a role can perform an action on a component.
 * TR role falls back to OL access when no explicit TR entry exists.
 * @param {string} role   - 'OL', 'OD', 'AS', 'TR'
 * @param {object} cmp    - component registry entry
 * @param {string} action - 'R','U','C','D'
 * @returns {boolean}
 */
function canAccess(role, cmp, action = 'R') {
  if (!role || !cmp) return false;
  // TR uses its own explicit access entry; falls back to OL if not set
  const effectiveRole = (role === 'TR' && cmp.access['TR'] == null) ? 'OL' : role;
  const accessStr = cmp.access[effectiveRole];
  if (!accessStr || accessStr === 'X') return false;
  return parseAccess(accessStr).has(action);
}

function getVisibleComponents(role, panel = 'ALL') {
  return COMPONENT_REGISTRY.filter(cmp => {
    const panelMatch = panel === 'ALL' || cmp.panel === panel || cmp.panel === 'ALL';
    return panelMatch && canAccess(role, cmp, 'R');
  });
}

function getComponent(id) {
  return COMPONENT_REGISTRY.find(c => c.id === id);
}

export {
  COMPONENT_REGISTRY,
  DESIGN_TOKENS,
  canAccess,
  getVisibleComponents,
  getComponent,
  parseAccess
};
