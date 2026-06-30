'use strict';
// Sinottico impianto LFR-4G — live plant synoptic (SCR-05 / CMP-34).
// Inspired by the client's legacy INT9000 SCADA mimic, rebuilt with the spec's
// own color semantics: every sensor is a live tag chip placed on the process
// schematic, colored by DAO.status (green nominal / yellow warning / red alarm /
// grey stale) with provenance-styled borders (measured = solid). Flow legs
// animate; hover shows quality/freshness; the chips react live to the scenario
// engine (launch LOCA on SCR-11 and watch tags here go red). Pure SVG, no deps.

import { S } from '@shared/src/model.js';
import { DAO } from '@shared/src/dao.js';

const SVG = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, kids = []) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, v);
  for (const c of [].concat(kids)) if (c !== null && c !== undefined) el.appendChild(c);
  return el;
}

// DAO.status → mandated color semantics
const STATUS_COLOR = { alarm: 'critical', warning: 'warning', low: 'stale', nominal: 'ok' };
const VAR = k => `var(--c-${k})`;

// equipment block
function block(x, y, w, hgt, label, sub) {
  const g = s('g');
  g.appendChild(s('rect', { x, y, width: w, height: hgt, rx: 5,
    fill: 'var(--surface)', stroke: 'var(--border)', 'stroke-width': 1.4 }));
  g.appendChild(s('text', { x: x + w / 2, y: y + hgt / 2 - 2, 'text-anchor': 'middle',
    'font-size': 12, 'font-weight': 700, fill: 'var(--text)' }));
  g.lastChild.textContent = label;
  if (sub) {
    const t = s('text', { x: x + w / 2, y: y + hgt / 2 + 13, 'text-anchor': 'middle',
      'font-size': 9, fill: 'var(--muted)' });
    t.textContent = sub;
    g.appendChild(t);
  }
  return g;
}

// animated process pipe
function pipe(x1, y1, x2, y2, kind) {
  const g = s('g');
  const col = kind === 'hot' ? VAR('degraded') : kind === 'steam' ? VAR('warning') : '#5b6675';
  g.appendChild(s('line', { x1, y1, x2, y2, stroke: col, 'stroke-width': 5, opacity: .25, 'stroke-linecap': 'round' }));
  const flow = s('line', { x1, y1, x2, y2, stroke: col, 'stroke-width': 2.5,
    'stroke-dasharray': '6 10', 'stroke-linecap': 'round', class: 'syn-flow' });
  g.appendChild(flow);
  return g;
}

// Deterministic connectivity model for the HEALTH flavor (the DAO has no
// link-state yet — FOS will provide it): signal quality derived per tag,
// one edge-attached sensor kept Degraded so the state is demonstrable.
function healthOf(key, snap) {
  let hash = 0;
  for (const ch of snap.tag) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  const quality = 93 + (hash % 7); // 93–99 %
  if (key === 'SEC_FLOW') return { state: 'degraded', quality: 71, via: 'EDGE-03' };
  return { state: 'online', quality, via: hash % 2 ? 'GW-01' : 'GW-02' };
}
const HEALTH_KIND = { online: 'ok', degraded: 'degraded', offline: 'stale' };

// twin-compare values for the TWIN flavor (deterministic offset like CMP-74)
function twinOf(key, snap) {
  let hash = 0;
  for (const ch of snap.tag) hash = (hash * 31 + ch.charCodeAt(0)) % 97;
  const sim = snap.v * (1 + ((hash - 48) / 1000)); // ±4.8 %
  const dev = Math.abs(sim - snap.v) / (snap.v || 1) * 100;
  return { sim, dev };
}

