/*
 * The welcome popup.
 *
 * A popup is the one thing on a shop that can lose an order by existing, so most
 * of these assertions are about restraint: it appears once, it never blocks the
 * cart, it is always dismissable, and a dismissal is remembered. The rest cover
 * the reward actually reaching the shopper.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Liquid } from 'liquidjs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const DIR = new URL('./.out/', import.meta.url).pathname;
mkdirSync(DIR, { recursive: true });
const SRC = readFileSync(new URL('../snippets/luxamom-popup.liquid', import.meta.url).pathname, 'utf8');
const HEADER = readFileSync(new URL('../sections/luxamom-header.liquid', import.meta.url).pathname, 'utf8');

/* Starts at the `assign` block, not at the guard below it: slicing past the
   assigns leaves every parameter empty — no code, no delay — and the test would
   be exercising a popup nobody ships. The slice cuts inside the
   `{%- unless template.name == 'cart' -%}` guard, so its closing tag is put back. */
const body = SRC.slice(SRC.indexOf('{%- liquid'), SRC.indexOf('<script>\n(function(){')) + '{%- endunless -%}';
const behaviour = SRC.slice(SRC.indexOf('<script>\n(function(){') + 8, SRC.lastIndexOf('</script>'));

const engine = new Liquid({ strictFilters: true });
engine.registerFilter('default_errors', (v) => String(v || ''));
engine.registerTag('form', {
  parse(token, remain) {
    this.tpls = [];
    const stream = this.liquid.parser.parseStream(remain);
    stream.on('tag:endform', () => stream.stop()).on('template', (t) => this.tpls.push(t)).on('end', () => stream.stop());
    stream.start();
  },
  *render(ctx, emitter) {
    emitter.write('<form method="post" action="/contact"><input type="hidden" name="form_type" value="customer">');
    yield this.liquid.renderer.renderTemplates(this.tpls, ctx, emitter);
    emitter.write('</form>');
  }
});

const render = (opts) => engine.parseAndRender(body, Object.assign({
  form: { 'posted_successfully?': false, errors: null },
  template: { name: 'index' },
  routes: { root_url: '/', all_products_collection_url: '/collections/all' }
}, opts || {}));

let pass = 0, fail = 0;
function check(name, ok, err) {
  if (ok) { pass++; console.log('PASS — ' + name); }
  else { fail++; console.log('FAIL — ' + name + (err ? ' :: ' + err : '')); }
}

const askHtml = await render({ delay: 0.3 });
const doneHtml = await render({ delay: 0.3, form: { 'posted_successfully?': true, errors: null } });
const cartHtml = await render({ template: { name: 'cart' } });

// ---- what gets rendered ----
check('הטופס הוא טופס לקוח אמיתי',
  askHtml.includes('name="form_type"') && askHtml.includes('name="contact[email]"'));
check('הכפתור הוא submit', askHtml.includes('type="submit"'));
check('המצטרפות מתויגות', askHtml.includes('luxamom-club'));
check('הקוד לא נחשף לפני הרשמה', !askHtml.includes('LUXAMOM10'));
check('אחרי הרשמה מוצג הקוד', doneHtml.includes('LUXAMOM10') && doneHtml.includes('data-pop-code'));
check('הפופאפ לא קיים כלל בעמוד העגלה', cartHtml.trim() === '');
check('הכותרת מקושרת לדיאלוג', askHtml.includes('aria-labelledby="lxm-pop-title"'));
check('הפופאפ מרונדר מהכותרת לכל עמוד', HEADER.includes("{% render 'luxamom-popup' %}"));

/* /collections/all is the unstyled stock template — a poor place to land someone
   who just handed over an email. The button goes to the home page's own shelf. */
check('הכפתור מפנה לחלק המוצרים בדף הבית', doneHtml.includes('href="/#products"'));
check('הכפתור לא מפנה לעמוד הקולקציה הגנרי', !doneHtml.includes('/collections/all'));

