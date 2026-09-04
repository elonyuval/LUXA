import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const DIR = new URL('./.out/', import.meta.url).pathname;
const src = readFileSync(new URL('../sections/', import.meta.url).pathname + 'luxamom-header.liquid', 'utf8');
const style = src.match(/<style>([\s\S]*?)<\/style>/)[1];
const behaviour = src.match(/<script>([\s\S]*?)<\/script>/)[1];

/* The drawer is extracted from the section rather than retyped. It used to be
   hand-built here, which is how this file went on testing a nudge that had been
   deleted and never saw the discount field that had been added. */
const drawer =
  '<div class="lxm-cart-drawer-overlay" data-cart-overlay></div>' +
  src.slice(src.indexOf('<aside class="lxm-cart-drawer"'), src.indexOf('</aside>') + 8)
    .replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, '')
    .replace(/\{\{\s*routes\.cart_url\s*\}\}/g, '/cart')
    .replace(/\{%[\s\S]*?%\}/g, '')
    .replace(/\{\{[^}]*\}\}/g, '');

/* The upsell list and its nudge were removed from the drawer: the cart shows
   what is in it. What remains here are the products a cart line can hold. */
const products = [
  { pid: 8002056126542, vid: 44100000001, name: 'תיק החתלה 3-ב-1 LUXAMOM', price: 34900 },
  { pid: 8016473555022, vid: 44147655180366, name: 'מנשא חיבוק LUXAMOM', price: 16999 },
  { pid: 8002063007822, vid: 44100000002, name: 'מחמם בקבוק אלחוטי נייד LUXAMOM', price: 11900 },
  { pid: 8003086024782, vid: 44100000003, name: 'כרית מגן ראש לתינוק LUXAMOM', price: 9900 }
];

writeFileSync(
  DIR + '/cart.html',
  `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>${style}</style></head><body>
<header class="lxm-header">
  <div class="lxm-h-wrap lxm-nav">
    <button class="lxm-burger" type="button">≡</button>
    <a href="/" class="lxm-logo">LUXAMOM</a>
    <ul class="lxm-links"><li><a href="/">בית</a></li></ul>
    <div class="lxm-actions">
      <a href="/search" class="lxm-icon">S</a>
      <a href="/cart" class="lxm-icon" data-cart-toggle>
        <span class="lxm-cart-count" data-cart-count style="display:none;">0</span>
      </a>
    </div>
  </div>
  <nav class="lxm-mobile-panel"><a href="/">בית</a></nav>
</header>

${drawer}

<script>
  window.__errors = [];
  window.addEventListener('error', function(e){ window.__errors.push('error: ' + e.message); });
  window.addEventListener('unhandledrejection', function(e){
    window.__errors.push('unhandledrejection: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
  });
  window.__cart = { item_count: 0, items: [], total_price: 0, total_discount: 0, original_total_price: 0 };
  window.fetch = function(url, opts){
    if (String(url).indexOf('/cart/change.js') === 0) {
      var b = JSON.parse(opts.body);
      window.__cart.items = window.__cart.items.filter(function(i){ return !(i.key === b.id && b.quantity === 0); });
      window.__cart.items.forEach(function(i){ if (i.key === b.id) i.quantity = b.quantity; });
      window.__cart.item_count = window.__cart.items.reduce(function(a,i){ return a + i.quantity; }, 0);
    }
    return Promise.resolve({ ok: true, status: 200, json: function(){ return Promise.resolve(window.__cart); } });
  };
</script>
<script>${behaviour}</script>
</body></html>`
);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 820 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text()) && pageErrors.push('console: ' + m.text()));
await page.goto('file://' + DIR + '/cart.html');

const errs = async () => {
  const inPage = await page.evaluate(() => window.__errors.slice());
  return [...pageErrors, ...inPage];
};
const clearErrs = async () => {
  pageErrors.length = 0;
  await page.evaluate(() => { window.__errors = []; });
};
const check = async (label, fn) => {
  try {
    const r = await fn();
    console.log((r ? 'PASS' : 'FAIL') + ' — ' + label);
  } catch (e) {
    console.log('ERROR — ' + label + ': ' + e.message);
  }
};

const setCart = (cart) => page.evaluate((c) => { window.__cart = c; }, cart);

