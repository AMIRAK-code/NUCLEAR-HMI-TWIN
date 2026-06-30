'use strict';
// Component Library view — one card per visualization standard (the "base
// components" the client asked to see), rendered inside the app shell.
// Each card: live atom + spec ids + interactions + which CMP instances use it.

import { STANDARDS, COMPONENTS, SCREENS, accessForRole } from '@shared/src/mappatura.js';
import { renderAtom } from './atoms.js';

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

const LEGEND = [
  ['solid-ok', 'Reale'], ['dash-est', 'Stimato'], ['dot-pred', 'Predetto'],
  ['stale', 'Stale'], ['degraded', 'Degradato'], ['warning', 'Warning'], ['critical', 'Critico'],
];

export function renderLibrary(root, { role = 'OL', builtScreens = [] } = {}) {
  root.textContent = '';
  const page = h('div', { class: 'spec-page' });

  page.appendChild(h('div', { class: 'page-head' }, [
    h('h1', { text: 'Libreria componenti — standard di visualizzazione' }),
    h('p', { text:
      `${STANDARDS.length} componenti base dal foglio "Standard visualizzazione" (Mappatura inRebus v5). ` +
      `Ogni card mostra il componente con dati di esempio, le interazioni previste e le istanze CMP che lo usano.` }),
    h('div', { class: 'legend', style: 'margin-top:10px' }, LEGEND.map(([sw, label]) =>
      h('span', { class: 'lg' }, [h('span', { class: `sw ${sw}` }), label]))),
  ]));

  const grid = h('div', { class: 'lib-grid' });
  for (const std of STANDARDS) {
    const usedBy = COMPONENTS.filter(c => c.standard_viz === std.id);
    const rep = usedBy[0] || null;
    const lvl = rep ? accessForRole(rep, role) : 'interactive';
    const mode = lvl === 'interactive' ? 'interactive' : 'readonly';
    const body = h('div', { class: 'body' });

    const card = h('article', { class: 'atom-card', id: `lib-${std.id}` }, [
      h('header', {}, [
        h('span', { class: 'spec-chip', text: std.id }),
        h('h3', { text: std.name }),
        h('span', { style: 'color:var(--muted);font-size:11px', text: std.tipologia_ui }),
      ]),
      body,
    ]);

    renderAtom(std.id, body, { standard: std, component: rep, mode });
    grid.appendChild(card);
  }
  page.appendChild(grid);

  page.appendChild(h('div', { class: 'coverage-footer', text:
    `${STANDARDS.length} standard di visualizzazione · ${COMPONENTS.length} componenti mappati · ` +
    `${builtScreens.length} di ${SCREENS.length} schermate complete (${builtScreens.join(', ')}) — le restanti in roadmap` }));

  root.appendChild(page);
}
