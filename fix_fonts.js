/**
 * fix_fonts.js — ISA-101 Light Theme HMI: Font Readability Pass
 *
 * Strategy (ISA-101 / NUREG-0700 guidance):
 *  - Section labels, status tags, footer text:  9px → 11px
 *  - Button labels, sub-headings, small data:   10px → 12px
 *  - Log/monospace body text:                   .72rem → .8rem (≈12.8px)
 *  - Diagnostics table header:                  9px → 11px
 *  Sizes already ≥ 11px (xs, sm, base, etc.) are left untouched.
 */

const fs   = require('fs');
const path = require('path');

const dir   = 'c:/Users/faraz/Desktop/hmi';
const files = ['index.html', 'script.js'];

// ── Tailwind arbitrary-size replacements ─────────────────────────────────────
// Order matters: do 10px before 9px so we don't double-replace.
const twReplacements = [
  // 10px labels → 12px
  { from: 'text-[10px]',  to: 'text-[12px]'  },
  // 9px micro-labels → 11px
  { from: 'text-[9px]',   to: 'text-[11px]'  },
  // 8px (time labels on chart axis) → 10px
  { from: 'text-[8px]',   to: 'text-[10px]'  },
];

// ── Inline-style / template-literal replacements (script.js generated HTML) ──
const inlineReplacements = [
  // font-size:9px  → 11px
  { from: 'font-size:9px',   to: 'font-size:11px'  },
  { from: 'font-size: 9px',  to: 'font-size: 11px' },
  // font-size:10px → 12px
  { from: 'font-size:10px',  to: 'font-size:12px'  },
  { from: 'font-size: 10px', to: 'font-size: 12px' },
  // font-size:8px  → 10px
  { from: 'font-size:8px',   to: 'font-size:10px'  },
  { from: 'font-size: 8px',  to: 'font-size: 10px' },
  // SVG font-size attribute  font-size="9" → 11, "10" → 12, "11" → 12 (already ok)
  { from: 'font-size="9"',   to: 'font-size="11"'  },
  { from: 'font-size="10"',  to: 'font-size="12"'  },
  // Monospace log text: .72rem → .8rem
  { from: 'font-size:.72rem', to: 'font-size:.8rem' },
  // tracking — reduce excessive tightness at bigger sizes (cosmetic, optional)
  { from: 'tracking-[.4em]', to: 'tracking-[.3em]' },
];

files.forEach(file => {
  const filepath = path.join(dir, file);
  let content = fs.readFileSync(filepath, 'utf8');

  for (const { from, to } of twReplacements) {
    content = content.split(from).join(to);
  }
  for (const { from, to } of inlineReplacements) {
    content = content.split(from).join(to);
  }

  fs.writeFileSync(filepath, content, 'utf8');
  console.log(`✔  ${file} — font sizes updated`);
});
