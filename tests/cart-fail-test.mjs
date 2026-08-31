import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const DIR = new URL('./.out/', import.meta.url).pathname;
const src = readFileSync(new URL('../sections/', import.meta.url).pathname + 'luxamom-header.liquid', 'utf8');
const style = src.match(/<style>([\s\S]*?)<\/style>/)[1];
const behaviour = src.match(/<script>([\s\S]*?)<\/script>/)[1];

const upsells = [
  { pid: 8002056126542, vid: 44100000001, name: 'תיק החתלה 3-ב-1 LUXAMOM', price: 34900 },
  { pid: 8016473555022, vid: 44147655180366, name: 'מנשא חיבוק LUXAMOM', price: 16999 }
];
const upsellHtml = upsells.map((u) => `<div class="lxm-cart-upsell-item" data-upsell-product="${u.pid}" data-upsell-variant="${u.vid}" data-upsell-price="${u.price}">
  <div class="lxm-cart-upsell-info"><span class="lxm-cart-upsell-name">${u.name}</span></div>
  <button type="button" class="lxm-cart-upsell-add" data-upsell-add>הוספה</button></div>`).join('\n');

writeFileSync(DIR + '/cart-fail.html',
`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>${style}</style></head><body>
<header class="lxm-header"><div class="lxm-h-wrap lxm-nav">
  <a href="/" class="lxm-logo">LUXAMOM</a>
  <div class="lxm-actions"><a href="/cart" class="lxm-icon" data-cart-toggle><span class="lxm-cart-count" data-cart-count style="display:none;">0</span></a></div>
</div><nav class="lxm-mobile-panel"><a href="/">בית</a></nav></header>
<div class="lxm-cart-drawer-overlay" data-cart-overlay></div>
<aside class="lxm-cart-drawer" data-cart-drawer aria-hidden="true">
  <div class="lxm-cart-drawer-head"><h3>הסל שלך</h3><button type="button" class="lxm-cart-drawer-close" data-cart-close>x</button></div>
  <div class="lxm-cart-drawer-body" data-cart-body><p class="lxm-cart-empty">הסל שלך ריק</p></div>
  <div class="lxm-cart-drawer-foot" data-cart-foot style="display:none;">
    <div class="lxm-cart-upsell" data-cart-upsell><p class="lxm-cart-nudge" data-cart-nudge style="display:none;"></p>${upsellHtml}</div>
    <div class="lxm-cart-saving-row" data-cart-saving style="display:none;"><span>חסכת</span><span data-cart-saving-amount>₪0</span></div>
    <div class="lxm-cart-subtotal-row"><span>סכום ביניים</span><span data-cart-subtotal>₪0</span></div>
    <a href="/cart" data-cart-checkout>מעבר לתשלום</a>
  </div>
</aside>
<script>
  window.__errors = [];
  window.addEventListener('error', function(e){ window.__errors.push('error: ' + e.message); });
  window.addEventListener('unhandledrejection', function(e){
    window.__errors.push('unhandledrejection: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
  });
  // mode is swapped from the test driver
  window.__mode = 'ok';
  window.__cart = { item_count: 1, items: [{ id: 44147655180366, key: '44147655180366:abc', product_id: 8016473555022,
    product_title: 'מנשא חיבוק LUXAMOM', variant_title: 'מנומר ירוק', quantity: 1, final_line_price: 16999, image: null }],
    total_price: 16999, total_discount: 0, original_total_price: 16999 };
  window.fetch = function(url, opts){
    var u = String(url);
    if (window.__mode === 'network' ) { return Promise.reject(new TypeError('Failed to fetch')); }
    if (window.__mode === 'html') {
      return Promise.resolve({ ok:false, status:503, json: function(){ return Promise.reject(new SyntaxError("Unexpected token '<', \\"<!DOCTYPE \\"... is not valid JSON")); } });
    }
    if (window.__mode === 'sold-out' && u.indexOf('/cart/change.js') === 0) {
      // Real Shopify 422 payload shape for a quantity that exceeds stock
      return Promise.resolve({ ok:false, status:422, json: function(){ return Promise.resolve({
        status: 422, message: 'Cart Error',
        description: 'לא ניתן להוסיף עוד מהמוצר הזה לסל.' }); } });
    }
    if (u.indexOf('/cart/change.js') === 0) {
      var b = JSON.parse(opts.body);
      window.__cart.items.forEach(function(i){ if (i.key === b.id) i.quantity = b.quantity; });
      window.__cart.items = window.__cart.items.filter(function(i){ return i.quantity > 0; });
      window.__cart.item_count = window.__cart.items.reduce(function(a,i){ return a+i.quantity; },0);
    }
    return Promise.resolve({ ok:true, status:200, json: function(){ return Promise.resolve(window.__cart); } });
  };
</script>
<script>${behaviour}</script>
</body></html>`);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 820 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text()) && pageErrors.push('console: ' + m.text()));

