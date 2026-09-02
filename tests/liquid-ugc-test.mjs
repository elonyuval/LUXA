/*
 * The UGC snippet's Liquid, rendered for real.
 *
 * ugc-test.mjs drives the player's JavaScript, but it feeds that player a JSON
 * blob built in JavaScript — so it can never catch a fault in the Liquid that
 * emits the blob on the storefront. This renders the actual template against the
 * shape Shopify really returns and parses the result.
 *
 * Requires liquidjs (npm install).
 */
import { readFileSync } from 'node:fs';
import { Liquid } from 'liquidjs';

const SRC = readFileSync(new URL('../snippets/luxamom-ugc.liquid', import.meta.url).pathname, 'utf8');

/* From the opening `assign` block down to the player markup: the part driven by
   product data, including the metafield read and the heading default. The player
   itself is static and is covered by ugc-test.mjs. The slice cuts inside the
   `{%- if ugc != blank -%}` guard, so its `endif` is put back. */
const template = SRC.slice(
  SRC.indexOf('{%- liquid'),
  SRC.indexOf('<div class="lxm-vp" data-vp hidden>')
) + '{%- endif -%}';

const engine = new Liquid({ strictFilters: true, strictVariables: false });
engine.registerFilter('image_url', (v) => String(v || ''));

/* Shopify's `divided_by` floors when both operands are integers; liquidjs
   divides as floats. The timecode depends on that, so the test has to model the
   engine the template will actually run on. */
engine.registerFilter('divided_by', (a, b) => {
  const x = Number(a), y = Number(b);
  return Number.isInteger(x) && Number.isInteger(y) ? Math.floor(x / y) : x / y;
});

/* A Shopify video's `sources` is ordered 480p mp4, 720p mp4, HLS manifest — the
   last entry is the one the template filters out. Renditions vary per file: a
   short upload may have no 1080p at all. */
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

function data(html) {
  const m = html.match(/<script type="application\/json" data-ugc-data>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no data block emitted');
  return JSON.parse(m[1]);
}

// The exact case that broke on the live catalogue: two mp4 renditions followed
// by an HLS manifest, so the final source is filtered out mid-loop.
const real = [
  video({ alt: '', duration: 13430, heights: [480, 720] }),
  video({ alt: 'נכנס לתיק?', duration: 10260, heights: [480, 720] })
];

await check('הבלוק הוא JSON תקין כשהמקור האחרון הוא HLS', async () => {
  data(await render(real)).length === 2;
  return true;
});

await check('רק mp4 נכנס לרשימת המקורות', async () => {
  const d = data(await render(real));
  return d.every((v) => v.sources.length === 2 && v.sources.every((s) => s.url.endsWith('.mp4')));
});

await check('סרטון בלי HLS עדיין תקין', async () => {
  const d = data(await render([video({ alt: 'א', duration: 9000, heights: [480, 720, 1080], hls: false })]));
  return d[0].sources.length === 3;
});

await check('סרטון עם איכות אחת בלבד תקין', async () => {
  const d = data(await render([video({ alt: 'א', duration: 9000, heights: [480] })]));
  return d[0].sources.length === 1;
});

await check('סרטון בלי mp4 כלל לא שובר את ה-JSON', async () => {
  const d = data(await render([video({ alt: 'א', duration: 9000, heights: [] })]));
  return Array.isArray(d[0].sources) && d[0].sources.length === 0;
});

await check('alt ריק מקבל כיתוב ברירת מחדל', async () => {
  const d = data(await render(real));
  return d[0].caption === 'סרטון מהשימוש במוצר' && d[1].caption === 'נכנס לתיק?';
});

await check('כיתוב עם גרש נשאר JSON תקין', async () => {
  const d = data(await render([video({ alt: 'זה "עובד" \\ באמת', duration: 9000, heights: [480] })]));
  return d[0].caption === 'זה "עובד" \\ באמת';
});

await check('משך הזמן מוצג כדקות:שניות', async () => {
  const html = await render([
    video({ alt: 'א', duration: 9820, heights: [480] }),   // 0:09
    video({ alt: 'ב', duration: 66000, heights: [480] }),  // 1:06
    video({ alt: 'ג', duration: 48000, heights: [480] })   // 0:48
  ]);
  const durs = [...html.matchAll(/class="lxm-ugc-dur">([^<]+)</g)].map((m) => m[1]);
  return durs.join(' ') === '0:09 1:06 0:48';
});

await check('כרטיס לכל סרטון', async () => {
  const html = await render(real);
  return (html.match(/data-ugc-open="/g) || []).length === 2;
});

/* The brief is "no unnecessary caption": the heading carries the message and
   nothing is written under a video. The alt text may only survive as an
   accessible name. */
await check('אין טקסט נראה מתחת לסרטון', async () => {
  const html = await render([video({ alt: 'זהו כיתוב', duration: 9000, heights: [480] })]);
  const visible = html
    .replace(/aria-label="[^"]*"/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<[^>]+>/g, ' ');
  return !visible.includes('זהו כיתוב');
});

await check('הכותרת היא ההמלצה של הלקוחה', async () =>
  (await render(real)).includes('הלקוחה מספר 1 שלנו ממליצה'));

await check('אין שורת משנה ואין תווית מעל הכותרת', async () => {
  const html = await render(real);
  return !html.includes('lxm-ugc-sub') && !html.includes('lxm-ugc-eyebrow');
});

await check('ה-alt נשאר כשם נגיש לכרטיס', async () => {
  const html = await render([video({ alt: 'זהו כיתוב', duration: 9000, heights: [480] })]);
  return html.includes('aria-label="נגן סרטון: זהו כיתוב"');
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
