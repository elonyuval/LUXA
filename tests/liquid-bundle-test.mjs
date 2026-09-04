/*
 * The bundle card's Liquid, rendered for real.
 *
 * bundle-test.mjs drives the card's JavaScript against markup it builds itself,
 * so it happily passed a five-product bundle while the template was emitting
 * four: the loop ran (1..4) and the belt sat at `when 5`. This renders the
 * template against the product set the shop actually has and counts the rows.
 *
 * Requires liquidjs (npm install).
 */
import { readFileSync } from 'node:fs';
import { Liquid } from 'liquidjs';

const SRC = readFileSync(new URL('../snippets/luxamom-bundle.liquid', import.meta.url).pathname, 'utf8');
const template = SRC.slice(SRC.indexOf('{%- liquid'), SRC.indexOf('<script>')) + '{%- endif -%}';

const engine = new Liquid({ strictFilters: true, strictVariables: false });
engine.registerFilter('image_url', (v) => String(v || 'img.jpg'));
engine.registerFilter('money_without_trailing_zeros', (v) => '₪' + (Number(v) / 100));
engine.registerFilter('money', (v) => '₪' + (Number(v) / 100));

// The five products the shop sells, keyed by the handles the snippet asks for.
const HANDLES = {
  'תיק-חיתולים-3-ב-1-luxamom': 'תיק החתלה 3-ב-1',
  'מחמם-בקבוק-usb-נייד-luxamom': 'מחמם בקבוק אלחוטי נייד',
  'כרית-מגן-ראש-לפעוט-luxamom': 'כרית מגן ראש לתינוק',
  'מנשא-חיבוק-luxamom': 'מנשא חיבוק',
  'מגן-בטן-luxamom': 'מגן בטן'
};

const makeProduct = (handle, title, id) => ({
  id, handle, title,
  featured_image: 'img.jpg',
  available: true,
  variants: [
    { id: id * 10 + 1, title: 'ברירת מחדל', price: 9999, available: true },
    { id: id * 10 + 2, title: 'שני', price: 9999, available: true }
  ],
  selected_or_first_available_variant: { id: id * 10 + 1, title: 'ברירת מחדל', price: 9999, available: true },
  price: 9999
});

function catalogue(handles) {
  const all = {};
  let id = 1;
  for (const h of handles) all[h] = makeProduct(h, HANDLES[h], id++);
  return all;
}

const ALL = Object.keys(HANDLES);

let pass = 0, fail = 0;
function check(name, ok, err) {
  if (ok) { pass++; console.log('PASS — ' + name); }
  else { fail++; console.log('FAIL — ' + name + (err ? ' :: ' + err : '')); }
}

const render = (handles, extra) => engine.parseAndRender(template,
  Object.assign({ all_products: catalogue(handles) }, extra || {}));

const rows = (html) => (html.match(/class="lxm-be-pick/g) || []).length;
const names = (html) => [...html.matchAll(/class="lxm-be-name">([^<]+)</g)].map((m) => m[1].trim());

const full = await render(ALL);

check('כל חמשת המוצרים מקבלים שורה', rows(full) === 5, 'got ' + rows(full));
check('מגן בטן נמצא בבאנדל', names(full).some((n) => n.includes('מגן בטן')), names(full).join(' | '));
check('אין מוצר כפול', new Set(names(full)).size === names(full).length);

/* The grid is laid out from be_count, so a mismatch between the count and the
   rows leaves either an empty column or a squashed one. */
check('רוחב הגריד תואם למספר השורות', full.includes('repeat(5,minmax(0,1fr))'));

// A product pulled from the shop must drop out cleanly, not blank the section.
const four = await render(ALL.filter((h) => h !== 'מגן-בטן-luxamom'));
check('מוצר שהוסר פשוט נושר', rows(four) === 4 && !names(four).some((n) => n.includes('מגן בטן')));
check('והגריד מתכווץ איתו', four.includes('repeat(4,minmax(0,1fr))'));

const one = await render(['מנשא-חיבוק-luxamom']);
check('מוצר בודד לא מציג באנדל בכלל', one.trim() === '');

const none = await render([]);
check('בלי מוצרים אין פלט', none.trim() === '');

// The ladder has to reach the top tier the shop actually offers.
check('סולם ההנחות מגיע עד חמישה', full.includes('25%'));
check('כל המדרגות מופיעות',
  ['10%', '15%', '20%', '25%'].every((t) => full.includes(t)));

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
