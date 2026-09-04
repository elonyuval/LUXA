/*
 * The second-unit offer in the buy box.
 *
 * Two things are load-bearing. The price shown must be the price the cart
 * actually charges — the shop's automatic discount is quantity >= 2 across
 * these five products, so the arithmetic here has to match Shopify's, not
 * approximate it. And the offer must be strictly additive: with the toggle off,
 * the page has to behave exactly as it did before this existed.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Liquid } from 'liquidjs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const DIR = new URL('./.out/', import.meta.url).pathname;
mkdirSync(DIR, { recursive: true });
const SRC = readFileSync(new URL('../snippets/luxamom-two-up.liquid', import.meta.url).pathname, 'utf8');
const HEADER = readFileSync(new URL('../sections/luxamom-header.liquid', import.meta.url).pathname, 'utf8');

const markup = SRC.slice(SRC.indexOf('{%- liquid'), SRC.indexOf('<script>\n(function(){')) + '{%- endif -%}';
const behaviour = SRC.slice(SRC.indexOf('<script>\n(function(){') + 8, SRC.lastIndexOf('</script>'));

const engine = new Liquid({ strictFilters: true });
engine.registerFilter('money_without_trailing_zeros', (v) => {
  const n = Number(v) / 100;
  return '₪' + (Number.isInteger(n) ? n : n.toFixed(2));
});

const VARIANTS = [
  { id: 111, title: 'שחור', price: 9999, available: true },
  { id: 222, title: 'ורוד', price: 9999, available: true },
  { id: 333, title: 'לבן', price: 9999, available: false }
];
const PRODUCT = {
  available: true,
  price: 9999,
  selected_or_first_available_variant: VARIANTS[0],
  variants: VARIANTS,
  options_with_values: [{ name: 'צבע', values: ['שחור', 'ורוד', 'לבן'] }]
};

const render = (extra) => engine.parseAndRender(markup,
  Object.assign({ product: PRODUCT, reason: 'אחד לכל רכב' }, extra || {}));

let pass = 0, fail = 0;
function check(name, ok, err) {
  if (ok) { pass++; console.log('PASS — ' + name); }
  else { fail++; console.log('FAIL — ' + name + (err ? ' :: ' + err : '')); }
}

const html = await render();

// ---- what it says ----
check('הסיבה מוצגת', html.includes('קחי שתיים — אחד לכל רכב'));
/* 9999 x 2 = 19998, less 10% = 17998. Shopify allocates the discount per line
   and rounds to the agora, landing on the same number either way — two units of
   one colour or one of each. */
check('מחיר לשתיים תואם את מה שהסל יגבה', html.includes('₪179.98'));
check('המחיר המלא מוצג כמחוק', html.includes('₪199.98'));
check('החיסכון בשקלים', html.includes('₪20'));
check('אין וריאנט שאזל בבורר', html.includes('>שחור<') && html.includes('>ורוד<') && !html.includes('>לבן<'));

const noReason = await render({ reason: '' });
check('בלי סיבה הסקשן לא מופיע כלל', noReason.trim() === '');
const soldOut = await render({ product: Object.assign({}, PRODUCT, { available: false }) });
check('מוצר שאזל לא מקבל הצעה', soldOut.trim() === '');
const single = await render({ product: Object.assign({}, PRODUCT, {
  options_with_values: [{ name: 'כותרת', values: ['ברירת מחדל'] }] }) });
check('מוצר בלי צבעים לא מציג בורר', !single.includes('data-tu-second') && single.includes('data-two-up'));

check('LXMCart יודע להוסיף שני פריטים בבקשה אחת', HEADER.includes('addItems: function(items)'));
check('addItem עדיין קיים ועובר דרכו', HEADER.includes('return window.LXMCart.addItems('));

// every product page renders it
for (const f of ['belt', 'sling', 'bag', 'cushion', 'warmer']) {
  const s = readFileSync(new URL(`../sections/luxamom-product-${f}.liquid`, import.meta.url).pathname, 'utf8');
  check(`${f}: מרנדר את ההצעה עם סיבה`, /render 'luxamom-two-up', reason: '[^']+'/.test(s));
  check(`${f}: ההצעה יושבת מעל כפתור ההוספה`,
    s.indexOf("render 'luxamom-two-up'") < s.indexOf('data-add-btn'));
}

