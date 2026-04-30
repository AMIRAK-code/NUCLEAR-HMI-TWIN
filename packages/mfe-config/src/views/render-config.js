/**
 * CORE-SENTINEL HMI — SCR-14 Platform Configuration Manager (CMP-24)
 * WP 1.3 / WP 1.2 — Graphical No-Code Configuration Interface
 * ISA-101.01 §5.4 / AAS IEC 63278 / IEC 62443 Audit Trail
 *
 * Features:
 *   Search & Filtering      — fuzzy search + system filter in Measures tab
 *   Unit Conversion         — thresholds shown in current metric/imperial mode
 *   AAS Graph Viewer        — interactive zoomable SVG node graph (Taxonomy tab)
 *   Digital Signatures      — FNV-64 checksum on export, verified on import
 *   Draft Mode (Two-Man)    — OD submits proposals; AS approves/rejects
 *   Interlock Constraints   — tripHigh > tripLow validation, Save blocked on error
 *   Bulk Edit Tools         — raise/lower all thresholds in a system by ±%
 *   What-If Analysis        — simulate pending thresholds vs live sensor data
 *   Historical Validation   — run new config vs last 10 min of TelemetryBuffer
 *   Visual Diff             — side-by-side JSON diff in Versions tab
 */

import {
  ConfigService, TelemetryBuffer, UnitConverter,
  escHtml, dlFile,
  dispatch,
  ACTION_TYPES as A,
} from '@sentinel/shared';

// ── Lookup maps ───────────────────────────────────────────────────────────────
const P_LABEL   = { 1: 'P1 — Critical', 2: 'P2 — Urgent', 3: 'P3 — High' };
const SYS_COLOR = { Primary:'#212529', Secondary:'#495057', Safety:'#e31a1a', Grid:'#159647' };
const SYSTEMS   = ['All', 'Primary', 'Secondary', 'Safety', 'Grid'];

// ── Pending changes buffer ────────────────────────────────────────────────────
const _pending = {};
let _pendingCount = 0;

function _clearPending() {
  Object.keys(_pending).forEach(k => delete _pending[k]);
  _pendingCount = 0;
  _validationErrors = {};
}

function _setPending(sensorKey, field, value) {
  if (!_pending[sensorKey]) _pending[sensorKey] = {};
  _pending[sensorKey][field] = value;
  _pendingCount = Object.keys(_pending).reduce((t, k) => t + Object.keys(_pending[k]).length, 0);
  _validateAll();
}

// ── Interlock Validation ──────────────────────────────────────────────────────
let _validationErrors = {};

function _validateAll() {
  _validationErrors = {};
  const measures = ConfigService.get('measures') ?? {};
  for (const [key, changes] of Object.entries(_pending)) {
    const base        = measures[key] ?? {};
    const tripHigh    = Number(changes.tripHigh    !== undefined ? changes.tripHigh    : base.tripHigh    ?? 0);
    const tripLow     = Number(changes.tripLow     !== undefined ? changes.tripLow     : base.tripLow     ?? 0);
    const nominalHigh = Number(changes.nominalHigh !== undefined ? changes.nominalHigh : base.nominalHigh ?? 0);
    if (tripHigh <= tripLow) {
      _validationErrors[`${key}_tripHigh`] = `Trip High (${tripHigh}) must be > Trip Low (${tripLow})`;
      _validationErrors[`${key}_tripLow`]  = `Trip Low (${tripLow}) must be < Trip High (${tripHigh})`;
    }
    if (base.nominalHigh !== undefined && nominalHigh >= tripHigh) {
      _validationErrors[`${key}_nominalHigh`] = `Nominal High (${nominalHigh}) must be < Trip High (${tripHigh})`;
    }
  }
  return _validationErrors;
}
function _hasErrors() { return Object.keys(_validationErrors).length > 0; }

// ── Bulk Edit state ───────────────────────────────────────────────────────────
let _bulkSystem = 'All';
let _bulkField  = 'tripHigh';
let _bulkPct    = 5;

// ── Search & Filter state ─────────────────────────────────────────────────────
let _measureSearch       = '';
let _measureSystemFilter = 'All';

// ── AAS Graph pan/zoom state ──────────────────────────────────────────────────
let _graphVB        = null;   // { x, y, w, h }
let _graphDragging  = false;
let _graphDragStart = { x:0, y:0, vbx:0, vby:0 };

// ── Dirty-check signature ─────────────────────────────────────────────────────
let _lastSig = '';

function _sig(s, meta) {
  const errCount   = Object.keys(_validationErrors).length;
  const draftCount = ConfigService.getPendingDrafts().length;
  return [
    s.role, s.activePanel, s.configActiveTab ?? 'overview',
    meta.configVersion, _pendingCount, errCount,
    _bulkSystem, _bulkField, _measureSearch, _measureSystemFilter,
    UnitConverter.mode, draftCount
  ].join('|');
}

// ── Proposed measures helper ──────────────────────────────────────────────────
function _buildProposedMeasures() {
  const current  = ConfigService.get('measures') ?? {};
  const proposed = JSON.parse(JSON.stringify(current));
  for (const [key, changes] of Object.entries(_pending)) {
    if (proposed[key]) Object.assign(proposed[key], changes);
  }
  return proposed;
}

// ── Fuzzy search helper ───────────────────────────────────────────────────────
function _matcheSearch(m, query) {
  if (!query) return true;
  const haystack = `${m.tag} ${m.label} ${m.sys}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).every(word => haystack.includes(word));
}

// ═══════════════════════════════════════════════════════════════════════════════
export function renderConfigPanel(s) {
  if (s.activePanel !== 'panel-config') { _lastSig = ''; return; }
  const container = document.getElementById('panel-config');
  if (!container) return;

  // RBAC: AS = full edit, OD = read + draft submission, OL = denied
  if (s.role !== 'AS' && s.role !== 'OD') {
    if (_lastSig !== `denied|${s.role}`) {
      _lastSig = `denied|${s.role}`;
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full gap-4">
          <span class="ms material-symbols-outlined text-[#e31a1a] text-5xl">lock</span>
          <div class="tv text-[13px] text-[#e31a1a] font-bold uppercase tracking-widest">Access Denied — CMP-24</div>
          <div class="tv text-[11px] text-[#6c757d]">Diagnostic Operator (OD) or System Admin (AS) role required.</div>
        </div>`;
    }
    return;
  }

  const activeTab = s.configActiveTab ?? 'overview';
  const meta      = ConfigService.getMeta();
  const sig       = _sig(s, meta);
  if (sig === _lastSig) return;
  _lastSig = sig;

  const pendingDrafts = ConfigService.getPendingDrafts();
  const draftBadge    = pendingDrafts.length > 0
    ? `<span class="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#d97d06] text-white text-[9px] font-bold">${pendingDrafts.length}</span>`
    : '';

  container.innerHTML = `
    <!-- Header -->
    <div class="flex-shrink-0 flex items-center justify-between px-5 py-2.5 border-b border-[rgba(0,0,0,.08)] bg-[#e2e6ea]">
      <div class="flex items-center gap-3">
        <span class="ms material-symbols-outlined text-[#343a40] text-[18px]">tune</span>
        <div>
          <div class="tv font-bold text-[11px] tracking-widest uppercase text-[#212529]">
            Platform Configuration Manager — SCR-14
            ${s.role === 'OD' ? '<span class="ml-2 text-[10px] text-[#d97d06] border border-[#d97d06]/40 px-1.5 py-0.5">DRAFT MODE — OD</span>' : ''}
          </div>
          <div class="tv text-[11px] text-[#6c757d]">
            AAS IEC 63278 · Config ${escHtml(meta.configVersion)} · ${escHtml(meta.versionCount)} versions ·
            Units: <span class="font-bold text-[#343a40]">${UnitConverter.mode.toUpperCase()}</span> ·
            Last: <span class="text-[#343a40]">${escHtml(meta.lastModifiedBy)}</span>
          </div>
        </div>
      </div>
      ${s.role === 'AS' ? `
      <div class="flex items-center gap-2">
        <button id="cfg-btn-export"
          class="flex items-center gap-1.5 px-3 py-1.5 border border-[rgba(0,0,0,.08)] tv text-[11px] text-[#343a40] font-bold uppercase tracking-wider hover:bg-[#d1d6dc] transition-colors"
          title="Export with integrity checksum (FNV-64)">
          <span class="ms material-symbols-outlined text-[14px]">verified</span> SIGNED EXPORT
        </button>
        <label class="flex items-center gap-1.5 px-3 py-1.5 border border-[rgba(0,0,0,.08)] tv text-[11px] text-[#343a40] font-bold uppercase tracking-wider hover:bg-[#d1d6dc] transition-colors cursor-pointer"
          title="Import and verify integrity checksum">
          <span class="ms material-symbols-outlined text-[14px]">upload</span> VERIFIED IMPORT
          <input type="file" id="cfg-file-input" accept=".json" class="hidden"/>
        </label>
        <button id="cfg-btn-reset"
          class="flex items-center gap-1.5 px-3 py-1.5 border border-[rgba(227,26,26,.3)] tv text-[11px] text-[#e31a1a] font-bold uppercase tracking-wider hover:bg-[rgba(227,26,26,.05)] transition-colors">
          <span class="ms material-symbols-outlined text-[14px]">restore</span> Reset
        </button>
      </div>` : `
      <div class="tv text-[11px] text-[#d97d06] flex items-center gap-1.5">
        <span class="ms material-symbols-outlined text-[14px]">info</span>
        Read-only view. Use "Submit Draft" to propose changes for AS approval.
      </div>`}
    </div>

    <!-- Tab Bar -->
    <div class="flex-shrink-0 flex border-b border-[rgba(0,0,0,.08)] bg-[#e2e6ea] overflow-x-auto">
      ${_renderTabBtn('overview',  'info',         'Overview',   activeTab)}
      ${_renderTabBtn('taxonomy',  'account_tree', 'AAS Graph',  activeTab)}
      ${_renderTabBtn('devices',   'sensors',      'Devices',    activeTab)}
      ${_renderTabBtn('measures',  'straighten',   'Measures',   activeTab)}
      ${_renderTabBtn('streams',   'stream',       'Streams',    activeTab)}
      ${_renderTabBtn('versions',  'history',      'Versions',   activeTab)}
      ${(s.role === 'AS') ? _renderTabBtn('approvals', 'approval', `Approvals${draftBadge}`, activeTab) : ''}
    </div>

    <!-- Tab Content -->
    <div id="cfg-tab-content" class="flex-1 overflow-y-auto">
      ${_renderTab(activeTab, meta, s)}
    </div>`;

  _bindConfigEvents(s);
}

