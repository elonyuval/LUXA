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

const render = (posted, extra) => engine.parseAndRender(markup,
  Object.assign({ form: { 'posted_successfully?': posted, errors: null } }, extra || {}));

const signup = await render(false);
const done = await render(true);
const knownHtml = await render(false, { customer: { accepts_marketing: true } });

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
/* The code now sits in the markup inside the hidden "already a member" panel.
   It is a public promo code that goes out in every email, not a secret, so what
   matters is that it is not shown to someone who has not signed up. */
check('הקוד לא מוצג למי שלא נרשמה',
  !signup.split('data-club-already')[0].includes('LUXAMOM10') &&
  /data-club-already[^>]*hidden/.test(signup));
check('אחרי הרשמה אין עוד שדה מייל', !done.includes('name="contact[email]"'));
check('האחוז אחיד בכותרת ובכפתור',
  (signup.match(/10%/g) || []).length >= 2);

/* No welcome automation exists in the shop, so by default the page must not say
   an email is coming. A shopper told to expect one stops reading and waits for
   a mail that never arrives — and loses the code she was just given. */
check('ברירת המחדל לא מבטיחה מייל', !done.includes('למייל'));
check('ברירת המחדל מבקשת להעתיק עכשיו', done.includes('להעתיק'));
const emailed = await render(true, { emailed: true });
check('כשיש אוטומציה אפשר להפעיל את ההבטחה', emailed.includes('שלחנו לך את הקוד גם למייל'));

// The old block is gone from the home page and the real one is rendered.
check('דף הבית מרנדר את הסקשן האמיתי', HOME.includes("{% render 'luxamom-club' %}"));
check('שרידי הטופס המת הוסרו',
  !HOME.includes('lxm-nform') && !HOME.includes('lxm-newsletter'));

/* Above the reviews: at the foot of the page it was the last thing after a long
   scroll and most visitors never reached it. */
check('ההרשמה מופיעה לפני הביקורות בדף הבית',
  HOME.indexOf("{% render 'luxamom-club' %}") < HOME.indexOf("{% render 'luxamom-reviews'"));

// ---- already a member ----
check('מנוי מזוהה רואה מיד שהוא כבר רשום',
  knownHtml.includes('data-club-already') && !/data-club-already[^>]*hidden/.test(knownHtml));
check('ולא מוצג לו הטופס',
  /data-club-ask[^>]*hidden/.test(knownHtml));
check('הקוד מוצג לו שוב', knownHtml.includes('LUXAMOM10'));
check('לא נטען שהקוד כבר נוצל או לא',
  knownHtml.includes('אם עדיין לא ניצלת'));
check('למבקרת חדשה מוצג הטופס ולא הודעת "כבר רשומה"',
  !/data-club-ask[^>]*hidden/.test(signup) && /data-club-already[^>]*hidden/.test(signup));

// ---- in a browser ----
const shell = (html) => `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
</head><body>${html}
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
<script>${behaviour}<\/script></body></html>`;

writeFileSync(DIR + 'club.html', shell(done));
writeFileSync(DIR + 'club-ask.html', shell(signup));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext();
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));

/* Signing up has to be remembered, and the signup panel has to give way to the
   "already a member" one on the next visit — otherwise the shop keeps asking a
   question it already has the answer to. */
await page.goto('file://' + DIR + 'club-ask.html');
await page.waitForTimeout(150);
check('מבקרת חדשה רואה את הטופס',
  await page.isVisible('[data-club-ask]') && await page.isHidden('[data-club-already]'));

await page.goto('file://' + DIR + 'club.html');
await page.waitForTimeout(150);
check('הרשמה נזכרת',
  (await page.evaluate(() => localStorage.getItem('lxmClubJoined'))) === '1');

await page.goto('file://' + DIR + 'club-ask.html');
await page.waitForTimeout(150);
check('בביקור הבא מוצג "את כבר במשפחה" במקום הטופס',
  await page.isHidden('[data-club-ask]') && await page.isVisible('[data-club-already]'));
check('והקוד מוצג לה שוב',
  (await page.textContent('[data-club-code]')).trim() === 'LUXAMOM10');

await page.evaluate(() => localStorage.clear());
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
