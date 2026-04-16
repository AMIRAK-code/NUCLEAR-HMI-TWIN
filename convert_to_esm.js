const fs = require('fs');
const content = fs.readFileSync('script.js', 'utf8');

const regex = /\/\/\s*SECTION\s+(\d+):\s*(.*?)(?=\n\/\/\s*═══════════════════════════════════════════════════════════════════\r?\n\/\/\s*SECTION\s+\d+:|\n\/\/\s*═══════════════════════════════════════════════════════════════════\r?\n\/\/\s*BOOTSTRAP|$)/gs;

let match;
const sections = {};
while ((match = regex.exec(content)) !== null) {
  sections[match[2].trim()] = match[0];
}

// Ensure src dir exists
if (!fs.existsSync('src')) fs.mkdirSync('src');
if (!fs.existsSync('src/views')) fs.mkdirSync('src/views');

// --- DAO ---
let daoCode = sections['DAO LAYER'].replace('const DAO = {', 'export const DAO = {');
fs.writeFileSync('src/dao.js', daoCode);

// --- MODEL ---
let modelCode = `import { DAO } from './dao.js';\nimport { ts, mkEntry } from '../utils.js';\n` +
   sections['IMMUTABLE MODEL'].replace('const mkModel', 'export const mkModel').replace('let S = mkModel();', '') +
   `\nexport let S = mkModel();\nexport function setS(newS) { S = newS; }\n`;
fs.writeFileSync('src/model.js', modelCode);

// --- REDUCER ---
let reducerCode = `import { DAO } from './dao.js';\n` +
  `import { S, setS, mkModel } from './model.js';\n` +
  `import { mkEntry, ts } from '../utils.js';\n` +
  `import { ScenarioEngine } from './scenario-engine.js';\n` +
  `import { render } from './views/render.js';\n\n` +
  `export const INTENT_PERMISSIONS = {\n` +
  `  'SCRAM': ['OD', 'AS'],\n` +
  `  'RESET_SCRAM': ['AS'],\n` +
  `  'TOGGLE_AUTOPILOT': ['OD', 'AS'],\n` +
  `  'RESET_INTERLOCKS': ['AS'],\n` +
  `  'SHELF_ALARM': ['OD', 'AS'],\n` +
  `  'UNSHELVE_ALARM': ['OD', 'AS']\n` +
  `};\n\n` +
  sections['MVI REDUCER'].replace('function reduce', 'export function reduce').replace('function dispatch', 'export function dispatch').replace('function scheduleRender', 'export function scheduleRender');
fs.writeFileSync('src/reducer.js', reducerCode);

// --- SCENARIO ENGINE ---
let scenarioCode = `import { dispatch } from './reducer.js';\n` +
  `import { DAO } from './dao.js';\n` +
  `import { S } from './model.js';\n` +
  `import { ts } from '../utils.js';\n` +
  `import { scheduleRender } from './reducer.js';\n` +
  `import { addAIMessage } from './events.js';\n\n` + // Note: Add UI helpers
  `export function showDemoBar(msg, col) { const el = document.getElementById('demo-banner'); if (el) { document.getElementById('demo-text').textContent = msg; el.style.background = col; el.style.height = '40px'; } }\n` +
  `export function hideDemoBar() { const el = document.getElementById('demo-banner'); if (el) el.style.height = '0'; }\n` +
  `export function setEmergencyOverlay(opacity) { const el = document.getElementById('three-emergency-overlay'); if (el) { el.style.opacity = opacity; el.style.background = \`radial-gradient(circle, transparent 50%, rgba(227,26,26,\${opacity * 0.4}) 100%)\`; } }\n\n` +
  sections['SCENARIO ENGINE'].replace('const ScenarioEngine = {', 'export const ScenarioEngine = {');
fs.writeFileSync('src/scenario-engine.js', scenarioCode);

// --- VIEWS ---
let viewsCode = `import { S } from '../model.js';\n` +
  `import { DAO } from '../dao.js';\n` +
  `import { ts, pct } from '../../utils.js';\n` +
  `import { dispatch, scheduleRender } from '../reducer.js';\n\n` +
  sections['VIEW RENDERERS'];
viewsCode = viewsCode.replace(/function renderPanels/g, 'export function renderPanels');
viewsCode = viewsCode.replace(/function render\(/g, 'export function render(');
fs.writeFileSync('src/views/render.js', viewsCode);

// --- THREE JS ---
let threeCode = `import * as THREE from 'three';\n` +
  `import { S } from './model.js';\n` +
  `import { dispatch } from './reducer.js';\n\n` +
  sections['THREE.JS DIGITAL TWIN'].replace('function initThreeJS', 'export function initThreeJS');
fs.writeFileSync('src/three-twin.js', threeCode);

// --- EVENTS ---
let eventCode = `import { dispatch, scheduleRender } from './reducer.js';\n` +
  `import { S, setS, mkModel } from './model.js';\n` +
  `import { DAO } from './dao.js';\n` +
  `import { ScenarioEngine } from './scenario-engine.js';\n` +
  `import { mkEntry, ts, p2, p3, escHtml } from '../utils.js';\n` +
  `import { renderDiagnostics } from './views/render.js';\n\n` +
  sections['MODAL SYSTEM'] + '\n' +
  sections['EVENT BINDINGS'].replace('function bindAll', 'export function bindAll') + '\n' +
  sections['AI COPILOT MESSAGING'].replace('function addAIMessage', 'export function addAIMessage') + '\n' +
  sections['CLOCK & DATA LOOP'].replace('function startDataLoop', 'export function startDataLoop').replace('function startClock', 'export function startClock');
fs.writeFileSync('src/events.js', eventCode);

// --- MAIN ---
let mainCode = `import { bindAll, startClock, startDataLoop } from './events.js';\n` +
  `import { initThreeJS } from './three-twin.js';\n` +
  `import { scheduleRender } from './reducer.js';\n\n` +
  `document.addEventListener('DOMContentLoaded', () => {\n` +
  `  bindAll();\n` +
  `  startClock();\n` +
  `  startDataLoop();\n` +
  `  initThreeJS();\n` +
  `  scheduleRender();\n` +
  `});\n`;
fs.writeFileSync('src/main.js', mainCode);

console.log("Modularization complete.");
