import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const DIR = new URL('./.out/', import.meta.url).pathname;
const src = readFileSync(new URL('../sections/', import.meta.url).pathname + 'luxamom-header.liquid', 'utf8');
const style = src.match(/<style>([\s\S]*?)<\/style>/)[1];
const behaviour = src.match(/<script>([\s\S]*?)<\/script>/)[1];

// The four upsell cards the live theme renders.
const upsells = [
  { pid: 8002056126542, vid: 44100000001, name: 'תיק החתלה 3-ב-1 LUXAMOM', price: 34900 },
  { pid: 8016473555022, vid: 44147655180366, name: 'מנשא חיבוק LUXAMOM', price: 16999 },
  { pid: 8002063007822, vid: 44100000002, name: 'מחמם בקבוק אלחוטי נייד LUXAMOM', price: 11900 },
  { pid: 8003086024782, vid: 44100000003, name: 'כרית מגן ראש לתינוק LUXAMOM', price: 9900 }
];

const upsellHtml = upsells
  .map(
    (u) => `<div class="lxm-cart-upsell-item" data-upsell-product="${u.pid}" data-upsell-variant="${u.vid}" data-upsell-price="${u.price}">
      <img src="" alt="${u.name}">
      <div class="lxm-cart-upsell-info">
        <span class="lxm-cart-upsell-name">${u.name}</span>
        <span class="lxm-cart-upsell-price">₪${u.price / 100}</span>
      </div>
      <button type="button" class="lxm-cart-upsell-add" data-upsell-add>הוספה</button>
    </div>`
  )
  .join('\n');

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

<div class="lxm-cart-drawer-overlay" data-cart-overlay></div>
<aside class="lxm-cart-drawer" data-cart-drawer aria-hidden="true">
  <div class="lxm-cart-drawer-head">
    <h3>הסל שלך</h3>
    <button type="button" class="lxm-cart-drawer-close" data-cart-close aria-label="סגירה">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </div>
  <div class="lxm-cart-drawer-body" data-cart-body><p class="lxm-cart-empty">הסל שלך ריק</p></div>
  <div class="lxm-cart-drawer-foot" data-cart-foot style="display:none;">
    <div class="lxm-cart-upsell" data-cart-upsell>
      <p class="lxm-cart-nudge" data-cart-nudge style="display:none;"></p>
      <p class="lxm-cart-upsell-title">להשלים את הסט</p>
      ${upsellHtml}
    </div>
    <div class="lxm-cart-saving-row" data-cart-saving style="display:none;">
      <span>חסכת בבאנדל</span><span class="lxm-cart-saving-amount" data-cart-saving-amount>₪0</span>
    </div>
    <div class="lxm-cart-subtotal-row"><span>סכום ביניים</span><span class="lxm-cart-subtotal-amount" data-cart-subtotal>₪0</span></div>
    <a href="/cart" class="lxm-cart-checkout-btn" data-cart-checkout>מעבר לתשלום</a>
  </div>
</aside>

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
  id: upsells[i].vid,
  key: upsells[i].vid + ':k' + i,
  product_id: upsells[i].pid,
  product_title: upsells[i].name,
  variant_title: 'מנומר ירוק',
  quantity: 1,
  final_line_price: upsells[i].price,
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
await check('nudge offers the next tier', async () => {
  const t = await page.textContent('[data-cart-nudge]');
  return t.includes('10%');
});

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

// 5 — upsell add
await setCart({ item_count: 1, items: [line(1)], total_price: 16999, total_discount: 0, original_total_price: 16999 });
await page.evaluate(() => window.LXMCart.close());
await page.evaluate(() => window.LXMCart.close());
await page.click('[data-cart-toggle]');
await page.waitForTimeout(150);
await clearErrs();
await page.click('[data-upsell-add] >> nth=0');
await page.waitForTimeout(200);
await check('upsell add raises no error', async () => (await errs()).length === 0);

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

// 7 — every product already in the cart, so no upsell is left
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
await check('full cart with no upsells left renders', async () => (await errs()).length === 0);
await check('nudge hidden at the top tier', async () => await page.isHidden('[data-cart-nudge]'));

// 8 — repeated clicks on the cart icon, the way a frustrated shopper does
await clearErrs();
for (let i = 0; i < 5; i++) await page.click('[data-cart-toggle]', { force: true });
await page.waitForTimeout(300);
await check('rapid repeated cart clicks raise no error', async () => (await errs()).length === 0);

const all = await errs();
console.log(all.length ? 'ERRORS SEEN:\n' + [...new Set(all)].join('\n') : 'no errors captured');
await browser.close();