const line = (i, over = {}) => ({
  id: products[i].vid,
  key: products[i].vid + ':k' + i,
  product_id: products[i].pid,
  product_title: products[i].name,
  variant_title: 'מנומר ירוק',
  quantity: 1,
  final_line_price: products[i].price,
  image: null,
  ...over
});

// 1 — empty cart
await clearErrs();
await page.evaluate(() => window.LXMCart.close());
await page.click('[data-cart-toggle]');
await page.waitForTimeout(120);
await check('empty cart opens without errors', async () =>
  (await page.isVisible('[data-cart-drawer]')) && (await errs()).length === 0);

// 2 — one item
await setCart({ item_count: 1, items: [line(1)], total_price: 16999, total_discount: 0, original_total_price: 16999 });
await clearErrs();
await page.evaluate(() => window.LXMCart.close());
await page.evaluate(() => window.LXMCart.close());
await page.click('[data-cart-toggle]');
await page.waitForTimeout(150);
await check('one item renders without errors', async () => (await errs()).length === 0);
await check('subtotal keeps agorot', async () => (await page.textContent('[data-cart-subtotal]')) === '₪169.99');

// 3 — two items with an automatic discount
await setCart({
  item_count: 2,
  items: [line(1), line(3)],
  total_price: 24299,
  total_discount: 2600,
  original_total_price: 26899
});
await clearErrs();
await page.evaluate(() => window.LXMCart.close());
await page.evaluate(() => window.LXMCart.close());
await page.click('[data-cart-toggle]');
await page.waitForTimeout(150);
await check('two items + discount render without errors', async () => (await errs()).length === 0);
await check('saving row shows the discount', async () =>
  (await page.isVisible('[data-cart-saving]')) && (await page.textContent('[data-cart-saving-amount]')) === '₪26');

// 4 — quantity controls
await clearErrs();
await page.click('[data-qty-increase] >> nth=0');
await page.waitForTimeout(150);
await check('quantity increase raises no error', async () => (await errs()).length === 0);
await clearErrs();
await page.click('[data-qty-decrease] >> nth=0');
await page.waitForTimeout(150);
await check('quantity decrease raises no error', async () => (await errs()).length === 0);
await clearErrs();
await page.click('[data-line-remove] >> nth=0');
await page.waitForTimeout(150);
await check('removing a line raises no error', async () => (await errs()).length === 0);

// 6 — a line with no image and no variant title (real for single-variant products)
await setCart({
  item_count: 1,
  items: [line(0, { image: null, variant_title: null })],
  total_price: 34900,
  total_discount: 0,
  original_total_price: 34900
});
await clearErrs();
await page.evaluate(() => window.LXMCart.close());
await page.evaluate(() => window.LXMCart.close());
await page.click('[data-cart-toggle]');
await page.waitForTimeout(150);
await check('line without image or variant title renders', async () => (await errs()).length === 0);

// 7 — a full cart
await setCart({
  item_count: 4,
  items: [line(0), line(1), line(2), line(3)],
  total_price: 58959,
  total_discount: 14740,
  original_total_price: 73699
});
await clearErrs();
await page.evaluate(() => window.LXMCart.close());
await page.evaluate(() => window.LXMCart.close());
await page.click('[data-cart-toggle]');
await page.waitForTimeout(150);
await check('full cart renders', async () => (await errs()).length === 0);
/* isHidden() on an element that does not exist returns true, so asserting the
   nudge is hidden would pass whether or not the drawer still sold to her. This
   reads the section instead. */
await check('הסל לא מוכר: אין רשימת השלמה ואין באנר דחיפה', async () => {
  const src = readFileSync(new URL('../sections/luxamom-header.liquid', import.meta.url).pathname, 'utf8');
  return !src.includes('data-cart-upsell') && !src.includes('data-cart-nudge') &&
         !src.includes('data-upsell-add');
});
await check('אבל שדה קוד ההנחה נשאר', async () => await page.isVisible('[data-cart-code-input]'));

// 8 — repeated clicks on the cart icon, the way a frustrated shopper does
await clearErrs();
for (let i = 0; i < 5; i++) await page.click('[data-cart-toggle]', { force: true });
await page.waitForTimeout(300);
await check('rapid repeated cart clicks raise no error', async () => (await errs()).length === 0);

const all = await errs();
console.log(all.length ? 'ERRORS SEEN:\n' + [...new Set(all)].join('\n') : 'no errors captured');
await browser.close();
