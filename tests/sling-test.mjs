import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const DIR = new URL('./.out/', import.meta.url).pathname;
const src = readFileSync(new URL('../sections/', import.meta.url).pathname + 'luxamom-product-sling.liquid', 'utf8');

const scripts = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const behaviour = scripts[scripts.length - 1];
const style = src.match(/<style>([\s\S]*?)<\/style>/)[1];

const colors = ['מנומר ירוק', 'שחור', 'מנומר חום', "בז'", 'מנומר לבן-שחור'];
const variants = colors.map((c, i) => ({
  id: String(101 + i),
  color: c,
  price: 16999,
  compare: 22999,
  priceStr: '₪169.99',
  compareStr: '₪229.99',
  available: true,
  // green: a real low count · black: tracked but well stocked · brown: untracked
  tracked: i !== 2,
  inv: i === 0 ? 6 : i === 1 ? 40 : 0,
  img: `img-${i}.png`
}));

const gallery = colors
  .map((c, i) => `<img src="img-${i}.png" alt="${c}" class="lxm-gallery-img${i === 0 ? ' lxm-active' : ''}" data-gallery-index="${i}" data-media-src="img-${i}.png">`)
  .join('\n');
const thumbs = colors
  .map((c, i) => `<img src="img-${i}.png" alt="${c}" class="lxm-thumb${i === 0 ? ' lxm-thumb-active' : ''}" data-thumb-index="${i}">`)
  .join('\n');
const swatchRow = (attr, activeFirst) =>
  colors
    .map((c, i) => `<button type="button" class="lxm-swatch${activeFirst && i === 0 ? ' lxm-swatch-active' : ''}" ${attr}="${c}" aria-pressed="${activeFirst && i === 0}"><span class="lxm-swatch-dot"></span><span class="lxm-swatch-name">${c}</span></button>`)
    .join('\n');

writeFileSync(
  DIR + '/sling.html',
  `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>${style}</style></head><body>
<div class="lxm-pdp" data-pair-discount="89.99" data-cta-single="אני רוצה אחד" data-cta-pair="אני רוצה שניים" data-stock-count-text="נשארו רק {count} יחידות" data-stock-note="כמות מוגבלת מהמשלוח הנוכחי" data-stock-threshold="20">
  <div class="lxm-wrap lxm-pdp-grid">
    <div class="lxm-gallery">
      <div class="lxm-gallery-main">${gallery}</div>
      <div class="lxm-thumbs">${thumbs}</div>
    </div>
    <div class="lxm-pdp-info">
      <h1>מנשא חיבוק LUXAMOM</h1>
      <div class="lxm-price-row">
        <span class="lxm-price-now" data-price>₪169.99</span>
        <span class="lxm-price-was" data-compare-price>₪229.99</span>
        <span class="lxm-price-off" data-price-off>26% הנחה</span>
      </div>
      <div class="lxm-stock" data-stock hidden><span class="lxm-stock-dot"></span><span data-stock-text></span></div>
      <form class="lxm-pdp-form">
        <input type="hidden" name="id" value="101" data-variant-id-input>
        <script type="application/json" data-lxm-variants>${JSON.stringify(variants)}</script>
        <div class="lxm-picker">
          <span class="lxm-picker-label"><span data-color-label>צבע</span>: <strong data-selected-color-name>מנומר ירוק</strong></span>
          <div class="lxm-swatch-row">${swatchRow('data-color', true)}</div>
        </div>
        <div class="lxm-picker">
          <span class="lxm-picker-label">כמה לוקחים?</span>
          <div class="lxm-qty-row">
            <button type="button" class="lxm-qty-card lxm-qty-active" data-qty="1" aria-pressed="true">
              <span class="lxm-qty-card-title">יחידה אחת</span>
              <span class="lxm-qty-card-price" data-qty-price="1"></span>
              <span class="lxm-qty-card-sub" data-qty-sub="1"></span>
            </button>
            <button type="button" class="lxm-qty-card" data-qty="2" aria-pressed="false">
              <span class="lxm-qty-card-tag">הכי משתלם</span>
              <span class="lxm-qty-card-title">שתי יחידות</span>
              <span class="lxm-qty-card-price" data-qty-price="2"></span>
              <span class="lxm-qty-card-sub" data-qty-sub="2"></span>
            </button>
          </div>
        </div>
        <div class="lxm-picker" data-second-color hidden>
          <span class="lxm-picker-label">צבע היחידה השנייה: <strong data-selected-color2-name></strong></span>
          <div class="lxm-swatch-row">${swatchRow('data-color2', false)}</div>
          <p class="lxm-pair-note">note</p>
        </div>
        <div class="lxm-cta">
          <button type="submit" class="lxm-btn lxm-btn-primary" data-add-btn><span data-add-label>אני רוצה אחד</span> — <span data-price-inline>₪169.99</span></button>
          <p class="lxm-add-error" data-add-error hidden></p>
        </div>
      </form>
      <div class="lxm-accordion">
        <div class="lxm-acc-item lxm-acc-open"><button type="button" class="lxm-acc-head">א</button><div class="lxm-acc-body"><div class="lxm-acc-body-in">1</div></div></div>
        <div class="lxm-acc-item"><button type="button" class="lxm-acc-head">ב</button><div class="lxm-acc-body"><div class="lxm-acc-body-in">2</div></div></div>
      </div>
    </div>
  </div>
  <div class="lxm-sticky-bar" data-sticky-bar>
    <span class="lxm-sticky-bar-price" data-sticky-price>₪169.99</span>
    <button type="button" class="lxm-btn lxm-btn-primary" data-sticky-cta>אני רוצה אחד</button>
  </div>
</div>
<script>
  window.__adds = [];
  window.__addOk = true;
  window.fetch = function(url, opts){
    window.__adds.push({ url: url, body: JSON.parse(opts.body) });
    if (!window.__addOk) {
      return Promise.resolve({ ok:false, status:422, json: function(){ return Promise.resolve(
        { status:422, message:'Cart Error', description:'לא ניתן להוסיף את הפריט הזה לסל.' }); } });
    }
    return Promise.resolve({ ok:true, status:200, json: function(){ return Promise.resolve({}); } });
  };
  window.LXMCart = { open: function(){}, addItem: function(){ return Promise.resolve({}); } };
</script>
<script>${behaviour}</script>
</body></html>`
);

