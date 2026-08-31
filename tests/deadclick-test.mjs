/*
 * Dead-click sweep.
 *
 * Candidates are DISCOVERED, not listed by hand: any element that presents
 * itself as interactive — a <button>, an <a href>, [role=button], or anything
 * the stylesheet gives `cursor: pointer` — is clicked, and the page must show an
 * observable response (DOM change, a request, or a navigation). A static label
 * such as the "22% הנחה" pill is not a candidate: it carries the default text
 * cursor, so it never advertises itself as clickable.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const DIR = new URL('./.out/', import.meta.url).pathname;
const SEC = new URL('../sections/', import.meta.url).pathname;
const part = (f, tag) => {
  const m = readFileSync(SEC + f, 'utf8').match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : '';
};
const img = (w = 1200) => `https://example.invalid/${w}.png`;

const galleryImgs = (n) => Array.from({ length: n }, (_, i) =>
  `<img src="${img()}?i=${i}" alt="תמונה ${i}" class="lxm-gallery-img${i === 0 ? ' lxm-active' : ''}" data-gallery-index="${i}" data-media-src="${img()}?i=${i}">`).join('');
const thumbImgs = (n) => Array.from({ length: n }, (_, i) =>
  `<img src="${img(160)}?i=${i}" alt="תמונה ${i}" class="lxm-thumb${i === 0 ? ' lxm-thumb-active' : ''}" data-thumb-index="${i}">`).join('');

// --- bag / warmer / cushion share one markup shape --------------------------
const oldPdpBody = `
<div class="lxm-pdp">
  <section class="lxm-pdp-main"><div class="lxm-wrap lxm-pdp-grid">
    <div class="lxm-gallery">
      <div class="lxm-gallery-main"><span class="lxm-gallery-badge">מוצר דגל</span>${galleryImgs(4)}</div>
      <div class="lxm-thumbs">${thumbImgs(4)}</div>
    </div>
    <div class="lxm-pdp-info">
      <h1>מוצר בדיקה</h1>
      <div class="lxm-price-row">
        <span class="lxm-price-now" data-price>₪349</span>
        <span class="lxm-price-was" data-compare-price>₪449</span>
        <span class="lxm-price-off" data-price-off>22% הנחה</span>
      </div>
      <form class="lxm-pdp-form" action="/cart/add" method="post">
        <input type="hidden" name="id" value="111" data-variant-id-input>
        <div class="lxm-swatches">
          <span class="lxm-swatches-label">צבע: <strong data-selected-color-name>שחור</strong></span>
          <div class="lxm-swatch-row">
            <button type="button" class="lxm-swatch lxm-swatch-active" data-variant-id="111"
              data-variant-price="₪349" data-variant-compare="₪449" data-variant-compare-raw="44900"
              data-variant-price-raw="34900" data-variant-name="שחור" data-variant-image="${img()}?i=0">
              <span class="lxm-swatch-dot"></span><span class="lxm-swatch-name">שחור</span></button>
            <button type="button" class="lxm-swatch" data-variant-id="222"
              data-variant-price="₪349" data-variant-compare="₪449" data-variant-compare-raw="44900"
              data-variant-price-raw="34900" data-variant-name="נייבי" data-variant-image="${img()}?i=1">
              <span class="lxm-swatch-dot"></span><span class="lxm-swatch-name">נייבי</span></button>
          </div>
        </div>
        <div class="lxm-cta">
          <button type="submit" class="lxm-btn lxm-btn-primary">הוספה לסל — <span data-price-inline>₪349</span></button>
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
    <span class="lxm-sticky-bar-price" data-sticky-price>₪349</span>
    <button type="button" class="lxm-btn lxm-btn-primary" data-sticky-cta>הוספה לסל</button>
  </div>
</div>`;

// --- the sling, which has the colour + quantity picker ----------------------
const COLORS = ['מנומר ירוק', 'מנומר חום', 'בז\'', 'שחור'];
const variantJson = JSON.stringify(COLORS.map((c, i) => ({
  id: 44147655180366 + i, color: c, price: 16999, compare: 22999,
  priceStr: '₪169.99', compareStr: '₪229.99', available: true, img: `${img()}?i=${i}`
})));
const swatchRow = (attr) => COLORS.map((c, i) =>
  `<button type="button" class="lxm-swatch${attr === 'data-color' && i === 0 ? ' lxm-swatch-active' : ''}" ${attr}="${c}" aria-pressed="${attr === 'data-color' && i === 0}">
     <span class="lxm-swatch-dot"></span><span class="lxm-swatch-name">${c}</span></button>`).join('');

const slingBody = `
<div class="lxm-pdp" data-pair-discount="89.99">
  <section class="lxm-pdp-main"><div class="lxm-wrap lxm-pdp-grid">
    <div class="lxm-gallery">
      <div class="lxm-gallery-main"><span class="lxm-gallery-badge">חדש</span>${galleryImgs(5)}</div>
      <div class="lxm-thumbs">${thumbImgs(5)}</div>
    </div>
    <div class="lxm-pdp-info">
      <h1>מנשא חיבוק LUXAMOM</h1>
      <div class="lxm-price-row"><span class="lxm-price-now" data-price>₪169.99</span></div>
      <div class="lxm-spec-row"><span class="lxm-spec-pill">3–36 חודשים</span><span class="lxm-spec-pill">עד 20 ק״ג</span></div>
      <form class="lxm-pdp-form" action="/cart/add" method="post">
        <input type="hidden" name="id" value="44147655180366" data-variant-id-input>
        <script type="application/json" data-lxm-variants>${variantJson}<\/script>
        <div class="lxm-picker">
          <span class="lxm-picker-label"><span data-color-label>צבע</span>: <strong data-selected-color-name></strong></span>
          <div class="lxm-swatch-row">${swatchRow('data-color')}</div>
        </div>
        <div class="lxm-picker">
          <span class="lxm-picker-label">כמה לוקחים?</span>
          <div class="lxm-qty-row">
            <button type="button" class="lxm-qty-card lxm-qty-active" data-qty="1" aria-pressed="true">
              <span class="lxm-qty-card-title">יחידה אחת</span><span class="lxm-qty-card-price" data-qty-price="1"></span>
              <span class="lxm-qty-card-sub" data-qty-sub="1"></span></button>
            <button type="button" class="lxm-qty-card" data-qty="2" aria-pressed="false">
              <span class="lxm-qty-card-tag">הכי משתלם</span><span class="lxm-qty-card-title">שתי יחידות</span>
              <span class="lxm-qty-card-price" data-qty-price="2"></span><span class="lxm-qty-card-sub" data-qty-sub="2"></span></button>
          </div>
        </div>
        <div class="lxm-picker" data-second-color hidden>
          <span class="lxm-picker-label">צבע היחידה השנייה: <strong data-selected-color2-name></strong></span>
          <div class="lxm-swatch-row">${swatchRow('data-color2')}</div>
        </div>
        <div class="lxm-cta">
          <button type="submit" class="lxm-btn lxm-btn-primary" data-add-btn><span data-add-label>הוספה לסל</span> — <span data-price-inline>₪169.99</span></button>
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
    <span class="lxm-sticky-bar-price" data-sticky-price>₪169.99</span>
    <button type="button" class="lxm-btn lxm-btn-primary" data-sticky-cta>הוספה לסל</button>
  </div>
</div>`;

// --- home product cards -----------------------------------------------------
const card = (name, url) => `
  <div class="lxm-pcard lxm-reveal">
    <a href="${url}" class="lxm-pcard-img"><span class="lxm-pcard-badge">מוצר דגל</span><img src="${img()}" alt="${name}"></a>
    <div class="lxm-pcard-body">
      <p class="lxm-tag">${name}</p>
      <h3><a href="${url}">כותרת ${name}</a></h3>
      <p class="lxm-desc">תיאור המוצר שמסביר מה הוא עושה ולמה הוא שווה את זה.</p>
      <div class="lxm-pcard-foot"><span class="lxm-price">₪349</span>
        <a href="${url}" class="lxm-btn lxm-btn-outline">לצפייה במוצר</a></div>
    </div>
  </div>`;
const homeBody = `<div class="lxm-home"><section class="lxm-section" id="products"><div class="lxm-wrap">
  <div class="lxm-products-scroller">
    ${card('תיק', '/products/bag')}${card('מנשא', '/products/sling')}
    ${card('מחמם', '/products/warmer')}${card('כרית', '/products/cushion')}
  </div></div></section></div>`;

const harness = (name, style, body, js) => {
  const file = DIR + `/dc-${name}.html`;
  writeFileSync(file, `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>${style}</style></head><body>
${body}
<script>
  window.__errors = []; window.__net = 0; window.__nav = 0;
  window.addEventListener('error', function(e){ window.__errors.push('error: ' + e.message); });
  window.addEventListener('unhandledrejection', function(e){
    window.__errors.push('rejection: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
  });
  window.fetch = function(){ window.__net++; return Promise.resolve({ ok:true, status:200,
    json: function(){ return Promise.resolve({ item_count:1, items:[], total_price:0, total_discount:0, original_total_price:0 }); } }); };
  HTMLFormElement.prototype.submit = function(){ window.__nav++; };
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a[href]');
    if (a) { e.preventDefault(); window.__nav++; }
  }, true);
  window.LXMCart = { open: function(){ window.__net++; return Promise.resolve(); },
                     close: function(){}, addItem: function(){ window.__net++; return Promise.resolve({}); } };
<\/script>
<script>${js}<\/script>
</body></html>`);
  return file;
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let dead = 0, checked = 0, errored = 0;

async function sweep(label, file) {
  let localDead = 0;
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('file://' + file);
  await page.waitForTimeout(250);

  // Discover everything that advertises itself as interactive.
  const count = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('body *'));
    const cands = all.filter((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      if (el.closest('[hidden]')) return false;
      const tag = el.tagName;
      if (tag === 'BUTTON' || (tag === 'A' && el.hasAttribute('href'))) return true;
      if (el.getAttribute('role') === 'button') return true;
      return getComputedStyle(el).cursor === 'pointer';
    });
    // Drop a candidate only when it is a passive child of another candidate —
    // clicking a <span> inside a <button> is the same click. A real control
    // nested inside another (a link inside a clickable card) is kept, or making
    // the card clickable would hide its own links from this sweep.
    const isControl = (el) =>
      el.tagName === 'BUTTON' || (el.tagName === 'A' && el.hasAttribute('href')) ||
      el.getAttribute('role') === 'button';
    window.__cands = cands.filter((el) =>
      isControl(el) || !cands.some((o) => o !== el && o.contains(el)));
    window.__cands.forEach((el, i) => el.setAttribute('data-dc', String(i)));
    return window.__cands.length;
  });

  for (let i = 0; i < count; i++) {
    const el = page.locator(`[data-dc="${i}"]`);
    if (!(await el.count()) || !(await el.isVisible().catch(() => false))) continue;
    // A control that is already in the state the click would request correctly
    // does nothing — that is a no-op, not a dead click.
    const alreadyActive = await el.evaluate((e) =>
      e.getAttribute('aria-pressed') === 'true' ||
      /(^|\s)lxm-(qty-active|swatch-active|thumb-active|acc-open)(\s|$)/.test(e.className || '')
    ).catch(() => false);
    if (alreadyActive) continue;
    checked++;
    const before = await page.evaluate(() => ({ html: document.body.innerHTML, net: window.__net, nav: window.__nav }));
    try {
      await el.click({ timeout: 2500, force: true });
    } catch {
      console.log(`  UNCLICKABLE — ${label} [${i}]`);
      dead++; localDead++;
      continue;
    }
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => ({ html: document.body.innerHTML, net: window.__net, nav: window.__nav }));
    if (after.html === before.html && after.net === before.net && after.nav === before.nav) {
      const info = await el.evaluate((e) => e.tagName + '.' + (e.className || '') + ' "' + (e.textContent || '').trim().slice(0, 20) + '"').catch(() => '?');
      console.log(`  DEAD CLICK — ${label} :: ${info}`);
      dead++; localDead++;
    }
  }

  const jsErrs = [...errs, ...(await page.evaluate(() => window.__errors.slice()))];
  if (jsErrs.length) { errored += jsErrs.length; console.log(`  JS ERROR — ${label}: ${[...new Set(jsErrs)].join(' | ')}`); }
  console.log(`${localDead === 0 && jsErrs.length === 0 ? 'PASS' : 'FAIL'} — ${label} (${count} אלמנטים אינטראקטיביים)`);
  await page.close();
}

for (const f of ['luxamom-product-bag', 'luxamom-product-warmer', 'luxamom-product-cushion']) {
  await sweep(f, harness(f, part(f + '.liquid', 'style'), oldPdpBody, part(f + '.liquid', 'script')));
}
await sweep('luxamom-product-sling',
  harness('sling', part('luxamom-product-sling.liquid', 'style'), slingBody, part('luxamom-product-sling.liquid', 'script')));
await sweep('luxamom-home',
  harness('home', part('luxamom-home.liquid', 'style'), homeBody, part('luxamom-home.liquid', 'script')));

console.log(`\nסה"כ: ${checked} אלמנטים נבדקו · ${dead} דד-קליקים · ${errored} שגיאות JS`);
await browser.close();
process.exit(dead || errored ? 1 : 0);
