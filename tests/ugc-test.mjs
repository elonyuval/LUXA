/*
 * UGC video shelf — inline players.
 *
 * Drives the real snippet's <style>/<script> against the real markup, rendered
 * through liquidjs so the DOM under test is the DOM that ships. A stub <video>
 * stands in for the media pipeline so playback state, seeking and volume can be
 * asserted without a real file: what is under test is the control surface, not
 * the codec.
 *
 * The player is inline — starting a video must not open anything, move anything,
 * or change the size of anything.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Liquid } from 'liquidjs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const DIR = new URL('./.out/', import.meta.url).pathname;
mkdirSync(DIR, { recursive: true });
const SRC = readFileSync(new URL('../snippets/luxamom-ugc.liquid', import.meta.url).pathname, 'utf8');

const markup = SRC.slice(SRC.indexOf('{%- liquid'), SRC.indexOf('<script>')) + '{%- endif -%}';
const behaviour = SRC.slice(SRC.indexOf('<script>') + 8, SRC.lastIndexOf('</script>'));

const engine = new Liquid({ strictFilters: true });
engine.registerFilter('image_url', (v) => String(v || ''));
engine.registerFilter('divided_by', (a, b) => {
  const x = Number(a), y = Number(b);
  return Number.isInteger(x) && Number.isInteger(y) ? Math.floor(x / y) : x / y;
});

const VIDEOS = [
  { alt: 'הסרטון הראשון', duration: 30000 },
  { alt: 'הסרטון השני', duration: 30000 }
].map((v) => ({
  ...v,
  preview_image: '',
  sources: [
    { url: 'v-480.mp4', height: 480, format: 'mp4' },
    { url: 'v-720.mp4', height: 720, format: 'mp4' },
    { url: 'v.m3u8', height: 720, format: 'm3u8' }
  ]
}));

const shelf = await engine.parseAndRender(markup, {
  product: { metafields: { custom: { ugc_videos: { value: VIDEOS } } } }
});

writeFileSync(DIR + 'ugc.html', `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#FAF6F1;">
<p id="before" style="height:40px;margin:0;">טקסט לפני</p>
${shelf}
<p id="after" style="height:1200px;margin:0;">טקסט אחרי</p>
<script>
  window.__errors = [];
  window.addEventListener('error', function(e){ window.__errors.push('error: ' + e.message); });
  window.addEventListener('unhandledrejection', function(e){
    window.__errors.push('rejection: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
  });
  // Stub media elements: real playback needs a real file, but every control path
  // can be exercised against the standard media properties and events.
  document.querySelectorAll('[data-ugc-video]').forEach(function(v){
    var _t = 0, _paused = true, _ended = false;
    Object.defineProperty(v, 'duration', { get: function(){ return 30; } });
    Object.defineProperty(v, 'paused', { get: function(){ return _paused; } });
    Object.defineProperty(v, 'ended', { get: function(){ return _ended; } });
    Object.defineProperty(v, 'buffered', { get: function(){
      return { length: 1, end: function(){ return 15; } };
    } });
    Object.defineProperty(v, 'currentTime', {
      get: function(){ return _t; },
      set: function(x){ _t = Math.min(30, Math.max(0, x)); v.dispatchEvent(new Event('timeupdate')); }
    });
    v.play = function(){ _paused = false; _ended = false; v.dispatchEvent(new Event('play')); return Promise.resolve(); };
    v.pause = function(){ if (!_paused) { _paused = true; v.dispatchEvent(new Event('pause')); } };
    v.__end = function(){ _paused = true; _ended = true; v.dispatchEvent(new Event('ended')); };
  });
<\/script>
<script>${behaviour}<\/script>
</body></html>`);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('file://' + DIR + 'ugc.html');
await page.waitForTimeout(200);

let pass = 0, fail = 0;
async function check(name, fn) {
  let ok = false, err = null;
  try { ok = await fn(); } catch (e) { err = e; }
  if (ok) { pass++; console.log('PASS — ' + name); }
  else { fail++; console.log('FAIL — ' + name + (err ? ' :: ' + err.message : '')); }
}

const P0 = '[data-ugc-player] >> nth=0';
const P1 = '[data-ugc-player] >> nth=1';
const vid = (i, prop) => page.evaluate(
  ([n, p]) => {
    const v = document.querySelectorAll('[data-ugc-video]')[n];
    return p === 'src' ? [...v.querySelectorAll('source')].map((s) => s.src) : v[p];
  }, [i, prop]);
const box = (sel) => page.evaluate((s) => {
  const r = document.querySelector(s.replace(' >> nth=0', ':nth-of-type(1)')).getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
}, sel);

// ---- shelf ----
await check('נגן לכל סרטון', async () =>
  (await page.locator('[data-ugc-player]').count()) === 2);
await check('הפקדים המובנים הוסרו לטובת שלנו', async () =>
  (await page.getAttribute('[data-ugc-video] >> nth=0', 'controls')) === null);
await check('המקורות בסדר יורד — הגבוהה ראשונה', async () => {
  const s = await vid(0, 'src');
  return s.length === 2 && s[0].includes('720') && s[1].includes('480');
});
await check('שורת הפקדים מוסתרת עד ההפעלה', async () =>
  await page.isHidden('[data-ugc-ctl] >> nth=0'));

// ---- the whole point: playback does not take over the screen ----
const beforeBox = await box('[data-ugc-player]');
const beforeScroll = await page.evaluate(() => window.scrollY);

await page.click('[data-ugc-cover] >> nth=0');
await page.waitForTimeout(250);

await check('הסרטון מתנגן', async () => (await vid(0, 'paused')) === false);
await check('הסאונד פועל — לא מושתק', async () => (await vid(0, 'muted')) === false);

await check('הכרטיס לא שינה גודל או מיקום', async () => {
  const after = await box('[data-ugc-player]');
  return after.w === beforeBox.w && after.h === beforeBox.h &&
         after.x === beforeBox.x && after.y === beforeBox.y;
});
await check('הדף לא נגלל', async () =>
  (await page.evaluate(() => window.scrollY)) === beforeScroll);
await check('לא נפתחה שום שכבה מעל הדף', async () =>
  await page.evaluate(() => {
    // Nothing fixed and full-screen may have appeared over the page.
    return ![...document.querySelectorAll('body *')].some((el) => {
      const s = getComputedStyle(el);
      if (s.position !== 'fixed' || s.display === 'none') return false;
      const r = el.getBoundingClientRect();
      return r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9;
    });
  }));
await check('הגלילה בעמוד לא ננעלה', async () =>
  await page.evaluate(() => getComputedStyle(document.body).overflow !== 'hidden'));
await check('שאר הדף עדיין נראה', async () =>
  (await page.isVisible('#before')) && (await page.isVisible('#after')));
await check('לא נכנס למסך מלא מעצמו', async () =>
  await page.evaluate(() => document.fullscreenElement === null));

await check('הכיסוי נעלם והפקדים הופיעו', async () =>
  (await page.isHidden('[data-ugc-cover] >> nth=0')) &&
  (await page.isVisible('[data-ugc-ctl] >> nth=0')));

// ---- one at a time ----
await page.click('[data-ugc-cover] >> nth=1');
await page.waitForTimeout(250);
await check('הפעלת השני עוצרת את הראשון', async () =>
  (await vid(1, 'paused')) === false && (await vid(0, 'paused')) === true);
await page.click('[data-ugc-play] >> nth=1');
await page.waitForTimeout(120);
await check('כפתור השהיה עוצר', async () => (await vid(1, 'paused')) === true);
await check('האייקון התחלף להפעלה', async () =>
  (await page.isVisible('[data-ugc-icon-play] >> nth=1')) &&
  (await page.isHidden('[data-ugc-icon-pause] >> nth=1')));
await page.click('[data-ugc-play] >> nth=1');
await page.waitForTimeout(120);
await check('לחיצה חוזרת ממשיכה', async () => (await vid(1, 'paused')) === false);
await check('בזמן ניגון מוצג אייקון ההשהיה בלבד', async () =>
  (await page.isVisible('[data-ugc-icon-pause] >> nth=1')) &&
  (await page.isHidden('[data-ugc-icon-play] >> nth=1')));
await check('לחיצה על הסרטון עצמו עוצרת', async () => {
  await page.click('[data-ugc-video] >> nth=1');
  await page.waitForTimeout(120);
  return (await vid(1, 'paused')) === true;
});
await page.click('[data-ugc-video] >> nth=1');
await page.waitForTimeout(120);

// ---- seeking ----
await page.evaluate(() => { document.querySelectorAll('[data-ugc-video]')[1].currentTime = 15; });
await page.waitForTimeout(100);
await check('דילוג 10 שניות אחורה', async () => {
  await page.click('[data-ugc-back] >> nth=1');
  await page.waitForTimeout(100);
  return Math.round(await vid(1, 'currentTime')) === 5;
});
await check('דילוג 10 שניות קדימה', async () => {
  await page.click('[data-ugc-fwd] >> nth=1');
  await page.waitForTimeout(100);
  return Math.round(await vid(1, 'currentTime')) === 15;
});
await check('לא מדלג אחורה מתחת לאפס', async () => {
  await page.click('[data-ugc-back] >> nth=1');
  await page.click('[data-ugc-back] >> nth=1');
  await page.waitForTimeout(100);
  return (await vid(1, 'currentTime')) === 0;
});
await check('לא מדלג קדימה מעבר לסוף', async () => {
  for (let i = 0; i < 5; i++) await page.click('[data-ugc-fwd] >> nth=1');
  await page.waitForTimeout(100);
  return (await vid(1, 'currentTime')) === 30;
});

await check('גרירת הפס מזיזה את הסרטון', async () => {
  const r = await page.evaluate(() => {
    const e = document.querySelectorAll('[data-ugc-scrub]')[1].getBoundingClientRect();
    return { top: e.top, height: e.height, left: e.left, right: e.right, width: e.width };
  });
  // RTL: a quarter of the way from the right edge is 25% through the video.
  await page.mouse.move(r.right - r.width * 0.25, r.top + r.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(120);
  const t = await vid(1, 'currentTime');
  return t > 6 && t < 9;
});

await check('הפס מדווח מיקום לקורא מסך', async () => {
  const now = Number(await page.getAttribute('[data-ugc-scrub] >> nth=1', 'aria-valuenow'));
  return now > 20 && now < 32;
});

await check('חצים על הפס מזיזים 5 שניות', async () => {
  await page.focus('[data-ugc-scrub] >> nth=1');
  const before = await vid(1, 'currentTime');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(100);
  return Math.abs((await vid(1, 'currentTime')) - (before + 5)) < 0.6;
});
await check('Home ו-End קופצים להתחלה ולסוף', async () => {
  await page.keyboard.press('Home');
  await page.waitForTimeout(80);
  const start = await vid(1, 'currentTime');
  await page.keyboard.press('End');
  await page.waitForTimeout(80);
  return start === 0 && (await vid(1, 'currentTime')) === 30;
});

// ---- volume ----
/* At the card's real width the slider is deliberately dropped and the mute
   button carries volume on its own. The slider's own behaviour is asserted at a
   width where it is shown. */
