/*
 * The discount-code field in the cart drawer.
 *
 * The drawer markup is extracted from the section rather than retyped, so the
 * test cannot pass against a field that no longer ships. A small fake stands in
 * for Shopify's /cart/update.js, including the part that matters most: a code
 * the cart rejects comes back 200 with applicable:false, not as an HTTP error.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const DIR = new URL('./.out/', import.meta.url).pathname;
mkdirSync(DIR, { recursive: true });
const SRC = readFileSync(new URL('../sections/luxamom-header.liquid', import.meta.url).pathname, 'utf8');
const style = SRC.match(/<style>([\s\S]*?)<\/style>/)[1];
const behaviour = SRC.match(/<script>([\s\S]*?)<\/script>/)[1];

// The real drawer, with the Liquid resolved away.
const drawer = SRC.slice(SRC.indexOf('<aside class="lxm-cart-drawer"'), SRC.indexOf('</aside>') + 8)
  .replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, '')
  .replace(/\{%\s*for n in \(1\.\.5\) %\}[\s\S]*?\{% endfor %\}/g, '')
  .replace(/\{\{\s*routes\.cart_url\s*\}\}/g, '/cart')
  .replace(/\{%[\s\S]*?%\}/g, '')
  .replace(/\{\{[^}]*\}\}/g, '');

if (!drawer.includes('data-cart-code-input')) {
  console.log('FAIL — שדה קוד ההנחה לא קיים בקוד הסקשן');
  process.exit(1);
}

writeFileSync(DIR + 'cart-code.html', `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>${style}</style></head><body>
<header class="lxm-header"><div class="lxm-h-wrap lxm-nav"><div class="lxm-actions">
  <a href="/cart" class="lxm-icon" data-cart-toggle><span class="lxm-cart-count" data-cart-count style="display:none;">0</span></a>
</div></div></header>
<div class="lxm-cart-drawer-overlay" data-cart-overlay></div>
${drawer}
<script>
  window.__errors = [];
  window.addEventListener('error', function(e){ window.__errors.push('error: ' + e.message); });
  window.addEventListener('unhandledrejection', function(e){
    window.__errors.push('unhandledrejection: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
  });

  // A stand-in Shopify. SAVE10 is worth 10% of a 20000 cart; anything else is
  // accepted by the endpoint and reported back as not applicable.
  window.__net = 'ok';
  window.__codes = [];
  window.__requests = [];
  function buildCart(){
    var applied = window.__codes.filter(function(c){ return c.toUpperCase() === 'SAVE10'; });
    var base = 20000;
    var off = applied.length ? 2000 : 0;
    return {
      item_count: 1,
      original_total_price: base,
      total_price: base - off,
      total_discount: 0,
      items: [{ key: 'k1', product_id: 1, product_title: 'מנשא חיבוק', variant_title: '', quantity: 1,
                final_line_price: base, url: '/products/x', image: '' }],
      discount_codes: window.__codes.map(function(c){
        return { code: c, amount: c.toUpperCase() === 'SAVE10' ? off : 0, applicable: c.toUpperCase() === 'SAVE10' };
      }),
      cart_level_discount_applications: applied.length
        ? [{ type: 'discount_code', title: 'SAVE10', total_allocated_amount: off }] : []
    };
  }
  window.fetch = function(url, opts){
    window.__requests.push({ url: String(url), body: opts && opts.body });
    if (window.__net === 'down') return Promise.reject(new TypeError('Failed to fetch'));
    if (String(url).indexOf('/cart/update.js') === 0) {
      if (window.__net === '422') {
        return Promise.resolve({ ok: false, status: 422,
          json: function(){ return Promise.resolve({ description: 'לא ניתן' }); } });
      }
      var sent = JSON.parse(opts.body).discount;
      window.__codes = sent ? sent.split(',').filter(Boolean) : [];
    }
    return Promise.resolve({ ok: true, status: 200, json: function(){ return Promise.resolve(buildCart()); } });
  };
<\/script>
<script>${behaviour}<\/script>
</body></html>`);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
await page.goto('file://' + DIR + 'cart-code.html');
await page.waitForTimeout(150);

let pass = 0, fail = 0;
async function check(name, fn) {
  let ok = false, err = null;
  try { ok = await fn(); } catch (e) { err = e; }
  if (ok) { pass++; console.log('PASS — ' + name); }
  else { fail++; console.log('FAIL — ' + name + (err ? ' :: ' + err.message : '')); }
}

const msg = () => page.evaluate(() => {
  const m = document.querySelector('[data-cart-code-msg]');
  return { text: m.textContent.trim(), state: m.getAttribute('data-state'), shown: m.style.display !== 'none' };
});
const pills = () => page.evaluate(() =>
  [...document.querySelectorAll('.lxm-cart-code-pill')].map((p) => p.getAttribute('data-code')));

// open the drawer so the footer, and the field, are on screen
await page.click('[data-cart-toggle]');
await page.waitForTimeout(250);

await check('שדה הקוד מוצג בעגלה', async () =>
  (await page.isVisible('[data-cart-code-input]')) && (await page.isVisible('[data-cart-code-apply]')));

await check('אין הודעה לפני שמקלידים', async () => !(await msg()).shown);

await check('קוד ריק מבקש להקליד', async () => {
  await page.click('[data-cart-code-apply]');
  await page.waitForTimeout(120);
  const m = await msg();
  return m.state === 'error' && m.text.includes('להקליד');
});

await check('קוד תקף מוחל', async () => {
  await page.fill('[data-cart-code-input]', 'SAVE10');
  await page.click('[data-cart-code-apply]');
  await page.waitForTimeout(250);
  const m = await msg();
  return m.state === 'ok' && (await pills()).join() === 'SAVE10';
});

await check('השדה מתרוקן אחרי הצלחה', async () =>
  (await page.inputValue('[data-cart-code-input]')) === '');

await check('ההנחה מוצגת בסיכום', async () =>
  (await page.isVisible('[data-cart-code-saving]')) &&
  (await page.textContent('[data-cart-code-saving-amount]')).includes('20'));

await check('הסכום לתשלום ירד', async () =>
  (await page.textContent('[data-cart-subtotal]')).includes('180'));

await check('אותו קוד פעמיים נחסם בלי בקשת רשת', async () => {
  const before = await page.evaluate(() => window.__requests.length);
  await page.fill('[data-cart-code-input]', 'save10');
  await page.click('[data-cart-code-apply]');
  await page.waitForTimeout(200);
  const m = await msg();
  const after = await page.evaluate(() => window.__requests.length);
  return m.state === 'error' && m.text.includes('כבר') && after === before;
});

/* The important case: Shopify answers 200 with applicable:false. Treating that
   as success would tell the shopper her code worked when it did not. */
