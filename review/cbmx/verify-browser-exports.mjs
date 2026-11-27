// User-requested cross-engine regression checks. Isolated synthetic preview only.
// Example: PLAYWRIGHT_BROWSERS_PATH=/tmp/browsers node review/cbmx/verify-browser-exports.mjs
//   --playwright=/tmp/tools/node_modules/playwright/index.mjs --engine=webkit
// No project dependency changes, environment files, credentials or database access.
import assert from 'node:assert/strict';
import { mkdir, appendFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const argument = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const engine = argument('engine', 'webkit');
const modulePath = argument('playwright');
const runtime = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const output = argument('out', 'output/cbmx-safari-review');
const counts = argument('counts', '2,3,4,5,6,7,8,9,10').split(',').map(Number);
const densities = argument('densities', 'empty,sparse,dense').split(',');
await mkdir(output, { recursive: true });
const bounded = async (operation, label) => {
  let timer;
  try { return await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), 20000); })]); }
  finally { clearTimeout(timer); }
};
console.log('LAUNCH', engine);
const browser = await bounded(runtime[engine].launch(engine === 'chromium' ? { channel: 'chrome', headless: true } : { headless: true }), 'Browser launch');
try {
  const context = await bounded(browser.newContext({ viewport: { width: Number(argument('viewport', '1280')), height: 900 }, deviceScaleFactor: Number(argument('dpr', '2')) }), 'Browser context');
  await context.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:5176/') ? route.continue() : route.abort());
  const page = await bounded(context.newPage(), 'Browser page');
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => console.error('Page error:', error.message));
  for (const count of counts) for (const density of densities) {
    console.log('START', engine, count, density);
    // Fresh page limits retained large PNG/PDF memory and tests first captures too.
    await page.goto('http://127.0.0.1:5176/');
    await page.getByRole('button', { name: `${count} actors`, exact: true }).click();
    await page.getByRole('button', { name: `${density} blueprint`, exact: true }).click();
    const variant = argument('variant', '');
    if (variant) {
      await page.getByRole('button', { name: 'Toggle read-only', exact: true }).click();
      await page.getByRole('button', { name: 'Open help panel', exact: true }).press('Enter');
      await page.getByRole('button', { name: 'Scroll workspace', exact: true }).click();
    }
    const source = await page.locator('#cbmx-canvas').evaluate(node => node.outerHTML);
    const editor = await page.locator('.cbmx-matrix-scroll').evaluate(node => ({ width: node.clientWidth,
      content: node.scrollWidth, first: node.querySelector('col').style.width,
      indent: getComputedStyle(node.querySelector('.cbmx-row-label--category')).marginLeft }));
    if (count === 5 && !variant) assert.equal(editor.width, editor.content, 'approved five-actor editor fit');
    assert.equal(editor.first, '174px'); assert.equal(editor.indent, '22px');
    await page.getByRole('button', { name: 'Capture PNG and PDF', exact: true }).click();
    await page.locator('#capture-result').waitFor({ state: 'attached', timeout: 90000 });
    await page.waitForFunction(() => /rasterClone|error/.test(document.querySelector('#export-metrics')?.textContent ?? ''), null, { timeout: 20000 });
    const result = await page.evaluate(() => ({ metrics: JSON.parse(document.querySelector('#export-metrics').textContent),
      png: document.querySelector('#capture-result').src, pdf: document.querySelector('#pdf-result').href,
      width: document.querySelector('#capture-result').naturalWidth, height: document.querySelector('#capture-result').naturalHeight }));
    assert.ok(!result.metrics.error, `Export diagnostic failed: ${result.metrics.error}`);
    const { metrics } = result, clone = metrics.rasterClone;
    assert.equal(clone.table.width, metrics.table.width, 'WebKit regression: serialized table must not expand');
    assert.ok(clone.maxRight + 5 <= clone.capture.width + 0.02, 'complete right extent with margin');
    assert.ok(clone.maxBottom + 5 <= clone.capture.height + 0.02, 'complete bottom extent with margin');
    assert.equal(clone.controls, 0);
    assert.equal(await page.locator('#cbmx-canvas').evaluate(node => node.outerHTML), source, 'interactive matrix stays unchanged');
    assert.equal(result.width, clone.capture.width * 2); assert.equal(result.height, clone.capture.height * 2);
    const name = `${engine}-${count}-${density}${variant ? '-' + variant : ''}`;
    await writeFile(`${output}/${name}.png`, Buffer.from(result.png.split(',')[1], 'base64'));
    await writeFile(`${output}/${name}.pdf`, Buffer.from(result.pdf.split(',')[1], 'base64'));
    delete result.png; delete result.pdf;
    await appendFile(`${output}/browser-results.jsonl`, JSON.stringify({ name, engine, browserVersion: browser.version(), count, density, editor, ...result }) + '\n');
    console.log('PASS', name, `${result.width}x${result.height}`);
  }
} finally { await bounded(browser.close(), 'Browser close'); }
