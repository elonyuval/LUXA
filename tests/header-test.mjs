import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const DIR = new URL('./.out/', import.meta.url).pathname;
const src = readFileSync(new URL('../sections/', import.meta.url).pathname + 'luxamom-header.liquid', 'utf8');
const style = src.match(/<style>([\s\S]*?)<\/style>/)[1];
const behaviour = src.match(/<script>([\s\S]*?)<\/script>/)[1];

const products = [
  ['תיק החתלה 3-ב-1', '/products/bag'],
  ['מנשא חיבוק', '/products/sling'],
  ['מחמם בקבוק אלחוטי נייד', '/products/warmer'],
  ['כרית מגן ראש לתינוק', '/products/cushion']
];
const subLis = products.map(([t, u]) => `<li><a href="${u}">${t}</a></li>`).join('');
const subAs = products.map(([t, u]) => `<a href="${u}">${t}</a>`).join('');
const caret = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';

writeFileSync(DIR + '/header.html', `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>${style}</style></head><body>
<header class="lxm-header">
  <div class="lxm-h-wrap lxm-nav">
    <button class="lxm-burger" type="button" aria-label="menu">≡</button>
    <a href="/" class="lxm-logo">LUXAMOM</a>
    <ul class="lxm-links">
      <li><a href="/">בית</a></li>
      <li class="lxm-has-sub">
        <button type="button" class="lxm-menu-toggle" data-sub-toggle aria-expanded="false">מוצרים ${caret}</button>
        <ul class="lxm-sub">${subLis}</ul>
      </li>
      <li><a href="/pages/about-luxa">אודות</a></li>
    </ul>
    <div class="lxm-actions"><a href="/cart" class="lxm-icon" data-cart-toggle><span class="lxm-cart-count" data-cart-count>0</span></a></div>
  </div>
  <nav class="lxm-mobile-panel">
    <a href="/">בית</a>
    <div class="lxm-m-group">
      <button type="button" class="lxm-m-toggle" data-m-sub-toggle aria-expanded="false">מוצרים ${caret}</button>
      <div class="lxm-m-sub">${subAs}</div>
    </div>
    <a href="/pages/about-luxa">אודות</a>
  </nav>
</header>
<script>window.fetch=function(){return Promise.resolve({json:function(){return Promise.resolve({item_count:0,items:[]});}});};</script>
<script>${behaviour}</script>
</body></html>`);

const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const check = async (label, fn) => { try { console.log(((await fn()) ? 'PASS' : 'FAIL') + ' — ' + label); } catch (e) { console.log('ERROR — ' + label + ': ' + e.message); } };

// mobile
const m = await browser.newPage({ viewport: { width: 390, height: 800 } });
m.on('pageerror', (e) => errors.push('mobile: ' + e.message));
await m.goto('file://' + DIR + '/header.html');
await check('burger menu closed on load', async () => await m.isHidden('.lxm-mobile-panel'));
await m.click('.lxm-burger');
await check('burger opens the panel', async () => await m.isVisible('.lxm-mobile-panel'));
await check('product list starts collapsed', async () => await m.isHidden('.lxm-m-sub'));
await m.click('[data-m-sub-toggle]');
await check('tapping מוצרים expands the product list', async () =>
  (await m.isVisible('.lxm-m-sub')) && (await m.getAttribute('[data-m-sub-toggle]', 'aria-expanded')) === 'true');
await check('all four products listed by name', async () => {
  const names = await m.$$eval('.lxm-m-sub a', (a) => a.map((x) => x.textContent.trim()));
  return names.length === 4 && names[1] === 'מנשא חיבוק';
});
await check('a product links straight to its page', async () =>
  (await m.getAttribute('.lxm-m-sub a:nth-child(2)', 'href')) === '/products/sling');
await m.click('.lxm-m-sub a:nth-child(2)');
await check('tapping a product closes the burger', async () => await m.isHidden('.lxm-mobile-panel'));

// desktop
const d = await browser.newPage({ viewport: { width: 1280, height: 800 } });
d.on('pageerror', (e) => errors.push('desktop: ' + e.message));
await d.goto('file://' + DIR + '/header.html');
await check('desktop dropdown closed on load', async () => await d.isHidden('.lxm-sub'));
await d.click('[data-sub-toggle]');
await check('clicking מוצרים opens the dropdown', async () => await d.isVisible('.lxm-sub'));
await d.mouse.click(5, 500);
await check('clicking outside closes it', async () =>
  (await d.isHidden('.lxm-sub')) && (await d.getAttribute('[data-sub-toggle]', 'aria-expanded')) === 'false');
await check('no scroll-to-anchor links left', async () =>
  await d.evaluate(() => !document.querySelector('a[href*="#products"]')));

console.log(errors.length ? 'JS ERRORS:\n' + errors.join('\n') : 'no JS errors');
await browser.close();