// ---- behaviour ----
writeFileSync(DIR + 'two-up.html', `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
</head><body>
<form class="lxm-pdp-form">
  <input type="hidden" name="id" value="111" data-variant-id-input>
  <script type="application/json" data-lxm-variants>${JSON.stringify(
    VARIANTS.map((v) => ({ id: v.id, price: v.price })))}<\/script>
  ${html}
  <button type="submit" data-add-btn><span data-add-label>הוספה לסל</span></button>
</form>
<script>
  window.__errors = [];
  window.addEventListener('error', function(e){ window.__errors.push(e.message); });
  window.addEventListener('unhandledrejection', function(e){ window.__errors.push(String(e.reason)); });
  window.__added = null;
  window.__sectionHandled = 0;
  window.__fail = false;
  window.LXMCart = {
    addItems: function(items){
      window.__added = items;
      return window.__fail ? Promise.reject(new Error('add failed')) : Promise.resolve({});
    },
    addItem: function(id, qty){ return window.LXMCart.addItems([{ id: id, quantity: qty || 1 }]); }
  };
  // Stands in for the section's own submit handler, which must keep working
  // untouched whenever the offer is not taken.
  document.querySelector('.lxm-pdp-form').addEventListener('submit', function(e){
    e.preventDefault();
    window.__sectionHandled++;
    window.LXMCart.addItem(document.querySelector('[data-variant-id-input]').value, 1);
  });
<\/script>
<script>${behaviour}<\/script></body></html>`);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
await page.goto('file://' + DIR + 'two-up.html');
await page.waitForTimeout(150);

const added = () => page.evaluate(() => window.__added);
const reset = () => page.evaluate(() => { window.__added = null; window.__sectionHandled = 0; });

check('הבורר מוסתר עד שמסמנים', await page.isHidden('[data-tu-second]'));

/* The offer must be additive: untouched, the section's own handler still runs
   and still adds exactly one. */
await page.click('[data-add-btn]');
await page.waitForTimeout(150);
check('בלי סימון — הדף מתנהג בדיוק כמו קודם',
  (await page.evaluate(() => window.__sectionHandled)) === 1 &&
  JSON.stringify(await added()) === JSON.stringify([{ id: '111', quantity: 1 }]));

await reset();
await page.click('.lxm-tu-head');
await page.waitForTimeout(150);
check('סימון פותח את בורר הצבע השני', await page.isVisible('[data-tu-second]'));
check('הצבע השני מתחיל זהה לראשון',
  (await page.inputValue('[data-tu-second]')) === '111');
check('תווית הכפתור משתנה',
  (await page.textContent('[data-add-label]')) === 'הוספת שתיים לסל');

await page.click('[data-add-btn]');
await page.waitForTimeout(150);
check('אותו צבע נשלח כשורה אחת בכמות 2',
  JSON.stringify(await added()) === JSON.stringify([{ id: '111', quantity: 2 }]));
check('המטפל של הסקשן לא רץ פעמיים',
  (await page.evaluate(() => window.__sectionHandled)) === 0);

await reset();
await page.selectOption('[data-tu-second]', '222');
await page.click('[data-add-btn]');
await page.waitForTimeout(150);
check('שני צבעים נשלחים כשתי שורות',
  JSON.stringify(await added()) === JSON.stringify([
    { id: '111', quantity: 1 }, { id: '222', quantity: 1 }]));

// a colour the shopper chose herself must survive her changing the first one
await reset();
await page.evaluate(() => {
  const i = document.querySelector('[data-variant-id-input]');
  i.setAttribute('value', '222'); i.value = '222';
});
await page.waitForTimeout(150);
check('בחירה ידנית של הצבע השני לא נדרסת',
  (await page.inputValue('[data-tu-second]')) === '222');

await check_fail();
async function check_fail(){
  await reset();
  await page.evaluate(() => { window.__fail = true; });
  await page.click('[data-add-btn]');
  await page.waitForTimeout(200);
  check('כישלון הוספה מוצג ולא נבלע',
    await page.isVisible('[data-tu-error]') &&
    (await page.textContent('[data-tu-error]')).includes('נסי שוב'));
  check('הכפתור לא נשאר מושבת',
    (await page.getAttribute('[data-add-btn]', 'disabled')) === null);
  await page.evaluate(() => { window.__fail = false; });
}

// unticking must put everything back
await page.click('.lxm-tu-head');
await page.waitForTimeout(150);
check('ביטול הסימון מחזיר את תווית הכפתור',
  (await page.textContent('[data-add-label]')) === 'הוספה לסל');
await reset();
await page.click('[data-add-btn]');
await page.waitForTimeout(150);
check('וביטול מחזיר גם את התנהגות ההוספה',
  (await page.evaluate(() => window.__sectionHandled)) === 1);

const inPage = await page.evaluate(() => window.__errors.slice());
const all = [...pageErrors, ...inPage];
console.log(all.length ? 'JS ERRORS:\n' + [...new Set(all)].join('\n') : 'no JS errors');
console.log(`\n${pass} pass, ${fail} fail`);
await browser.close();
process.exit(fail || all.length ? 1 : 0);
