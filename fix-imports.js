// fix-imports.js - Run with: node fix-imports.js
const fs = require('fs');

// Fix events.js imports
let c = fs.readFileSync('src/events.js', 'utf8');
c = c.replace(
  "import { ts, p2, p3 } from '../utils.js';",
  "import { ts, p2, p3, escHtml, bindGuardedButton, dlFile, setText, setAttr } from '../utils.js';"
);
c = c.replace(/window\.bindGuardedButton/g, 'bindGuardedButton');
fs.writeFileSync('src/events.js', c);

// Fix views/render.js imports
let v = fs.readFileSync('src/views/render.js', 'utf8');
v = v.replace(
  "import { ts, pct } from '../../utils.js';",
  "import { ts, pct, setText, setAttr, dlFile } from '../../utils.js';"
);
fs.writeFileSync('src/views/render.js', v);

console.log('import fixes done');
