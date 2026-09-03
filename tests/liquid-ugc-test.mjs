/*
 * The UGC snippet's Liquid, rendered for real.
 *
 * ugc-test.mjs drives the player's JavaScript, but against markup it builds
 * itself — so it can never catch a fault in the Liquid that produces that markup
 * on the storefront. This renders the actual template against the shape Shopify
 * really returns.
 *
 * Requires liquidjs (npm install).
 */
import { readFileSync } from 'node:fs';
import { Liquid } from 'liquidjs';

const SRC = readFileSync(new URL('../snippets/luxamom-ugc.liquid', import.meta.url).pathname, 'utf8');

/* From the opening `assign` block down to the behaviour script: the part driven
   by product data, including the metafield read and the heading default. The
   slice cuts inside the `{%- if ugc != blank -%}` guard, so its `endif` is put
   back. */
const template = SRC.slice(SRC.indexOf('{%- liquid'), SRC.indexOf('<script>')) + '{%- endif -%}';

const engine = new Liquid({ strictFilters: true, strictVariables: false });
engine.registerFilter('image_url', (v) => String(v || ''));

/* Shopify's `divided_by` floors when both operands are integers; liquidjs
   divides as floats. The timecode depends on that, so the test has to model the
   engine the template will actually run on. */
engine.registerFilter('divided_by', (a, b) => {
  const x = Number(a), y = Number(b);
  return Number.isInteger(x) && Number.isInteger(y) ? Math.floor(x / y) : x / y;
});

/* A Shopify video's `sources` is ordered 480p mp4, 720p mp4, HLS manifest.
   Renditions vary per file: a short upload may have no 1080p at all. */
const video = (opts) => ({
  alt: opts.alt,
  duration: opts.duration,
  preview_image: 'preview.jpg',
  sources: opts.heights
    .map((h) => ({ url: `v-${h}.mp4`, height: h, format: 'mp4' }))
    .concat(opts.hls === false ? [] : [{ url: 'v.m3u8', height: 720, format: 'm3u8' }])
});

let pass = 0, fail = 0;
async function check(name, fn) {
  let ok = false, err = null;
  try { ok = await fn(); } catch (e) { err = e; }
  if (ok) { pass++; console.log('PASS — ' + name); }
  else { fail++; console.log('FAIL — ' + name + (err ? ' :: ' + err.message : '')); }
}

// The template reads the metafield itself, so the fixture goes in as a product.
async function render(ugc) {
  return engine.parseAndRender(template, {
    product: { metafields: { custom: { ugc_videos: { value: ugc } } } }
  });
}

const srcs = (html) => [...html.matchAll(/<source src="([^"]+)"/g)].map((m) => m[1]);

const real = [
  video({ alt: '', duration: 13430, heights: [480, 720] }),
  video({ alt: 'נכנס לתיק?', duration: 10260, heights: [480, 720] })
];

await check('נגן לכל סרטון', async () => {
  const html = await render(real);
  return (html.match(/data-ugc-player/g) || []).length === 2 &&
         (html.match(/<video /g) || []).length === 2;
});

/* A browser plays the FIRST <source> it supports, not the best one available.
   Ordering ascending would serve every shopper the 480p rendition. */
await check('האיכות הגבוהה ביותר מופיעה ראשונה', async () => {
  const html = await render([video({ alt: 'א', duration: 9000, heights: [480, 1080, 720] })]);
  return srcs(html).join(',') === 'v-1080.mp4,v-720.mp4,v-480.mp4';
});

await check('מקור ה-HLS לא נכנס', async () =>
  srcs(await render(real)).every((u) => u.endsWith('.mp4')));

await check('סרטון עם איכות אחת בלבד תקין', async () =>
  srcs(await render([video({ alt: 'א', duration: 9000, heights: [480] })])).length === 1);

await check('סרטון בלי mp4 כלל לא שובר את הנגן', async () => {
  const html = await render([video({ alt: 'א', duration: 9000, heights: [] })]);
  return srcs(html).length === 0 && html.includes('data-ugc-player');
});

await check('כל סרטון טוען רק בלחיצה', async () => {
  const html = await render(real);
  return (html.match(/preload="none"/g) || []).length === 2 &&
         (html.match(/poster="/g) || []).length === 2;
});

await check('פקדים מובנים קיימים כגיבוי ללא JS', async () =>
  (await render(real)).includes('controls'));

await check('משך הזמן מוצג כדקות:שניות', async () => {
  const html = await render([
    video({ alt: 'א', duration: 9820, heights: [480] }),
    video({ alt: 'ב', duration: 66000, heights: [480] }),
    video({ alt: 'ג', duration: 48000, heights: [480] })
  ]);
  return [...html.matchAll(/class="lxm-ugc-dur">([^<]+)</g)].map((m) => m[1]).join(' ') === '0:09 1:06 0:48';
});

/* The brief is "no unnecessary caption": the heading carries the message and
   nothing is written under a video. The alt text may only survive as an
   accessible name. */
await check('אין טקסט נראה מתחת לסרטון', async () => {
  const html = await render([video({ alt: 'זהו כיתוב', duration: 9000, heights: [480] })]);
  const visible = html
    .replace(/aria-label="[^"]*"/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ');
  return !visible.includes('זהו כיתוב');
});

await check('ה-alt נשאר כשם נגיש', async () => {
  const html = await render([video({ alt: 'זהו כיתוב', duration: 9000, heights: [480] })]);
  return html.includes('aria-label="נגן סרטון: זהו כיתוב"') && html.includes('aria-label="זהו כיתוב"');
});

await check('alt ריק מקבל שם נגיש ברירת מחדל', async () =>
  (await render(real)).includes('נגן סרטון: סרטון מהשימוש במוצר'));

// Shopify's `escape` emits &quot; and liquidjs emits &#34;; both are correct, so
// the assertion is that the quote is encoded at all and the attribute holds.
await check('גרשיים ב-alt לא שוברים את המארקאפ', async () => {
  const html = await render([video({ alt: 'זה "עובד"', duration: 9000, heights: [480] })]);
  return /aria-label="נגן סרטון: זה (&quot;|&#34;)עובד(&quot;|&#34;)"/.test(html) &&
         !html.includes('aria-label="זה "');
});

await check('הכותרת היא ההמלצה של הלקוחה', async () =>
  (await render(real)).includes('הלקוחה מספר 1 שלנו ממליצה'));

await check('אין שורת משנה ואין תווית מעל הכותרת', async () => {
  const html = await render(real);
  return !html.includes('lxm-ugc-sub') && !html.includes('lxm-ugc-eyebrow');
});

// The overlay player is gone: playback happens in the card, in place.
await check('אין חלון קופץ ואין שכבת רקע', async () => {
  const html = await render(real);
  return !html.includes('role="dialog"') && !html.includes('lxm-vp') &&
         !SRC.includes('document.body.style.overflow');
});

// A product with no videos must render nothing at all — not an empty shelf, and
// not a stray heading. Every product page carries the render call unconditionally.
await check('מוצר בלי סרטונים לא מייצר שום פלט', async () => {
  const empty = await render([]);
  const missing = await engine.parseAndRender(template, {});
  return empty.trim() === '' && missing.trim() === '';
});

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