await check('בגודל האמיתי הסליידר מוסתר וההשתקה נשארת', async () =>
  (await page.isHidden('[data-ugc-vol] >> nth=1')) &&
  (await page.isVisible('[data-ugc-mute] >> nth=1')));

const widen = (px) => page.evaluate((w) => {
  document.querySelectorAll('[data-ugc-player]').forEach((el) => { el.style.width = w + 'px'; });
}, px);
await widen(430);
await page.waitForTimeout(120);
await check('בכרטיס רחב הסליידר מופיע', async () =>
  await page.isVisible('[data-ugc-vol] >> nth=1'));

await check('הזזת הווליום משנה עוצמה', async () => {
  await page.locator('[data-ugc-vol]').nth(1).fill('0.4');
  await page.waitForTimeout(100);
  return Math.abs((await vid(1, 'volume')) - 0.4) < 0.01;
});
await check('השתקה עובדת ומחליפה אייקון', async () => {
  await page.click('[data-ugc-mute] >> nth=1');
  await page.waitForTimeout(100);
  return (await vid(1, 'muted')) === true && (await page.isVisible('[data-ugc-icon-muted] >> nth=1'));
});
await check('ביטול השתקה חוזר', async () => {
  await page.click('[data-ugc-mute] >> nth=1');
  await page.waitForTimeout(100);
  return (await vid(1, 'muted')) === false && (await page.isVisible('[data-ugc-icon-vol] >> nth=1'));
});
await check('ווליום 0 נחשב מושתק', async () => {
  await page.locator('[data-ugc-vol]').nth(1).fill('0');
  await page.waitForTimeout(100);
  return (await vid(1, 'muted')) === true;
});
await page.locator('[data-ugc-vol]').nth(1).fill('1');
await page.waitForTimeout(80);
await page.evaluate(() => {
  document.querySelectorAll('[data-ugc-player]').forEach((el) => { el.style.width = ''; });
});
await page.waitForTimeout(120);

