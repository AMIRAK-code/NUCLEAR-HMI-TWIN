'use strict';
// Notification tray — replaces the toast stack. A topbar bell button shows the
// unread count; clicking it opens a slide-in right panel with the full log.
// Critical/Alta items pulse the badge red until acknowledged so high-severity
// events still get attention without spamming overlays.
//
// State lives module-local (not in S — these are transient UI state, not
// auditable reducer events; the underlying policy fire is already audited via
// dispatch(LOG) inside notification-engine.js).

import { subscribeNotifications } from '@shared/src/notification-engine.js';

const STORE_LIMIT = 200;

const state = {
  items: [],         // newest first
  unread: 0,
  hasCritical: false,
  open: false,
};

const subs = new Set();
const subscribeTray = cb => { subs.add(cb); return () => subs.delete(cb); };
const notify = () => { for (const cb of subs) { try { cb(state); } catch (e) { console.error(e); } } };

const CRIT_KIND = {
  Critica: 'critical',
  Alta:    'warning',
  Media:   'estimated',
  Bassa:   'stale',
};
const isHigh = c => c === 'Critica' || c === 'Alta';

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return e;
}

// ── topbar bell button ──────────────────────────────────────────────────

let bellEl = null, badgeEl = null;
function injectBell() {
  if (bellEl) return bellEl;
  // place before the audit button in the existing topbar
  const auditBtn = document.getElementById('btn-audit-hdr');
  if (!auditBtn || !auditBtn.parentElement) return null;

  bellEl = el('button', {
    id: 'btn-notif-tray',
    title: 'Centro notifiche',
    'aria-label': 'Apri centro notifiche',
    'aria-haspopup': 'dialog',
    'aria-expanded': 'false',
    class: 'w-8 h-8 flex items-center justify-center border border-[rgba(0,0,0,.08)] hover:bg-[#d1d6dc] transition-colors relative',
    onclick: () => setOpen(!state.open),
  });
  // Material Symbols are already loaded by the shell; reuse for visual parity
  bellEl.appendChild(el('span', { class: 'ms material-symbols-outlined text-[#343a40] text-[17px]', text: 'notifications' }));
  badgeEl = el('span', {
    id: 'notif-badge',
    'aria-live': 'polite',
    class: 'absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#495057] tv text-[10px] font-bold flex items-center justify-center text-white',
    text: '0',
  });
  badgeEl.style.display = 'none';
  bellEl.appendChild(badgeEl);

  auditBtn.parentElement.insertBefore(bellEl, auditBtn);
  return bellEl;
}

function refreshBell() {
  if (!badgeEl) return;
  if (state.unread > 0) {
    badgeEl.textContent = state.unread > 99 ? '99+' : String(state.unread);
    badgeEl.style.display = '';
    badgeEl.classList.toggle('notif-badge-crit', state.hasCritical);
  } else {
    badgeEl.style.display = 'none';
    badgeEl.classList.remove('notif-badge-crit');
  }
}

// ── slide-in panel ──────────────────────────────────────────────────────

let panelEl = null, listEl = null, backdropEl = null;

function ensurePanel() {
  if (panelEl) return panelEl;
  backdropEl = el('div', {
    class: 'notif-backdrop',
    'aria-hidden': 'true',
    onclick: () => setOpen(false),
  });
  panelEl = el('aside', {
    class: 'notif-panel',
    role: 'dialog',
    'aria-modal': 'false',
    'aria-label': 'Centro notifiche',
    tabindex: '-1',
  });
  const head = el('header', { class: 'notif-panel-head' }, [
    el('h2', { class: 'notif-panel-title', text: 'Centro notifiche' }),
    el('span', { class: 'notif-panel-count', id: 'notif-panel-count', text: '0 elementi' }),
    el('button', {
      class: 'notif-icon-btn',
      title: 'Segna tutte come lette',
      'aria-label': 'Segna tutte come lette',
      onclick: markAllRead,
    }, [el('span', { class: 'ms material-symbols-outlined text-[16px]', text: 'mark_email_read' })]),
    el('button', {
      class: 'notif-icon-btn',
      title: 'Svuota',
      'aria-label': 'Svuota notifiche',
      onclick: clearAll,
    }, [el('span', { class: 'ms material-symbols-outlined text-[16px]', text: 'delete_sweep' })]),
    el('button', {
      class: 'notif-icon-btn',
      title: 'Chiudi',
      'aria-label': 'Chiudi pannello',
      onclick: () => setOpen(false),
    }, [el('span', { class: 'ms material-symbols-outlined text-[16px]', text: 'close' })]),
  ]);
  listEl = el('div', { class: 'notif-list', role: 'log', 'aria-live': 'polite' });
  panelEl.appendChild(head);
  panelEl.appendChild(listEl);

  document.body.appendChild(backdropEl);
  document.body.appendChild(panelEl);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.open) setOpen(false);
  });
  return panelEl;
}

