/*
 * iOS auto-zoom on focus.
 *
 * Safari on iPhone zooms the whole page in when a shopper focuses a field whose
 * font-size is under 16px, and then leaves the page zoomed and scrolled sideways.
 * It is not a setting a site can turn off — user-scalable=no has been ignored
 * since iOS 10, and disabling zoom would break the accessibility widget this
 * shop ships. The only lever is the font size of the control.
 *
 * This walks every rule in every section and snippet that styles a text field,
 * and fails on any that is under 16px on touch. It is a lint rather than a
 * browser test because the behaviour belongs to iOS, not to the page.
 */
import { readFileSync, readdirSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url).pathname;
const files = [
  ...readdirSync(ROOT + 'sections').map((f) => 'sections/' + f),
  ...readdirSync(ROOT + 'snippets').map((f) => 'snippets/' + f)
].filter((f) => f.endsWith('.liquid'));

/* Controls that never take a keyboard cannot trigger the zoom, so their size is
   a design choice rather than a defect. */
const NO_KEYBOARD = /\[type=["']?(checkbox|radio|range|submit|button|file|color)["']?\]/;

let pass = 0, fail = 0;
const offenders = [];

for (const file of files) {
  const src = readFileSync(ROOT + file, 'utf8');
  let styles = [...src.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  if (!styles) continue;

  /* Sizes that only apply on touch are the fix, not the fault. The blocks are
     collected and then cut out of the text, so the main scan never sees them —
     matching nested braces with one regex is what got this wrong the first
     time. */
  const coarse = new Set();
  styles = styles.replace(/@media\s*\(pointer:\s*coarse\)\s*\{([\s\S]*?\})\s*\}/g, (_, body) => {
    for (const r of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const size = r[2].match(/font-size:\s*([0-9.]+)px/);
      if (size && parseFloat(size[1]) >= 16) {
        r[1].split(',').forEach((s) => coarse.add(s.trim()));
      }
    }
    return '';
  });

  for (const rule of styles.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const selectors = rule[1].trim().replace(/\s+/g, ' ');
    if (!/\b(input|select|textarea)\b/.test(selectors)) continue;
    if (NO_KEYBOARD.test(selectors)) continue;
    if (/::placeholder|:focus|:hover|:checked/.test(selectors)) continue;

    const size = rule[2].match(/font-size:\s*([0-9.]+)px/);
    if (!size) continue;
    if (parseFloat(size[1]) >= 16) continue;

    const covered = selectors.split(',').every((s) => coarse.has(s.trim()));
    if (!covered) offenders.push(`${file}  ${selectors}  → ${size[1]}px`);
  }
}

function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS — ' + name); }
  else { fail++; console.log('FAIL — ' + name + (detail ? '\n        ' + detail : '')); }
}

check('אין שדה קלט מתחת ל-16px במגע', offenders.length === 0, offenders.join('\n        '));

// The fields the shopper actually meets, named so a regression says where it is.
const NAMED = [
  ['sections/luxamom-header.liquid', '.lxm-cart-code-input', 'שדה קוד ההנחה בסל'],
  ['snippets/luxamom-club.liquid', '.lxm-club-input', 'שדה המייל בהרשמה'],
  ['snippets/luxamom-popup.liquid', '.lxm-pop-input', 'שדה המייל בבאנר'],
  ['snippets/luxamom-bundle.liquid', '.lxm-be-pick select', 'בורר הצבע בבאנדל'],
  ['snippets/luxamom-two-up.liquid', '.lxm-tu-pick select', 'בורר הצבע השני'],
  ['sections/luxamom-product-belt.liquid', '.lxm-review-fields input', 'טופס הביקורת']
];
for (const [file, sel, label] of NAMED) {
  const src = readFileSync(ROOT + file, 'utf8');
  const base = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^{]*\\{([^}]*)\\}');
  const m = src.match(base);
  const declared = m && m[1].match(/font-size:\s*([0-9.]+)px/);
  const touch = new RegExp('@media \\(pointer: coarse\\)\\{ ' +
    sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^{]*\\{font-size:16px;\\} \\}');
  const ok = (declared && parseFloat(declared[1]) >= 16) || touch.test(src);
  check(label + ' לא גורם לזום', ok, declared ? 'declared ' + declared[1] + 'px, no touch override' : 'rule not found');
}

/* Disabling zoom outright is the wrong fix twice over: iOS ignores it, and it
   would strip the page-zoom the accessibility widget exists to provide. */
const layouts = files.concat(['layout/theme.liquid'].filter((f) => {
  try { readFileSync(ROOT + f); return true; } catch { return false; }
}));
const banned = layouts.filter((f) => /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/.test(readFileSync(ROOT + f, 'utf8')));
check('לא ביטלנו זום בכוח', banned.length === 0, banned.join(', '));

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