// ---- behaviour ----
function page(html) {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
  <style>${SRC.match(/<style>([\s\S]*?)<\/style>/)[1]}</style></head><body>
  <a href="#" id="before">קישור</a>
  <aside class="lxm-cart-drawer" data-cart-drawer></aside>
  <div style="height:1400px"></div>
  <section id="products" style="height:600px">המוצרים</section>
  <!-- room below the shelf, so scrollIntoView can actually bring it to the top
       rather than stopping at the end of the document -->
  <div style="height:1600px"></div>
  ${html}
  <script>
    window.__errors = [];
    window.addEventListener('error', function(e){ window.__errors.push(e.message); });
    window.addEventListener('unhandledrejection', function(e){ window.__errors.push(String(e.reason)); });
    window.__copied = null; window.__mode = 'ok';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, get: function(){
      if (window.__mode === 'none') return undefined;
      return { writeText: function(t){
        if (window.__mode === 'deny') return Promise.reject(new Error('no'));
        window.__copied = t; return Promise.resolve(); } };
    }});
    document.execCommand = function(){ window.__copied = 'via-execCommand'; return true; };
  <\/script>
  <script>${behaviour}<\/script></body></html>`;
}

writeFileSync(DIR + 'popup-ask.html', page(askHtml));
writeFileSync(DIR + 'popup-done.html', page(doneHtml));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
const pageErrors = [];
const p = await ctx.newPage();
p.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
const open = () => p.evaluate(() => document.querySelector('[data-lxm-pop]').classList.contains('lxm-pop-open'));

await p.goto('file://' + DIR + 'popup-ask.html');
await p.waitForTimeout(120);
check('לא קופץ מיד עם טעינת העמוד', !(await open()));
await p.waitForTimeout(500);
check('קופץ אחרי ההשהיה', await open());
check('הפוקוס נכנס לשדה המייל',
  (await p.evaluate(() => document.activeElement.getAttribute('data-pop-email') !== null)));
check('הגלילה ברקע ננעלת בזמן שהוא פתוח',
  (await p.evaluate(() => getComputedStyle(document.body).overflow)) === 'hidden');

await p.keyboard.press('Escape');
await p.waitForTimeout(150);
check('Esc סוגר', !(await open()));
check('הגלילה משוחררת אחרי סגירה',
  (await p.evaluate(() => getComputedStyle(document.body).overflow)) !== 'hidden');
check('הדחייה נזכרת', (await p.evaluate(() => localStorage.getItem('lxmPopSeen'))) === '1');

// A visitor who said no must not be asked again on the next page.
await p.reload();
await p.waitForTimeout(700);
check('לא קופץ שוב בביקור הבא', !(await open()));

// A fresh visitor, to test the other dismissals
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForTimeout(700);
check('מבקר חדש כן רואה אותו', await open());
await p.click('[data-lxm-pop]', { position: { x: 8, y: 8 } });
await p.waitForTimeout(150);
check('לחיצה על הרקע סוגרת', !(await open()));

await p.evaluate(() => localStorage.clear());
await p.reload();
await p.waitForTimeout(700);
check('כפתור הסגירה סוגר', await open());
await p.click('[data-pop-close] >> nth=0');
await p.waitForTimeout(150);
check('ואחריו הוא סגור', !(await open()));

/* The drawer owns the screen when it is open. Two overlays at once is a trap,
   and it lands squarely on top of someone about to buy. */
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.evaluate(() => document.querySelector('[data-cart-drawer]').classList.add('lxm-open'));
await p.waitForTimeout(700);
check('לא קופץ בזמן שהסל פתוח', !(await open()));

/* Whoever already joined — here or in the section on the home page — must not
   be asked again. The two share one key. */
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('lxmClubJoined', '1'); });
await p.reload();
await p.waitForTimeout(700);
check('מי שכבר נרשמה לא נשאלת שוב', !(await open()));

/* ?lxmpop=1 is the preview switch: it must show the popup whatever the browser
   remembers, and must leave no trace, or checking it twice would need the
   storage cleared in between. */
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('lxmPopSeen', '1'); });
await p.goto('file://' + DIR + 'popup-ask.html?lxmpop=1');
await p.waitForTimeout(200);
check('lxmpop=1 מציג את הבאנר גם למי שסגרה אותו', await open());
check('ובלי להמתין להשהיה', await open());
await p.click('[data-pop-close] >> nth=0');
await p.waitForTimeout(150);
check('סגירה במצב בדיקה לא נרשמת',
  (await p.evaluate(() => localStorage.getItem('lxmPopSeen'))) === '1');
await p.goto('file://' + DIR + 'popup-ask.html?lxmpop=1');
await p.waitForTimeout(200);
check('אפשר לבדוק שוב ושוב', await open());

await p.evaluate(() => { localStorage.clear(); localStorage.setItem('lxmClubJoined', '1'); });
await p.goto('file://' + DIR + 'popup-ask.html?lxmpop=1');
await p.waitForTimeout(200);
check('מצב הבדיקה גובר גם על "כבר נרשמה"', await open());

// and a normal visit is unaffected
await p.evaluate(() => localStorage.clear());
await p.goto('file://' + DIR + 'popup-ask.html');
await p.waitForTimeout(120);
check('בביקור רגיל אין קפיצה מיידית', !(await open()));

const knownHtml = await render({ delay: 0.3, customer: { accepts_marketing: true } });
check('מנוי מזוהה מסומן כידוע כבר בשרת', knownHtml.includes('data-pop-known="true"'));
check('מבקרת אנונימית לא מסומנת ככזו', askHtml.includes('data-pop-known="false"'));

writeFileSync(DIR + 'popup-known.html', page(knownHtml));
const p3 = await ctx.newPage();
p3.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
await p3.goto('file://' + DIR + 'popup-known.html');
await p3.evaluate(() => localStorage.clear());
await p3.reload();
await p3.waitForTimeout(700);
check('מנוי מזוהה לא רואה את הבאנר כלל', !(await p3.evaluate(() =>
  document.querySelector('[data-lxm-pop]').classList.contains('lxm-pop-open'))));

// ---- the success state ----
const p2 = await ctx.newPage();
p2.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
await p2.goto('file://' + DIR + 'popup-done.html');
await p2.waitForTimeout(250);
check('אחרי הרשמה נפתח מיד בלי השהיה',
  await p2.evaluate(() => document.querySelector('[data-lxm-pop]').classList.contains('lxm-pop-open')));
check('אחרי הרשמה לא יישאל שוב',
  (await p2.evaluate(() => localStorage.getItem('lxmPopSeen'))) === '1');
check('ההרשמה נזכרת גם עבור הסקשן בדף הבית',
  (await p2.evaluate(() => localStorage.getItem('lxmClubJoined'))) === '1');

await p2.click('[data-pop-copy]');
await p2.waitForTimeout(200);
check('העתקת הקוד עובדת', (await p2.evaluate(() => window.__copied)) === 'LUXAMOM10');
check('נאמר ללקוחה שהועתק', (await p2.textContent('[data-pop-copied]')).includes('הועתק'));

await p2.evaluate(() => { window.__copied = null; window.__mode = 'none'; });
await p2.click('[data-pop-copy]');
await p2.waitForTimeout(200);
check('דפדפן בלי clipboard API עדיין מעתיק',
  (await p2.evaluate(() => window.__copied)) === 'via-execCommand');

// Already on the page that has the shelf: scroll to it, do not reload.
const urlBefore = p2.url();
await p2.click('[data-pop-go]');
await p2.waitForTimeout(700);
check('הכפתור סוגר את החלון', !(await p2.evaluate(() =>
  document.querySelector('[data-lxm-pop]').classList.contains('lxm-pop-open'))));
check('הכפתור גולל לחלק המוצרים',
  (await p2.evaluate(() => {
    const r = document.getElementById('products').getBoundingClientRect();
    return r.top > -20 && r.top < 120;
  })));
check('לא נטען מחדש עמוד שכבר עומדים בו', p2.url() === urlBefore);

const errs = [...pageErrors,
  ...(await p.evaluate(() => window.__errors.slice())),
  ...(await p2.evaluate(() => window.__errors.slice()))];
console.log(errs.length ? 'JS ERRORS:\n' + [...new Set(errs)].join('\n') : 'no JS errors');
console.log(`\n${pass} pass, ${fail} fail`);
await browser.close();
process.exit(fail || errs.length ? 1 : 0);
