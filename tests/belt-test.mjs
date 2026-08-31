/*
 * מגן בטן product page: colour picker, price, sold-out handling and the
 * add-to-cart contract (including a rejected add showing the reason).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const DIR = new URL('./.out/', import.meta.url).pathname;
mkdirSync(DIR, { recursive: true });
const SEC = new URL('../sections/', import.meta.url).pathname;
const part = (f, tag) => {
  const m = readFileSync(SEC + f, 'utf8').match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : '';
};
const img = (w = 1200) => `https://example.invalid/${w}.png`;
const galleryImgs = (n) => Array.from({ length: n }, (_, i) =>
  `<img src="${img()}?i=${i}" alt="t${i}" class="lxm-gallery-img${i === 0 ? ' lxm-active' : ''}" data-gallery-index="${i}" data-media-src="${img()}?i=${i}">`).join('');
const thumbImgs = (n) => Array.from({ length: n }, (_, i) =>
  `<img src="${img(160)}?i=${i}" alt="t${i}" class="lxm-thumb${i === 0 ? ' lxm-thumb-active' : ''}" data-thumb-index="${i}">`).join('');

// --- the belt: one option, variant-map picker --------------------------------
const BELT = ['שחור', 'ורוד', 'לבן', 'ירוק'];
const beltJson = JSON.stringify(BELT.map((c, i) => ({
  id: 44251701248078 + i, color: c, price: 9999, compare: 19998,
  priceStr: '₪99.99', compareStr: '₪199.98', available: true, img: `${img()}?i=${i}`
})));
const beltBody = `
<div class="lxm-pdp">
  <section class="lxm-pdp-main"><div class="lxm-wrap lxm-pdp-grid">
    <div class="lxm-gallery">
      <div class="lxm-gallery-main"><span class="lxm-gallery-badge">חדש</span>${galleryImgs(4)}</div>
      <div class="lxm-thumbs">${thumbImgs(4)}</div>
    </div>
    <div class="lxm-pdp-info">
      <h1>מגן בטן LUXAMOM</h1>
      <div class="lxm-price-row"><span class="lxm-price-now" data-price>₪99.99</span></div>
      <div class="lxm-spec-row"><span class="lxm-spec-pill">התקנה בשנייה</span><span class="lxm-spec-pill">מתאים לכל רכב</span></div>
      <form class="lxm-pdp-form" action="/cart/add" method="post">
        <input type="hidden" name="id" value="44251701248078" data-variant-id-input>
        <script type="application/json" data-lxm-variants>${beltJson}<\/script>
        <div class="lxm-picker">
          <span class="lxm-picker-label">צבע: <strong data-selected-color-name></strong></span>
          <div class="lxm-swatch-row">${BELT.map((c, i) =>
            `<button type="button" class="lxm-swatch${i === 0 ? ' lxm-swatch-active' : ''}" data-color="${c}" aria-pressed="${i === 0}">
               <span class="lxm-swatch-dot"></span><span class="lxm-swatch-name">${c}</span></button>`).join('')}</div>
        </div>
        <div class="lxm-cta">
          <button type="submit" class="lxm-btn lxm-btn-primary" data-add-btn><span data-add-label>הוספה לסל</span> — <span data-price-inline>₪99.99</span></button>
          <p class="lxm-add-error" data-add-error hidden></p>
        </div>
      </form>
      <div class="lxm-accordion">
        <div class="lxm-acc-item lxm-acc-open"><button type="button" class="lxm-acc-head">א<svg viewBox="0 0 24 24"></svg></button>
          <div class="lxm-acc-body"><div class="lxm-acc-body-in"><p>תוכן</p></div></div></div>
        <div class="lxm-acc-item"><button type="button" class="lxm-acc-head">ב<svg viewBox="0 0 24 24"></svg></button>
          <div class="lxm-acc-body"><div class="lxm-acc-body-in"><p>תוכן</p></div></div></div>
      </div>
    </div>
  </div></section>
  <div class="lxm-sticky-bar" data-sticky-bar>
    <span class="lxm-sticky-bar-price" data-sticky-price>₪99.99</span>
    <button type="button" class="lxm-btn lxm-btn-primary" data-sticky-cta>הוספה לסל</button>
  </div>
</div>`;


writeFileSync(DIR + '/belt.html', `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>${part('luxamom-product-belt.liquid', 'style')}</style></head><body>
${beltBody}
<script>
  window.__errors = []; window.__adds = []; window.__addOk = true;
  window.addEventListener('error', function(e){ window.__errors.push('error: ' + e.message); });
  window.addEventListener('unhandledrejection', function(e){
    window.__errors.push('rejection: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
  });
  window.LXMCart = {
    open: function(){}, close: function(){},
    addItem: function(id, qty){
      window.__adds.push({ id: id, qty: qty });
      if (!window.__addOk) return Promise.reject(new Error('לא ניתן להוסיף את הפריט הזה לסל.'));
      return Promise.resolve({});
    }
  };
<\/script>
<script>${part('luxamom-product-belt.liquid', 'script')}<\/script>
</body></html>`);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('file://' + DIR + '/belt.html');
await page.waitForTimeout(250);

const check = async (label, fn) => {
  try { console.log(((await fn()) ? 'PASS' : 'FAIL') + ' — ' + label); }
  catch (e) { console.log('ERROR — ' + label + ': ' + e.message); }
};
const adds = () => page.evaluate(() => window.__adds.slice());
const clearAdds = () => page.evaluate(() => { window.__adds = []; });

await check('נטען עם הצבע הראשון נבחר', async () =>
  (await page.textContent('[data-selected-color-name]')) === 'שחור');
await check('מחיר ומחיר קודם מוצגים', async () =>
  (await page.textContent('[data-price]')) === '₪99.99' &&
  (await page.textContent('[data-price-inline]')) === '₪99.99');
await check('אחוז ההנחה מחושב נכון (50%)', async () =>
  (await page.textContent('[data-price-off]')).trim().startsWith('50%'));

await page.click('[data-color="ורוד"]');
await check('בחירת צבע מעדכנת את השם', async () =>
  (await page.textContent('[data-selected-color-name]')) === 'ורוד');
await check('בחירת צבע מעדכנת את המזהה בטופס', async () =>
  (await page.getAttribute('[data-variant-id-input]', 'value')) === '44251701248079');
await check('בחירת צבע מסמנת רק סווטש אחד', async () =>
  (await page.locator('.lxm-swatch.lxm-swatch-active').count()) === 1);
await check('הגלריה עוקבת אחרי הצבע', async () =>
  await page.evaluate(() => document.querySelector('.lxm-gallery-img.lxm-active').getAttribute('data-media-src').endsWith('i=1')));

await clearAdds();
await page.click('[data-add-btn]');
await page.waitForTimeout(200);
await check('הוספה לסל שולחת את הווריאנט הנבחר', async () => {
  const a = await adds();
  return a.length === 1 && String(a[0].id) === '44251701248079' && a[0].qty === 1;
});
await check('הכפתור משתחרר אחרי הוספה', async () => !(await page.isDisabled('[data-add-btn]')));

// a rejected add must say why and leave the button usable
await page.evaluate(() => { window.__addOk = false; });
await clearAdds();
await page.click('[data-add-btn]');
await page.waitForTimeout(250);
await check('הוספה שנדחתה מציגה סיבה', async () =>
  (await page.isVisible('[data-add-error]')) &&
  (await page.textContent('[data-add-error]')).includes('לא ניתן להוסיף'));
await check('הוספה שנדחתה לא משאירה כפתור תקוע', async () => !(await page.isDisabled('[data-add-btn]')));

await page.evaluate(() => { window.__addOk = true; });
await page.click('[data-color="לבן"]');
await check('בחירת צבע מנקה שגיאה קודמת', async () => await page.isHidden('[data-add-error]'));

// clicking the big image advances the gallery
const before = await page.evaluate(() => document.querySelector('.lxm-gallery-img.lxm-active').getAttribute('data-gallery-index'));
await page.click('.lxm-gallery-main');
await page.waitForTimeout(150);
const after = await page.evaluate(() => document.querySelector('.lxm-gallery-img.lxm-active').getAttribute('data-gallery-index'));
await check('לחיצה על התמונה הראשית מקדמת גלריה', async () => before !== after);

console.log(errors.length ? 'JS ERRORS:\n' + errors.join('\n') : 'no JS errors');
await browser.close();
