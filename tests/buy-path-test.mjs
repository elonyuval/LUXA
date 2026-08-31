/*
 * Can a shopper actually complete a purchase?
 * Drives the REAL header JS + the REAL older-PDP JS (bag/warmer/cushion share it)
 * and the sling PDP JS, through the add-to-cart -> drawer -> checkout path.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const DIR = new URL('./.out/', import.meta.url).pathname;
const header = readFileSync(new URL('../sections/', import.meta.url).pathname + 'luxamom-header.liquid', 'utf8');
const headerJs = header.match(/<script>([\s\S]*?)<\/script>/)[1];

// The add-to-cart handler shared by bag / warmer / cushion, verbatim from the live theme.
const oldPdpJs = `
  var root = document.querySelector('.lxm-pdp');
  var variantInput = root.querySelector('[data-variant-id-input]');
  var pdpForm = root.querySelector('.lxm-pdp-form');
  if (pdpForm) {
    pdpForm.addEventListener('submit', function(e){
      if (!window.LXMCart) return;
      e.preventDefault();
      var vid = variantInput ? variantInput.value : null;
      if (!vid) return;
      var submitBtn = pdpForm.querySelector('.lxm-btn-primary');
      if (submitBtn) submitBtn.disabled = true;
      window.LXMCart.addItem(vid, 1).then(function(){
        if (submitBtn) submitBtn.disabled = false;
      }).catch(function(){
        if (submitBtn) submitBtn.disabled = false;
        pdpForm.submit();
      });
    });
  }
`;

writeFileSync(DIR + '/buy.html', `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"></head><body>
<header class="lxm-header"><div class="lxm-h-wrap">
  <a href="/cart" class="lxm-icon" data-cart-toggle><span data-cart-count style="display:none;">0</span></a>
</div><nav class="lxm-mobile-panel"></nav></header>
<div data-cart-overlay></div>
<aside data-cart-drawer aria-hidden="true">
  <button type="button" data-cart-close>x</button>
  <div data-cart-body><p class="lxm-cart-empty">הסל שלך ריק</p></div>
  <div data-cart-foot style="display:none;">
    <div data-cart-upsell><p data-cart-nudge style="display:none;"></p></div>
    <div data-cart-saving style="display:none;"><span data-cart-saving-amount></span></div>
    <span data-cart-subtotal>0</span>
    <a href="/cart" data-cart-checkout>מעבר לתשלום</a>
  </div>
</aside>

<div class="lxm-pdp">
  <form class="lxm-pdp-form" action="/cart/add" method="post">
    <input type="hidden" name="id" value="44104963031118" data-variant-id-input>
    <button type="submit" class="lxm-btn lxm-btn-primary">הוספה לסל</button>
  </form>
</div>

<script>
  window.__errors = [];
  window.__addCalls = [];      // every /cart/add.js POST
  window.__nativeSubmits = 0;  // every native (non-ajax) form post
  window.addEventListener('error', function(e){ window.__errors.push('error: ' + e.message); });
  window.addEventListener('unhandledrejection', function(e){
    window.__errors.push('unhandledrejection: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
  });

  // Count native form submits instead of navigating away.
  HTMLFormElement.prototype.submit = function(){ window.__nativeSubmits++; };

  window.__mode = 'ok';
  window.__cart = { item_count: 0, items: [], total_price: 0, total_discount: 0, original_total_price: 0 };
  var LINE = { id: 44104963031118, key: '44104963031118:k', product_id: 8002056126542,
               product_title: 'תיק החתלה 3-ב-1 LUXAMOM', variant_title: 'שחור',
               quantity: 1, final_line_price: 34900, image: null };

  window.fetch = function(url, opts){
    var u = String(url);
    if (u.indexOf('/cart/add.js') === 0) {
      window.__addCalls.push(JSON.parse(opts.body));
      if (window.__mode === 'add-fails') {
        return Promise.resolve({ ok:false, status:422, json: function(){ return Promise.resolve(
          { status:422, message:'Cart Error', description:'לא ניתן להוסיף את הפריט הזה לסל.' }); } });
      }
      var body = JSON.parse(opts.body);
      body.items.forEach(function(it){
        var line = Object.assign({}, LINE, { quantity: it.quantity });
        window.__cart.items.push(line);
      });
      window.__cart.item_count = window.__cart.items.reduce(function(a,i){ return a+i.quantity; },0);
      window.__cart.total_price = window.__cart.item_count * 34900;
      window.__cart.original_total_price = window.__cart.total_price;
      return Promise.resolve({ ok:true, status:200, json: function(){ return Promise.resolve(window.__cart); } });
    }
    if (u.indexOf('/cart.js') === 0 && window.__mode === 'cartjs-fails') {
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    return Promise.resolve({ ok:true, status:200, json: function(){ return Promise.resolve(window.__cart); } });
  };
</script>
<script>(function(){${headerJs}})();</script>
<script>(function(){${oldPdpJs}})();</script>
</body></html>`);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 820 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
await page.goto('file://' + DIR + '/buy.html');
await page.waitForTimeout(150);

const st = () => page.evaluate(() => ({
  adds: window.__addCalls.length,
  units: window.__addCalls.reduce((a, b) => a + b.items.reduce((x, i) => x + i.quantity, 0), 0),
  native: window.__nativeSubmits,
  count: window.__cart.item_count,
  errs: window.__errors.slice()
}));
const reset = (mode) => page.evaluate((m) => {
  window.__mode = m; window.__addCalls = []; window.__nativeSubmits = 0; window.__errors = [];
  window.__cart = { item_count: 0, items: [], total_price: 0, total_discount: 0, original_total_price: 0 };
}, mode);
const rep = (l, ok, x = '') => console.log((ok ? 'PASS' : 'FAIL') + ' — ' + l + (x ? '  [' + x + ']' : ''));

// 1 — the ordinary case: one click, one unit, drawer opens
await reset('ok');
await page.click('.lxm-pdp-form button[type=submit]');
await page.waitForTimeout(250);
{
  const s = await st();
  const open = await page.evaluate(() => document.querySelector('[data-cart-drawer]').classList.contains('lxm-open'));
  rep('רכישה רגילה: יחידה אחת נכנסת לסל', s.units === 1 && s.count === 1, 'units=' + s.units);
  rep('רכישה רגילה: הדראוור נפתח', open);
  rep('רכישה רגילה: כפתור מעבר לתשלום קיים', await page.isVisible('[data-cart-checkout]'));
  rep('רכישה רגילה: בלי שגיאות', s.errs.length === 0 && pageErrors.length === 0, s.errs.join('|'));
}

// 2 — /cart/add.js itself rejects the item
await reset('add-fails');
pageErrors.length = 0;
await page.click('.lxm-pdp-form button[type=submit]');
await page.waitForTimeout(300);
{
  const s = await st();
  const btnDisabled = await page.isDisabled('.lxm-pdp-form button[type=submit]');
  rep('הוספה נדחית ע"י שופיפיי: הכפתור לא נשאר תקוע', !btnDisabled);
  // A real add failure must fall back to the native form post exactly once, so
  // Shopify itself reports the reason instead of the click doing nothing.
  rep('הוספה נדחית: נופל לשליחה רגילה פעם אחת בדיוק', s.native === 1, 'native submits=' + s.native);
  rep('הוספה נדחית: לא נוסף פריט בטעות', s.count === 0, 'item_count=' + s.count);
}

// 3 — the add SUCCEEDS but the follow-up /cart.js fails
await reset('ok');
pageErrors.length = 0;
await page.evaluate(() => {
  // add succeeds, then the refresh fetch dies — a dropped connection mid-flow
  const realFetch = window.fetch;
  window.fetch = function (u, o) {
    if (String(u).indexOf('/cart.js') === 0) return Promise.reject(new TypeError('Failed to fetch'));
    return realFetch(u, o);
  };
});
await page.click('.lxm-pdp-form button[type=submit]');
await page.waitForTimeout(400);
{
  const s = await st();
  rep('נפילת רשת אחרי הוספה מוצלחת: לא נוספת יחידה כפולה',
    s.units === 1 && s.native === 0,
    'ajax units=' + s.units + ', native submits=' + s.native);
  rep('נפילת רשת אחרי הוספה מוצלחת: בלי שגיאת JS', s.errs.length === 0 && pageErrors.length === 0,
    [...s.errs, ...pageErrors].join(' | '));
}

console.log('\n' + (pageErrors.length ? 'PAGE ERRORS:\n' + [...new Set(pageErrors)].join('\n') : ''));
await browser.close();
