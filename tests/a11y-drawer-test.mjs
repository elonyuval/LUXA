/*
 * The accessibility widget and the cart drawer on one page.
 *
 * The drawer's loading / error / note states are injected into the DOM long
 * after the widget has scanned the page, so this checks that the widget's
 * MutationObserver actually picks them up — otherwise a shopper running at
 * 150% text would get the new states at the original size.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const DIR = new URL('./.out/', import.meta.url).pathname;
const SEC = new URL('../sections/', import.meta.url).pathname;
const grab = (f, tag) => {
  const m = readFileSync(SEC + f, 'utf8').match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : '';
};
// The widget file carries its markup between the style and script blocks.
const a11ySrc = readFileSync(SEC + 'luxa-accessibility.liquid', 'utf8');
const a11yStyle = a11ySrc.match(/<style>([\s\S]*?)<\/style>/)[1];
const a11yScripts = [...a11ySrc.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const a11yMarkup = (a11ySrc.match(/<\/style>([\s\S]*?)<script>/) || ['', ''])[1]
  .replace(/\{\{[^}]*\}\}/g, '')
  .replace(/\{%[^%]*%\}/g, '');

const headerStyle = grab('luxamom-header.liquid', 'style');
const headerJs = grab('luxamom-header.liquid', 'script');

writeFileSync(DIR + '/a11y-drawer.html', `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>${headerStyle}</style><style>${a11yStyle}</style></head><body>
<header class="lxm-header"><div class="lxm-h-wrap lxm-nav">
  <a href="/" class="lxm-logo">LUXAMOM</a>
  <div class="lxm-actions"><a href="/cart" class="lxm-icon" data-cart-toggle><span class="lxm-cart-count" data-cart-count style="display:none;">0</span></a></div>
</div><nav class="lxm-mobile-panel"><a href="/">בית</a></nav></header>
<main><p class="lxm-body-copy">טקסט רגיל בעמוד לבדיקת קנה מידה.</p></main>
<div class="lxm-cart-drawer-overlay" data-cart-overlay></div>
<aside class="lxm-cart-drawer" data-cart-drawer aria-hidden="true">
  <div class="lxm-cart-drawer-head"><h3>הסל שלך</h3><button type="button" class="lxm-cart-drawer-close" data-cart-close>x</button></div>
  <div class="lxm-cart-drawer-body" data-cart-body><p class="lxm-cart-empty">הסל שלך ריק</p></div>
  <div class="lxm-cart-drawer-foot" data-cart-foot style="display:none;">
    <div class="lxm-cart-upsell" data-cart-upsell><p class="lxm-cart-nudge" data-cart-nudge style="display:none;"></p></div>
    <div class="lxm-cart-saving-row" data-cart-saving style="display:none;"><span data-cart-saving-amount></span></div>
    <span data-cart-subtotal>₪0</span>
    <a href="/cart" class="lxm-cart-checkout-btn" data-cart-checkout>מעבר לתשלום</a>
  </div>
</aside>
${a11yMarkup}
<script>
  window.__errors = [];
  window.addEventListener('error', function(e){ window.__errors.push('error: ' + e.message); });
  window.addEventListener('unhandledrejection', function(e){
    window.__errors.push('rejection: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
  });
  window.__mode = 'ok';
  window.__cart = { item_count: 1, total_price: 16999, total_discount: 0, original_total_price: 16999,
    items: [{ id: 1, key: 'k1', product_id: 9, url: '/products/sling', product_title: 'מנשא חיבוק LUXAMOM',
      variant_title: 'מנומר ירוק', quantity: 1, final_line_price: 16999, image: null }] };
  window.fetch = function(){
    if (window.__mode === 'dead') return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve({ ok:true, status:200, json: function(){ return Promise.resolve(window.__cart); } });
  };
</script>
${a11yScripts.map((s) => `<script>${s}<\/script>`).join('\n')}
<script>${headerJs}<\/script>
</body></html>`);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 820 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
await page.goto('file://' + DIR + '/a11y-drawer.html');
await page.waitForTimeout(300);

const errs = async () => [...pageErrors, ...(await page.evaluate(() => window.__errors.slice()))];
const rep = (l, ok, x = '') => console.log((ok ? 'PASS' : 'FAIL') + ' — ' + l + (x ? '  [' + x + ']' : ''));
const fontOf = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  return el ? parseFloat(getComputedStyle(el).fontSize) : null;
}, sel);

// The widget must be on the page at all.
const hasWidget = await page.evaluate(() => !!document.querySelector('[data-luxa-a11y]'));
rep('רכיב הנגישות נטען יחד עם הדראוור', hasWidget);

const baseCopy = await fontOf('.lxm-body-copy');

// Raise the text size two steps through the widget's own control.
await page.click('[data-luxa-a11y-toggle]');
await page.waitForTimeout(250);
const bumped = await page.evaluate(() => {
  const inc = document.querySelector('[data-luxa-a11y-size="1"]');
  if (!inc) return false;
  inc.click(); inc.click();
  return true;
});
await page.waitForTimeout(700);

const scaledCopy = await fontOf('.lxm-body-copy');
rep('הגדלת טקסט משנה טקסט קיים בעמוד',
  bumped && scaledCopy !== null && baseCopy !== null && scaledCopy > baseCopy,
  'base=' + baseCopy + ' scaled=' + scaledCopy);

// Close the widget panel so its backdrop stops intercepting clicks.
await page.evaluate(() => {
  const c = document.querySelector('[data-luxa-a11y-close]');
  if (c) c.click();
});
await page.waitForTimeout(250);

// Now inject the drawer states AFTER the scan and confirm they get scaled too.
await page.evaluate(() => window.LXMCart.open());
await page.waitForTimeout(700);
const lineFont = await fontOf('.lxm-cart-line-title');
const ratio = scaledCopy / baseCopy;
rep('תוכן שנוסף לדראוור אחרי הסריקה גם הוא מוגדל',
  lineFont !== null && lineFont > 14.5 * (1 + (ratio - 1) * 0.5),
  'cart line font=' + lineFont + ' (base 14.5, page ratio ' + ratio.toFixed(2) + ')');

// The error state, injected later still.
await page.evaluate(() => { window.__mode = 'dead'; });
await page.evaluate(() => window.LXMCart.close());
await page.evaluate(() => window.LXMCart.open());
await page.waitForTimeout(800);
const problemVisible = await page.isVisible('.lxm-cart-problem');
const problemFont = await fontOf('.lxm-cart-problem p');
rep('מצב השגיאה מוצג גם עם הגדלת טקסט', problemVisible);
rep('מצב השגיאה מוגדל יחד עם שאר העמוד',
  problemFont !== null && problemFont > 15 * (1 + (ratio - 1) * 0.5),
  'problem font=' + problemFont + ' (base 15, page ratio ' + ratio.toFixed(2) + ')');
rep('כפתור "לנסות שוב" נגיש', await page.isVisible('[data-cart-retry]'));

// Dark / contrast mode must not hide the new states.
await page.evaluate(() => {
  const dark = document.querySelector('[data-luxa-a11y-opt="dark"]');
  if (dark) dark.click();
});
await page.waitForTimeout(500);
rep('מצב השגיאה נשאר גלוי גם בניגודיות כהה', await page.isVisible('.lxm-cart-problem'));

const all = await errs();
rep('אין שגיאות JS בשילוב נגישות + דראוור', all.length === 0, all.join(' | '));
await page.screenshot({ path: DIR + '/a11y-drawer.png' });
await browser.close();