// live sensor tag chip (INT9000-style box) — three flavors of line 2/3:
//   'values' (default): live value, colored by process status
//   'health' (CMP-34):  stato operativo Online/Degraded/Offline + signal quality
//   'twin'   (CMP-44):  reale vs simulato + deviazione %
function tagChip(x, y, key, snap, flavor, onClick) {
  const st = DAO.status(snap);
  const w = 92, hgt = 38;
  let kind, rows;
  if (flavor === 'health') {
    const hs = healthOf(key, snap);
    kind = HEALTH_KIND[hs.state];
    rows = [
      { y: 21, size: 10, color: VAR(kind), text: hs.state.toUpperCase() },
      { y: 33, size: 7.5, color: 'var(--muted)', text: `quality ${hs.quality} % · ${hs.via}` },
    ];
  } else if (flavor === 'twin') {
    const tw = twinOf(key, snap);
    kind = tw.dev > 3 ? 'critical' : tw.dev > 1 ? 'warning' : 'ok';
    rows = [
      { y: 21, size: 10, color: VAR(STATUS_COLOR[st] || 'ok'),
        text: `${Number(snap.v).toFixed(snap.v >= 100 ? 0 : 1)} ${snap.u}` },
      { y: 33, size: 7.5, color: VAR('predicted'),
        text: `sim ${Number(tw.sim).toFixed(tw.sim >= 100 ? 0 : 1)} · Δ ${tw.dev.toFixed(1)} %` },
    ];
  } else {
    kind = STATUS_COLOR[st] || 'ok';
    rows = [
      { y: 24, size: 11, color: VAR(kind),
        text: `${Number(snap.v).toFixed(snap.v >= 100 ? 0 : 1)} ${snap.u}` },
    ];
  }
  const g = s('g', { class: 'syn-chip', transform: `translate(${x},${y})`, style: 'cursor:pointer' });
  const alarmPulse = (flavor !== 'health' && st === 'alarm') || (flavor === 'health' && kind === 'degraded');
  g.appendChild(s('rect', { x: 0, y: 0, width: w, height: hgt, rx: 3,
    fill: 'var(--surface)', stroke: VAR(kind), 'stroke-width': alarmPulse ? 2 : 1.3,
    class: alarmPulse ? 'syn-alarm' : '' }));
  const tag = s('text', { x: 5, y: 11, 'font-size': 8, 'font-weight': 700, fill: 'var(--muted)' });
  tag.textContent = snap.tag;
  g.appendChild(tag);
  for (const r of rows) {
    const t = s('text', { x: 5, y: r.y, 'font-size': r.size, 'font-weight': 700, fill: r.color });
    t.textContent = r.text;
    g.appendChild(t);
  }
  // provenance dot (measured = solid green / simulated overlay = purple)
  g.appendChild(s('circle', { cx: w - 7, cy: 8, r: 3, fill: VAR(flavor === 'twin' ? 'predicted' : 'ok') }));
  const tip = s('title');
  tip.textContent = flavor === 'health'
    ? `${snap.label} (${snap.tag})\nStato collegamento: ${healthOf(key, snap).state} via ${healthOf(key, snap).via}\nSignal quality: ${healthOf(key, snap).quality} % · ultimo dato < 1 s`
    : `${snap.label} (${snap.tag})\nValore: ${snap.v} ${snap.u} · stato: ${st}\nSoglia trip: ${snap.trip} ${snap.u} · Fonte: ${snap.source} · Freshness < 1s`;
  g.appendChild(tip);
  if (onClick) g.addEventListener('click', () => onClick(snap));
  return g;
}

// chip placements on the schematic (viewBox 1000×430): bands above/below the spine
const LAYOUT = {
  CORE_TEMP:   [8,   40],  NEUTRON_FLUX: [110, 40],  COOLANT_OUT: [212, 40],  FUEL_BURNUP: [314, 40],
  LEAD_LEVEL:  [8,   88],  PUMP_A:       [110, 88],  COOLANT_IN:  [212, 88],
  ROD_POS:     [8,  278],  SCRAM_V:      [110, 278], PRIM_PRESS:  [212, 278],
  SG_INLET:    [435, 40],  STEAM_PRESS:  [537, 40],  TURBINE_RPM: [700, 40],
  PUMP_B:      [435, 278], SEC_FLOW:     [537, 278],
  GRID_OUT:    [876, 40],
};