// ---- keyboard, scoped to the card ----
await check('רווח על הכרטיס עוצר ומפעיל', async () => {
  await page.focus('[data-ugc-play] >> nth=1');
  const was = await vid(1, 'paused');
  await page.keyboard.press('k');
  await page.waitForTimeout(100);
  return (await vid(1, 'paused')) !== was;
});
await check('J ו-L מדלגים 10 שניות', async () => {
  await page.evaluate(() => { document.querySelectorAll('[data-ugc-video]')[1].currentTime = 15; });
  await page.keyboard.press('j');
  await page.waitForTimeout(80);
  const back = await vid(1, 'currentTime');
  await page.keyboard.press('l');
  await page.waitForTimeout(80);
  return Math.round(back) === 5 && Math.round(await vid(1, 'currentTime')) === 15;
});
await check('M משתיק', async () => {
  await page.keyboard.press('m');
  await page.waitForTimeout(100);
  const muted = await vid(1, 'muted');
  await page.keyboard.press('m');
  await page.waitForTimeout(100);
  return muted === true && (await vid(1, 'muted')) === false;
});
await check('חצים מעלה ומטה משנים ווליום', async () => {
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(80);
  const down = await vid(1, 'volume');
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(80);
  return down < 1 && (await vid(1, 'volume')) > down;
});