const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 950 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('ERR_FILE_NOT_FOUND') && errors.push('console: ' + m.text()));
await page.goto('file://' + DIR + '/sling.html');

const check = async (label, fn) => {
  try {
    const r = await fn();
    console.log((r ? 'PASS' : 'FAIL') + ' — ' + label);
  } catch (e) {
    console.log('ERROR — ' + label + ': ' + e.message);
  }
};
const adds = () => page.evaluate(() => window.__adds);
const clearAdds = () => page.evaluate(() => { window.__adds = []; });

await check('single unit priced from the variant', async () =>
  (await page.textContent('[data-price]')) === '₪169.99' &&
  (await page.textContent('[data-price-inline]')) === '₪169.99');

await check('quantity cards show unit and pair prices', async () => {
  const p = await page.$$eval('[data-qty-price]', (e) => e.map((x) => x.textContent));
  return p[0] === '₪169.99' && p[1] === '₪249.99';
});

await check('pair card states the saving', async () => {
  const s = await page.$$eval('[data-qty-sub]', (e) => e.map((x) => x.textContent));
  return s[0] === 'במקום ₪229.99' && s[1] === 'חוסכים ₪89.99';
});

await check('second colour picker hidden for a single unit', async () => await page.isHidden('[data-second-color]'));

// switch to the pair
await page.click('[data-qty="2"]');
await check('pair price and discount badge', async () =>
  (await page.textContent('[data-price]')) === '₪249.99' &&
  (await page.textContent('[data-compare-price]')) === '₪459.98' &&
  (await page.textContent('[data-price-off]')).trim() === '46% הנחה');
await check('second colour picker appears', async () => await page.isVisible('[data-second-color]'));
await check('first picker relabels to "היחידה הראשונה"', async () =>
  (await page.textContent('[data-color-label]')) === 'צבע היחידה הראשונה');
await check('second unit defaults to the first colour', async () =>
  (await page.textContent('[data-selected-color2-name]')) === 'מנומר ירוק');
await check('sticky bar follows the pair price', async () => (await page.textContent('[data-sticky-price]')) === '₪249.99');

// two different colours
await page.click('[data-color2="שחור"]');
await check('second colour can differ from the first', async () =>
  (await page.textContent('[data-selected-color2-name]')) === 'שחור' &&
  (await page.textContent('[data-selected-color-name]')) === 'מנומר ירוק');
await check('gallery still follows the first unit', async () =>
  await page.evaluate(() => document.querySelector('.lxm-gallery-img.lxm-active').getAttribute('data-media-src') === 'img-0.png'));

await clearAdds();
await page.click('[data-add-btn]');
await page.waitForTimeout(150);
await check('mixed pair adds two separate lines', async () => {
  const a = await adds();
  return a.length === 1 && a[0].url === '/cart/add.js' &&
    a[0].body.items.length === 2 &&
    a[0].body.items[0].id === '101' && a[0].body.items[0].quantity === 1 &&
    a[0].body.items[1].id === '102' && a[0].body.items[1].quantity === 1;
});

