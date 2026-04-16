const fs = require('fs');
const content = fs.readFileSync('script.js', 'utf8');
const lines = content.split('\n');

const breaks = [];
for (let i=0; i<lines.length; i++) {
  if (lines[i].includes('// SECTION ')) breaks.push({name: lines[i].trim(), idx: i});
}
breaks.push({name: '// BOOTSTRAP', idx: lines.findIndex(l => l.includes('// BOOTSTRAP'))});
breaks.push({name: 'EOF', idx: lines.length});

const getSec = (name) => {
  const start = breaks.find(b => b.name.includes(name));
  const end = breaks[breaks.indexOf(start)+1];
  return lines.slice(start.idx+1, end.idx-2).join('\n'); // skip '====' lines
};

if (!fs.existsSync('src')) fs.mkdirSync('src');
if (!fs.existsSync('src/views')) fs.mkdirSync('src/views');

let daoStr = getSec('DAO LAYER').replace('const DAO = {', 'export const DAO = {');
fs.writeFileSync('src/dao.js', daoStr);

let modelStr = `import { DAO } from './dao.js';\nimport { ts, mkEntry } from '../utils.js';\n` + getSec('IMMUTABLE MODEL').replace('const mkModel', 'export const mkModel').replace('let S = mkModel();', '') + '\nexport let S = mkModel();\nexport function setS(val) { S = val; }\n';
fs.writeFileSync('src/model.js', modelStr);

let reducerStr = `import { DAO } from './dao.js';\nimport { S, setS, mkModel } from './model.js';\nimport { ts, mkEntry } from '../utils.js';\nimport { ScenarioEngine } from './scenario-engine.js';\nimport { render } from './views/render.js';\n\n` + 'export const INTENT_PERMISSIONS = { \'SCRAM\':[\'OD\',\'AS\'], \'RESET_SCRAM\':[\'AS\'], \'TOGGLE_AUTOPILOT\':[\'OD\',\'AS\'], \'RESET_INTERLOCKS\':[\'AS\'], \'SHELF_ALARM\':[\'OD\',\'AS\'], \'UNSHELVE_ALARM\':[\'OD\',\'AS\'] };\n\n' + getSec('MVI REDUCER').replace('function reduce', 'export function reduce')
  .replace('function dispatch', 'export function dispatch')
  .replace('function scheduleRender', 'export function scheduleRender')
  .replace(/S = reduce/g, 'setS(reduce')
  .replace(/S = newS/g, 'setS(newS)')
  .replace(/S=mkModel/g, 'setS(mkModel');
fs.writeFileSync('src/reducer.js', reducerStr);

let scenarioStr = `import { S, setS } from './model.js';\nimport { DAO } from './dao.js';\nimport { dispatch, scheduleRender } from './reducer.js';\nimport { ts } from '../utils.js';\nimport { addAIMessage, showDemoBar, setEmergencyOverlay, hideDemoBar } from './events.js';\n\n` + getSec('SCENARIO ENGINE').replace('const ScenarioEngine = {', 'export const ScenarioEngine = {');
fs.writeFileSync('src/scenario-engine.js', scenarioStr);

let viewsStr = `import { S } from '../model.js';\nimport { DAO } from '../dao.js';\nimport { ts, pct } from '../../utils.js';\nimport { dispatch } from '../reducer.js';\n\n` + getSec('VIEW RENDERERS').replace(/function render/g, 'export function render');
fs.writeFileSync('src/views/render.js', viewsStr);

let threeStr = `import { S } from './model.js';\nimport { dispatch } from './reducer.js';\n\n` + getSec('THREE.JS DIGITAL TWIN').replace('function initThreeJS', 'export function initThreeJS');
fs.writeFileSync('src/three-twin.js', threeStr);

let eventStr = `import { S, setS, mkModel } from './model.js';\nimport { DAO } from './dao.js';\nimport { dispatch, scheduleRender, reduce } from './reducer.js';\nimport { ts, p2, p3, escHtml } from '../utils.js';\nimport { ScenarioEngine } from './scenario-engine.js';\nimport { renderDiagnostics } from './views/render.js';\n\n` + 'export function showDemoBar(msg, col) { const el = document.getElementById(\'demo-banner\'); if (el) { document.getElementById(\'demo-text\').textContent = msg; el.style.background = col; el.style.height = \'40px\'; } }\n' + 'export function hideDemoBar() { const el = document.getElementById(\'demo-banner\'); if (el) el.style.height = \'0\'; }\n' + 'export function setEmergencyOverlay(opacity) { const el = document.getElementById(\'three-emergency-overlay\'); if (el) { el.style.opacity = opacity; el.style.background = `radial-gradient(circle, transparent 50%, rgba(227,26,26,${opacity * 0.4}) 100%)`; } }\n\n' + getSec('MODAL SYSTEM') + '\n' + getSec('DEMO BAR HELPERS') + '\n' + getSec('EVENT BINDINGS').replace('function bindAll', 'export function bindAll') + '\n' + getSec('AI COPILOT MESSAGING').replace('function addAIMessage', 'export function addAIMessage') + '\n' + getSec('CLOCK & DATA LOOP').replace('function startClock', 'export function startClock').replace('function startDataLoop', 'export function startDataLoop');
fs.writeFileSync('src/events.js', eventStr);

let mainStr = `import { bindAll, startClock, startDataLoop } from './events.js';\nimport { initThreeJS } from './three-twin.js';\nimport { scheduleRender } from './reducer.js';\nimport { S, setS } from './model.js';\nimport { DAO } from './dao.js';\n\n` + lines.slice(breaks.find(b => b.name === '// BOOTSTRAP').idx + 2, lines.length).join('\n');
fs.writeFileSync('src/main.js', mainStr);

console.log('Modularization Split Done'); 
