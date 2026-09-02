/*
 * UGC video shelf + player.
 *
 * Drives the real snippet's <style>/<script> against a shelf built from the
 * markup the Liquid produces. A stub <video> element stands in for the media
 * pipeline so playback state, seeking and volume can be asserted without a real
 * file: what is under test is the control surface, not the codec.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const DIR = new URL('./.out/', import.meta.url).pathname;
mkdirSync(DIR, { recursive: true });
const SRC = readFileSync(new URL('../snippets/luxamom-ugc.liquid', import.meta.url).pathname, 'utf8');
const style = SRC.match(/<style>([\s\S]*?)<\/style>/)[1];
const behaviour = SRC.match(/<script>\n\(function\(\)\{[\s\S]*?<\/script>/)[0]
  .replace(/^<script>/, '').replace(/<\/script>$/, '');

const VIDEOS = [
  { caption: 'כמה זמן לוקח להתקין?', dur: '0:14' },
  { caption: 'נכנס לתיק?', dur: '0:11' },
  { caption: 'איך זה מרגיש אחרי שעה', dur: '0:26' }
];

const cards = VIDEOS.map((v, i) => `
  <button type="button" class="lxm-ugc-card" data-ugc-open="${i}" aria-label="נגן סרטון: ${v.caption}">
    <span class="lxm-ugc-poster">
      <img src="" alt="" width="210" height="373">
      <span class="lxm-ugc-play" aria-hidden="true"><span><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span></span>
      <span class="lxm-ugc-dur">${v.dur}</span>
    </span>
    <span class="lxm-ugc-cap">${v.caption}</span>
  </button>`).join('');

const json = JSON.stringify(VIDEOS.map((v, i) => ({
  caption: v.caption,
  poster: `poster-${i}.jpg`,
  sources: [
    { url: `v${i}-480.mp4`, height: 480 },
    { url: `v${i}-1080.mp4`, height: 1080 },
    { url: `v${i}-720.mp4`, height: 720 }
  ]
})));

// The player markup, copied out of the snippet so the test drives the real DOM.
const playerMarkup = SRC.match(/<div class="lxm-vp" data-vp hidden>[\s\S]*?<\/div>\n<\/section>/)[0]
  .replace(/<\/section>$/, '');

writeFileSync(DIR + '/ugc.html', `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>${style}</style></head><body>
<section class="lxm-ugc">
  <div class="lxm-ugc-wrap"><div class="lxm-ugc-rail">${cards}</div></div>
  <script type="application/json" data-ugc-data>${json}<\/script>
  ${playerMarkup}
</section>
<script>
  window.__errors = [];
  window.addEventListener('error', function(e){ window.__errors.push('error: ' + e.message); });
  window.addEventListener('unhandledrejection', function(e){
    window.__errors.push('rejection: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
  });
  // A stub media element: real playback needs a real file, but every control
  // path can be exercised against the standard media properties and events.
  (function(){
    var v = document.querySelector('[data-vp-video]');
    var _t = 0, _paused = true;
    Object.defineProperty(v, 'duration', { get: function(){ return 30; } });
    Object.defineProperty(v, 'paused', { get: function(){ return _paused; } });
    Object.defineProperty(v, 'ended', { get: function(){ return false; } });
    Object.defineProperty(v, 'buffered', { get: function(){
      return { length: 1, end: function(){ return 15; } };
    } });
    Object.defineProperty(v, 'currentTime', {
      get: function(){ return _t; },
      set: function(x){ _t = Math.min(30, Math.max(0, x)); v.dispatchEvent(new Event('timeupdate')); }
    });
    v.play = function(){ _paused = false; v.dispatchEvent(new Event('play')); return Promise.resolve(); };
    v.pause = function(){ _paused = true; v.dispatchEvent(new Event('pause')); };
    v.load = function(){ _t = 0; setTimeout(function(){ v.dispatchEvent(new Event('loadedmetadata')); }, 0); };
  })();
<\/script>
<script>${behaviour}<\/script>
</body></html>`);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('file://' + DIR + '/ugc.html');
await page.waitForTimeout(200);

const check = async (label, fn) => {
  try { console.log(((await fn()) ? 'PASS' : 'FAIL') + ' — ' + label); }
  catch (e) { console.log('ERROR — ' + label + ': ' + e.message); }
};
const vid = (prop) => page.evaluate((p) => {
  const v = document.querySelector('[data-vp-video]');
  return p === 'src' ? Array.from(v.querySelectorAll('source')).map((s) => s.getAttribute('src')) : v[p];
}, prop);

await check('הנגן סגור בטעינה', async () => await page.isHidden('[data-vp]'));
await check('הנגן לא מוריד וידאו לפני לחיצה', async () =>
  (await page.getAttribute('[data-vp-video]', 'preload')) === 'none');
await check('שלושה כרטיסים עם כיתוב', async () =>
  (await page.locator('.lxm-ugc-card').count()) === 3 &&
  (await page.textContent('.lxm-ugc-card >> nth=0')).includes('כמה זמן'));

// open
await page.click('.lxm-ugc-card >> nth=1');
await page.waitForTimeout(250);
await check('לחיצה על כרטיס פותחת את הנגן', async () => await page.isVisible('[data-vp]'));
await check('נפתח הסרטון הנכון', async () =>
  (await page.textContent('[data-vp-caption]')) === 'נכנס לתיק?');
await check('הסרטון מתנגן מיד', async () => (await vid('paused')) === false);
await check('הסאונד פועל — לא מושתק', async () => (await vid('muted')) === false);
await check('נטענו כל האיכויות, מהנמוכה לגבוהה', async () => {
  const s = await vid('src');
  return s.length === 3 && s[0].includes('480') && s[2].includes('1080');
});
await check('הפקדים המובנים הוסרו לטובת שלנו', async () =>
  (await page.getAttribute('[data-vp-video]', 'controls')) === null);

await check('בזמן ניגון מוצג אייקון ההשהיה בלבד', async () =>
  (await page.isVisible('[data-vp-icon-pause]')) && (await page.isHidden('[data-vp-icon-play]')));

// play / pause
await page.click('[data-vp-play]');
await check('כפתור השהיה עוצר', async () => (await vid('paused')) === true);
await check('האייקון התחלף להפעלה', async () =>
  (await page.isVisible('[data-vp-icon-play]')) && (await page.isHidden('[data-vp-icon-pause]')));
await page.click('[data-vp-play]');
await check('לחיצה חוזרת ממשיכה', async () => (await vid('paused')) === false);

// skip
await page.evaluate(() => { document.querySelector('[data-vp-video]').currentTime = 20; });
await page.click('[data-vp-back]');
await check('אחורה 10 שניות', async () => (await vid('currentTime')) === 10);
await page.click('[data-vp-fwd]');
await check('קדימה 10 שניות', async () => (await vid('currentTime')) === 20);
await page.click('[data-vp-back]');
await page.click('[data-vp-back]');
await page.click('[data-vp-back]');
await check('לא יורד מתחת לאפס', async () => (await vid('currentTime')) === 0);

// scrubber
await check('הסרגל מציג התקדמות וזמן', async () => {
  await page.evaluate(() => { document.querySelector('[data-vp-video]').currentTime = 15; });
  await page.waitForTimeout(60);
  const w = await page.evaluate(() => document.querySelector('[data-vp-fill]').style.width);
  const t = await page.textContent('[data-vp-time]');
  return w === '50%' && t === '0:15 / 0:30';
});
await check('הסרגל מציג טעינה מראש', async () =>
  (await page.evaluate(() => document.querySelector('[data-vp-buf]').style.width)) === '50%');
await check('גרירת הסרגל קופצת לנקודה', async () => {
  const box = await page.locator('[data-vp-scrub]').boundingBox();
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(60);
  const t = await vid('currentTime');
  return t > 6 && t < 9; // ~25% of 30s
});
await check('הסרגל נגיש למקלדת', async () => {
  await page.focus('[data-vp-scrub]');
  const before = await vid('currentTime');
  await page.keyboard.press('ArrowRight');
  const after = await vid('currentTime');
  return after === before + 5;
});
await check('הסרגל מדווח ערך לקורא מסך', async () =>
  (await page.getAttribute('[data-vp-scrub]', 'aria-valuetext')).includes('מתוך'));

// volume
await check('סליידר ווליום משנה עוצמה', async () => {
  await page.evaluate(() => {
    const i = document.querySelector('[data-vp-vol]');
    i.value = '0.4';
    i.dispatchEvent(new Event('input'));
  });
  return Math.abs((await vid('volume')) - 0.4) < 0.001;
});
await check('השתקה עובדת ומחליפה אייקון', async () => {
  await page.click('[data-vp-mute]');
  return (await vid('muted')) === true && (await page.isVisible('[data-vp-icon-muted]'));
});
await check('ביטול השתקה חוזר', async () => {
  await page.click('[data-vp-mute]');
  return (await vid('muted')) === false;
});
await check('ווליום 0 נחשב מושתק', async () => {
  await page.evaluate(() => {
    const i = document.querySelector('[data-vp-vol]');
    i.value = '0';
    i.dispatchEvent(new Event('input'));
  });
  return (await vid('muted')) === true;
});

// keyboard
await page.evaluate(() => {
  const i = document.querySelector('[data-vp-vol]');
  i.value = '0.5'; i.dispatchEvent(new Event('input'));
});
await page.evaluate(() => document.querySelector('[data-vp-play]').focus());
await check('רווח עוצר ומפעיל', async () => {
  const before = await vid('paused');
  await page.keyboard.press(' ');
  return (await vid('paused')) !== before;
});
await check('J ו-L מדלגים 10 שניות', async () => {
  await page.evaluate(() => { document.querySelector('[data-vp-video]').currentTime = 10; });
  await page.keyboard.press('l');
  const fwd = await vid('currentTime');
  await page.keyboard.press('j');
  return fwd === 20 && (await vid('currentTime')) === 10;
});
await check('חצים מעלה ומטה משנים ווליום', async () => {
  const before = await vid('volume');
  await page.keyboard.press('ArrowUp');
  return (await vid('volume')) > before;
});
await check('M משתיק', async () => {
  await page.keyboard.press('m');
  return (await vid('muted')) === true;
});
await page.keyboard.press('m');
await check('F נכנס למסך מלא', async () => {
  await page.keyboard.press('f');
  await page.waitForTimeout(250);
  return await page.evaluate(() => !!document.fullscreenElement);
});
await check('F שוב יוצא ממסך מלא', async () => {
  await page.keyboard.press('f');
  await page.waitForTimeout(250);
  return await page.evaluate(() => !document.fullscreenElement);
});

// navigation between videos
await page.click('[data-vp-next]');
await page.waitForTimeout(200);
await check('חץ הבא עובר לסרטון הבא', async () =>
  (await page.textContent('[data-vp-caption]')) === 'איך זה מרגיש אחרי שעה');
await page.click('[data-vp-next]');
await page.waitForTimeout(200);
await check('אחרי האחרון חוזר לראשון', async () =>
  (await page.textContent('[data-vp-caption]')) === 'כמה זמן לוקח להתקין?');
await page.click('[data-vp-prev]');
await page.waitForTimeout(200);
await check('חץ הקודם חוזר אחורה', async () =>
  (await page.textContent('[data-vp-caption]')) === 'איך זה מרגיש אחרי שעה');

// closing
await check('Esc סוגר ועוצר את הסרטון', async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  return (await page.isHidden('[data-vp]')) && (await vid('paused')) === true;
});
await check('הגלילה בעמוד משוחררת אחרי סגירה', async () =>
  (await page.evaluate(() => document.body.style.overflow)) === '');
await check('הפוקוס חוזר לכרטיס שנלחץ', async () =>
  (await page.evaluate(() => document.activeElement.getAttribute('data-ugc-open'))) === '1');

await page.click('.lxm-ugc-card >> nth=0');
await page.waitForTimeout(200);
await check('לחיצה על הרקע סוגרת', async () => {
  await page.evaluate(() => {
    const vp = document.querySelector('[data-vp]');
    vp.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(150);
  return await page.isHidden('[data-vp]');
});

await page.click('.lxm-ugc-card >> nth=0');
await page.waitForTimeout(200);
await check('לחיצה על הנגן עצמו לא סוגרת', async () => {
  await page.click('.lxm-vp-stage');
  await page.waitForTimeout(120);
  return await page.isVisible('[data-vp]');
});
await check('כפתור הסגירה סוגר', async () => {
  await page.click('[data-vp-close]');
  await page.waitForTimeout(150);
  return await page.isHidden('[data-vp]');
});

/* Layout. `hidden` is an HTML content attribute — the UA stylesheet does not
   apply it to SVG elements, so asserting the attribute is present proves
   nothing. These assert what the shopper actually sees. */