// same colour twice
await page.click('[data-color2="מנומר ירוק"]');
await clearAdds();
await page.click('[data-add-btn]');
await page.waitForTimeout(150);
await check('matching pair adds one line of quantity 2', async () => {
  const a = await adds();
  return a[0].body.items.length === 1 && a[0].body.items[0].id === '101' && a[0].body.items[0].quantity === 2;
});

// changing the first colour must not silently reset the second while paired
await page.click('[data-color2="בז\'"]');
await page.click('[data-color="מנומר חום"]');
await check('changing unit one keeps unit two as chosen', async () =>
  (await page.textContent('[data-selected-color-name]')) === 'מנומר חום' &&
  (await page.textContent('[data-selected-color2-name]')) === "בז'");
await check('quantity stays on the pair after a colour change', async () =>
  (await page.textContent('[data-price]')) === '₪249.99');

// back to a single unit
await page.click('[data-qty="1"]');
await check('single unit hides the second picker and restores the price', async () =>
  (await page.isHidden('[data-second-color]')) &&
  (await page.textContent('[data-price]')) === '₪169.99' &&
  (await page.textContent('[data-color-label]')) === 'צבע');
await clearAdds();
await page.click('[data-add-btn]');
await page.waitForTimeout(150);
await check('single unit adds one line of quantity 1', async () => {
  const a = await adds();
  return a[0].body.items.length === 1 && a[0].body.items[0].id === '103' && a[0].body.items[0].quantity === 1;
});

await check('hidden variant input tracks the first unit', async () =>
  (await page.inputValue('[data-variant-id-input]')) === '103');

// scarcity strip + call to action wording
await page.click('[data-color="מנומר ירוק"]');
await check('real low count shown for the selected colour', async () =>
  (await page.isVisible('[data-stock]')) &&
  (await page.textContent('[data-stock-text]')) === 'נשארו רק 6 יחידות');
await check('call to action asks for one unit', async () =>
  (await page.textContent('[data-add-label]')) === 'אני רוצה אחד' &&
  (await page.textContent('[data-sticky-cta]')) === 'אני רוצה אחד');
await page.click('[data-qty="2"]');
await check('call to action switches to two units', async () =>
  (await page.textContent('[data-add-label]')) === 'אני רוצה שניים' &&
  (await page.textContent('[data-sticky-cta]')) === 'אני רוצה שניים');
await page.click('[data-qty="1"]');
await page.click('[data-color="שחור"]');
await check('well-stocked colour hides the strip', async () => await page.isHidden('[data-stock]'));
await page.click('[data-color="מנומר חום"]');
await check('untracked colour falls back to wording without a number', async () =>
  (await page.isVisible('[data-stock]')) &&
  (await page.textContent('[data-stock-text]')) === 'כמות מוגבלת מהמשלוח הנוכחי');
await page.click('[data-color="מנומר ירוק"]');

// sold-out colour
const soldOut = readFileSync(DIR + '/sling.html', 'utf8').replace(
  JSON.stringify(variants),
  JSON.stringify(variants.map((v) => (v.color === 'שחור' ? { ...v, available: false } : v)))
);
writeFileSync(DIR + '/sling-soldout.html', soldOut);
const page2 = await browser.newPage({ viewport: { width: 1200, height: 950 } });
page2.on('pageerror', (e) => errors.push('pageerror(soldout): ' + e.message));
await page2.goto('file://' + DIR + '/sling-soldout.html');
await page2.click('[data-color="שחור"]');
await check('sold-out colour disables the button', async () =>
  (await page2.isDisabled('[data-add-btn]')) && (await page2.textContent('[data-add-label]')) === 'אזל מהמלאי');
await check('price span survives the sold-out state', async () => {
  await page2.click('[data-color="בז\'"]');
  return (await page2.textContent('[data-add-label]')) === 'אני רוצה אחד' &&
    (await page2.textContent('[data-price-inline]')) === '₪169.99' &&
    !(await page2.isDisabled('[data-add-btn]'));
});

// --- rejected add: the shopper must be told, and the button must recover ----
await page.click('[data-qty="1"]');
await page.evaluate(() => { window.__addOk = false; });
await clearAdds();
await page.click('[data-add-btn]');
await page.waitForTimeout(250);
await check('rejected add shows the reason from Shopify', async () =>
  (await page.isVisible('[data-add-error]')) &&
  (await page.textContent('[data-add-error]')).includes('לא ניתן להוסיף'));
await check('rejected add leaves the button usable', async () =>
  !(await page.isDisabled('[data-add-btn]')));

await page.evaluate(() => { window.__addOk = true; });
await clearAdds();
await page.click('[data-add-btn]');
await page.waitForTimeout(250);
await check('a successful add clears the previous error', async () =>
  await page.isHidden('[data-add-error]'));

await page.screenshot({ path: DIR + '/sling-picker.png' });
console.log(errors.length ? 'JS ERRORS:\n' + errors.join('\n') : 'no JS errors');
await browser.close();
