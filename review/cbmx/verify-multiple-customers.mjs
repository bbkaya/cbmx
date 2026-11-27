// Optional real-browser regression using the existing database-free preview.
// No project dependency changes, credentials or database access.
// Run with --playwright=/path/to/playwright/index.mjs and optional --engine=webkit.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const argument = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const engine = argument('engine', 'chromium');
const modulePath = argument('playwright');
const runtime = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const base = argument('base', 'http://127.0.0.1:5176');
const output = argument('out', 'output/cbmx-multiple-customers');
await mkdir(output, { recursive: true });
console.log('Launching', engine);
const browser = await runtime[engine].launch({ timeout: 20000, headless: true, ...(engine === 'chromium' ? { channel: 'chrome' } : {}) });
const palette = {
  Customer: ['rgb(36, 85, 79)', 'rgb(224, 240, 235)', 'rgb(36, 85, 79)'],
  Orchestrator: ['rgb(120, 55, 76)', 'rgb(246, 229, 235)', 'rgb(120, 55, 76)'],
  Other: ['rgb(13, 70, 120)', 'rgb(224, 239, 254)', 'rgb(22, 75, 123)'],
};
try {
  console.log('Checking', engine);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
  await context.route('**/*', route => route.request().url().startsWith(base + '/') ? route.continue() : route.abort());
  const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/');
  await page.locator('.cbmx-role-trigger').first().waitFor({ state: 'visible' });
  const trigger = index => page.locator('.cbmx-role-trigger').nth(index - 2);
  const choose = async (index, type) => {
    await trigger(index).click();
    await page.getByRole('menuitemradio', { name: type, exact: true }).click();
    assert.equal(await page.locator('.cbmx-role-menu').count(), 0);
  };
  const colors = async () => page.locator('#cbmx-canvas').evaluate(node => [...node.querySelectorAll('.cbmx-actor-header')].map((header, index) => {
    const label = node.querySelectorAll('.cbmx-role')[index];
    return { type: label.textContent, header: getComputedStyle(header).backgroundColor,
      background: getComputedStyle(label).backgroundColor, text: getComputedStyle(label).color, nameText: getComputedStyle(header).color };
  }));
  const checkColors = values => values.forEach(item => {
    assert.deepEqual([item.header, item.background, item.text], palette[item.type]); assert.equal(item.nameText, 'rgb(255, 255, 255)');
  });
  assert.equal(await page.locator('.cbmx-role-trigger').count(), 3); checkColors(await colors());
  await trigger(2).press('Enter');
  assert.equal(await page.getByRole('menuitemradio', { name: 'Other', exact: true }).getAttribute('aria-checked'), 'true');
  await page.screenshot({ path: `${output}/${engine}-menu.png` });
  await page.getByRole('menuitemradio', { name: 'Other', exact: true }).press('ArrowUp');
  await page.getByRole('menuitemradio', { name: 'Customer', exact: true }).press('Enter');
  assert.equal(await trigger(2).textContent(), 'Customer'); assert.equal(await trigger(2).evaluate(node => node === document.activeElement), true);
  checkColors(await colors());
  await trigger(2).press('Space'); await page.getByRole('menuitemradio', { name: 'Customer', exact: true }).press('Escape');
  assert.equal(await page.locator('.cbmx-role-menu').count(), 0); assert.equal(await trigger(2).evaluate(node => node === document.activeElement), true);
  await trigger(2).tap(); await page.getByRole('button', { name: 'Scroll to top', exact: true }).tap();
  assert.equal(await page.locator('.cbmx-role-menu').count(), 0);
  await choose(2, 'Other'); checkColors(await colors()); await choose(2, 'Customer'); await choose(4, 'Customer');
  assert.equal(await page.locator('.cbmx-remove-actor').count(), 3);
  assert.deepEqual((await colors()).map(item => item.type), ['Customer', 'Orchestrator', 'Customer', 'Other', 'Customer']);
  await page.screenshot({ path: `${output}/${engine}-editor.png` });

  // Observe the actual shared export table before rasterization removes it.
  await page.evaluate(() => {
    globalThis.actorExport = null;
    const observer = new MutationObserver(() => {
      const node = document.querySelector('.cbmx-matrix--export'); if (!node) return;
      globalThis.actorExport = { controls: node.querySelectorAll('button,input,textarea,select,[tabindex],.cbmx-role-chevron,[role="menu"]').length,
        actors: [...node.querySelectorAll('.cbmx-actor-header')].map((header, index) => {
          const label = node.querySelectorAll('.cbmx-role')[index];
          return { type: label.textContent, header: getComputedStyle(header).backgroundColor,
            background: getComputedStyle(label).backgroundColor, text: getComputedStyle(label).color, nameText: getComputedStyle(header).color };
        }) };
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  await page.getByRole('button', { name: 'Capture PNG and PDF', exact: true }).click();
  await page.locator('#capture-result').waitFor({ state: 'visible', timeout: 90000 });
  const exported = await page.evaluate(() => ({ ...globalThis.actorExport, png: document.querySelector('#capture-result').src, pdf: document.querySelector('#pdf-result').href }));
  assert.equal(exported.controls, 0); checkColors(exported.actors);
  assert.deepEqual(exported.actors.map(item => item.type), ['Customer', 'Orchestrator', 'Customer', 'Other', 'Customer']);
  await writeFile(`${output}/${engine}-multiple-customers.png`, Buffer.from(exported.png.split(',')[1], 'base64'));
  await writeFile(`${output}/${engine}-multiple-customers.pdf`, Buffer.from(exported.pdf.split(',')[1], 'base64'));
  delete exported.png; delete exported.pdf;
  await writeFile(`${output}/${engine}-checks.json`, JSON.stringify({ engine, version: browser.version(), ...exported }, null, 2));
  await page.getByRole('button', { name: 'Toggle read-only', exact: true }).click();
  assert.equal(await page.locator('.cbmx-role-trigger,.cbmx-role-chevron,.cbmx-role-menu,.cbmx-remove-actor').count(), 0); checkColors(await colors());
  await page.getByRole('button', { name: 'Toggle read-only', exact: true }).click();
  page.once('dialog', dialog => dialog.dismiss()); await page.locator('.cbmx-remove-actor').first().click(); assert.equal(await page.locator('.cbmx-actor-header').count(), 5);
  page.once('dialog', dialog => dialog.accept()); await page.locator('.cbmx-remove-actor').first().click(); assert.equal(await page.locator('.cbmx-actor-header').count(), 4);
  assert.deepEqual((await colors()).map(item => item.type), ['Customer', 'Orchestrator', 'Other', 'Customer']);
  await page.getByRole('button', { name: '10 actors', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '+ Add Actor', exact: true }).isDisabled(), true);
  for (const index of [2, 4, 6, 8, 9]) await choose(index, 'Customer');
  checkColors(await colors()); assert.equal((await colors()).filter(item => item.type === 'Customer').length, 6);
  assert.deepEqual(errors, []);
  console.log(`PASS ${engine}: keyboard, touch, dismissal, exact colors, multiple Customers, deletion, fixed actors, 10-actor limit, read-only and actual PNG/PDF capture`);
} finally { await browser.close(); }
