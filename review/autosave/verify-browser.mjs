import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const modulePath = process.argv.find(value => value.startsWith('--playwright='))?.split('=')[1];
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const evidence = new URL('./evidence/', import.meta.url);
await mkdir(evidence, { recursive: true });
const results = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await context.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:5177/') ? route.continue() : route.abort());
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const kind of ['cbmx', 'pcb']) {
    await page.goto(`http://127.0.0.1:5177/?editor=${kind}`);
    await page.getByRole('status').filter({ hasText: /^Saved$/ }).waitFor();
    await page.screenshot({ path: new URL(`${kind}-normal.png`, evidence).pathname });
    const trigger = kind === 'cbmx' ? page.locator('.cbmx-row--networkVP [title="Click to edit"]') : page.getByRole('button', { name: 'Provide reliable, accessible neighbourhood mobility.', exact: true });
    await page.getByRole('textbox', { name: 'Blueprint name', exact: true }).fill('Committed change awaiting save');
    await trigger.click();
    const field = kind === 'cbmx' ? page.getByRole('textbox', { name: 'Network Value Proposition', exact: true }) : page.locator('textarea');
    await field.fill('Uncommitted inline draft — retained throughout saving');
    await field.evaluate(node => { window.__draftNode = node; });
    await page.getByRole('status').filter({ hasText: /^Saving…$/ }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Blueprint name', exact: true }).isDisabled(), true);
    const geometry = await field.evaluate(node => ({ x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }));
    await field.evaluate((node, kind) => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: kind === 'pcb', bubbles: true })), kind);
    assert.equal(await field.evaluate(node => node === window.__draftNode), true);
    await page.screenshot({ path: new URL(`${kind}-saving.png`, evidence).pathname });
    await page.getByRole('button', { name: 'Fail save', exact: true }).click();
    await page.getByRole('status').filter({ hasText: /^Save failed — changes retained$/ }).waitFor();
    assert.equal(await field.inputValue(), 'Uncommitted inline draft — retained throughout saving');
    assert.equal(await field.evaluate(node => node === window.__draftNode), true);
    assert.equal(await page.getByRole('textbox', { name: 'Blueprint name', exact: true }).isDisabled(), false);
    const after = await field.evaluate(node => ({ x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }));
    assert.deepEqual(after, geometry, 'No draft layout shift when save fails');
    await page.screenshot({ path: new URL(`${kind}-failure.png`, evidence).pathname });
    await field.press(kind === 'pcb' ? 'Control+Enter' : 'Enter');
    await page.getByRole('status').filter({ hasText: /^Saving…$/ }).waitFor();
    await page.getByRole('button', { name: 'Complete save', exact: true }).click();
    await page.getByRole('status').filter({ hasText: /^Saved$/ }).waitFor();
    const saved = await page.evaluate(kind => {
      const blueprint = window.__autosaveModel.rows[kind].blueprint_json;
      return kind === 'cbmx' ? blueprint.networkValueProposition.statement : blueprint.desirability.purpose;
    }, kind);
    assert.equal(saved, 'Uncommitted inline draft — retained throughout saving');
    results.push({ editor: kind, geometry, sameDraftNode: true, failureUnlock: true, subsequentCommitSaved: true });
  }
  assert.deepEqual(errors, []);
  await writeFile(new URL('browser-results.json', evidence), JSON.stringify({ browser: browser.version(), viewport: { width: 1440, height: 1000 }, results, errors }, null, 2) + '\n');
  console.log(JSON.stringify(results));
} finally { await browser.close(); }
