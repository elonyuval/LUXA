#!/usr/bin/env node
/*
 * Runs every storefront test and exits non-zero if anything fails.
 *
 *   node tests/run-all.mjs
 *
 * Each test extracts the real <style>/<script> out of the Liquid sections in
 * ../sections and drives it in headless Chromium, so what is tested is the code
 * that ships, not a copy of it.
 */
import { readdirSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const HERE = new URL('.', import.meta.url).pathname;
mkdirSync(HERE + '.out', { recursive: true });

const FAIL = /^(FAIL|ERROR —|\s+DEAD CLICK|\s+UNCLICKABLE|\s+JS ERROR)/;
const files = readdirSync(HERE)
  .filter((f) => f.endsWith('-test.mjs') || f === 'test-widget.mjs')
  .sort();

let pass = 0;
let fail = 0;
const failed = [];

for (const f of files) {
  let out = '';
  try {
    out = execFileSync(process.execPath, [HERE + f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '');
  }
  const lines = out.split('\n');
  const p = lines.filter((l) => l.startsWith('PASS')).length;
  const bad = lines.filter((l) => FAIL.test(l));
  pass += p;
  fail += bad.length;
  console.log(`${bad.length ? 'FAIL' : 'ok  '}  ${f.padEnd(24)} ${String(p).padStart(3)} pass  ${bad.length} fail`);
  for (const b of bad) console.log('        ' + b.trim());
  if (bad.length) failed.push(f);
}

console.log('\n' + '-'.repeat(52));
console.log(`${pass} pass, ${fail} fail across ${files.length} suites`);
if (failed.length) console.log('failing suites: ' + failed.join(', '));
process.exit(fail ? 1 : 0);
