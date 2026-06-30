'use strict';
// Mock live-data feed for the spec mockup charts.
// Keeps a rolling buffer per signal, advances them ~1×/sec, and redraws each
// registered chart's SVG in place (no DOM rebuild) so trends scroll smoothly
// without resetting checkboxes / selections / scroll position.
//
// This is the SEAM for the real FOS/API feed: replace advance() with an API
// push into the buffers and every chart keeps working unchanged.

import { S } from '@shared/src/model.js';
import { DAO } from '@shared/src/dao.js';

const BUF = 48;            // samples kept per signal
const buffers = new Map(); // key -> number[]
const seeds = new Map();   // key -> { base, amp }  (drift center for synthetic signals)

function seedShape(base, amp) {
  const arr = [];
  for (let i = 0; i < BUF; i++) {
    arr.push(base + amp * Math.sin(i / 4.1) + amp * 0.4 * Math.sin(i / 2.7));
  }
  return arr;
}

function padTo(v, n, fill) {
  if (v.length >= n) return v.slice(v.length - n);
  return Array(n - v.length).fill(fill).concat(v);
}

// Seed a buffer driven by drift around `base` (±amp). If `key` matches a live
// DAO sensor id, advance() tracks that sensor's value instead of the seed.
export function ensureSeeded(key, base, amp) {
  if (!buffers.has(key)) { buffers.set(key, seedShape(base, amp)); seeds.set(key, { base, amp }); }
  return buffers.get(key);
}

// Seed a buffer from an explicit sample array (stub / demo charts).
export function ensureFromVals(key, vals) {
  if (!buffers.has(key)) {
    const v = (vals && vals.length) ? vals : [50];
    const base = v.reduce((a, b) => a + b, 0) / v.length;
    const amp = Math.max((Math.max(...v) - Math.min(...v)) / 2, 1);
    buffers.set(key, padTo(v, BUF, base));
    seeds.set(key, { base, amp });
  }
  return buffers.get(key);
}

export function getSeries(key) {
  return buffers.has(key) ? [...buffers.get(key)] : [];
}

// advance every buffer one step (mean-reverting random walk toward its center)
function advance() {
  for (const [key, arr] of buffers) {
    const sensor = S.sensors && S.sensors[key];
    const seed = seeds.get(key) || { base: arr[arr.length - 1] || 50, amp: 1 };
    const center = sensor ? sensor.v : seed.base;
    const amp = sensor ? Math.max(Math.abs(sensor.v) * 0.012, 0.5) : Math.max(seed.amp * 0.22, 0.4);
    const last = arr[arr.length - 1] ?? center;
    const next = last + (center - last) * 0.15 + (Math.random() - 0.5) * amp * 2;
    arr.push(next);
    if (arr.length > BUF) arr.shift();
  }
}

// ── chart registry: each entry repaints its own SVG on every tick ────────
const charts = new Set(); // { node, redraw }
export function registerChart(node, redraw) {
  const entry = { node, redraw };
  charts.add(entry);
  return () => charts.delete(entry);
}

let started = false;
export function startChartFeed() {
  if (started) return;
  started = true;
  setInterval(() => {
    advance();
    for (const c of [...charts]) {
      if (!c.node || !c.node.isConnected) { charts.delete(c); continue; } // gone from DOM
      if (c.node.offsetParent === null) continue;                          // hidden panel — skip
      try { c.redraw(); } catch (_e) { charts.delete(c); }
    }
  }, 1000);
}
