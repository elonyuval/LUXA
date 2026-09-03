/*
 * The LUXAMOM club signup.
 *
 * Two things are being guarded. First, that the form is a real Shopify customer
 * form with named fields — the block it replaced was a bare input and button
 * with no form around them, which promised 10% off and did nothing at all when
 * clicked. Second, that the reward actually reaches the shopper: the code is
 * revealed on screen, and the copy button works even when the clipboard API is
 * unavailable or refuses.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Liquid } from 'liquidjs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const DIR = new URL('./.out/', import.meta.url).pathname;
mkdirSync(DIR, { recursive: true });
const SRC = readFileSync(new URL('../snippets/luxamom-club.liquid', import.meta.url).pathname, 'utf8');
const HOME = readFileSync(new URL('../sections/luxamom-home.liquid', import.meta.url).pathname, 'utf8');

const markup = SRC.slice(SRC.indexOf('{%- liquid'), SRC.indexOf('<script>'));
const behaviour = SRC.slice(SRC.indexOf('<script>') + 8, SRC.lastIndexOf('</script>'));

const engine = new Liquid({ strictFilters: true });
engine.registerFilter('default_errors', (v) => String(v || ''));
// Shopify's {% form %} is a real tag; here it just has to produce a <form>.
engine.registerTag('form', {
  parse(token, remain) {
    this.tpls = [];
    const stream = this.liquid.parser.parseStream(remain);
    stream.on('tag:endform', () => stream.stop()).on('template', (t) => this.tpls.push(t)).on('end', () => stream.stop());
    stream.start();
  },
  *render(ctx, emitter) {
    emitter.write('<form method="post" action="/contact#lxm-club-form" accept-charset="UTF-8">');
    emitter.write('<input type="hidden" name="form_type" value="customer">');
    yield this.liquid.renderer.renderTemplates(this.tpls, ctx, emitter);
    emitter.write('</form>');
  }
});

let pass = 0, fail = 0;
function check(name, ok, err) {
  if (ok) { pass++; console.log('PASS — ' + name); }
  else { fail++; console.log('FAIL — ' + name + (err ? ' :: ' + err : '')); }
}

const render = (posted) => engine.parseAndRender(markup, { form: { 'posted_successfully?': posted, errors: null } });

const signup = await render(false);
const done = await render(true);

// ---- the form itself ----
check('הטופס הוא טופס לקוח של שופיפיי', signup.includes('name="form_type"') && signup.includes('<form'));
check('לשדה המייל יש name שהשרת מכיר', signup.includes('name="contact[email]"'));
check('סוג השדה email עם required', /type="email"[^>]*required|required[^>]*type="email"/.test(signup));
check('הכפתור הוא submit ולא כפתור סרק', signup.includes('type="submit"'));
check('נשמרת הסכמה לדיוור', signup.includes('name="contact[accepts_marketing]"'));
check('המצטרפות מתויגות', signup.includes('luxamom-club'));
check('לשדה יש תווית לקורא מסך', signup.includes('for="lxm-club-email"'));

// ---- the reward ----
check('אחרי הרשמה מוצג הקוד', done.includes('LUXAMOM10') && done.includes('data-club-code'));
check('לפני הרשמה הקוד לא נחשף', !signup.includes('LUXAMOM10'));
check('אחרי הרשמה אין עוד שדה מייל', !done.includes('name="contact[email]"'));
check('האחוז אחיד בכותרת ובכפתור',
  (signup.match(/10%/g) || []).length >= 2);

// The old block is gone from the home page and the real one is rendered.
check('דף הבית מרנדר את הסקשן האמיתי', HOME.includes("{% render 'luxamom-club' %}"));
check('שרידי הטופס המת הוסרו',
  !HOME.includes('lxm-nform') && !HOME.includes('lxm-newsletter'));

// ---- the copy button, in a browser ----
writeFileSync(DIR + 'club.html', `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
</head><body>${done}
<script>
  window.__errors = [];
  window.addEventListener('error', function(e){ window.__errors.push(e.message); });
  window.addEventListener('unhandledrejection', function(e){ window.__errors.push(String(e.reason)); });
  window.__copied = null;
  window.__mode = 'ok';
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    get: function(){
      if (window.__mode === 'none') return undefined;
      return { writeText: function(t){
        if (window.__mode === 'deny') return Promise.reject(new Error('denied'));
        window.__copied = t; return Promise.resolve();
      } };
    }
  });
  document.execCommand = function(){ window.__copied = 'via-execCommand'; return true; };
<\/script>
<script>${behaviour}<\/script></body></html>`);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
await page.goto('file://' + DIR + 'club.html');
await page.waitForTimeout(150);

await page.click('[data-club-copy]');
await page.waitForTimeout(200);
check('לחיצה על העתקה מעתיקה את הקוד',
  (await page.evaluate(() => window.__copied)) === 'LUXAMOM10');
check('נאמר ללקוחה שהקוד הועתק',
  (await page.textContent('[data-club-copied]')).includes('הועתק'));

// A refused clipboard permission must not leave a button that silently does nothing.
await page.evaluate(() => { window.__copied = null; window.__mode = 'deny'; });
await page.click('[data-club-copy]');
await page.waitForTimeout(200);
check('סירוב הרשאה נופל בחזרה להעתקה ידנית',
  (await page.evaluate(() => window.__copied)) === 'via-execCommand');

await page.evaluate(() => { window.__copied = null; window.__mode = 'none'; });
await page.click('[data-club-copy]');
await page.waitForTimeout(200);
check('דפדפן בלי clipboard API עדיין מעתיק',
  (await page.evaluate(() => window.__copied)) === 'via-execCommand');

const inPage = await page.evaluate(() => window.__errors.slice());
const all = [...pageErrors, ...inPage];
console.log(all.length ? 'JS ERRORS:\n' + [...new Set(all)].join('\n') : 'no JS errors');
console.log(`\n${pass} pass, ${fail} fail`);
await browser.close();
process.exit(fail || all.length ? 1 : 0);