await page.click('.lxm-ugc-card >> nth=0');
await page.waitForTimeout(250);
// a known state: paused, unmuted, full volume
await page.evaluate(() => {
  const v = document.querySelector('[data-vp-video]');
  v.pause(); v.muted = false; v.volume = 1;
  v.dispatchEvent(new Event('volumechange'));
});
await page.waitForTimeout(80);

await check('אייקון ההשהיה באמת מוסתר כשהסרטון עצור', async () =>
  await page.evaluate(() => {
    const i = document.querySelector('[data-vp-icon-pause]');
    return i.hasAttribute('hidden') && getComputedStyle(i).display === 'none';
  }));

await check('אייקון ההשתקה באמת מוסתר כשיש קול', async () =>
  await page.evaluate(() => {
    const i = document.querySelector('[data-vp-icon-muted]');
    return i.hasAttribute('hidden') && getComputedStyle(i).display === 'none';
  }));

await check('רק אייקון אחד גלוי בכל כפתור מתחלף', async () =>
  await page.evaluate(() => {
    const shown = (b) => Array.from(document.querySelectorAll(b + ' svg'))
      .filter((s) => getComputedStyle(s).display !== 'none').length;
    return shown('[data-vp-play]') === 1 && shown('[data-vp-mute]') === 1;
  }));