// ── Tab button ────────────────────────────────────────────────────────────────
function _renderTabBtn(id, icon, label, active) {
  const isActive = active === id;
  return `
    <button data-cfg-tab="${id}" class="cfg-tab-btn flex items-center gap-1.5 px-4 py-2.5 tv text-[11px] font-bold uppercase tracking-wider transition-colors border-b-2 whitespace-nowrap
      ${isActive ? 'border-[#212529] text-[#212529] bg-[#d1d6dc]' : 'border-transparent text-[#6c757d] hover:text-[#343a40] hover:bg-[#d1d6dc]'}">
      <span class="ms material-symbols-outlined text-[14px]">${icon}</span>${label}
    </button>`;
}

function _renderTab(tab, meta, s) {
  switch (tab) {
    case 'overview':  return _tabOverview(meta);
    case 'taxonomy':  return _tabTaxonomyGraph();
    case 'devices':   return _tabDevices();
    case 'measures':  return _tabMeasures(s);
    case 'streams':   return _tabStreams();
    case 'versions':  return _tabVersions();
    case 'approvals': return _tabApprovals(s);
    default:          return _tabOverview(meta);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1 — OVERVIEW
// ══════════════════════════════════════════════════════════════════════════════
function _tabOverview(meta) {
  const cv        = meta.currentVersion;
  const standards = ConfigService.get('standards') ?? {};
  const security  = ConfigService.get('security')  ?? {};
  const drafts    = ConfigService.getPendingDrafts();

  return `
    <div class="p-5 grid grid-cols-2 gap-5">
      <div class="border border-[rgba(0,0,0,.08)] bg-white p-4">
        <div class="tv text-[11px] text-[#6c757d] uppercase tracking-widest mb-3">Active Configuration</div>
        <div class="tv text-2xl font-black text-[#212529] mb-1">v${escHtml(meta.configVersion)}</div>
        ${cv ? `
          <div class="tv text-[11px] text-[#6c757d] mb-3">${escHtml(cv.ts ? new Date(cv.ts).toLocaleString('it-IT') : '—')}</div>
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="ms material-symbols-outlined text-[#6c757d] text-[14px]">person</span>
              <span class="tv text-[11px] text-[#343a40]">By: <strong>${escHtml(cv.user)}</strong> [${escHtml(cv.role)}]</span>
            </div>
            <div class="flex items-start gap-2">
              <span class="ms material-symbols-outlined text-[#6c757d] text-[14px] mt-0.5">comment</span>
              <span class="tv text-[11px] text-[#343a40]">${escHtml(cv.reason)}</span>
            </div>
            <div class="flex items-center gap-2 mt-2">
              <span class="ms material-symbols-outlined text-[#6c757d] text-[14px]">fingerprint</span>
              <span class="tv text-[10px] text-[#adb5bd] font-mono">${escHtml(cv.id)}</span>
            </div>
          </div>` : '<div class="tv text-[11px] text-[#adb5bd]">No version info</div>'}
        ${drafts.length > 0 ? `
          <div class="mt-3 p-2 bg-[#d97d06]/08 border border-[#d97d06]/30">
            <div class="tv text-[10px] text-[#d97d06] font-bold uppercase">
              ⏳ ${drafts.length} pending draft${drafts.length !== 1 ? 's' : ''} awaiting AS approval
            </div>
          </div>` : ''}
      </div>

      <div class="border border-[rgba(0,0,0,.08)] bg-white p-4">
        <div class="tv text-[11px] text-[#6c757d] uppercase tracking-widest mb-3">Platform Statistics</div>
        <div class="space-y-2">
          ${_statRow('Sensors Monitored',    Object.keys(ConfigService.get('measures') ?? {}).length)}
          ${_statRow('Data Streams',         Object.keys(ConfigService.get('streams')  ?? {}).length)}
          ${_statRow('Devices Registered',   Object.keys(ConfigService.get('devices')  ?? {}).length)}
          ${_statRow('Config Versions',      meta.versionCount)}
          ${_statRow('Pending Drafts',       drafts.length)}
          ${_statRow('Unit System',          UnitConverter.mode.toUpperCase())}
          ${_statRow('Telemetry Buffer',     `${TelemetryBuffer.durationSec().toFixed(0)} s / 600 s`)}
          ${_statRow('Asset ID',             meta.assetId   ?? '—')}
        </div>
      </div>

      <div class="border border-[rgba(0,0,0,.08)] bg-white p-4">
        <div class="tv text-[11px] text-[#6c757d] uppercase tracking-widest mb-3">Applicable Standards</div>
        <div class="space-y-1.5">
          ${Object.entries(standards).map(([k, v]) =>
            `<div class="flex items-center justify-between py-0.5 border-b border-[rgba(0,0,0,.04)]">
              <span class="tv text-[11px] text-[#6c757d] uppercase">${escHtml(k.replace(/_/g,' '))}</span>
              <span class="tv text-[11px] font-bold text-[#343a40]">${escHtml(v)}</span>
            </div>`).join('')}
        </div>
      </div>

      <div class="border border-[rgba(0,0,0,.08)] bg-white p-4">
        <div class="tv text-[11px] text-[#6c757d] uppercase tracking-widest mb-3">Security Suite (IEC 62443)</div>
        <div class="space-y-1.5">
          ${Object.entries(security).map(([k, v]) =>
            `<div class="flex items-center justify-between py-0.5 border-b border-[rgba(0,0,0,.04)]">
              <span class="tv text-[11px] text-[#6c757d] uppercase">${escHtml(k)}</span>
              <span class="tv text-[11px] font-bold text-[#343a40]">${escHtml(v)}</span>
            </div>`).join('')}
          <div class="flex items-center justify-between py-0.5 border-b border-[rgba(0,0,0,.04)]">
            <span class="tv text-[11px] text-[#6c757d] uppercase">Export Signature</span>
            <span class="tv text-[11px] font-bold text-[#159647]">FNV-1a 64-bit</span>
          </div>
        </div>
      </div>
    </div>`;
}

function _statRow(label, value) {
  return `
    <div class="flex items-center justify-between py-1 border-b border-[rgba(0,0,0,.04)]">
      <span class="tv text-[11px] text-[#6c757d]">${escHtml(String(label))}</span>
      <span class="tv text-[12px] font-bold text-[#212529]">${escHtml(String(value))}</span>
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2 — AAS GRAPH VIEWER (replaces static tree)
// Interactive zoomable SVG node graph — pure SVG, no external library
// ══════════════════════════════════════════════════════════════════════════════
function _tabTaxonomyGraph() {
  const tax = ConfigService.get('taxonomy');
  if (!tax) return '<div class="p-5 tv text-[11px] text-[#6c757d]">No taxonomy data</div>';

  const NODE_W = 190, NODE_H = 46, DEPTH_W = 240, V_PAD = 20;
  const measures = ConfigService.get('measures') ?? {};
  const nodes = [], edges = [];

  function layout(node, depth, startY) {
    if (!node.children || node.children.length === 0) {
      const y = startY + NODE_H / 2 + V_PAD / 2;
      const n = { ...node, x: depth * DEPTH_W + NODE_W / 2 + 10, y };
      nodes.push(n);
      return { laid: n, h: NODE_H + V_PAD };
    }
    let cy = startY;
    const children = [];
    for (const child of (node.children ?? [])) {
      const res = layout(child, depth + 1, cy);
      children.push(res.laid);
      cy += res.h;
    }
    const totalH = cy - startY;
    const y = startY + totalH / 2;
    const n = { ...node, x: depth * DEPTH_W + NODE_W / 2 + 10, y };
    nodes.push(n);
    for (const c of children) {
      edges.push({ x1: n.x + NODE_W / 2, y1: n.y, x2: c.x - NODE_W / 2, y2: c.y });
    }
    return { laid: n, h: totalH };
  }

  const { h: totalH } = layout(tax, 0, 10);
  const totalW = 4 * DEPTH_W + NODE_W + 30;
  const svgH   = Math.max(totalH + 40, 400);

  const typeColor = { Plant:'#212529', System:'#343a40', Subsystem:'#495057' };
  const typeBg    = { Plant:'#212529', System:'#e2e6ea', Subsystem:'#f4f6f8' };
  const typeTxt   = { Plant:'#ffffff', System:'#212529', Subsystem:'#343a40' };

  const svgEdges = edges.map(e => {
    const cx = (e.x1 + e.x2) / 2;
    return `<path d="M${e.x1},${e.y1} C${cx},${e.y1} ${cx},${e.y2} ${e.x2},${e.y2}"
      fill="none" stroke="#adb5bd" stroke-width="1.5" opacity=".7"/>`;
  }).join('');

  const svgNodes = nodes.map(n => {
    const bg  = typeBg[n.type]  ?? '#f4f6f8';
    const tc  = typeTxt[n.type] ?? '#343a40';
    const bc  = typeColor[n.type] ?? '#6c757d';
    const bw  = n.type === 'Plant' ? 2 : 1;
    const lx  = n.x - NODE_W / 2;
    const ty  = n.y - NODE_H / 2;

    // Sensor chips
    const sensors = (n.sensors ?? []);
    const chipStr = sensors.slice(0, 3).map(key => {
      const m = measures[key];
      const sc = SYS_COLOR[m?.sys ?? ''] ?? '#6c757d';
      return `<span style="background:${sc}22;color:${sc};border:1px solid ${sc}44;
        font-family:'Courier New',monospace;font-size:8px;padding:1px 4px;border-radius:2px;
        margin-right:2px">${escHtml(key)}</span>`;
    }).join('') + (sensors.length > 3 ? `<span style="color:#adb5bd;font-size:8px">+${sensors.length-3}</span>` : '');

    return `
      <g class="aas-node cursor-pointer" transform="translate(0,0)">
        <rect x="${lx}" y="${ty}" width="${NODE_W}" height="${NODE_H}" rx="4"
          fill="${bg}" stroke="${bc}" stroke-width="${bw}"/>
        <text x="${n.x}" y="${n.y - (sensors.length ? 6 : 2)}"
          text-anchor="middle" font-family="'Courier New',monospace" font-size="11"
          font-weight="700" fill="${tc}">${escHtml(n.label)}</text>
        ${n.type !== 'Plant' ? `<text x="${n.x}" y="${n.y + 8}"
          text-anchor="middle" font-family="'Courier New',monospace" font-size="9"
          fill="${tc === '#ffffff' ? '#adb5bd' : '#6c757d'}">${escHtml(n.type)}</text>` : ''}
        ${sensors.length ? `
          <foreignObject x="${lx + 4}" y="${n.y + 13}" width="${NODE_W - 8}" height="16">
            <div xmlns="http://www.w3.org/1999/xhtml" style="white-space:nowrap;overflow:hidden">
              ${chipStr}
            </div>
          </foreignObject>` : ''}
      </g>`;
  }).join('');

  // Store initial viewBox
  _graphVB = { x: 0, y: 0, w: totalW, h: svgH };

  return `
    <div class="p-4 flex flex-col h-full">
      <div class="flex items-center justify-between mb-3 flex-shrink-0">
        <div>
          <div class="tv text-[11px] text-[#6c757d] uppercase tracking-widest">
            AAS IEC 63278 — LFR-4G Unit 4 System Interconnection Graph
          </div>
          <div class="tv text-[10px] text-[#adb5bd] mt-0.5">
            <span class="ms material-symbols-outlined text-[11px] align-middle">mouse</span>
            Scroll wheel to zoom · Drag to pan
          </div>
        </div>
        <button id="aas-graph-reset"
          class="tv text-[10px] px-2.5 py-1 border border-[rgba(0,0,0,.1)] text-[#6c757d] font-bold uppercase hover:bg-[#d1d6dc] transition-colors">
          ↺ RESET VIEW
        </button>
      </div>
      <div class="flex-1 border border-[rgba(0,0,0,.08)] bg-white overflow-hidden" style="min-height:350px">
        <svg id="aas-graph-svg" width="100%" height="100%"
          viewBox="0 0 ${totalW} ${svgH}"
          style="cursor:grab;user-select:none;display:block">
          ${svgEdges}
          ${svgNodes}
        </svg>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3 — DEVICES
// ══════════════════════════════════════════════════════════════════════════════
function _tabDevices() {
  const entries = Object.entries(ConfigService.get('devices') ?? {});
  return `
    <div class="p-5">
      <div class="tv text-[11px] text-[#6c757d] uppercase tracking-widest mb-4">
        Device Registry — ${entries.length} Assets (AAS Digital ID Cards)
      </div>
      <div class="overflow-x-auto">
        <table class="w-full border-collapse">
          <thead>
            <tr class="bg-[#e2e6ea]">
              ${['Tag','Label','System','Unit','Manufacturer','Protocol','AAS ID','Status']
                .map(h => `<th class="tv text-[10px] text-[#6c757d] uppercase tracking-wider text-left px-3 py-2 border border-[rgba(0,0,0,.06)]">${h}</th>`)
                .join('')}
            </tr>
          </thead>
          <tbody>
            ${entries.map(([, d]) => {
              const col = SYS_COLOR[d.system] ?? '#6c757d';
              return `<tr class="sr border-b border-[rgba(0,0,0,.04)]">
                <td class="px-3 py-1.5 border border-[rgba(0,0,0,.06)]"><span class="tv text-[11px] font-bold" style="color:${col}">${escHtml(d.tag)}</span></td>
                <td class="px-3 py-1.5 border border-[rgba(0,0,0,.06)] tv text-[11px] text-[#343a40]">${escHtml(d.label)}</td>
                <td class="px-3 py-1.5 border border-[rgba(0,0,0,.06)]"><span class="tv text-[10px] px-1.5 py-0.5 font-bold" style="border:1px solid ${col}33;color:${col}">${escHtml(d.system)}</span></td>
                <td class="px-3 py-1.5 border border-[rgba(0,0,0,.06)] tv text-[11px] text-[#6c757d]">${escHtml(UnitConverter.unitLabel(d.unit))}</td>
                <td class="px-3 py-1.5 border border-[rgba(0,0,0,.06)] tv text-[11px] text-[#6c757d]">${escHtml(d.manufacturer)}</td>
                <td class="px-3 py-1.5 border border-[rgba(0,0,0,.06)] tv text-[11px] text-[#6c757d]">${escHtml(d.protocol)}</td>
                <td class="px-3 py-1.5 border border-[rgba(0,0,0,.06)] tv text-[10px] text-[#adb5bd] font-mono">${escHtml(d.aasId)}</td>
                <td class="px-3 py-1.5 border border-[rgba(0,0,0,.06)]"><span class="tv text-[10px] font-bold" style="color:${d.enabled?'#159647':'#e31a1a'}">${d.enabled?'● ENABLED':'○ DISABLED'}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 4 — MEASURES  (Search/Filter + Interlock Validation + Bulk Edit + Analysis)
// ══════════════════════════════════════════════════════════════════════════════
function _tabMeasures(s) {
  const measures   = ConfigService.get('measures') ?? {};
  const hasPending = Object.keys(_pending).length > 0;
  const errCount   = Object.keys(_validationErrors).length;
  const saveBlocked = hasPending && errCount > 0;
  const isOD       = s.role === 'OD';

  // Apply search & system filter
  const filteredEntries = Object.entries(measures).filter(([, m]) => {
    const sysOk    = _measureSystemFilter === 'All' || m.sys === _measureSystemFilter;
    const searchOk = _matcheSearch(m, _measureSearch);
    return sysOk && searchOk;
  });

  // ── Unit info bar ───────────────────────────────────────────────────────────
  const unitBar = `
    <div class="flex-shrink-0 flex items-center gap-2 px-5 py-1.5 bg-white border-b border-[rgba(0,0,0,.06)]">
      <span class="ms material-symbols-outlined text-[#6c757d] text-[13px]">straighten</span>
      <span class="tv text-[10px] text-[#6c757d]">Thresholds always stored in SI metric.
        Display unit: <strong class="text-[#343a40]">${UnitConverter.mode.toUpperCase()}</strong>.
        Change in <em>Settings → Unit System</em>.
      </span>
    </div>`;

  // ── Validation error banner ─────────────────────────────────────────────────
  const errorBanner = errCount > 0 ? `
    <div class="flex-shrink-0 flex items-center gap-2 px-5 py-2 bg-[rgba(227,26,26,.06)] border-b border-[#e31a1a]/20">
      <span class="ms material-symbols-outlined text-[#e31a1a] text-[14px]">error</span>
      <span class="tv text-[11px] text-[#e31a1a] font-bold uppercase tracking-wide">
        ${errCount} interlock violation${errCount !== 1 ? 's' : ''} — fix before saving
      </span>
      <div class="flex-1 flex flex-wrap gap-1 ml-2">
        ${Object.values(_validationErrors).slice(0,3).map(e =>
          `<span class="tv text-[10px] text-[#e31a1a] bg-[rgba(227,26,26,.08)] px-1.5 py-0.5 border border-[#e31a1a]/20">${escHtml(e)}</span>`
        ).join('')}
      </div>
    </div>` : '';

  // ── Save toolbar (AS) / Submit toolbar (OD) ─────────────────────────────────
  const saveToolbar = isOD ? `
    <div class="flex-shrink-0 flex items-center justify-between px-5 py-2.5 border-b border-[rgba(0,0,0,.08)] bg-[#e2e6ea]">
      <div class="tv text-[11px] text-[#6c757d]">
        <strong class="text-[#d97d06]">DRAFT MODE:</strong>
        Changes will be submitted for AS approval — not applied directly.
      </div>
      <div class="flex items-center gap-2">
        ${hasPending ? `
          <div class="tv text-[11px] text-[#d97d06] font-bold">● ${_pendingCount} staged change${_pendingCount !== 1 ? 's' : ''}</div>
          <button id="cfg-btn-discard" class="tv text-[11px] px-3 py-1.5 border border-[rgba(0,0,0,.1)] text-[#343a40] font-bold uppercase tracking-wider hover:bg-[#d1d6dc] transition-colors">DISCARD</button>
          <button id="cfg-btn-submit-draft"
            class="flex items-center gap-1.5 tv text-[11px] px-3 py-1.5 bg-[#d97d06] text-white font-bold uppercase tracking-wider hover:bg-[#b86a05] transition-colors">
            <span class="ms material-symbols-outlined text-[13px]">send</span> SUBMIT FOR AS APPROVAL
          </button>` : `<div class="tv text-[11px] text-[#6c757d]">Stage changes below, then submit for approval</div>`}
      </div>
    </div>` : `
    <div class="flex-shrink-0 flex items-center justify-between px-5 py-2.5 border-b border-[rgba(0,0,0,.08)] bg-[#e2e6ea]">
      <div class="tv text-[11px] text-[#6c757d]">
        Edit trip setpoints inline.
        Changes are <strong class="text-[#343a40]">held locally</strong> until "Save as New Version".
      </div>
      <div class="flex items-center gap-2">
        ${hasPending ? `
          <div class="tv text-[11px] ${saveBlocked ? 'text-[#e31a1a]' : 'text-[#d97d06]'} font-bold">
            ${saveBlocked ? '⛔' : '●'} ${_pendingCount} unsaved
          </div>
          <button id="cfg-btn-discard" class="tv text-[11px] px-3 py-1.5 border border-[rgba(0,0,0,.1)] text-[#343a40] font-bold uppercase tracking-wider hover:bg-[#d1d6dc] transition-colors">DISCARD</button>
          <button id="cfg-btn-save" ${saveBlocked ? 'disabled' : ''}
            class="flex items-center gap-1.5 tv text-[11px] px-3 py-1.5 font-bold uppercase tracking-wider transition-colors
              ${saveBlocked ? 'bg-[#adb5bd] text-white cursor-not-allowed opacity-50' : 'bg-[#212529] text-white hover:bg-[#343a40]'}">
            <span class="ms material-symbols-outlined text-[13px]">${saveBlocked ? 'block' : 'save'}</span>
            ${saveBlocked ? 'BLOCKED' : 'SAVE AS NEW VERSION'}
          </button>` : `<div class="tv text-[11px] text-[#159647] font-bold">✓ No pending changes</div>`}
      </div>
    </div>`;

  // ── Search & Filter bar ─────────────────────────────────────────────────────
  const searchBar = `
    <div class="flex-shrink-0 flex items-center gap-3 px-5 py-2.5 border-b border-[rgba(0,0,0,.08)] bg-white">
      <div class="flex items-center gap-2 flex-1">
        <span class="ms material-symbols-outlined text-[#6c757d] text-[16px]">search</span>
        <input id="cfg-search-input" type="text" value="${escHtml(_measureSearch)}"
          placeholder="Search by tag, label or system…"
          class="flex-1 tv text-[11px] px-2 py-1 border border-[rgba(0,0,0,.1)] bg-[#f4f6f8] outline-none focus:border-[#343a40] transition-colors"/>
        ${_measureSearch ? `<button id="cfg-search-clear" class="tv text-[10px] text-[#adb5bd] hover:text-[#343a40] px-1">✕</button>` : ''}
      </div>
      <div class="flex items-center gap-1">
        ${SYSTEMS.map(sys => `
          <button data-sys-filter="${sys}"
            class="sys-filter-btn tv text-[10px] font-bold px-2.5 py-1 border transition-colors
              ${_measureSystemFilter === sys
                ? 'bg-[#212529] text-white border-[#212529]'
                : 'border-[rgba(0,0,0,.1)] text-[#6c757d] hover:bg-[#e2e6ea]'}"
            style="${sys !== 'All' && sys !== _measureSystemFilter ? `color:${SYS_COLOR[sys]};border-color:${SYS_COLOR[sys]}33` : ''}">
            ${sys}
          </button>`).join('')}
      </div>
      <div class="tv text-[10px] text-[#adb5bd] whitespace-nowrap">${filteredEntries.length} / ${Object.keys(measures).length}</div>
    </div>`;

  // ── Bulk Edit toolbar (AS only) ─────────────────────────────────────────────
  const bulkToolbar = isOD ? '' : `
    <div class="flex-shrink-0 flex items-center gap-3 flex-wrap px-5 py-2 bg-white border-b border-[rgba(0,0,0,.08)]">
      <span class="ms material-symbols-outlined text-[#6c757d] text-[16px]">format_list_bulleted</span>
      <span class="tv text-[10px] text-[#6c757d] uppercase tracking-widest font-bold whitespace-nowrap">Bulk Edit:</span>
      <select id="cfg-bulk-system" class="tv text-[11px] px-2 py-1 border border-[rgba(0,0,0,.1)] bg-[#f4f6f8] outline-none">
        ${SYSTEMS.map(s => `<option value="${s}" ${_bulkSystem===s?'selected':''}>${s}</option>`).join('')}
      </select>
      <select id="cfg-bulk-field" class="tv text-[11px] px-2 py-1 border border-[rgba(0,0,0,.1)] bg-[#f4f6f8] outline-none">
        <option value="tripHigh"    ${_bulkField==='tripHigh'   ?'selected':''}>Trip High</option>
        <option value="tripLow"     ${_bulkField==='tripLow'    ?'selected':''}>Trip Low</option>
        <option value="nominalHigh" ${_bulkField==='nominalHigh'?'selected':''}>Nominal High</option>
      </select>
      <span class="tv text-[11px] text-[#6c757d]">by</span>
      <input id="cfg-bulk-pct" type="number" value="${_bulkPct}" min="0.1" max="50" step="0.5"
        class="tv text-[11px] w-16 px-2 py-1 border border-[rgba(0,0,0,.1)] bg-[#f4f6f8] text-center outline-none"/>
      <span class="tv text-[11px] text-[#6c757d]">%</span>
      <button id="cfg-bulk-raise" class="flex items-center gap-1 tv text-[11px] px-2.5 py-1 border border-[#159647] text-[#159647] font-bold uppercase hover:bg-[#159647]/10 transition-colors">
        <span class="ms material-symbols-outlined text-[12px]">arrow_upward</span> RAISE
      </button>
      <button id="cfg-bulk-lower" class="flex items-center gap-1 tv text-[11px] px-2.5 py-1 border border-[#e31a1a] text-[#e31a1a] font-bold uppercase hover:bg-[#e31a1a]/10 transition-colors">
        <span class="ms material-symbols-outlined text-[12px]">arrow_downward</span> LOWER
      </button>
      <button id="cfg-bulk-reset" class="tv text-[11px] px-2.5 py-1 border border-[rgba(0,0,0,.15)] text-[#6c757d] font-bold uppercase hover:bg-[#d1d6dc] transition-colors">↺ RESET</button>
    </div>`;

  // ── Analysis toolbar (AS only) ──────────────────────────────────────────────
  const analysisToolbar = isOD ? '' : `
    <div class="flex-shrink-0 flex items-center gap-3 flex-wrap px-5 py-2 bg-[#f4f6f8] border-b border-[rgba(0,0,0,.08)]">
      <span class="ms material-symbols-outlined text-[#6c757d] text-[16px]">science</span>
      <span class="tv text-[10px] text-[#6c757d] uppercase tracking-widest font-bold whitespace-nowrap">Impact Analysis:</span>
      <button id="cfg-btn-whatif" class="flex items-center gap-1.5 tv text-[11px] px-2.5 py-1.5 border border-[#343a40] text-[#343a40] font-bold uppercase hover:bg-[#343a40] hover:text-white transition-colors">
        <span class="ms material-symbols-outlined text-[13px]">bolt</span> WHAT-IF (LIVE)
      </button>
      <button id="cfg-btn-histval" class="flex items-center gap-1.5 tv text-[11px] px-2.5 py-1.5 border border-[#495057] text-[#495057] font-bold uppercase hover:bg-[#495057] hover:text-white transition-colors">
        <span class="ms material-symbols-outlined text-[13px]">history</span> VALIDATE HISTORY
        <span class="tv text-[10px] text-[#adb5bd] ml-1 font-normal normal-case">(${TelemetryBuffer.durationSec().toFixed(0)}s)</span>
      </button>
      <div id="cfg-analysis-panel" class="w-full"></div>
    </div>`;

  const noResults = filteredEntries.length === 0 ? `
    <tr><td colspan="8" class="px-5 py-8 text-center tv text-[11px] text-[#adb5bd] italic">
      No sensors match "${escHtml(_measureSearch)}" in ${_measureSystemFilter} — clear search to show all
    </td></tr>` : '';

  return `
    <div class="flex flex-col h-full">
      ${unitBar}
      ${errorBanner}
      ${saveToolbar}
      ${searchBar}
      ${bulkToolbar}
      ${analysisToolbar}
      <div class="flex-1 overflow-auto">
        <table class="w-full border-collapse">
          <thead>
            <tr class="bg-[#e2e6ea] sticky top-0 z-10">
              ${['Tag','Label','System','Priority','Trip High','Trip Low','Nominal High','Unit']
                .map(h => `<th class="tv text-[10px] text-[#6c757d] uppercase tracking-wider text-left px-3 py-2 border border-[rgba(0,0,0,.06)] whitespace-nowrap">${h}</th>`)
                .join('')}
            </tr>
          </thead>
          <tbody>
            ${noResults}
            ${filteredEntries.map(([key, m]) => _measureRow(key, m, isOD)).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function _measureRow(key, m, readOnly = false) {
  const col     = SYS_COLOR[m.sys] ?? '#6c757d';
  const pc      = _pending[key] ?? {};
  const isDirty = Object.keys(pc).length > 0;
  const rowBg   = isDirty ? 'background:rgba(217,125,6,0.04)' : '';

  const fieldInput = (field, metricVal) => {
    const pendingVal = pc[field];
    const rawVal     = pendingVal !== undefined ? pendingVal : metricVal;
    const { v: displayVal, u: displayUnit } = UnitConverter.convertThreshold(Number(rawVal), m.unit);
    const isPending  = pendingVal !== undefined;
    const hasError   = !!_validationErrors[`${key}_${field}`];
    const errMsg     = _validationErrors[`${key}_${field}`] ?? '';

    const cls = hasError   ? 'border-[#e31a1a] bg-[rgba(227,26,26,.08)] text-[#e31a1a]'
              : isPending  ? 'border-[#d97d06] bg-[rgba(217,125,6,.08)] text-[#d97d06] font-bold'
              :              'border-[rgba(0,0,0,.1)] bg-[#f4f6f8] text-[#212529]';

    if (readOnly) {
      return `<span class="tv text-[11px] font-bold text-[#343a40]">${Number(displayVal).toFixed(1)} <span class="text-[#6c757d] font-normal text-[10px]">${escHtml(displayUnit)}</span></span>`;
    }

    return `
      <div class="relative group">
        <input type="number" step="any"
          data-cfg-measure="${key}" data-cfg-field="${field}"
          data-metric-unit="${escHtml(m.unit)}"
          value="${escHtml(String(Number(displayVal).toFixed(2)))}"
          class="cfg-measure-input tv text-[11px] w-24 px-2 py-1 border transition-colors outline-none focus:border-[#343a40] ${cls}"/>
        ${hasError ? `<div class="absolute left-0 top-full mt-0.5 z-20 hidden group-focus-within:flex group-hover:flex
          bg-[#e31a1a] text-white tv text-[10px] px-2 py-1 whitespace-nowrap shadow-lg pointer-events-none">
          ⚠ ${escHtml(errMsg)}</div>` : ''}
      </div>`;
  };

  const unitCell = () => {
    const displayUnit = UnitConverter.unitLabel(m.unit);
    return `<span class="tv text-[11px] text-[#6c757d]">${escHtml(displayUnit)}</span>`;
  };

  const prioritySelect = () => {
    const pending   = pc['priority'];
    const current   = pending !== undefined ? pending : m.priority;
    const isPending = pending !== undefined;
    if (readOnly) return `<span class="tv text-[11px] text-[#343a40]">${P_LABEL[Number(current)] ?? 'P'+current}</span>`;
    return `<select data-cfg-measure="${key}" data-cfg-field="priority"
      class="cfg-measure-input tv text-[11px] w-32 px-2 py-1 border outline-none focus:border-[#343a40] transition-colors
        ${isPending ? 'border-[#d97d06] bg-[rgba(217,125,6,.08)] text-[#d97d06] font-bold' : 'border-[rgba(0,0,0,.1)] bg-[#f4f6f8] text-[#212529]'}">
      ${[1,2,3].map(p => `<option value="${p}" ${Number(current)===p?'selected':''}>${P_LABEL[p]}</option>`).join('')}
    </select>`;
  };

  return `
    <tr class="sr border-b border-[rgba(0,0,0,.04)]" style="${rowBg}" data-measure-row="${key}">
      <td class="px-3 py-2 border border-[rgba(0,0,0,.06)]">
        <div class="flex items-center gap-1.5">
          ${isDirty ? '<span class="w-1.5 h-1.5 rounded-full bg-[#d97d06] flex-shrink-0 animate-pulse"></span>'
                    : '<span class="w-1.5 h-1.5 flex-shrink-0"></span>'}
          <span class="tv text-[11px] font-bold" style="color:${col}">${escHtml(m.tag)}</span>
        </div>
      </td>
      <td class="px-3 py-2 border border-[rgba(0,0,0,.06)] tv text-[11px] text-[#343a40]">${escHtml(m.label)}</td>
      <td class="px-3 py-2 border border-[rgba(0,0,0,.06)]">
        <span class="tv text-[10px] px-1.5 py-0.5 font-bold" style="border:1px solid ${col}33;color:${col}">${escHtml(m.sys)}</span>
      </td>
      <td class="px-3 py-2 border border-[rgba(0,0,0,.06)]">${prioritySelect()}</td>
      <td class="px-3 py-2 border border-[rgba(0,0,0,.06)]">${fieldInput('tripHigh',    m.tripHigh)}</td>
      <td class="px-3 py-2 border border-[rgba(0,0,0,.06)]">${fieldInput('tripLow',     m.tripLow)}</td>
      <td class="px-3 py-2 border border-[rgba(0,0,0,.06)]">${fieldInput('nominalHigh', m.nominalHigh)}</td>
      <td class="px-3 py-2 border border-[rgba(0,0,0,.06)]">${unitCell()}</td>
    </tr>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 5 — STREAMS
// ══════════════════════════════════════════════════════════════════════════════
function _tabStreams() {
  const streams = ConfigService.get('streams') ?? {};
  return `
    <div class="p-5 space-y-4">
      <div class="tv text-[11px] text-[#6c757d] uppercase tracking-widest">Data Stream Definitions — OPC UA / IEC 62541 / ProtoBuf</div>
      ${Object.entries(streams).map(([id, st]) => {
        const ec = st.enabled ? '#159647' : '#e31a1a';
        return `
          <div class="border border-[rgba(0,0,0,.08)] bg-white p-4">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-3">
                <span class="ms material-symbols-outlined text-[#495057] text-[18px]">stream</span>
                <div>
                  <div class="tv font-bold text-[12px] text-[#212529]">${escHtml(st.label)}</div>
                  <div class="tv text-[10px] text-[#adb5bd] font-mono">${escHtml(id)}</div>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="tv text-[11px] font-bold" style="color:${ec}">${st.enabled?'● ENABLED':'○ DISABLED'}</span>
                <span class="tv text-[11px] px-2 py-0.5 bg-[#e2e6ea] text-[#6c757d]">${escHtml(st.encoding)}</span>
                <span class="tv text-[11px] px-2 py-0.5 bg-[#e2e6ea] text-[#343a40] font-bold">${st.rateMs} ms</span>
              </div>
            </div>
            <div class="tv text-[11px] text-[#6c757d] mb-2">Protocol: <strong class="text-[#343a40]">${escHtml(st.protocol)}</strong></div>
            <div class="flex flex-wrap gap-1.5">
              ${(st.sensors??[]).map(key=>{
                const m=ConfigService.get('measures')?.[key];
                const sc=SYS_COLOR[m?.sys??'']??'#6c757d';
                return `<span class="tv text-[10px] px-2 py-0.5 border font-bold"
                  style="border-color:${sc}44;color:${sc};background:${sc}08">${escHtml(key)}</span>`;
              }).join('')}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 6 — VERSIONS  (Timeline + Visual Diff + Rollback)
// ══════════════════════════════════════════════════════════════════════════════
function _tabVersions() {
  const versions = ConfigService.getVersions();
  const meta     = ConfigService.getMeta();
  const audit    = ConfigService.getAuditLog().slice(0, 20);

  return `
    <div class="p-5 grid grid-cols-3 gap-5">
      <div class="col-span-2">
        <div class="tv text-[11px] text-[#6c757d] uppercase tracking-widest mb-4">
          Version History — ${versions.length} Snapshots (Max 50)
        </div>
        <div class="space-y-2">
          ${versions.slice(0,30).map((v,i) => {
            const isCurrent = v.id === meta.currentVersionId;
            const isFactory = i === versions.length - 1;
            return `
              <div class="border ${isCurrent?'border-[#212529]':'border-[rgba(0,0,0,.08)]'} bg-white">
                <div class="p-3 flex items-start justify-between gap-3">
                  <div class="flex items-start gap-3 flex-1 min-w-0">
                    <div class="flex flex-col items-center flex-shrink-0 mt-0.5">
                      <div class="w-2.5 h-2.5 rounded-full flex-shrink-0 ${isCurrent?'bg-[#159647]':'bg-[#adb5bd]'}"></div>
                      ${i < versions.length-1 ? '<div class="w-px flex-1 bg-[rgba(0,0,0,.08)] mt-1" style="min-height:12px"></div>' : ''}
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="tv text-[12px] font-bold ${isCurrent?'text-[#212529]':'text-[#495057]'}">${escHtml(v.label)}</span>
                        ${isCurrent?'<span class="tv text-[10px] px-1.5 py-0.5 bg-[#212529] text-white font-bold">CURRENT</span>':''}
                        ${isFactory?'<span class="tv text-[10px] px-1.5 py-0.5 bg-[#e2e6ea] text-[#6c757d]">FACTORY</span>':''}
                      </div>
                      <div class="tv text-[11px] text-[#6c757d] mt-0.5">
                        ${escHtml(new Date(v.ts).toLocaleString('it-IT'))} · <strong>${escHtml(v.user)}</strong> [${escHtml(v.role)}]
                      </div>
                      <div class="tv text-[10px] text-[#adb5bd] italic mt-0.5">${escHtml(v.reason)}</div>
                      ${v.changes?.length > 0 ? `
                        <div class="mt-1.5 flex flex-wrap gap-1">
                          ${v.changes.slice(0,4).map(c=>`<span class="tv text-[10px] px-1.5 py-0.5 bg-[rgba(0,0,0,.04)] text-[#6c757d]">
                            ${escHtml(c.path)}: <span class="text-[#e31a1a] line-through">${escHtml(String(c.oldValue))}</span>
                            → <span class="text-[#159647] font-bold">${escHtml(String(c.newValue))}</span>
                          </span>`).join('')}
                          ${v.changes.length>4?`<span class="tv text-[10px] text-[#adb5bd]">+${v.changes.length-4} more</span>`:''}
                        </div>` : ''}
                    </div>
                  </div>
                  <div class="flex gap-1.5 flex-shrink-0">
                    ${v.changes?.length>0?`
                      <button data-cfg-diff="${escHtml(v.id)}"
                        class="cfg-diff-btn tv text-[10px] px-2 py-1 border border-[#495057] text-[#495057] font-bold uppercase hover:bg-[#495057] hover:text-white transition-colors flex items-center gap-1">
                        <span class="ms material-symbols-outlined text-[11px]">compare</span> DIFF
                      </button>`:''}
                    ${!isCurrent&&!isFactory?`
                      <button data-cfg-rollback="${escHtml(v.id)}"
                        class="tv text-[10px] px-2 py-1 border border-[rgba(0,0,0,.1)] text-[#343a40] font-bold uppercase hover:bg-[#d1d6dc] transition-colors">
                        ROLLBACK
                      </button>`:''}
                  </div>
                </div>
                <div id="cfg-diff-${escHtml(v.id)}" class="hidden border-t border-[rgba(0,0,0,.06)]"></div>
              </div>`;
          }).join('')}
        </div>
      </div>
      <div>
        <div class="tv text-[11px] text-[#6c757d] uppercase tracking-widest mb-4">Audit Log (IEC 62443)</div>
        <div class="space-y-1.5">
          ${audit.length===0?'<div class="tv text-[11px] text-[#adb5bd]">No entries yet</div>'
            :audit.map(a=>`
              <div class="border border-[rgba(0,0,0,.06)] bg-white p-2">
                <div class="flex items-center gap-1.5 mb-0.5">
                  <span class="tv text-[10px] font-bold px-1 py-0.5 bg-[#e2e6ea] text-[#495057]">${escHtml(a.action.replace('CONFIG_',''))}</span>
                  <span class="tv text-[10px] font-bold text-[#343a40]">${escHtml(a.version??'')}</span>
                </div>
                <div class="tv text-[10px] text-[#6c757d]">${escHtml(new Date(a.ts).toLocaleString('it-IT'))}</div>
                <div class="tv text-[10px] text-[#343a40]"><strong>${escHtml(a.user)}</strong> [${escHtml(a.role)}]</div>
                <div class="tv text-[10px] text-[#6c757d] mt-0.5 truncate">${escHtml(a.reason)}</div>
              </div>`).join('')}
        </div>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 7 — APPROVALS (AS only — Two-Man Rule / Draft Review)
// ══════════════════════════════════════════════════════════════════════════════
function _tabApprovals(s) {
  const drafts = ConfigService.getDrafts();
  if (drafts.length === 0) {
    return `
      <div class="flex flex-col items-center justify-center h-full gap-4 p-10">
        <span class="ms material-symbols-outlined text-[#159647] text-5xl">check_circle</span>
        <div class="tv text-[13px] text-[#159647] font-bold uppercase tracking-widest">No Pending Approvals</div>
        <div class="tv text-[11px] text-[#6c757d] text-center max-w-xs">
          All submitted OD configuration drafts have been reviewed.
          Operators can submit new drafts from the Measures tab when logged in as OD.
        </div>
      </div>`;
  }

  return `
    <div class="p-5">
      <div class="tv text-[11px] text-[#6c757d] uppercase tracking-widest mb-4">
        Configuration Drafts — Two-Man Integrity Rule (ISA-18.2 Management of Change)
      </div>
      <div class="space-y-4">
        ${drafts.map(d => {
          const isPending  = d.status === 'PENDING';
          const isApproved = d.status === 'APPROVED';
          const statCol    = isPending ? '#d97d06' : isApproved ? '#159647' : '#e31a1a';
          const statBg     = isPending ? 'rgba(217,125,6,.06)' : isApproved ? 'rgba(21,150,71,.06)' : 'rgba(227,26,26,.06)';
          const changes    = Object.entries(d.changes ?? {});

          return `
            <div class="border bg-white" style="border-color:${statCol}33">
              <!-- Draft header -->
              <div class="flex items-start justify-between p-4 border-b border-[rgba(0,0,0,.06)]"
                style="background:${statBg}">
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="tv text-[11px] font-bold px-2 py-0.5 border"
                      style="color:${statCol};border-color:${statCol}44">${d.status}</span>
                    <span class="tv text-[10px] text-[#adb5bd] font-mono">${escHtml(d.id)}</span>
                  </div>
                  <div class="tv text-[12px] font-bold text-[#212529] mb-1">${escHtml(d.reason)}</div>
                  <div class="tv text-[11px] text-[#6c757d]">
                    Submitted by <strong>${escHtml(d.user)}</strong> [${escHtml(d.role)}] ·
                    ${escHtml(new Date(d.ts).toLocaleString('it-IT'))}
                  </div>
                  ${d.approvedBy ? `<div class="tv text-[11px] text-[#159647] mt-1">✓ Approved by ${escHtml(d.approvedBy)} — "${escHtml(d.approvalNote??'')}"</div>` : ''}
                  ${d.rejectedBy ? `<div class="tv text-[11px] text-[#e31a1a] mt-1">✗ Rejected by ${escHtml(d.rejectedBy)} — "${escHtml(d.rejectionNote??'')}"</div>` : ''}
                </div>
                ${isPending ? `
                  <div class="flex gap-2 ml-4 flex-shrink-0">
                    <button data-approve-draft="${escHtml(d.id)}"
                      class="flex items-center gap-1 tv text-[11px] px-3 py-1.5 bg-[#159647] text-white font-bold uppercase hover:bg-[#0e7035] transition-colors">
                      <span class="ms material-symbols-outlined text-[13px]">check</span> APPROVE
                    </button>
                    <button data-reject-draft="${escHtml(d.id)}"
                      class="flex items-center gap-1 tv text-[11px] px-3 py-1.5 border border-[#e31a1a] text-[#e31a1a] font-bold uppercase hover:bg-[#e31a1a]/10 transition-colors">
                      <span class="ms material-symbols-outlined text-[13px]">close</span> REJECT
                    </button>
                  </div>` : ''}
              </div>

              <!-- Proposed changes -->
              <div class="p-4">
                <div class="tv text-[10px] text-[#6c757d] uppercase tracking-widest mb-2">Proposed Changes</div>
                ${changes.length === 0
                  ? '<div class="tv text-[11px] text-[#adb5bd] italic">No specific field changes recorded</div>'
                  : `<table class="w-full border-collapse">
                      <thead>
                        <tr class="bg-[#f4f6f8]">
                          ${['Sensor','Field','Current Value','→ Proposed Value']
                            .map(h=>`<th class="tv text-[10px] text-[#6c757d] uppercase px-3 py-1.5 text-left border border-[rgba(0,0,0,.06)]">${h}</th>`).join('')}
                        </tr>
                      </thead>
                      <tbody>
                        ${changes.flatMap(([key, fields]) => {
                          const current = ConfigService.get('measures')?.[key] ?? {};
                          return Object.entries(fields).map(([field, newVal]) => {
                            const oldVal = current[field] ?? '—';
                            const delta  = typeof newVal === 'number' && typeof oldVal === 'number'
                              ? newVal - oldVal : null;
                            const deltaStr = delta !== null
                              ? `<span class="ml-1 text-[10px] ${delta>0?'text-[#d97d06]':'text-[#159647]'}">(${delta>0?'+':''}${delta.toFixed(2)})</span>`
                              : '';
                            return `<tr class="border-b border-[rgba(0,0,0,.04)]">
                              <td class="px-3 py-1.5 border border-[rgba(0,0,0,.06)] tv text-[11px] font-bold text-[#212529]">${escHtml(current.tag ?? key)}</td>
                              <td class="px-3 py-1.5 border border-[rgba(0,0,0,.06)] tv text-[11px] text-[#6c757d] uppercase">${escHtml(field)}</td>
                              <td class="px-3 py-1.5 border border-[rgba(0,0,0,.06)] tv text-[11px] font-mono text-[#e31a1a] line-through">${escHtml(String(oldVal))}</td>
                              <td class="px-3 py-1.5 border border-[rgba(0,0,0,.06)] tv text-[11px] font-mono font-bold text-[#159647]">
                                ${escHtml(String(newVal))}${deltaStr}
                              </td>
                            </tr>`;
                          });
                        }).join('')}
                      </tbody>
                    </table>`}
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// WHAT-IF ANALYSIS
// ══════════════════════════════════════════════════════════════════════════════
function _runWhatIf(s) {
  const current  = ConfigService.get('measures') ?? {};
  const proposed = _buildProposedMeasures();
  const sensors  = s.sensors ?? {};
  const rows = [];
  let wouldAlarmCount = 0, currentAlarmCount = 0;

  for (const [key, m] of Object.entries(proposed)) {
    const sensor = sensors[key];
    if (!sensor || sensor.v == null) continue;
    const v    = sensor.v;
    const curHi = current[key]?.tripHigh ?? m.tripHigh;
    const curLo = current[key]?.tripLow  ?? m.tripLow;
    const newHi = m.tripHigh, newLo = m.tripLow;
    const curAlarms = (curHi>0&&v>=curHi?1:0)+(curLo>0&&v<=curLo?1:0);
    const newAlarms = (newHi>0&&v>=newHi?1:0)+(newLo>0&&v<=newLo?1:0);
    currentAlarmCount += curAlarms; wouldAlarmCount += newAlarms;
    if (_pending[key]!==undefined || curAlarms!==newAlarms) {
      const status = newAlarms>curAlarms?'NEW ALARM':newAlarms<curAlarms?'CLEARED':newAlarms>0?'STILL ALARM':'NOMINAL';
      const statusCol = status==='NEW ALARM'?'#e31a1a':status==='STILL ALARM'?'#d97d06':status==='CLEARED'?'#159647':'#6c757d';
      rows.push({ tag:m.tag, label:m.label, v:v.toFixed(2), unit:m.unit, curHi, newHi, curLo, newLo, status, statusCol });
    }
  }
  const delta = wouldAlarmCount - currentAlarmCount;
  const deltaCol = delta>0?'#e31a1a':delta<0?'#159647':'#6c757d';
  const summary = delta>0?`⚠ ${delta} MORE alarm${delta!==1?'s':''} would trigger`
                :delta<0?`✓ ${Math.abs(delta)} FEWER alarm${Math.abs(delta)!==1?'s':''} would trigger`
                :'→ No change in alarm count';
  return `
    <div class="mt-2 border border-[rgba(0,0,0,.08)] bg-white">
      <div class="flex items-center justify-between px-4 py-2 bg-[#e2e6ea] border-b border-[rgba(0,0,0,.08)]">
        <span class="tv text-[11px] font-bold uppercase tracking-wider text-[#212529]">⚡ What-If — Live Sensor Snapshot</span>
        <span class="tv text-[12px] font-bold" style="color:${deltaCol}">${summary}</span>
      </div>
      ${rows.length===0?`<div class="px-4 py-3 tv text-[11px] text-[#6c757d] italic">No sensor state changes detected.</div>`:
        `<table class="w-full border-collapse">
          <thead><tr class="bg-[#f4f6f8]">
            ${['Sensor','Value','Cur Hi','→ New Hi','Cur Lo','→ New Lo','Impact']
              .map(h=>`<th class="tv text-[10px] text-[#6c757d] uppercase tracking-wider text-left px-3 py-1.5 border border-[rgba(0,0,0,.06)]">${h}</th>`).join('')}
          </tr></thead>
          <tbody>${rows.map(r=>`<tr class="border-b border-[rgba(0,0,0,.04)]">
            <td class="px-3 py-1.5 border border-[rgba(0,0,0,.06)]"><div class="tv text-[11px] font-bold text-[#212529]">${escHtml(r.tag)}</div></td>
            <td class="px-3 py-1.5 border border-[rgba(0,0,0,.06)] tv text-[11px] font-bold text-[#343a40]">${r.v} ${escHtml(r.unit)}</td>
            <td class="px-3 py-1.5 border border-[rgba(0,0,0,.06)] tv text-[11px] text-[#6c757d]">${r.curHi}</td>
            <td class="px-3 py-1.5 border border-[rgba(0,0,0,.06)] tv text-[11px] font-bold text-[#343a40]">${r.newHi}</td>
            <td class="px-3 py-1.5 border border-[rgba(0,0,0,.06)] tv text-[11px] text-[#6c757d]">${r.curLo}</td>
            <td class="px-3 py-1.5 border border-[rgba(0,0,0,.06)] tv text-[11px] font-bold text-[#343a40]">${r.newLo}</td>
            <td class="px-3 py-1.5 border border-[rgba(0,0,0,.06)]">
              <span class="tv text-[10px] font-bold px-1.5 py-0.5" style="color:${r.statusCol};border:1px solid ${r.statusCol}33">${r.status}</span>
            </td>
          </tr>`).join('')}</tbody>
        </table>`}
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// HISTORICAL VALIDATION
// ══════════════════════════════════════════════════════════════════════════════
function _runHistoricalValidation() {
  const current  = ConfigService.get('measures') ?? {};
  const proposed = _buildProposedMeasures();
  const bufSec   = TelemetryBuffer.durationSec();
  if (bufSec < 10) return `<div class="mt-2 border border-[#d97d06]/30 px-4 py-3 bg-[#d97d06]/05">
    <span class="tv text-[11px] text-[#d97d06] font-bold">⚠ Only ${bufSec.toFixed(0)}s buffered — need ≥10s. Wait for more data.</span></div>`;
  const base = TelemetryBuffer.simulate(current);
  const prop = TelemetryBuffer.simulate(proposed);
  const delta = prop.tripCount - base.tripCount;
  const dc = delta>0?'#e31a1a':delta<0?'#159647':'#6c757d';
  const dl = delta>0?`▲ ${delta} MORE`:(delta<0?`▼ ${Math.abs(delta)} FEWER`:'No change');
  const sensorRows = [...new Set([...Object.keys(base.byKey),...Object.keys(prop.byKey)])]
    .map(key=>{const b=base.byKey[key]??{trips:0,highTrips:0,lowTrips:0};const p=prop.byKey[key]??{trips:0,highTrips:0,lowTrips:0};
      return{key,tag:current[key]?.tag??key,bT:b.trips,pT:p.trips,diff:p.trips-b.trips,bH:b.highTrips,pH:p.highTrips,bL:b.lowTrips,pL:p.lowTrips};
    }).filter(r=>r.bT>0||r.pT>0);
  return `
    <div class="mt-2 border border-[rgba(0,0,0,.08)] bg-white">
      <div class="flex items-center justify-between px-4 py-2 bg-[#e2e6ea] border-b">
        <span class="tv text-[11px] font-bold uppercase tracking-wider text-[#212529]">📊 Historical Validation — ${bufSec.toFixed(0)}s / ${base.sampleCount} samples</span>
        <span class="tv text-[12px] font-bold" style="color:${dc}">${dl} trip events over ${bufSec.toFixed(0)}s</span>
      </div>
      <div class="grid grid-cols-3 divide-x divide-[rgba(0,0,0,.06)] border-b">
        ${[{l:'Current Config Trips',v:base.tripCount,c:'#343a40'},{l:'Proposed Trips',v:prop.tripCount,c:dc},{l:'Net Δ',v:(delta>=0?'+':'')+delta,c:dc}]
          .map(r=>`<div class="px-4 py-3 text-center"><div class="tv text-[10px] text-[#6c757d] uppercase tracking-wider">${r.l}</div>
            <div class="tv text-[22px] font-black mt-1" style="color:${r.c}">${r.v}</div></div>`).join('')}
      </div>
      ${sensorRows.length===0?`<div class="px-4 py-3 tv text-[11px] text-[#6c757d] italic">No trips in buffer for any sensor.</div>`:
        `<table class="w-full border-collapse"><thead><tr class="bg-[#f4f6f8]">
          ${['Sensor','Current (Hi/Lo)','Proposed (Hi/Lo)','Δ'].map(h=>`<th class="tv text-[10px] text-[#6c757d] uppercase px-3 py-1.5 text-left border border-[rgba(0,0,0,.06)]">${h}</th>`).join('')}
        </tr></thead><tbody>
          ${sensorRows.map(r=>{const dc2=r.diff>0?'#e31a1a':r.diff<0?'#159647':'#6c757d';return`<tr class="border-b border-[rgba(0,0,0,.04)]">
            <td class="px-3 py-1.5 border border-[rgba(0,0,0,.06)] tv text-[11px] font-bold">${escHtml(r.tag)}</td>
            <td class="px-3 py-1.5 border border-[rgba(0,0,0,.06)] tv text-[11px]"><span class="font-bold text-[#343a40]">${r.bT}</span> <span class="text-[#6c757d]">(Hi:${r.bH} Lo:${r.bL})</span></td>
            <td class="px-3 py-1.5 border border-[rgba(0,0,0,.06)] tv text-[11px]"><span class="font-bold" style="color:${dc2}">${r.pT}</span> <span class="text-[#6c757d]">(Hi:${r.pH} Lo:${r.pL})</span></td>
            <td class="px-3 py-1.5 border border-[rgba(0,0,0,.06)] tv text-[12px] font-bold" style="color:${dc2}">${r.diff>=0?'+':''}${r.diff}</td>
          </tr>`;}).join('')}
        </tbody></table>`}
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// VISUAL DIFF
// ══════════════════════════════════════════════════════════════════════════════
function _buildDiffHtml(version) {
  if (!version.changes?.length) return `<div class="px-4 py-3 tv text-[11px] text-[#6c757d] italic">No changes recorded.</div>`;
  const groups = {};
  for (const c of version.changes) {
    const grp = c.path.split('.').slice(0,2).join('.');
    if (!groups[grp]) groups[grp] = [];
    groups[grp].push(c);
  }
  return `
    <div class="p-4">
      <div class="tv text-[10px] text-[#6c757d] uppercase tracking-widest mb-3">
        Diff: ${escHtml(version.label)} · ${escHtml(new Date(version.ts).toLocaleString('it-IT'))} · by ${escHtml(version.user)}
      </div>
      <div class="grid grid-cols-2 gap-px bg-[rgba(0,0,0,.08)]">
        <div class="bg-[rgba(227,26,26,.04)] px-3 py-2">
          <div class="tv text-[10px] text-[#e31a1a] font-bold uppercase tracking-widest mb-2">← BEFORE</div>
          ${Object.entries(groups).map(([grp,changes])=>`
            <div class="mb-3"><div class="tv text-[10px] font-bold text-[#343a40] mb-1 uppercase">${escHtml(grp)}</div>
            ${changes.map(c=>{const f=c.path.split('.').pop();return`
              <div class="flex justify-between items-center py-0.5 border-b border-[rgba(227,26,26,.1)]">
                <span class="tv text-[10px] text-[#6c757d]">${escHtml(f)}</span>
                <span class="tv text-[11px] font-mono font-bold text-[#e31a1a] line-through">${escHtml(String(c.oldValue))}</span>
              </div>`}).join('')}</div>`).join('')}
        </div>
        <div class="bg-[rgba(21,150,71,.04)] px-3 py-2">
          <div class="tv text-[10px] text-[#159647] font-bold uppercase tracking-widest mb-2">→ AFTER</div>
          ${Object.entries(groups).map(([grp,changes])=>`
            <div class="mb-3"><div class="tv text-[10px] font-bold text-[#343a40] mb-1 uppercase">${escHtml(grp)}</div>
            ${changes.map(c=>{const f=c.path.split('.').pop();const isNum=typeof c.newValue==='number'&&typeof c.oldValue==='number';
              const arrow=isNum?(c.newValue>c.oldValue?'↑':'↓'):'→';const vc=isNum?(c.newValue>c.oldValue?'#d97d06':'#159647'):'#343a40';
              return`<div class="flex justify-between items-center py-0.5 border-b border-[rgba(21,150,71,.1)]">
                <span class="tv text-[10px] text-[#6c757d]">${escHtml(f)}</span>
                <span class="tv text-[11px] font-mono font-bold" style="color:${vc}">${arrow} ${escHtml(String(c.newValue))}</span>
              </div>`;}).join('')}</div>`).join('')}
        </div>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// BULK EDIT HELPER
// ══════════════════════════════════════════════════════════════════════════════
function _applyBulk(sign) {
  const measures = ConfigService.get('measures') ?? {};
  const pct      = _bulkPct / 100;
  for (const [key, m] of Object.entries(measures)) {
    if (_bulkSystem !== 'All' && m.sys !== _bulkSystem) continue;
    const base = _pending[key]?.[_bulkField] !== undefined
      ? Number(_pending[key][_bulkField]) : Number(m[_bulkField] ?? 0);
    if (base === 0) continue;
    // Convert from display unit back to metric before storing
    const metricBase = UnitConverter.mode === 'imperial'
      ? UnitConverter.toMetric(base, UnitConverter.unitLabel(m.unit)) : base;
    _setPending(key, _bulkField, parseFloat((metricBase * (1 + sign * pct)).toFixed(3)));
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// EVENT BINDINGS
// ══════════════════════════════════════════════════════════════════════════════
function _bindConfigEvents(s) {

  // Tab switching
  document.querySelectorAll('.cfg-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-cfg-tab');
      if (tab) dispatch(A.CONFIG_TAB_CHANGE, { tab });
    });
  });

  // ── AAS Graph zoom + pan ──────────────────────────────────────────────────
  const svg = document.getElementById('aas-graph-svg');
  if (svg && _graphVB) {
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.12 : 0.89;
      _graphVB.w *= factor; _graphVB.h *= factor;
      svg.setAttribute('viewBox', `${_graphVB.x} ${_graphVB.y} ${_graphVB.w} ${_graphVB.h}`);
    }, { passive: false });

    svg.addEventListener('mousedown', e => {
      _graphDragging = true;
      svg.style.cursor = 'grabbing';
      _graphDragStart = { x: e.clientX, y: e.clientY, vbx: _graphVB.x, vby: _graphVB.y };
    });
    const onMove = e => {
      if (!_graphDragging) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = _graphVB.w / (rect.width  || 1);
      const scaleY = _graphVB.h / (rect.height || 1);
      _graphVB.x = _graphDragStart.vbx - (e.clientX - _graphDragStart.x) * scaleX;
      _graphVB.y = _graphDragStart.vby - (e.clientY - _graphDragStart.y) * scaleY;
      svg.setAttribute('viewBox', `${_graphVB.x} ${_graphVB.y} ${_graphVB.w} ${_graphVB.h}`);
    };
    const onUp = () => { _graphDragging = false; if (svg) svg.style.cursor = 'grab'; };
    svg.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp, { once: true });
    document.getElementById('aas-graph-reset')?.addEventListener('click', () => {
      if (!_graphVB) return;
      const origW = svg.viewBox.baseVal.width  || _graphVB.w;
      const origH = svg.viewBox.baseVal.height || _graphVB.h;
      _graphVB = { x:0, y:0, w:origW, h:origH };
      svg.setAttribute('viewBox', `0 0 ${origW} ${origH}`);
    });
  }

  // ── Search & filter ───────────────────────────────────────────────────────
  document.getElementById('cfg-search-input')?.addEventListener('input', e => {
    _measureSearch = e.target.value;
    dispatch(A.CONFIG_TAB_CHANGE, { tab: s.configActiveTab ?? 'measures' });
  });
  document.getElementById('cfg-search-clear')?.addEventListener('click', () => {
    _measureSearch = '';
    dispatch(A.CONFIG_TAB_CHANGE, { tab: s.configActiveTab ?? 'measures' });
  });
  document.querySelectorAll('.sys-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _measureSystemFilter = btn.getAttribute('data-sys-filter') ?? 'All';
      dispatch(A.CONFIG_TAB_CHANGE, { tab: s.configActiveTab ?? 'measures' });
    });
  });

  // ── Measure input changes → pending ──────────────────────────────────────
  document.querySelectorAll('.cfg-measure-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const key       = inp.getAttribute('data-cfg-measure');
      const field     = inp.getAttribute('data-cfg-field');
      const metricUnit = inp.getAttribute('data-metric-unit') ?? '';
      let val = inp.value.trim();
      if (inp.type === 'number') {
        let n = parseFloat(val);
        if (isNaN(n)) n = 0;
        // Convert imperial display value back to metric before storing
        if (UnitConverter.mode === 'imperial' && field !== 'priority') {
          n = UnitConverter.toMetric(n, UnitConverter.unitLabel(metricUnit));
        }
        val = n;
      } else if (field === 'priority') {
        val = parseInt(val, 10) || 1;
      }
      _setPending(key, field, val);
      const row = document.querySelector(`[data-measure-row="${key}"]`);
      if (row) row.style.background = 'rgba(217,125,6,0.04)';
      dispatch(A.CONFIG_TAB_CHANGE, { tab: s.configActiveTab ?? 'measures' });
    });
  });

  // ── AS: Save as new version ───────────────────────────────────────────────
  document.getElementById('cfg-btn-save')?.addEventListener('click', () => {
    if (!Object.keys(_pending).length || _hasErrors()) return;
    const reason = prompt('Reason for this configuration change (required for audit trail):', `Setpoint update by ${s.role}`);
    if (!reason?.trim()) return;
    const currentMeasures = ConfigService.get('measures') ?? {};
    const delta = {};
    for (const [sKey, fields] of Object.entries(_pending)) {
      delta[sKey] = { ...currentMeasures[sKey], ...fields };
    }
    const ok = ConfigService.update('measures', delta, { reason: reason.trim(), role: s.role, user: `Operator (${s.role})` });
    if (ok) { _clearPending(); dispatch(A.LOG, { msg: `Config updated: ${reason.trim()}` }); dispatch(A.CONFIG_TAB_CHANGE, { tab: 'measures' }); }
  });

  // ── OD: Submit draft for AS approval ─────────────────────────────────────
  document.getElementById('cfg-btn-submit-draft')?.addEventListener('click', () => {
    if (!Object.keys(_pending).length) return;
    const reason = prompt('Reason for this proposed change (required for Two-Man review):', `Threshold adjustment — OD request`);
    if (!reason?.trim()) return;
    const draftId = ConfigService.submitDraft(_pending, { reason: reason.trim(), role: s.role, user: `Operator (${s.role})` });
    _clearPending();
    dispatch(A.LOG, { msg: `Draft ${draftId} submitted for AS approval: ${reason.trim()}` });
    alert(`✅ Draft submitted for System Admin approval.\nDraft ID: ${draftId}\nThe AS will see it in the Approvals tab.`);
    dispatch(A.CONFIG_TAB_CHANGE, { tab: 'measures' });
  });

  // ── Discard pending ───────────────────────────────────────────────────────
  document.getElementById('cfg-btn-discard')?.addEventListener('click', () => {
    _clearPending();
    dispatch(A.CONFIG_TAB_CHANGE, { tab: s.configActiveTab ?? 'measures' });
  });

  // ── Bulk edit controls ────────────────────────────────────────────────────
  document.getElementById('cfg-bulk-system')?.addEventListener('change', e => { _bulkSystem = e.target.value; });
  document.getElementById('cfg-bulk-field')?.addEventListener('change',  e => { _bulkField  = e.target.value; });
  document.getElementById('cfg-bulk-pct')?.addEventListener('change',    e => { _bulkPct    = Math.abs(parseFloat(e.target.value) || 5); });
  document.getElementById('cfg-bulk-raise')?.addEventListener('click', () => { _applyBulk(+1); dispatch(A.CONFIG_TAB_CHANGE, { tab: 'measures' }); });
  document.getElementById('cfg-bulk-lower')?.addEventListener('click', () => { _applyBulk(-1); dispatch(A.CONFIG_TAB_CHANGE, { tab: 'measures' }); });
  document.getElementById('cfg-bulk-reset')?.addEventListener('click', () => { _clearPending(); dispatch(A.CONFIG_TAB_CHANGE, { tab: 'measures' }); });

  // ── What-If + Historical Validation ──────────────────────────────────────
  document.getElementById('cfg-btn-whatif')?.addEventListener('click', () => {
    const p = document.getElementById('cfg-analysis-panel');
    if (p) { p.innerHTML = _runWhatIf(s); p.classList.remove('hidden'); }
  });
  document.getElementById('cfg-btn-histval')?.addEventListener('click', () => {
    const p = document.getElementById('cfg-analysis-panel');
    if (p) { p.innerHTML = _runHistoricalValidation(); p.classList.remove('hidden'); }
  });

  // ── Export (signed) ───────────────────────────────────────────────────────
  document.getElementById('cfg-btn-export')?.addEventListener('click', () => {
    const json = ConfigService.exportSigned();
    dlFile(json, `core-sentinel-config-signed-${Date.now()}.json`, 'application/json');
    dispatch(A.LOG, { msg: 'Signed config exported (FNV-64 checksum embedded)' });
  });

  // ── Import (with signature verification) ─────────────────────────────────
  document.getElementById('cfg-file-input')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const result = ConfigService.importSigned(ev.target.result, {
        reason: `Imported from file: ${file.name}`,
        role: s.role, user: `Operator (${s.role})`,
      });
      if (result.ok) {
        alert(`✅ Configuration imported and integrity verified.\n${result.version}`);
        dispatch(A.LOG, { msg: `Config imported & verified: ${file.name}` });
        dispatch(A.CONFIG_TAB_CHANGE, { tab: 'overview' });
      } else {
        alert(`❌ Import FAILED:\n\n${result.error}`);
        if (result.tampered) dispatch(A.LOG, { msg: `⚠ SECURITY: Config import rejected — integrity check failed on ${file.name}` });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // ── Reset to factory ──────────────────────────────────────────────────────
  document.getElementById('cfg-btn-reset')?.addEventListener('click', () => {
    if (!confirm('⚠ Factory reset will discard ALL configuration changes.\nThis action is logged in the audit trail. Continue?')) return;
    ConfigService.reset({ reason: 'Factory reset via SCR-14', role: s.role, user: `Operator (${s.role})` });
    _clearPending();
    dispatch(A.LOG, { msg: 'Platform configuration factory reset' });
    dispatch(A.CONFIG_TAB_CHANGE, { tab: 'overview' });
  });

  // ── Rollback ──────────────────────────────────────────────────────────────
  document.querySelectorAll('[data-cfg-rollback]').forEach(btn => {
    btn.addEventListener('click', () => {
      const vId    = btn.getAttribute('data-cfg-rollback');
      const reason = prompt('Reason for rollback (required):', 'Manual rollback via SCR-14');
      if (!reason?.trim()) return;
      const ok = ConfigService.rollback(vId, { reason: reason.trim(), role: s.role, user: `Operator (${s.role})` });
      if (ok) { _clearPending(); dispatch(A.LOG, { msg: `Config rolled back: ${reason.trim()}` }); dispatch(A.CONFIG_TAB_CHANGE, { tab: 'versions' }); }
    });
  });

  // ── Visual Diff toggle ────────────────────────────────────────────────────
  document.querySelectorAll('.cfg-diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const vId     = btn.getAttribute('data-cfg-diff');
      const diffDiv = document.getElementById(`cfg-diff-${vId}`);
      if (!diffDiv) return;
      if (!diffDiv.classList.contains('hidden')) {
        diffDiv.classList.add('hidden');
        btn.innerHTML = `<span class="ms material-symbols-outlined text-[11px]">compare</span> DIFF`;
        return;
      }
      const version = ConfigService.getVersions().find(v => v.id === vId);
      if (!version) return;
      diffDiv.innerHTML = _buildDiffHtml(version);
      diffDiv.classList.remove('hidden');
      btn.innerHTML = `<span class="ms material-symbols-outlined text-[11px]">expand_less</span> HIDE`;
    });
  });

  // ── AS: Approve draft ─────────────────────────────────────────────────────
  document.querySelectorAll('[data-approve-draft]').forEach(btn => {
    btn.addEventListener('click', () => {
      const draftId = btn.getAttribute('data-approve-draft');
      const note    = prompt('Approval note (optional):', 'Approved — changes verified');
      if (note === null) return; // cancelled
      const ok = ConfigService.approveDraft(draftId, { reason: note.trim() || 'Approved', role: s.role, user: `Operator (${s.role})` });
      if (ok) { dispatch(A.LOG, { msg: `Draft ${draftId} approved and applied by AS` }); dispatch(A.CONFIG_TAB_CHANGE, { tab: 'approvals' }); }
    });
  });

  // ── AS: Reject draft ──────────────────────────────────────────────────────
  document.querySelectorAll('[data-reject-draft]').forEach(btn => {
    btn.addEventListener('click', () => {
      const draftId = btn.getAttribute('data-reject-draft');
      const reason  = prompt('Rejection reason (required for audit):', '');
      if (!reason?.trim()) return;
      ConfigService.rejectDraft(draftId, { reason: reason.trim(), role: s.role, user: `Operator (${s.role})` });
      dispatch(A.LOG, { msg: `Draft ${draftId} rejected by AS: ${reason.trim()}` });
      dispatch(A.CONFIG_TAB_CHANGE, { tab: 'approvals' });
    });
  });
}
