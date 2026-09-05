import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const DIR = new URL('./.out/', import.meta.url).pathname;
mkdirSync(DIR, { recursive: true });

// Build the harness page from the real accessibility section, so this suite
// stays self-contained instead of depending on a file built elsewhere.
{
  const src = readFileSync(new URL('../sections/luxa-accessibility.liquid', import.meta.url).pathname, 'utf8');
  const body = src
    .replace(/\{%\s*schema\s*%\}[\s\S]*?\{%\s*endschema\s*%\}/g, '')
    .replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, '')
    .replace(/\{%-?\s*liquid[\s\S]*?-?%\}/g, '')
    .replace(/\{%-?\s*if[\s\S]*?-?%\}/g, '')
    .replace(/\{%-?\s*endif\s*-?%\}/g, '')
    .replace(/\{\{[^}]*?\|\s*default:\s*'([^']*)'[^}]*\}\}/g, '$1')
    .replace(/\{\{[^}]*?\|\s*default:\s*(\d+)[^}]*\}\}/g, '$1')
    .replace(/\{\{\s*side\s*\}\}/g, 'right')
    .replace(/\{\{\s*statement_url\s*\}\}/g, '/pages/accessibility')
    .replace(/\{\{[^}]*contact_email[^}]*\}\}/g, 'hello@luxa-il.com')
    .replace(/\{\{[^}]*\}\}/g, '');
  if (body.includes('{%') || body.includes('{{')) {
    console.log('FAIL — leftover Liquid in the accessibility harness');
  }
  writeFileSync(DIR + '/harness.html', `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Luxa harness</title>
<style>
  body{font-family:Montserrat,Arial,sans-serif;margin:0;background:#FAF8F5;color:#1A1410}
  header{position:fixed;top:0;inset-inline:0;background:#1A1410;color:#C9A96E;padding:14px 20px;z-index:50}
  main{padding:80px 24px 120px;max-width:760px;margin:0 auto}
  h1{font-size:34px}h2{font-size:22px}
  .card{background:#fff;border:1px solid #E6DED3;padding:20px;border-radius:12px;margin:20px 0}
  a{color:#8C6B2E}
  .swatch{width:120px;height:60px;background:linear-gradient(90deg,#C9A96E,#1A1410);border-radius:8px}
</style></head><body>
<header>LUXAMOM — חנות</header>
<main>
  <h1>מוצר לבדיקה</h1>
  <p>טקסט בדיקה בעברית עם <a href="#">קישור לדוגמה</a> ועוד מלל שמדגים ריווח, גודל גופן וניגודיות.</p>
  <div class="card"><h2>כותרת משנה</h2><p>פסקה בתוך כרטיס לבן.</p><div class="swatch"></div></div>
  <button>הוספה לסל</button>
</main>
<div id="shopify-section-luxa-a11y">${body}</div>
</body></html>`);
}

const url = 'file://' + DIR + '/harness.html';
const errors = [];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
await page.goto(url);

const check = async (label, fn) => {
  try {
    const r = await fn();
    console.log((r ? 'PASS' : 'FAIL') + ' — ' + label, r === true ? '' : r);
  } catch (e) {
    console.log('ERROR — ' + label + ': ' + e.message);
  }
};

// open panel
await page.click('[data-luxa-a11y-toggle]');
await check('panel opens + aria-expanded', async () =>
  (await page.isVisible('[data-luxa-a11y-panel]')) &&
  (await page.getAttribute('[data-luxa-a11y-toggle]', 'aria-expanded')) === 'true');
await check('focus moved into panel', async () =>
  await page.evaluate(() => document.activeElement?.hasAttribute('data-luxa-a11y-close')));
await page.screenshot({ path: DIR + '/shot-panel.png' });

await check('widget hoisted to top of tab order', async () =>
  await page.evaluate(() => document.body.firstElementChild?.hasAttribute('data-luxa-a11y')));