const errs = async () => [...pageErrors, ...(await page.evaluate(() => window.__errors.slice()))];
const clear = async () => { pageErrors.length = 0; await page.evaluate(() => { window.__errors = []; }); };
const mode = (m) => page.evaluate((x) => { window.__mode = x; }, m);
const report = (label, ok, extra = '') => console.log((ok ? 'PASS' : 'FAIL') + ' — ' + label + (extra ? '  [' + extra + ']' : ''));

await page.goto('file://' + DIR + '/cart-fail.html');
await page.waitForTimeout(150);

// A — /cart.js unreachable (offline / Shopify hiccup / blocked by an extension)
await mode('network');
await clear();
await page.evaluate(() => window.LXMCart.close());
await page.click('[data-cart-toggle]');
await page.waitForTimeout(250);
{
  const e = await errs();
  const opened = await page.evaluate(() => document.querySelector('[data-cart-drawer]').classList.contains('lxm-open'));
  report('cart icon click while /cart.js is unreachable: no JS error', e.length === 0, e.join(' | '));
  report('cart icon click while /cart.js is unreachable: drawer still opens', opened);
}

// B — /cart.js returns HTML (Shopify 5xx / challenge page)
await mode('html');
await clear();
await page.evaluate(() => window.LXMCart.close());
await page.click('[data-cart-toggle]');
await page.waitForTimeout(250);
{
  const e = await errs();
  report('cart icon click while /cart.js returns HTML: no JS error', e.length === 0, e.join(' | '));
}

// C — quantity change rejected with a real 422 (out of stock)
await mode('ok');
await clear();
await page.evaluate(() => window.LXMCart.close());
await page.click('[data-cart-toggle]');
await page.waitForTimeout(200);
await mode('sold-out');
await clear();
await page.click('[data-qty-increase] >> nth=0');
await page.waitForTimeout(250);
{
  const e = await errs();
  const bodyText = await page.textContent('[data-cart-body]');
  const badge = await page.textContent('[data-cart-count]');
  report('rejected quantity change: no JS error', e.length === 0, e.join(' | '));
  report('rejected quantity change: cart lines survive', !bodyText.includes('הסל שלך ריק'), 'body=' + bodyText.trim().slice(0, 40));
  report('rejected quantity change: badge is not "undefined"', badge !== 'undefined', 'badge=' + badge);
}

// D — add-to-cart failing from a PDP through LXMCart
await mode('network');
await clear();
await page.evaluate(() => { window.LXMCart.addItem(44147655180366, 1); });
await page.waitForTimeout(250);
{
  const e = await errs();
  report('LXMCart.addItem with a dead network: no unhandled rejection', e.length === 0, e.join(' | '));
}

// E — upsell "הוספה" button with a dead network (it has its own catch)
await mode('ok');
await clear();
await page.evaluate(() => window.LXMCart.open());
await page.waitForTimeout(200);
await mode('network');
await clear();
await page.click('[data-upsell-add] >> nth=0');
await page.waitForTimeout(300);
{
  const e = await errs();
  const label = await page.textContent('[data-upsell-add] >> nth=0');
  report('upsell add with a dead network: no unhandled rejection', e.length === 0, e.join(' | '));
  report('upsell add with a dead network: button recovers its label', label.trim() === 'הוספה', 'label=' + label.trim());
}

const all = await errs();
console.log('\n' + (all.length ? 'ERRORS SEEN:\n' + [...new Set(all)].join('\n') : 'no errors captured'));
await browser.close();