/* The shortcuts must not leak to the page: Space anywhere else has to scroll,
   which is the whole reason they are bound to the card and not the document. */
await check('מקשי הקיצור לא חלים על שאר הדף', async () => {
  await page.click('#before');
  const before = await vid(1, 'paused');
  await page.keyboard.press('k');
  await page.keyboard.press('l');
  await page.waitForTimeout(120);
  return (await vid(1, 'paused')) === before;
});

// ---- fullscreen is opt-in only ----
await check('F נכנס למסך מלא', async () => {
  await page.focus('[data-ugc-play] >> nth=1');
  await page.keyboard.press('f');
  await page.waitForTimeout(300);
  return await page.evaluate(() => document.fullscreenElement !== null);
});
await check('F שוב יוצא ממסך מלא', async () => {
  await page.keyboard.press('f');
  await page.waitForTimeout(300);
  return await page.evaluate(() => document.fullscreenElement === null);
});

// ---- end of playback ----
await check('בסוף הסרטון חוזר הכיסוי', async () => {
  await page.evaluate(() => document.querySelectorAll('[data-ugc-video]')[1].__end());
  await page.waitForTimeout(150);
  return (await page.isVisible('[data-ugc-cover] >> nth=1')) &&
         (await page.isHidden('[data-ugc-ctl] >> nth=1')) &&
         (await vid(1, 'currentTime')) === 0;
});
await check('אפשר להפעיל שוב אחרי שנגמר', async () => {
  await page.click('[data-ugc-cover] >> nth=1');
  await page.waitForTimeout(200);
  return (await vid(1, 'paused')) === false && (await page.isVisible('[data-ugc-ctl] >> nth=1'));
});

// ---- layout at every width the card really takes ----
for (const w of [320, 300, 260, 220]) {
  await page.evaluate((px) => {
    document.querySelectorAll('[data-ugc-player]').forEach((el) => { el.style.width = px + 'px'; });
  }, w);
  await page.waitForTimeout(120);

  await check(`שורת הפקדים לא נחתכת ברוחב ${w}px`, async () =>
    await page.evaluate(() => {
      const r = document.querySelectorAll('.lxm-ugc-row')[1];
      return r.scrollWidth <= r.clientWidth + 1;
    }));
  await check(`הפעלה והשתקה תמיד בפנים ברוחב ${w}px`, async () =>
    await page.evaluate(() => {
      const root = document.querySelectorAll('[data-ugc-player]')[1];
      const b = root.getBoundingClientRect();
      return ['[data-ugc-play]', '[data-ugc-mute]', '[data-ugc-full]'].every((s) => {
        const r = root.querySelector(s).getBoundingClientRect();
        return r.width > 0 && r.left >= b.left - 1 && r.right <= b.right + 1;
      });
    }));
}

const inPage = await page.evaluate(() => window.__errors.slice());
const all = [...errors, ...inPage];
console.log(all.length ? 'JS ERRORS:\n' + [...new Set(all)].join('\n') : 'no JS errors');
console.log(`\n${pass} pass, ${fail} fail`);
await browser.close();
process.exit(fail || all.length ? 1 : 0);