// font scaling
const baseSize = await page.evaluate(() => getComputedStyle(document.querySelector('main p')).fontSize);
await page.click('[data-luxa-a11y-size="1"]');
await page.click('[data-luxa-a11y-size="1"]');
const bigSize = await page.evaluate(() => getComputedStyle(document.querySelector('main p')).fontSize);
await check('text grows (' + baseSize + ' -> ' + bigSize + ')', async () => parseFloat(bigSize) > parseFloat(baseSize) * 1.25);
await check('widget text unscaled', async () =>
  await page.evaluate(() => !document.querySelector('.luxa-a11y-title').style.fontSize));

// dynamic content gets scaled too
await page.evaluate(() => {
  const p = document.createElement('p');
  p.id = 'late';
  p.textContent = 'תוכן שנוסף אחרי הטעינה';
  document.querySelector('main').appendChild(p);
});
await page.waitForTimeout(500);
await check('late DOM content scaled', async () =>
  await page.evaluate(() => !!document.getElementById('late').style.fontSize));

// exclusive contrast modes
await page.click('[data-luxa-a11y-opt="dark"]');
await check('dark mode on', async () => await page.evaluate(() => document.documentElement.classList.contains('luxa-a11y-dark')));
await check('panel readable in dark', async () =>
  await page.evaluate(() => getComputedStyle(document.querySelector('.luxa-a11y-panel')).backgroundColor === 'rgb(0, 0, 0)'));
await page.screenshot({ path: DIR + '/shot-dark.png' });

await page.click('[data-luxa-a11y-opt="invert"]');
await check('invert replaces dark (exclusive)', async () =>
  await page.evaluate(() => document.documentElement.classList.contains('luxa-a11y-invert') &&
    !document.documentElement.classList.contains('luxa-a11y-dark')));
await check('dark button un-pressed', async () =>
  (await page.getAttribute('[data-luxa-a11y-opt="dark"]', 'aria-pressed')) === 'false');
await page.screenshot({ path: DIR + '/shot-invert.png' });

await page.click('[data-luxa-a11y-opt="links"]');
await page.click('[data-luxa-a11y-opt="headings"]');
await page.click('[data-luxa-a11y-opt="spacing"]');
await check('links underlined', async () =>
  await page.evaluate(() => getComputedStyle(document.querySelector('main a')).textDecorationLine === 'underline'));
await check('body spacing applied, widget untouched', async () =>
  await page.evaluate(() => {
    const body = getComputedStyle(document.querySelector('main p')).letterSpacing;
    const widget = getComputedStyle(document.querySelector('.luxa-a11y-title')).letterSpacing;
    return body !== 'normal' && widget === '1px';
  }));

// persistence across reload
await page.reload();
await check('preferences survive reload', async () =>
  await page.evaluate(() => document.documentElement.classList.contains('luxa-a11y-invert') &&
    document.documentElement.classList.contains('luxa-a11y-links')));
await page.waitForTimeout(300);
await check('font scale restored after reload', async () =>
  await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('main p')).fontSize) > 17));

// keyboard: Esc closes and returns focus
await page.click('[data-luxa-a11y-toggle]');
await page.keyboard.press('Escape');
await check('Esc closes + focus returns to toggle', async () =>
  (await page.isHidden('[data-luxa-a11y-panel]')) &&
  (await page.evaluate(() => document.activeElement?.hasAttribute('data-luxa-a11y-toggle'))));

await page.keyboard.press('Alt+a');
await check('Alt+A opens the menu', async () => await page.isVisible('[data-luxa-a11y-panel]'));
await page.keyboard.press('Alt+a');
await check('Alt+A closes the menu', async () => await page.isHidden('[data-luxa-a11y-panel]'));

// reset
await page.click('[data-luxa-a11y-toggle]');
await page.click('[data-luxa-a11y-reset]');
await check('reset clears everything', async () =>
  await page.evaluate(() => {
    const cls = Array.from(document.documentElement.classList).filter((c) => c.startsWith('luxa-a11y-'));
    const size = getComputedStyle(document.querySelector('main p')).fontSize;
    return cls.length === 0 && size === '16px';
  }));
await page.screenshot({ path: DIR + '/shot-reset.png' });

console.log(errors.length ? 'JS ERRORS:\n' + errors.join('\n') : 'no JS errors');
await browser.close();
