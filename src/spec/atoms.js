'use strict';
// Atom renderers — one per visualization standard (Standard visualizzazione sheet).
// Each renderer: (el, ctx) => void, ctx = { component, standard, mode }
// mode: 'interactive' | 'readonly'  (P3 wires this to the role switcher).
// Stub data is deterministic (seeded sine series) — no backend yet by design:
// every atom renders against the data-abstraction stub until FOS APIs exist.

import { registerChart, ensureSeeded, ensureFromVals, getSeries } from './chart-feed.js';

// ── helpers ─────────────────────────────────────────────────────────────

function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c !== null && c !== undefined) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, children = []) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c !== null && c !== undefined) el.appendChild(c);
  return el;
}

// deterministic pseudo-series (seeded; stable across renders)
function series(seed, n, base, amp) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(base
      + amp * Math.sin((i + seed * 7) / 4.1)
      + amp * 0.45 * Math.sin((i * 2.3 + seed * 13) / 2.7));
  }
  return out;
}

function toPoints(vals, w, hgt, min, max) {
  const n = vals.length;
  return vals.map((v, i) => {
    const x = (i / (n - 1)) * w;
    const y = hgt - ((v - min) / (max - min)) * hgt;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

const VAR = name => `var(--c-${name})`;

// compact numeric formatter for on-chart labels (axis + latest value)
function fmtVal(v) {
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

// Multi-series LIVE line chart honoring spec line semantics:
// real = solid green, estimated = dashed blue, predicted = dotted purple.
// Each layer is backed by a chart-feed buffer (keyed signal, or seeded from an
// explicit `vals` array) so the line scrolls in place on every feed tick — the
// y-axis is fixed at creation so only the trace moves, not the whole frame.
let _chartSeq = 0;
function lineChart({ w = 380, hgt = 130, threshold = null, layers, unit = '', showMetric = true, endLabels = false, labels = null }) {
  const id = `chart${++_chartSeq}`;
  // end-labels get a reserved right gutter: traces + gridlines + threshold stop
  // at plotW so the colour-coded numbers never sit under a stroke. No labels →
  // padR 0 → identical geometry to before for every other chart.
  const padR = endLabels ? 58 : 0;
  const plotW = w - padR;
  const specs = layers.map((l, i) => {
    let key = l.key;
    if (key) ensureSeeded(key, l.base ?? 50, l.amp ?? 5);
    else { key = `${id}#${i}`; ensureFromVals(key, l.vals || []); }
    return { key, kind: l.kind, band: l.band || null, unit: l.unit || '' };
  });
  const all = specs.flatMap(sp => getSeries(sp.key));
  const min = Math.min(...all) - 2, max = Math.max(...all) + 2;

  const svg = s('svg', { viewBox: `0 0 ${w} ${hgt}`, width: '100%', height: 'auto', role: 'img' });
  for (let i = 1; i <= 3; i++) {
    const y = (hgt / 4) * i;
    svg.appendChild(s('line', { x1: 0, y1: y, x2: plotW, y2: y, stroke: 'var(--border)', 'stroke-width': .6 }));
  }
  if (threshold !== null && threshold !== undefined) {
    const y = hgt - ((threshold - min) / (max - min)) * hgt;
    svg.appendChild(s('line', {
      x1: 0, y1: y, x2: plotW, y2: y,
      stroke: VAR('critical'), 'stroke-width': 1, 'stroke-dasharray': '8 4', opacity: .8,
    }));
    svg.appendChild(s('text', {
      x: plotW - 4, y: y - 4, 'text-anchor': 'end', 'font-size': 9,
      fill: VAR('critical'), text: 'SOGLIA',
    }));
  }
  const DASH = { real: null, estimated: '7 5', predicted: '2 4' };
  const COL  = { real: VAR('ok'), estimated: VAR('estimated'), predicted: VAR('predicted'), stale: VAR('stale'), warning: VAR('warning'), degraded: VAR('degraded') };
  const drawn = specs.map(sp => {
    const bandEl = sp.band ? s('polygon', { fill: COL[sp.kind] || COL.real, opacity: .12 }) : null;
    if (bandEl) svg.appendChild(bandEl);
    const pl = s('polyline', {
      fill: 'none', stroke: COL[sp.kind] || COL.real, 'stroke-width': 1.8,
      ...(DASH[sp.kind] ? { 'stroke-dasharray': DASH[sp.kind] } : {}),
    });
    svg.appendChild(pl);
    return { ...sp, pl, bandEl };
  });

  // marker dot riding the latest point of the primary trace
  const primary = drawn.find(d => d.kind === 'real') || drawn[0];
  const dot = primary ? s('circle', { r: 2.6, fill: COL[primary.kind] || COL.real }) : null;
  if (dot) svg.appendChild(dot);

  // multi-variable charts: one value label per line in the right gutter, each
  // tied to its trace end by a leader line and de-collided vertically in redraw
  // (a single big number is meaningless with many lines). Built in a top layer
  // so labels always paint above every trace; haloed (paint-order:stroke) so the
  // few strokes near them don't mask the digits.
  const labelLayer = endLabels ? s('g', { 'paint-order': 'stroke' }) : null;
  const endEls = endLabels ? drawn.map(d => {
    const col = COL[d.kind] || COL.real;
    const leader = s('line', { stroke: col, 'stroke-width': 1, opacity: 0 });
    const t = s('text', {
      'text-anchor': 'start', 'font-size': 9, 'font-weight': 700, fill: col,
      stroke: 'var(--surface)', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'paint-order': 'stroke',
    });
    labelLayer.appendChild(leader);
    labelLayer.appendChild(t);
    return { leader, t };
  }) : null;
  if (labelLayer) svg.appendChild(labelLayer);

  // single-value trends get a clean HTML metric header (big live value + unit);
  // multi-series charts rely on per-line end labels + the readouts above them.
  let valEl = null;
  let out = svg;
  if (showMetric && !endLabels && primary) {
    out = h('div', {}, [
      h('div', { class: 'trend-metric' }, [
        (valEl = h('span', { class: 'trend-val' })),
        unit ? h('span', { class: 'trend-unit', text: unit }) : null,
      ]),
      svg,
    ]);
  }

  function redraw() {
    for (const d of drawn) {
      const vals = getSeries(d.key);
      if (!vals.length) continue;
      d.pl.setAttribute('points', toPoints(vals, plotW, hgt, min, max));
      if (d.bandEl) {
        const up = toPoints(vals.map(v => v + d.band), plotW, hgt, min, max);
        const dnP = toPoints(vals.map(v => v - d.band).reverse(), plotW, hgt, min, max).split(' ').map(p => {
          const [x, y] = p.split(','); return `${(plotW - parseFloat(x)).toFixed(1)},${y}`;
        }).join(' ');
        d.bandEl.setAttribute('points', `${up} ${dnP}`);
      }
    }
    if (primary) {
      const pv = getSeries(primary.key);
      if (pv.length) {
        const last = pv[pv.length - 1];
        if (dot) {
          dot.setAttribute('cx', (plotW - 1.5).toFixed(1));
          dot.setAttribute('cy', (hgt - ((last - min) / (max - min)) * hgt).toFixed(1));
        }
        if (valEl) valEl.textContent = fmtVal(last);
      }
    }
    if (endEls) {
      const LH = 11, TOP = 8, BOT = hgt - 3;
      // 1. ideal slot = clamped trace-end y; label text = the readout string when
      //    supplied (so on-chart value is identical to the readout above), else
      //    the chart-feed endpoint.
      const items = [];
      drawn.forEach((d, i) => {
        const vals = getSeries(d.key);
        if (!vals.length) return;
        const last = vals[vals.length - 1];
        const yEnd = hgt - ((last - min) / (max - min)) * hgt;
        const txt = (labels && labels[d.key] != null)
          ? labels[d.key]
          : fmtVal(last) + (d.unit ? ` ${d.unit}` : '');
        items.push({ i, yEnd, yIdeal: Math.max(TOP, Math.min(BOT, yEnd)), txt });
      });
      // 2. de-collide: sort by ideal y, push each ≥ LH below the previous, then a
      //    back-pass up if the stack ran past the bottom.
      items.sort((a, b) => a.yIdeal - b.yIdeal);
      let prev = TOP - LH;
      for (const it of items) { it.y = Math.max(it.yIdeal, prev + LH); prev = it.y; }
      if (items.length && items[items.length - 1].y > BOT) {
        let next = BOT + LH;
        for (let k = items.length - 1; k >= 0; k--) { items[k].y = Math.min(items[k].y, next - LH); next = items[k].y; }
        if (items[0].y < TOP) items[0].y = TOP;
      }
      // 3. write back: leader from trace end → slot, text in the gutter.
      const live = new Set();
      for (const it of items) {
        live.add(it.i);
        const e = endEls[it.i];
        e.t.setAttribute('x', (plotW + 6).toFixed(1));
        e.t.setAttribute('y', (it.y + 3).toFixed(1));
        e.t.textContent = it.txt;
        e.leader.setAttribute('x1', plotW.toFixed(1));
        e.leader.setAttribute('y1', it.yEnd.toFixed(1));
        e.leader.setAttribute('x2', (plotW + 4).toFixed(1));
        e.leader.setAttribute('y2', it.y.toFixed(1));
        e.leader.setAttribute('opacity', '.7');
      }
      endEls.forEach((e, i) => { if (!live.has(i)) { e.t.textContent = ''; e.leader.setAttribute('opacity', '0'); } });
    }
  }
  redraw();
  registerChart(svg, redraw);
  return out;
}

// Cell descriptors let the data layer (live-data.js) describe rich cells
// without building DOM: {b:[kind,text]} → badge, plain string → text.
function cell(c) {
  if (c && typeof c === 'object' && !(c instanceof Node) && c.b) return badge(c.b[0], c.b[1]);
  return c;
}

// Sortable table — "Sorting" is a mandated interaction on every table standard
// (TABLE/KPI_TABLE/ALARM/AUDIT_STD_01): click a header to toggle asc/desc.
function stdTable(cols, rows, opts = {}) {
  const { onRowClick = null, selectedIndex = null } = opts;
  const tbody = h('tbody', {}, rows.map((r, ri) => {
    const tr = h('tr', {}, r.map(c => {
      const v = cell(c);
      return h('td', {}, typeof v === 'string' ? [v] : [v]);
    }));
    if (onRowClick) {
      tr.style.cursor = 'pointer';
      if (ri === selectedIndex) tr.className = 'selected';
      // a click selects the row, EXCEPT clicks on an action button (e.g. ack)
      tr.addEventListener('click', e => { if (!e.target.closest('button')) onRowClick(ri); });
    }
    return tr;
  }));
  const dirs = {};
  const thead = h('thead', {}, h('tr', {}, cols.map((c, i) =>
    h('th', { text: c, style: c ? 'cursor:pointer' : '', title: c ? 'Ordina' : '' }))));
  thead.addEventListener('click', e => {
    const th = e.target.closest('th');
    if (!th || !th.textContent) return;
    const i = [...th.parentElement.children].indexOf(th);
    const dir = dirs[i] = -(dirs[i] || -1);
    const trs = [...tbody.children];
    trs.sort((a, b) => {
      const x = a.children[i]?.textContent.trim() || '', y = b.children[i]?.textContent.trim() || '';
      const nx = parseFloat(x.replace(',', '.')), ny = parseFloat(y.replace(',', '.'));
      const cmp = (!isNaN(nx) && !isNaN(ny)) ? nx - ny : x.localeCompare(y);
      return cmp * dir;
    });
    trs.forEach(tr => tbody.appendChild(tr));
  });
  return h('table', { class: 'std-table' }, [thead, tbody]);
}

function badge(kind, text) { return h('span', { class: `badge ${kind}`, text }); }

function ack(el, mode, label = 'Acknowledge') {
  return h('button', {
    class: 'btn', text: label,
    ...(mode === 'readonly' ? { disabled: 'true', title: 'Sola lettura per il ruolo corrente' } : {}),
  });
}

// ── renderers, keyed by ID_STANDARD ────────────────────────────────────

export const ATOMS = {

  TREND_STD_01(el, ctx) { // Trend multi-sorgente — live layers from the DAO when bound
    const d = ctx?.data;
    el.appendChild(lineChart(d?.layers
      ? { layers: d.layers, threshold: d.threshold, unit: d.unit, showMetric: d.showMetric, endLabels: d.endLabels, labels: d.labels }
      : {
          threshold: 86,
          layers: [
            { kind: 'real',      vals: series(1, 40, 70, 6) },
            { kind: 'estimated', vals: series(2, 40, 74, 5) },
            { kind: 'predicted', vals: series(3, 40, 78, 4), band: 3 },
          ],
        }));
    if (d?.meta) {
      el.appendChild(h('div', { style: 'margin-top:6px;font:11px var(--mono);color:var(--muted)', text: d.meta }));
    }
  },

  KPI_STD_01(el, ctx) { // Indicatore KPI — per-CMP kpis when bound
    if (ctx?.data?.kpis) {
      el.appendChild(h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px' },
        ctx.data.kpis.map(k => h('div', {}, [
          h('div', { style: 'font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em', text: k.label }),
          h('div', { class: 'kpi-value', style: 'font-size:22px' }, [String(k.value),
            k.unit ? h('span', { class: 'kpi-unit', text: k.unit }) : null]),
          k.delta ? h('div', { class: `kpi-delta ${k.deltaKind || 'up'}`, text: k.delta }) : null,
          k.badge ? h('div', { style: 'margin-top:3px' }, [badge(k.badge[0], k.badge[1])]) : null,
        ]))));
      return;
    }
    el.appendChild(h('div', {}, [
      h('div', { class: 'kpi-value' }, ['542.4', h('span', { class: 'kpi-unit', text: '°C' })]),
      h('div', { class: 'kpi-delta up', text: '▲ +1.2% vs ultima ora' }),
      h('div', { style: 'margin-top:8px' }, [badge('ok', 'NOMINALE'), ' ', badge('estimated', 'STIMATO')]),
    ]));
  },

  KPI_TABLE_STD_01(el) { // Tabella KPI / ranking
    el.appendChild(stdTable(
      ['KPI', 'Valore', 'Target', 'Stato'],
      [
        ['Disponibilità sensori', '98.2 %', '≥ 95 %', badge('ok', 'OK')],
        ['Latenza acquisizione', '740 ms', '≤ 1 s', badge('ok', 'OK')],
        ['Copertura virtuale', '83 %', '≥ 90 %', badge('warning', 'SOTTO TARGET')],
        ['Allarmi non gestiti', '3', '0', badge('critical', 'CRITICO')],
      ],
    ));
  },

  ALARM_STD_01(el, ctx) { // Lista allarmi / alert — live S.alarms or per-CMP table
    if (ctx?.data?.cols) { // generic per-CMP table (dettaglio, storico, threat list, …)
      el.appendChild(stdTable(ctx.data.cols, ctx.data.rows,
        { onRowClick: ctx.data.onRowClick, selectedIndex: ctx.data.selectedIndex }));
      return;
    }
    const live = ctx?.data?.alarms;
    const rows = live
      ? live.map(a => {
          const btn = ack(el, a.acked ? 'readonly' : ctx.mode, a.acked ? 'Ack ✓' : 'Acknowledge');
          if (!a.acked && ctx.mode !== 'readonly' && ctx.data.onAckOne) {
            btn.addEventListener('click', () => ctx.data.onAckOne(a.id)); // single alarm, not all
          }
          return [badge(a.sev, a.sevLabel), a.tag, a.tipo || 'Process',
                  badge(a.acked ? 'stale' : 'warning', a.acked ? 'ACK' : 'ACTIVE'),
                  a.msg, a.ackBy || '—', btn];
        })
      : [
          [badge('critical', 'CRIT'), 'TC-04', 'Sensor', badge('warning', 'ACTIVE'), 'Temperatura oltre soglia critica', '—', ack(el, ctx.mode)],
          [badge('warning', 'WARN'), 'PT-02', 'Process', badge('warning', 'ACTIVE'), 'Pressione in avvicinamento soglia', '—', ack(el, ctx.mode)],
          [badge('degraded', 'DEGR'), 'VS-07', 'Model', badge('stale', 'ACK'), 'Sensore virtuale in fallback', 'OD', ack(el, ctx.mode)],
        ];
    el.appendChild(stdTable(['Sev.', 'Asset', 'Tipo', 'Stato', 'Messaggio', 'Responsabile', ''], rows,
      { onRowClick: ctx?.data?.onRowClick, selectedIndex: ctx?.data?.selectedIndex }));
  },

  STATE_STD_01(el, ctx) { // Stato sistema / servizio — live rows when bound
    const rows = ctx?.data?.rows || [
      ['ok', 'Acquisizione sensori', 'Operativo'],
      ['ok', 'Pipeline AI / modelli', 'Operativo'],
      ['degraded', 'Rete IoT — nodo EDGE-03', 'Degradato'],
      ['stale', 'Stream ottico', 'Ultimo dato 12 min fa'],
    ];
    el.appendChild(h('div', {}, rows.map(([k, name, st]) =>
      h('div', { class: 'state-row' }, [
        h('span', { class: `dot ${k}` }),
        h('strong', { text: name }),
        h('span', { style: 'color:var(--muted);margin-left:auto', text: st }),
      ]))));
  },

  TABLE_STD_01(el, ctx) { // Tabella operativa generica — per-CMP rows when bound
    if (ctx?.data?.cols) { // e.g. CMP-18 selectable sensor list (row → detail)
      el.appendChild(stdTable(ctx.data.cols, ctx.data.rows,
        { onRowClick: ctx.data.onRowClick, selectedIndex: ctx.data.selectedIndex }));
      return;
    }
    el.appendChild(stdTable(
      ['ID', 'Sensore', 'Valore', 'Unità', 'Qualità'],
      [
        ['TC-01', 'Core inlet temp', '398.6', '°C', badge('ok', 'MISURATO')],
        ['TC-02', 'Core outlet temp', '542.4', '°C', badge('ok', 'MISURATO')],
        ['VS-07', 'Coolant flow (virtuale)', '1 042', 'kg/s', badge('estimated', 'STIMATO')],
        ['PT-02', 'Primary pressure', '15.4', 'MPa', badge('stale', 'STALE')],
      ],
    ));
  },

  AUDIT_STD_01(el, ctx) { // Log / audit trail — per-CMP cols/rows when bound
    if (ctx?.data?.cols) {
      el.appendChild(stdTable(ctx.data.cols, ctx.data.rows));
      return;
    }
    el.appendChild(stdTable(
      ['Timestamp', 'Utente', 'Azione', 'Esito'],
      [
        ['2026-06-11 10:44', 'op.rossi (OL)', 'ACK allarme ALM-0412', badge('ok', 'OK')],
        ['2026-06-11 10:21', 'diag.bianchi (OD)', 'Modifica soglia TC-04', badge('ok', 'OK')],
        ['2026-06-11 09:58', 'admin.verdi (AS)', 'Creazione utente', badge('ok', 'OK')],
        ['2026-06-11 09:31', 'sconosciuto', 'Login fallito (×3)', badge('critical', 'FAIL')],
      ],
    ));
  },

  FORM_STD_01(el, ctx) { // Form di configurazione — per-CMP fields when bound
    const ro = ctx.mode === 'readonly' ? { disabled: 'true' } : {};
    const d = ctx?.data;
    if (d?.fields) {
      const inputs = {};
      const errEls = {};
      if (d.banner) { // running-state / status banner above the form
        el.appendChild(h('div', { class: 'state-row', style: 'margin-bottom:10px' }, [
          h('span', { class: `dot ${d.banner[0]}` }),
          h('strong', { text: d.banner[1] }),
          d.banner[2] ? h('span', { style: 'color:var(--muted);margin-left:auto;font-size:11.5px', text: d.banner[2] }) : null,
        ]));
      }
      const form = h('div', {}, d.fields.map(f => {
        const input = f.options
          ? h('select', { ...ro }, f.options.map(o => h('option', { text: o, ...(o === f.value ? { selected: 'true' } : {}) })))
          : h('input', { type: f.type || 'text', value: String(f.value ?? ''), ...ro });
        inputs[f.label] = input;
        const errEl = errEls[f.label] = h('span', { class: 'form-err' });
        return h('div', { class: 'form-row' }, [h('label', { text: f.label }), input, errEl]);
      }));
      const btnRow = h('div', { style: 'display:flex;gap:8px' });
      let saveBtn = null;
      // live validation (FORM_STD_01 mandates "validazione errori"): runs on every
      // edit, paints per-field errors, disables Save while anything is invalid.
      const values = () => Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value]));
      const runValidate = () => {
        if (!d.validate) return true;
        const errs = d.validate(values()) || {};
        let ok = true;
        for (const [label, el2] of Object.entries(errEls)) { el2.textContent = errs[label] || ''; if (errs[label]) ok = false; }
        if (saveBtn) saveBtn.disabled = !ok || ctx.mode === 'readonly';
        return ok;
      };
      if (d.validate) Object.values(inputs).forEach(i => { i.addEventListener('input', runValidate); i.addEventListener('change', runValidate); });
      if (d.submit) {
        saveBtn = h('button', {
          class: 'btn primary', text: d.submit.label,
          ...((ctx.mode === 'readonly' || d.submit.disabled) ? { disabled: 'true' } : {}),
          onclick: () => runValidate() && d.submit.onSubmit && d.submit.onSubmit(values()),
        });
        btnRow.appendChild(saveBtn);
      }
      if (d.secondary) {
        btnRow.appendChild(h('button', {
          class: 'btn', text: d.secondary.label, ...ro,
          onclick: () => d.secondary.onClick && d.secondary.onClick(),
        }));
      }
      form.appendChild(btnRow);
      el.appendChild(form);
      if (d.validate) runValidate(); // initial pass
      return;
    }
    el.appendChild(h('div', {}, [
      h('div', { class: 'form-row' }, [
        h('label', { text: 'Soglia critica (°C)' }),
        h('input', { type: 'number', value: '560', ...ro }),
      ]),
      h('div', { class: 'form-row' }, [
        h('label', { text: 'Finestra media mobile' }),
        h('select', { ...ro }, ['30 s', '1 min', '5 min'].map(o => h('option', { text: o }))),
      ]),
      h('button', { class: 'btn primary', text: 'Salva configurazione', ...ro }),
    ]));
  },

  ACTION_STD_01(el, ctx) { // Azione singola — per-CMP status + actions when bound
    const ro = ctx.mode === 'readonly' ? { disabled: 'true' } : {};
    const d = ctx?.data;
    if (d?.actions) {
      const box = h('div', {});
      if (d.status) {
        box.appendChild(h('div', { class: 'state-row' }, [
          h('span', { class: `dot ${d.status[0]}` }),
          h('strong', { text: d.status[1] }),
          d.status[2] ? h('span', { style: 'color:var(--muted);margin-left:auto;font-size:11.5px', text: d.status[2] }) : null,
        ]));
      }
      box.appendChild(h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px' },
        d.actions.map(a => h('button', {
          class: `btn${a.primary ? ' primary' : ''}${a.danger ? ' danger' : ''}`,
          text: a.label,
          ...(a.enabled === false ? { disabled: 'true' } : ro),
          onclick: () => a.onClick && ctx.mode !== 'readonly' && a.onClick(),
        }))));
      el.appendChild(box);
      return;
    }
    el.appendChild(h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
      h('button', { class: 'btn primary', text: 'Esporta report', ...ro }),
      h('button', { class: 'btn', text: 'Annulla' }),
    ]));
  },

  ACTION_PANEL_STD_01(el, ctx) { // Pannello azioni con stato
    const ro = ctx.mode === 'readonly' ? { disabled: 'true' } : {};
    el.appendChild(h('div', {}, [
      h('div', { class: 'state-row' }, [
        h('span', { class: 'dot warning' }),
        h('strong', { text: 'Calibrazione TC-04' }),
        h('span', { style: 'color:var(--muted);margin-left:auto', text: 'In attesa approvazione' }),
      ]),
      h('div', { style: 'display:flex;gap:8px;margin-top:10px' }, [
        h('button', { class: 'btn primary', text: 'Approva', ...ro }),
        h('button', { class: 'btn danger', text: 'Rifiuta', ...ro }),
        h('button', { class: 'btn', text: 'Dettagli' }),
      ]),
    ]));
  },

  MAP_STD_01(el) { // Mappa asset / sensori
    const svg = s('svg', { viewBox: '0 0 380 150', width: '100%' });
    svg.appendChild(s('rect', { x: 10, y: 10, width: 360, height: 130, rx: 6, fill: 'var(--surface-2)', stroke: 'var(--border)' }));
    // sala / zone outlines
    svg.appendChild(s('rect', { x: 30, y: 28, width: 130, height: 95, fill: 'none', stroke: 'var(--border)', 'stroke-width': 1.2 }));
    svg.appendChild(s('rect', { x: 180, y: 28, width: 80, height: 60, fill: 'none', stroke: 'var(--border)', 'stroke-width': 1.2 }));
    svg.appendChild(s('rect', { x: 280, y: 28, width: 70, height: 95, fill: 'none', stroke: 'var(--border)', 'stroke-width': 1.2 }));
    // plant-area labels (Mappatura: mappa asset/sensori dell'impianto)
    const zones = [[95, 24, 'EDIFICIO REATTORE'], [220, 24, 'SALA POMPE'], [315, 24, 'NODI EDGE IoT']];
    for (const [x, y, label] of zones) {
      svg.appendChild(s('text', { x, y, 'text-anchor': 'middle', 'font-size': 7.5, fill: 'var(--muted)', 'font-weight': 700, text: label }));
    }
    const pts = [[60, 50, 'ok', 'TC-01'], [110, 80, 'ok', 'TC-02'], [140, 105, 'warning', 'PT-02'], [210, 55, 'ok', 'FL-01'], [240, 75, 'stale', 'VS-07'], [310, 50, 'ok', 'GW-01'], [330, 100, 'critical', 'EDGE-03']];
    for (const [x, y, k, tag] of pts) {
      svg.appendChild(s('circle', { cx: x, cy: y, r: 6, fill: VAR(k), stroke: '#fff', 'stroke-width': 1.5 }));
      svg.appendChild(s('text', { x, y: y + 15, 'text-anchor': 'middle', 'font-size': 7, fill: 'var(--muted)', text: tag }));
    }
    el.appendChild(svg);
  },

  TOPOLOGY_STD_01(el) { // Topologia rete
    const svg = s('svg', { viewBox: '0 0 380 150', width: '100%' });
    const nodes = [
      [190, 26, 'GATEWAY', 'ok'], [80, 80, 'EDGE-01', 'ok'], [190, 80, 'EDGE-02', 'ok'],
      [300, 80, 'EDGE-03', 'degraded'], [40, 128, 'S-01', 'ok'], [120, 128, 'S-02', 'ok'],
      [190, 128, 'S-03', 'warning'], [260, 128, 'S-04', 'stale'], [340, 128, 'S-05', 'ok'],
    ];
    const edges = [[0, 1], [0, 2], [0, 3], [1, 4], [1, 5], [2, 6], [3, 7], [3, 8]];
    for (const [a, b] of edges) {
      const ka = nodes[a], kb = nodes[b];
      const bad = ka[3] === 'degraded' || kb[3] === 'degraded';
      svg.appendChild(s('line', {
        x1: ka[0], y1: ka[1], x2: kb[0], y2: kb[1],
        stroke: bad ? VAR('degraded') : 'var(--border)', 'stroke-width': bad ? 1.6 : 1.2,
        ...(bad ? { 'stroke-dasharray': '5 3' } : {}),
      }));
    }
    for (const [x, y, label, k] of nodes) {
      svg.appendChild(s('circle', { cx: x, cy: y, r: 8, fill: VAR(k), stroke: '#fff', 'stroke-width': 1.5 }));
      svg.appendChild(s('text', { x, y: y + 20, 'text-anchor': 'middle', 'font-size': 8.5, fill: 'var(--muted)', text: label }));
    }
    el.appendChild(svg);
  },

  HEATMAP_STD_01(el) { // Heatmap anomalie
    const svg = s('svg', { viewBox: '0 0 380 140', width: '100%' });
    const cw = 34, ch = 24;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 10; c++) {
        const v = Math.abs(Math.sin(r * 3.7 + c * 1.3));
        const col = v > .92 ? VAR('critical') : v > .75 ? VAR('warning') : v > .5 ? '#bccfe8' : 'var(--surface-2)';
        svg.appendChild(s('rect', { x: 14 + c * (cw + 2), y: 8 + r * (ch + 2), width: cw, height: ch, rx: 3, fill: col, stroke: 'var(--border)', 'stroke-width': .5 }));
      }
    }
    el.appendChild(svg);
  },

  CORR_STD_01(el) { // Matrice correlazione
    const names = ['TC-01', 'TC-02', 'PT-02', 'FL-01', 'VS-07'];
    const svg = s('svg', { viewBox: '0 0 380 160', width: '100%' });
    const cell = 24, ox = 60, oy = 28;
    names.forEach((n, i) => {
      svg.appendChild(s('text', { x: ox - 6, y: oy + i * cell + 16, 'text-anchor': 'end', 'font-size': 8.5, fill: 'var(--muted)', text: n }));
      svg.appendChild(s('text', { x: ox + i * cell + 12, y: oy - 8, 'text-anchor': 'middle', 'font-size': 8.5, fill: 'var(--muted)', text: n }));
      names.forEach((_, j) => {
        const v = i === j ? 1 : Math.abs(Math.sin(i * 2.1 + j * 3.3));
        const op = (v * 0.9 + 0.1).toFixed(2);
        svg.appendChild(s('rect', {
          x: ox + j * cell, y: oy + i * cell, width: cell - 2, height: cell - 2, rx: 2,
          fill: VAR(v > .8 ? 'predicted' : 'estimated'), opacity: op,
        }));
      });
    });
    el.appendChild(svg);
  },

  TWIN_COMPARE_STD_01(el, ctx) { // Confronto reale vs simulato
    el.appendChild(lineChart({
      unit: ctx?.data?.unit, // big real value (showMetric default) + Δ% meta below
      layers: ctx?.data?.layers || [
        { kind: 'real',      vals: series(5, 40, 60, 7) },
        { kind: 'predicted', vals: series(5.4, 40, 61, 7), band: 2.5 }, // twin output
      ],
    }));
    el.appendChild(h('div', { class: 'legend', style: 'margin-top:6px' }, [
      h('span', { class: 'lg' }, [h('span', { class: 'sw solid-ok' }), 'Reale (misurato)']),
      h('span', { class: 'lg' }, [h('span', { class: 'sw dot-pred' }), 'Simulato (Digital Twin)']),
      ctx?.data?.meta ? h('span', { class: 'lg', style: 'margin-left:auto;font-weight:600', text: ctx.data.meta }) : null,
    ]));
  },

  TWIN_3D_STD_01(el) { // Visualizzazione 3D Twin — live three.js arriva in SCR-11
    const stub = h('div', { class: 'media-stub' }, [
      h('span', { text: '3D TWIN VIEWPORT — live in SCR-11' }),
    ]);
    const svg = s('svg', { viewBox: '0 0 120 70', style: 'position:absolute;left:12px;bottom:8px;width:110px;opacity:.8' });
    // isometric vessel hint
    svg.appendChild(s('ellipse', { cx: 60, cy: 18, rx: 26, ry: 9, fill: 'none', stroke: '#5d6c7d', 'stroke-width': 1.5 }));
    svg.appendChild(s('line', { x1: 34, y1: 18, x2: 34, y2: 50, stroke: '#5d6c7d', 'stroke-width': 1.5 }));
    svg.appendChild(s('line', { x1: 86, y1: 18, x2: 86, y2: 50, stroke: '#5d6c7d', 'stroke-width': 1.5 }));
    svg.appendChild(s('ellipse', { cx: 60, cy: 50, rx: 26, ry: 9, fill: 'none', stroke: '#5d6c7d', 'stroke-width': 1.5 }));
    stub.appendChild(svg);
    el.appendChild(stub);
  },

  VIDEO_STREAM_STD_01(el) { // Streaming video
    el.appendChild(h('div', { class: 'media-stub' }, [
      h('span', { class: 'rec', text: 'LIVE' }),
      h('span', { text: 'CAM-02 — HALL A · 1080p · 25 fps' }),
    ]));
  },

  VIDEO_OVERLAY_STD_01(el) { // Video con overlay dati
    const box = h('div', { class: 'media-stub' }, [
      h('span', { class: 'rec', text: 'LIVE' }),
      h('span', { text: 'CAM-04 — PIPING EST' }),
    ]);
    box.appendChild(h('div', {
      style: 'position:absolute;right:10px;top:8px;font:600 10px var(--mono);color:#9fe3b5;text-align:right',
      text: 'TC-09 ▸ 412.7 °C',
    }));
    box.appendChild(h('div', {
      style: 'position:absolute;right:10px;top:24px;font:600 10px var(--mono);color:#9bb7f5;text-align:right',
      text: 'VS-03 ▸ 14.9 MPa (stimato)',
    }));
    el.appendChild(box);
  },

  VISION_DETECTION_STD_01(el) { // Rilevamento visivo AI
    const box = h('div', { class: 'media-stub' }, [h('span', { text: 'FRAME 0421 — AI VISION' })]);
    const bb = h('div', { class: 'bbox', style: 'left:18%;top:34%;width:26%;height:38%' });
    bb.appendChild(h('span', { text: 'corrosione · conf 0.87' }));
    box.appendChild(bb);
    el.appendChild(box);
    el.appendChild(h('div', { style: 'margin-top:8px' }, [
      badge('predicted', 'OUTPUT AI'), ' ', badge('warning', 'DA VERIFICARE'),
    ]));
  },

  DATA_QUALITY_STD_01(el, ctx) { // Qualità dati — live rows when bound
    const rows = ctx?.data?.rows || [
      ['Confidence modello', '0.91', 'ok'],
      ['Validità dato', 'Verificato', 'ok'],
      ['Età ultimo campione', '0.8 s', 'ok'],
      ['Copertura sensori', '83 %', 'warning'],
    ];
    el.appendChild(h('div', {}, rows.map(([k, v, st]) =>
      h('div', { class: 'state-row' }, [
        h('span', { class: `dot ${st}` }),
        h('span', { text: k }),
        h('strong', { style: 'margin-left:auto', text: v }),
      ]))));
  },

  EVIDENCE_STD_01(el, ctx) { // Evidenze annotate
    const ro = ctx.mode === 'readonly' ? { disabled: 'true' } : {};
    el.appendChild(h('div', {}, [
      h('div', { class: 'state-row' }, [
        h('span', { class: 'dot warning' }),
        h('strong', { text: 'EV-0118 — Vibrazione anomala pompa P-01' }),
      ]),
      h('p', { style: 'color:var(--muted);font-size:12.5px;margin:6px 0 10px', text: 'Annotata da OD il 2026-06-10. Correlata a trend TC-04 e allarme ALM-0412.' }),
      h('div', { style: 'display:flex;gap:8px' }, [
        h('button', { class: 'btn', text: 'Annota', ...ro }),
        h('button', { class: 'btn', text: 'Esporta', ...ro }),
        h('button', { class: 'btn danger', text: 'Elimina', ...ro }),
      ]),
    ]));
  },

  CATALOG_STD_01(el, ctx) { // Card catalogo / selezione — corsi/scenari per la Mappatura
    const items = ctx?.data?.items || [
      ['🎓', 'Normal Operations', 'EASY · 5 min'],
      ['🌡', 'Rising Temperature', 'MEDIUM · 10 min'],
      ['💧', 'LOCA Drill', 'HARD · 15 min'],
      ['⚡', 'Station Blackout', 'HARD · 12 min'],
      ['🛰', 'Sensor Fault Triage', 'MEDIUM · 8 min'],
      ['🔐', 'Cyber Incident', 'HARD · 10 min'],
    ];
    el.appendChild(h('div', { class: 'catalog-grid' }, items.map((it, i) =>
      h('div', { class: `catalog-item${i === 0 ? ' selected' : ''}` }, [
        h('div', { class: 'ico', text: it[0] }),
        h('div', { text: it[1] }),
        it[2] ? h('div', { style: 'color:var(--muted);font-size:10px;margin-top:2px', text: it[2] }) : null,
      ]))));
  },

  LAYOUT_STD_01(el) { // Gestione layout (widget grid)
    el.appendChild(h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px' }, [
      h('div', { class: 'layout-slot', text: 'Slot 1 — Trend TC-02', style: 'grid-column:1/3;padding:18px' }),
      h('div', { class: 'layout-slot', text: 'Slot 2 — KPI' }),
      h('div', { class: 'layout-slot', text: 'Slot 3 — trascina qui un widget' }),
    ]));
  },
};

// Fallback for any standard without a dedicated renderer.
export function renderAtom(standardId, el, ctx = {}) {
  el.textContent = '';
  const fn = ATOMS[standardId];
  if (fn) { fn(el, ctx); return true; }
  el.appendChild(h('div', { class: 'coming-soon' }, [
    h('div', { style: 'font-weight:600', text: ctx.standard?.name || standardId }),
    h('div', { style: 'font-size:12px;margin-top:4px', text: `${standardId} — renderer in arrivo` }),
  ]));
  return false;
}