function renderList() {
  if (!listEl) return;
  listEl.textContent = '';
  if (state.items.length === 0) {
    listEl.appendChild(el('div', { class: 'notif-empty', text: 'Nessuna notifica recente.' }));
    return;
  }
  for (const n of state.items) {
    const kind = CRIT_KIND[n.criticita] || 'estimated';
    const row = el('div', {
      class: `notif-row ${kind}${n.read ? ' read' : ''}`,
      role: 'article',
      tabindex: '0',
      onclick: () => markRead(n.id),
    }, [
      el('span', { class: `notif-bar ${kind}`, 'aria-hidden': 'true' }),
      el('div', { class: 'notif-body' }, [
        el('div', { class: 'notif-row-head' }, [
          el('span', { class: `badge ${kind}`, text: n.criticita || 'INFO' }),
          el('span', { class: 'notif-policy', text: n.policyId }),
          el('time', { class: 'notif-time', datetime: new Date(n.timestamp).toISOString(), text: new Date(n.timestamp).toLocaleTimeString('it-IT') }),
        ]),
        el('div', { class: 'notif-title', text: n.title }),
        el('div', { class: 'notif-msg', text: n.message }),
        el('div', { class: 'notif-foot', text: `${n.canale} · → ${(n.destinatari || []).join(', ')}` }),
      ]),
      el('button', {
        class: 'notif-dismiss',
        'aria-label': `Dismiss ${n.policyId}`,
        title: 'Rimuovi',
        text: '×',
        onclick: e => { e.stopPropagation(); dismiss(n.id); },
      }),
    ]);
    listEl.appendChild(row);
  }
  const count = document.getElementById('notif-panel-count');
  if (count) count.textContent = `${state.items.length} elementi · ${state.unread} non lette`;
}

function setOpen(open) {
  state.open = open;
  ensurePanel();
  panelEl.classList.toggle('open', open);
  backdropEl.classList.toggle('open', open);
  if (bellEl) bellEl.setAttribute('aria-expanded', String(open));
  if (open) {
    markAllRead();         // opening the tray is itself an acknowledgement
    panelEl.focus();
  }
  notify();
}

// ── store mutations ─────────────────────────────────────────────────────

function recalc() {
  state.unread = state.items.filter(n => !n.read).length;
  state.hasCritical = state.items.some(n => !n.read && n.criticita === 'Critica');
}

function add(notif) {
  // dedup: don't add identical (policy + title + message) within 2 s
  const last = state.items[0];
  if (last && last.policyId === notif.policyId && last.title === notif.title && (notif.timestamp - last.timestamp) < 2000) return;
  state.items.unshift({ ...notif, read: false });
  if (state.items.length > STORE_LIMIT) state.items.length = STORE_LIMIT;
  recalc();
  refreshBell();
  if (state.open) renderList();
  notify();
}

function markRead(id) {
  const n = state.items.find(x => x.id === id);
  if (n && !n.read) { n.read = true; recalc(); refreshBell(); renderList(); notify(); }
}

function markAllRead() {
  let changed = false;
  for (const n of state.items) if (!n.read) { n.read = true; changed = true; }
  if (changed) { recalc(); refreshBell(); renderList(); notify(); }
}

function dismiss(id) {
  state.items = state.items.filter(n => n.id !== id);
  recalc();
  refreshBell();
  renderList();
  notify();
}

function clearAll() {
  state.items = [];
  recalc();
  refreshBell();
  renderList();
  notify();
}

// ── public API ──────────────────────────────────────────────────────────

export function initNotificationToasts() {
  // Name kept for compatibility with main.js — it's now a tray initializer.
  // Defer the topbar injection until the shell DOM is ready.
  const setup = () => {
    injectBell();
    refreshBell();
    ensurePanel();
    subscribeNotifications(add);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup, { once: true });
  } else {
    setup();
  }
}

// Exposed for debugging from the console: window.__notifTray.state
if (typeof window !== 'undefined') {
  window.__notifTray = { state, subscribe: subscribeTray, markAllRead, clearAll, open: () => setOpen(true) };
}
