import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const DIR = new URL('./.out/', import.meta.url).pathname;
const src = readFileSync('/home/user/LUXA/snippets/luxamom-bundle.liquid', 'utf8');
const style = src.match(/<style>([\s\S]*?)<\/style>/)[1];
const behaviour = src.match(/<script>([\s\S]*?)<\/script>/)[1];

const products = [
  { name: 'תיק החתלה 3-ב-1', price: 34900, current: true },
  { name: 'מחמם בקבוק אלחוטי נייד', price: 11900 },
  { name: 'כרית מגן ראש לתינוק', price: 9900 },
  { name: 'מנשא חיבוק', price: 16999 }
];
const tiers = [
  { step: 1, rate: 0, name: 'מוצר אחד', label: 'מחיר מלא' },
  { step: 2, rate: 10, name: 'שניים', label: '10% הנחה' },
  { step: 3, rate: 15, name: 'שלושה', label: '15% הנחה' },
  { step: 4, rate: 20, name: 'ארבעה', label: '20% הנחה' }
];

const picks = products
  .map(
    (p, i) => `<div class="lxm-be-pick${p.current ? ' lxm-be-on lxm-be-lock' : ''}" data-be-pick data-be-price="${p.price}"
      ${p.current ? 'data-be-on="1" data-be-lock="1"' : 'role="button" tabindex="0" aria-pressed="false"'}>
      <span class="lxm-be-tick">✓</span>
      <div class="lxm-be-img"></div>
      <div class="lxm-be-info">
        <p class="lxm-be-name">${p.name}</p>
        <span class="lxm-be-price">₪${p.price / 100}</span>
        <input type="hidden" data-be-variant value="v${i}">
      </div>
    </div>`
  )
  .join('\n');

const ladder = tiers
  .map(
    (t) =>
      `<div class="lxm-be-step" data-be-step="${t.step}" data-be-rate="${t.rate}"><b>${t.name}</b>${t.label}</div>`
  )
  .join('\n');

writeFileSync(
  DIR + '/bundle.html',
  `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>${style}</style></head><body>
<section class="lxm-be"><div class="lxm-be-wrap"><div class="lxm-be-card" data-be>
  <div class="lxm-be-row" style="grid-template-columns:repeat(4,minmax(0,1fr));">${picks}</div>
  <div class="lxm-be-ladder">${ladder}</div>
  <p class="lxm-be-next" data-be-next></p>
  <div class="lxm-be-foot">
    <div class="lxm-be-total">
      <span class="lxm-be-was" data-be-was></span>
      <span class="lxm-be-now" data-be-now></span>
      <span class="lxm-be-save" data-be-save></span>
    </div>
    <button type="button" class="lxm-be-add" data-be-add>הוספה לסל</button>
  </div>
</div></div></section>
<script>${behaviour}</script>
</body></html>`
);

const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('file://' + DIR + '/bundle.html');

const check = async (label, fn) => {
  try {
    const r = await fn();
    console.log((r ? 'PASS' : 'FAIL') + ' — ' + label);
  } catch (e) {
    console.log('ERROR — ' + label + ': ' + e.message);
  }
};

const pick = (n) => `.lxm-be-pick:nth-child(${n})`;
const activeStep = () =>
  page.evaluate(() => {
    const a = document.querySelector('.lxm-be-step.lxm-be-act');
    return a ? a.getAttribute('data-be-step') : null;
  });

await check('current product starts selected and locked', async () =>
  (await page.textContent('[data-be-now]')) === '₪349' && (await activeStep()) === '1');

await check('one product suggests the cheapest addition at 10%', async () => {
  const t = await page.textContent('[data-be-next]');
  return t.includes('כרית מגן ראש') && t.includes('10%');
});

// add the sling (4th card)
await page.click(pick(4));
await check('two products apply 10%', async () => {
  const now = await page.textContent('[data-be-now]');
  const was = await page.textContent('[data-be-was]');
  return was === '₪518.99' && now === '₪467.09';
});
await check('agorot survive the total', async () => (await page.textContent('[data-be-now]')).includes('.'));
await check('ladder highlights step 2', async () => (await activeStep()) === '2');
await check('next step now advertises 15%', async () => (await page.textContent('[data-be-next]')).includes('15%'));

await page.click(pick(3));
await check('three products apply 15%', async () => {
  const now = await page.textContent('[data-be-now]');
  return now === '₪525.29' && (await activeStep()) === '3';
});

await page.click(pick(2));
await check('four products apply 20%', async () => {
  const now = await page.textContent('[data-be-now]');
  const save = await page.textContent('[data-be-save]');
  return now === '₪589.59' && save.includes('147.4') && (await activeStep()) === '4';
});
await check('full set message at the top tier', async () =>
  (await page.textContent('[data-be-next]')).includes('הסט המלא'));
await check('button counts the products', async () =>
  (await page.textContent('[data-be-add]')) === 'הוספת 4 מוצרים לסל');

await check('locked current product cannot be removed', async () => {
  await page.click(pick(1));
  return (await activeStep()) === '4';
});

await page.click(pick(4));
await page.click(pick(3));
await page.click(pick(2));
await check('back to one product clears the discount', async () =>
  (await page.textContent('[data-be-was]')) === '' && (await page.textContent('[data-be-now]')) === '₪349');

await page.screenshot({ path: DIR + '/bundle.png' });
console.log(errors.length ? 'JS ERRORS:\n' + errors.join('\n') : 'no JS errors');
await browser.close();