export function renderSynoptic(el, { flavor = 'values', onSensorClick } = {}) {
  el.textContent = '';
  const snap = S.sensors || DAO.snapshot();
  // process-event marker belongs to the value/twin views, not the IoT health map
  const scenario = S.demoMode && flavor !== 'health';

  const svg = s('svg', { viewBox: '0 0 1000 430', width: '100%', style: 'display:block' });

  // section labels
  for (const [x, label] of [[200, 'CIRCUITO PRIMARIO'], [600, 'CIRCUITO SECONDARIO'], [922, 'RETE']]) {
    const t = s('text', { x, y: 22, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700,
      fill: 'var(--muted)', 'letter-spacing': '0.08em' });
    t.textContent = label;
    svg.appendChild(t);
  }

  // pipes (hot/cold/steam legs)
  svg.appendChild(pipe(190, 185, 255, 185, 'hot'));   // vessel → IHX hot
  svg.appendChild(pipe(255, 225, 190, 225, 'cold'));  // IHX → vessel cold
  svg.appendChild(pipe(355, 205, 435, 205, 'hot'));   // IHX → steam gen
  svg.appendChild(pipe(555, 185, 695, 185, 'steam')); // steam gen → turbine
  svg.appendChild(pipe(815, 205, 875, 205, 'cold'));  // turbine → grid
  svg.appendChild(pipe(755, 260, 690, 330, 'cold'));  // turbine → condenser
  svg.appendChild(pipe(600, 357, 500, 357, 'cold'));  // condensate return

  // equipment
  svg.appendChild(block(70, 150, 120, 110, 'REATTORE', 'LFR-4G'));
  svg.appendChild(block(255, 165, 100, 80, 'IHX 03-A', 'scambiatore'));
  svg.appendChild(block(435, 158, 120, 95, 'GEN. VAPORE', 'steam gen'));
  svg.appendChild(block(695, 150, 120, 110, 'TURBINA', 'turbine'));
  svg.appendChild(block(600, 330, 130, 55, 'CONDENS.', 'condenser'));
  svg.appendChild(block(875, 170, 95, 70, 'RETE', 'grid'));

  // scenario leak marker (LOCA)
  if (scenario) {
    const leak = s('g', { transform: 'translate(222,185)' });
    leak.appendChild(s('circle', { cx: 0, cy: 0, r: 9, fill: VAR('critical'), class: 'syn-alarm' }));
    const lt = s('text', { x: 0, y: 26, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 700, fill: VAR('critical') });
    lt.textContent = 'EVENTO ATTIVO';
    leak.appendChild(lt);
    svg.appendChild(leak);
  }

  // live chips
  for (const [key, [x, y]] of Object.entries(LAYOUT)) {
    if (snap[key]) svg.appendChild(tagChip(x, y, key, snap[key], flavor, onSensorClick));
  }

  el.appendChild(svg);

  // per-flavor legend
  el.appendChild((() => {
    const wrap = document.createElement('div');
    wrap.className = 'legend';
    wrap.style.marginTop = '8px';
    const items = flavor === 'health'
      ? [['ok', 'Online'], ['degraded', 'Degraded'], ['stale', 'Offline']]
      : flavor === 'twin'
        ? [['ok', 'Δ < 1 %'], ['warning', 'Δ 1–3 %'], ['critical', 'Δ > 3 %'], ['dot-pred', 'Simulato (twin)']]
        : [['ok', 'Nominale'], ['warning', 'Warning'], ['critical', 'Allarme'], ['stale', 'Stale']];
    for (const [k, label] of items) {
      const lg = document.createElement('span');
      lg.className = 'lg';
      lg.innerHTML = `<span class="sw ${k === 'ok' ? 'solid-ok' : k}"></span>${label}`;
      wrap.appendChild(lg);
    }
    const note = document.createElement('span');
    note.className = 'lg';
    note.style.marginLeft = 'auto';
    note.textContent = flavor === 'health'
      ? 'Hover su un tag per signal quality/gateway · click per dettaglio'
      : 'Hover su un tag per qualità/soglie · click per dettaglio';
    wrap.appendChild(note);
    return wrap;
  })());
}