// A 9:16 video on a small phone is about 300px wide; the bar must still fit.
for (const w of [300, 360, 430]) {
  await page.evaluate((px) => {
    const v = document.querySelector('[data-vp-video]');
    v.style.width = px + 'px'; v.style.height = Math.round(px * 16 / 9) + 'px';
  }, w);
  await page.waitForTimeout(80);

  await check(`שורת הפקדים לא נחתכת ברוחב ${w}px`, async () =>
    await page.evaluate(() => {
      const r = document.querySelector('.lxm-vp-row');
      return r.scrollWidth <= r.clientWidth + 1;
    }));

  await check(`הזמן לא נשבר לשתי שורות ברוחב ${w}px`, async () =>
    await page.evaluate(() => {
      const t = document.querySelector('.lxm-vp-time');
      return t.getBoundingClientRect().height < 26;
    }));

  await check(`כל הפקדים בתוך המסגרת ברוחב ${w}px`, async () =>
    await page.evaluate(() => {
      const box = document.querySelector('.lxm-vp-ctl').getBoundingClientRect();
      const must = ['[data-vp-play]', '[data-vp-back]', '[data-vp-fwd]', '[data-vp-mute]', '[data-vp-full]'];
      return must.every((s) => {
        const r = document.querySelector(s).getBoundingClientRect();
        return r.width > 0 && r.left >= box.left - 1 && r.right <= box.right + 1;
      });
    }));
}

await page.click('[data-vp-close]');
await page.waitForTimeout(150);

const inPage = await page.evaluate(() => window.__errors.slice());
const all = [...errors, ...inPage];
console.log(all.length ? 'JS ERRORS:\n' + [...new Set(all)].join('\n') : 'no JS errors');
await browser.close();