await check('קוד שנדחה מדווח כשגיאה, לא כהצלחה', async () => {
  await page.fill('[data-cart-code-input]', 'NOPE');
  await page.click('[data-cart-code-apply]');
  await page.waitForTimeout(250);
  const m = await msg();
  return m.state === 'error' && m.text.includes('לא תקף') && !(await pills()).includes('NOPE');
});

await check('הקוד התקף שרד את הקוד שנדחה', async () =>
  (await pills()).join() === 'SAVE10');

await check('הסרת קוד מסירה אותו', async () => {
  await page.click('[data-cart-code-remove]');
  await page.waitForTimeout(250);
  return (await pills()).length === 0 && (await page.isHidden('[data-cart-code-saving]'));
});

await check('הסכום חזר אחרי הסרה', async () =>
  (await page.textContent('[data-cart-subtotal]')).includes('200'));

await check('Enter מחיל את הקוד', async () => {
  await page.fill('[data-cart-code-input]', 'SAVE10');
  await page.press('[data-cart-code-input]', 'Enter');
  await page.waitForTimeout(250);
  return (await msg()).state === 'ok' && (await pills()).join() === 'SAVE10';
});

await check('נפילת רשת מציגה שגיאה ולא קורסת', async () => {
  await page.click('[data-cart-code-remove]');
  await page.waitForTimeout(250);
  await page.evaluate(() => { window.__net = 'down'; });
  await page.fill('[data-cart-code-input]', 'SAVE10');
  await page.click('[data-cart-code-apply]');
  await page.waitForTimeout(300);
  const m = await msg();
  return m.state === 'error' && m.text.includes('נסי שוב');
});

// The button must not stay disabled after a failure, or the shopper is stuck.
await check('אפשר לנסות שוב אחרי כישלון', async () => {
  const disabled = await page.getAttribute('[data-cart-code-apply]', 'disabled');
  await page.evaluate(() => { window.__net = 'ok'; });
  await page.click('[data-cart-code-apply]');
  await page.waitForTimeout(250);
  return disabled === null && (await msg()).state === 'ok';
});

await check('שגיאת 422 מהשרת מטופלת', async () => {
  await page.click('[data-cart-code-remove]');
  await page.waitForTimeout(250);
  await page.evaluate(() => { window.__net = '422'; });
  await page.fill('[data-cart-code-input]', 'SAVE10');
  await page.click('[data-cart-code-apply]');
  await page.waitForTimeout(300);
  const m = await msg();
  await page.evaluate(() => { window.__net = 'ok'; });
  return m.state === 'error';
});

await check('הקוד נשלח כרשימה מופרדת בפסיקים', async () => {
  const last = await page.evaluate(() =>
    window.__requests.filter((r) => r.url.indexOf('/cart/update.js') === 0).pop());
  return JSON.parse(last.body).discount === 'SAVE10';
});

const inPage = await page.evaluate(() => window.__errors.slice());
const all = [...pageErrors, ...inPage];
console.log(all.length ? 'JS ERRORS:\n' + [...new Set(all)].join('\n') : 'no JS errors');
console.log(`\n${pass} pass, ${fail} fail`);
await browser.close();
process.exit(fail || all.length ? 1 : 0);
