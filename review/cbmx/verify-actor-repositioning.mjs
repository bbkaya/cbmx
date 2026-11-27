// Database-free real-browser checks; Playwright is supplied externally.
// Start npm run review:cbmx, then pass --playwright=/absolute/path/to/playwright/index.mjs.
import assert from 'node:assert/strict';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const arg = (name, fallback) => process.argv.find(v => v.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const engine = arg('engine', 'chromium'), base = arg('base', 'http://127.0.0.1:5176');
const modulePath = arg('playwright');
const runtime = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const out = arg('out', 'output/cbmx-actor-repositioning'); await mkdir(out, { recursive: true });
const browser = await runtime[engine].launch({ headless: true, timeout: 20000, ...(engine === 'chromium' ? { channel: 'chrome' } : {}) });
const records = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
  await context.route('**/*', route => route.request().url().startsWith(base + '/') ? route.continue() : route.abort());
  const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  const cell = index => page.locator('.cbmx-row--actor > td').nth(index + 1);
  const arrow = (index, direction) => cell(index).locator('.cbmx-move-actor').nth(direction === 'left' ? 0 : 1);
  const rows = () => page.locator('#cbmx-canvas tr').evaluateAll(rows => rows.map(row => [...row.children].slice(1).map(cell => cell.textContent)));
  const names = () => page.locator('.cbmx-actor-header .cbmx-editable-trigger').allTextContents();
  for (const count of [2, 3, 5, 10]) {
    await page.goto(base + '/'); await page.getByRole('button', { name: `${count} actors`, exact: true }).click();
    await page.getByRole('button', { name: 'dense blueprint', exact: true }).click();
    assert.equal(await page.locator('.cbmx-move-actor').count(), (count - 2) * 2);
    for (let i = 0; i < count; i++) {
      if (i < 2) assert.equal(await cell(i).locator('.cbmx-actor-position').count(), 0);
      else { assert.equal(await arrow(i, 'left').isDisabled(), i === 2); assert.equal(await arrow(i, 'right').isDisabled(), i === count - 1); }
    }
    if (count > 3) {
      // An additional Customer interleaves with Other actors; names and role labels must travel together.
      await page.locator('.cbmx-role-trigger').nth(count - 3).click();
      await page.getByRole('menuitemradio', { name: 'Customer', exact: true }).click();
      const originalNames = await names(), before = await rows();
      const last = count - 1;
      await arrow(last, 'left').focus(); await page.keyboard.press('Enter');
      const expected = [...originalNames]; [expected[last - 1], expected[last]] = [expected[last], expected[last - 1]];
      assert.deepEqual(await names(), expected);
      const movedRows = await rows();
      before.forEach((cells, rowIndex) => {
        if (![count, count * 2].includes(cells.length)) return;
        const next = [...cells], size = cells.length === count ? 1 : 2;
        const block = next.splice(last * size, size); next.splice((last - 1) * size, 0, ...block);
        assert.deepEqual(movedRows[rowIndex], next, `complete actor cells move in row ${rowIndex}`);
      });
      // Touch returns it to its previous position; Space repeats the move using a native button.
      await arrow(last - 1, 'right').tap(); assert.deepEqual(await names(), originalNames);
      await arrow(last, 'left').focus(); await page.keyboard.press('Space'); assert.deepEqual(await names(), expected);
      // Name draft stays open, follows the actor on a move and commits to that actor.
      await cell(last - 1).locator('[title="Click to edit"]').click();
      const field = cell(last - 1).locator('input'); await field.fill('Employer with a saved actor draft');
      await arrow(last - 1, 'right').tap();
      assert.equal(await cell(last).locator('input').inputValue(), 'Employer with a saved actor draft');
      await cell(last).locator('input').press('Enter');
      assert.equal((await names())[last], 'Employer with a saved actor draft');
      // A process draft temporarily disables moves, without touching its text.
      await page.locator('.cbmx-process-trigger').first().click();
      await page.getByRole('textbox', { name: 'Co-creation process', exact: true }).fill('Uncommitted process draft');
      assert.equal(await page.locator('.cbmx-move-actor:enabled').count(), 0);
      assert.match(await page.locator('.cbmx-move-notice').textContent(), /Finish or cancel/);
      await page.getByRole('textbox', { name: 'Co-creation process', exact: true }).press('Escape');
      assert.equal(await page.locator('.cbmx-move-notice').count(), 0);
      // Deliberately finish with reordered columns for raster/PDF verification.
      await arrow(last, 'left').tap();
      await page.setViewportSize({ width: 400, height: 900 });
      await arrow(last - 1, 'right').scrollIntoViewIfNeeded();
      assert.ok(await page.locator('.cbmx-matrix-scroll').evaluate(n => n.scrollWidth > n.clientWidth && n.scrollLeft > 0));
      await page.screenshot({ path: `${out}/${engine}-${count}-narrow.png` });
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    const expectedNames = await names();
    const controlTops = await page.locator('.cbmx-actor-position').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top));
    if (controlTops.length) assert.ok(Math.max(...controlTops) - Math.min(...controlTops) < 1, 'controls align despite different actor name lengths');
    if (count === 5) {
      await page.locator('.cbmx-row--actor').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${out}/${engine}-controls.png` });
      await page.locator('.cbmx-row--actor').screenshot({ path: `${out}/${engine}-controls-row.png` });
    }
    // Inspect both the independent export table and the serialized raster clone.
    await page.evaluate(() => {
      globalThis.moveStages = {};
      const measure = root => ({
        controls: root.querySelectorAll('button,input,textarea,select,[tabindex],.cbmx-actor-position,.cbmx-move-notice').length,
        rows: [...root.querySelectorAll('tr')].map(row => [...row.children].slice(1).map(cell => cell.textContent)),
        names: [...root.querySelectorAll('.cbmx-actor-header')].map(node => node.textContent.trim()),
        roles: [...root.querySelectorAll('.cbmx-role')].map(node => {
          const cs = getComputedStyle(node), ys = [], xs = [], walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
          let text;
          while ((text = walker.nextNode())) for (let i = 0; i < text.length; i++) {
            const range = document.createRange(); range.setStart(text, i); range.setEnd(text, i + 1);
            const r = range.getBoundingClientRect(); ys.push(Math.round(r.y * 2)); xs.push([r.left, r.right]);
          }
          const bounds = node.getBoundingClientRect();
          return { type: node.textContent, lines: new Set(ys).size, complete: xs.every(([l, r]) => r > l && l >= bounds.left && r <= bounds.right + .1),
            whiteSpace: cs.whiteSpace, overflowWrap: cs.overflowWrap, wordBreak: cs.wordBreak };
        }),
      });
      globalThis.moveStages.editor = measure(document.querySelector('#cbmx-canvas'));
      const observer = new MutationObserver(records => {
        for (const record of records) for (const node of record.addedNodes)
          if (node instanceof HTMLElement && node.matches('.cbmx-matrix--export')) globalThis.moveStages.export = measure(node);
      }); observer.observe(document.body, { childList: true });
      const append = document.body.append;
      document.body.append = function(...nodes) {
        append.apply(this, nodes);
        for (const node of nodes) {
          const clone = node.shadowRoot?.querySelector('.cbmx-matrix--export');
          if (clone) { globalThis.moveStages.serialized = measure(clone); observer.disconnect(); }
        }
      };
    });
    await page.getByRole('button', { name: 'Capture PNG and PDF', exact: true }).click();
    await page.locator('#capture-result').waitFor({ state: 'visible', timeout: 90000 });
    await page.waitForFunction(() => globalThis.moveStages.serialized, null, { timeout: 20000 });
    const result = await page.evaluate(() => ({ stages: globalThis.moveStages,
      png: document.querySelector('#capture-result').src, pdf: document.querySelector('#pdf-result').href,
      width: document.querySelector('#capture-result').naturalWidth, height: document.querySelector('#capture-result').naturalHeight,
      metrics: JSON.parse(document.querySelector('#export-metrics').textContent) }));
    assert.deepEqual(result.stages.export.names, expectedNames); assert.deepEqual(result.stages.serialized.names, expectedNames);
    assert.deepEqual(result.stages.export.rows, result.stages.serialized.rows);
    assert.equal(result.stages.export.rows.length, result.stages.editor.rows.length, 'no additional export rows');
    for (const stage of ['export', 'serialized']) {
      assert.equal(result.stages[stage].controls, 0);
      for (const role of result.stages[stage].roles) {
        assert.equal(role.lines, 1); assert.equal(role.complete, true);
        assert.equal(role.whiteSpace, 'nowrap'); assert.equal(role.overflowWrap, 'normal'); assert.equal(role.wordBreak, 'normal');
      }
    }
    const name = `${engine}-${count}-reordered`;
    await writeFile(`${out}/${name}.png`, Buffer.from(result.png.split(',')[1], 'base64'));
    await writeFile(`${out}/${name}.pdf`, Buffer.from(result.pdf.split(',')[1], 'base64'));
    delete result.png; delete result.pdf;
    records.push({ name, engine, browserVersion: browser.version(), count, ...result });
    await appendFile(`${out}/browser-results.jsonl`, JSON.stringify(records.at(-1)) + '\n');
    await page.getByRole('button', { name: 'Toggle read-only', exact: true }).click();
    assert.equal(await page.locator('.cbmx-actor-position,.cbmx-move-actor').count(), 0);
    assert.deepEqual(await page.locator('.cbmx-actor-header').allTextContents(), expectedNames);
    console.log(`PASS ${engine}: ${count} actors, boundaries, full-column order, keyboard/touch, drafts, scrolling, readonly, actual PNG/PDF and label wrapping`);
  }
  assert.deepEqual(errors, []);
  await writeFile(`${out}/${engine}-summary.json`, JSON.stringify({ engine, version: browser.version(), cases: records.map(r => r.name), pageErrors: errors }, null, 2));
} finally { await browser.close(); }
