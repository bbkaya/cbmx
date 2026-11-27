// Database-free regression; use the existing preview or a minified build of it.
// Example: --playwright=/path/to/playwright/index.mjs --engine=webkit --base=http://127.0.0.1:5176
import assert from 'node:assert/strict';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const arg = (name, fallback) => process.argv.find(v => v.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const engine = arg('engine', 'webkit'), base = arg('base', 'http://127.0.0.1:5176');
const modulePath = arg('playwright');
const runtime = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const out = arg('out', 'output/cbmx-actor-labels');
const baseline = arg('baseline', 'false') === 'true';
await mkdir(out, { recursive: true });
const browser = await runtime[engine].launch({ headless: true, timeout: 20000, ...(engine === 'chromium' ? { channel: 'chrome' } : {}) });
try {
  const context = await browser.newContext();
  await context.route('**/*', route => route.request().url().startsWith(base + '/') ? route.continue() : route.abort());
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const count of arg('counts', '2,5,10').split(',').map(Number))
    for (const names of arg('names', 'short,long').split(','))
      for (const width of arg('widths', '400,1440').split(',').map(Number)) {
        const name = `${engine}-${count}-${names}-${width}`;
        console.log('START', name);
        await page.setViewportSize({ width, height: 950 });
        await page.goto(base + '/'); await page.locator('.cbmx-role').first().waitFor();
        await page.getByRole('button', { name: `${count} actors`, exact: true }).click();
        // Use actual editor commits, including repeated Customer selection and Escape.
        if (count > 2) {
          const trigger = page.locator('.cbmx-role-trigger').first();
          await trigger.click(); await page.getByRole('menuitemradio', { name: 'Customer', exact: true }).click();
          await trigger.click(); await page.getByRole('menuitemradio', { name: 'Customer', exact: true }).press('Escape');
          assert.equal(await page.locator('.cbmx-role-menu').count(), 0);
        }
        for (const index of [0, count - 1]) {
          const header = page.locator('.cbmx-actor-header').nth(index);
          await header.locator('[title="Click to edit"]').click();
          await header.locator('input').fill(names === 'short' ? `Actor ${index + 1}` : `Actor ${index + 1} with a deliberately long organization name across the collaborative network`);
          await header.locator('input').press('Enter');
        }
        const readOnly = width < 1000;
        if (readOnly) {
          await page.getByRole('button', { name: 'Toggle read-only', exact: true }).click();
          assert.equal(await page.locator('.cbmx-role-trigger,.cbmx-role-chevron').count(), 0);
        }
        await page.evaluate(() => {
          globalThis.labelStages = {};
          const measure = node => {
            const root = node.getBoundingClientRect();
            const rect = r => ({ x: r.left - root.left, y: r.top - root.top, width: r.width, height: r.height });
            return [...node.querySelectorAll('.cbmx-role')].map(label => {
              const cs = getComputedStyle(label), chars = [];
              const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
              let text;
              while ((text = walker.nextNode())) for (let i = 0; i < text.length; i++) {
                const range = document.createRange(); range.setStart(text, i); range.setEnd(text, i + 1);
                chars.push({ value: text.data[i], ...rect(range.getBoundingClientRect()) });
              }
              return { type: label.textContent, bounds: rect(label.getBoundingClientRect()), cell: rect(label.closest('td').getBoundingClientRect()),
                chars, icon: rect(label.querySelector('svg').getBoundingClientRect()), whiteSpace: cs.whiteSpace, overflowWrap: cs.overflowWrap,
                wordBreak: cs.wordBreak, fontSize: cs.fontSize, background: cs.backgroundColor, color: cs.color };
            });
          };
          globalThis.labelStages.editor = measure(document.querySelector('#cbmx-canvas'));
          const observer = new MutationObserver(records => {
            for (const record of records) for (const node of record.addedNodes) {
              if (!(node instanceof HTMLElement)) continue;
              if (node.matches('.cbmx-matrix--export')) globalThis.labelStages.export = measure(node);
            }
          });
          observer.observe(document.body, { childList: true });
          // Diagnostics attach and remove the serialized clone synchronously.
          // Measure on attachment, while styles and layout are still available.
          const append = document.body.append;
          document.body.append = function(...nodes) {
            append.apply(this, nodes);
            for (const node of nodes) {
              const clone = node.shadowRoot?.querySelector('.cbmx-matrix--export');
              if (clone) { globalThis.labelStages.serialized = measure(clone); observer.disconnect(); }
            }
          };

        });
        const editor = await page.locator('#cbmx-canvas').evaluate(n => n.outerHTML);
        await page.getByRole('button', { name: 'Capture PNG and PDF', exact: true }).click();
        await page.locator('#capture-result').waitFor({ state: 'visible', timeout: 90000 });
        await page.waitForFunction(() => globalThis.labelStages.serialized, null, { timeout: 20000 });
        const result = await page.evaluate(() => ({ stages: globalThis.labelStages,
          png: document.querySelector('#capture-result').src, pdf: document.querySelector('#pdf-result').href,
          width: document.querySelector('#capture-result').naturalWidth, height: document.querySelector('#capture-result').naturalHeight,
          metrics: JSON.parse(document.querySelector('#export-metrics').textContent) }));
        assert.equal(await page.locator('#cbmx-canvas').evaluate(n => n.outerHTML), editor);
        assert.equal(result.metrics.rasterClone.controls, 0);
        await writeFile(`${out}/${name}.png`, Buffer.from(result.png.split(',')[1], 'base64'));
        await writeFile(`${out}/${name}.pdf`, Buffer.from(result.pdf.split(',')[1], 'base64'));
        delete result.png; delete result.pdf;
        await appendFile(`${out}/results.jsonl`, JSON.stringify({ name, engine, browserVersion: browser.version(), count, names, viewport: width, readOnly, ...result }) + '\n');
        const problems = [];
        for (const [stage, labels] of Object.entries(result.stages)) for (const label of labels) {
          const lines = new Set(label.chars.map(c => Math.round(c.y * 2)));
          if (lines.size !== 1) problems.push(`${stage}: ${label.type} wraps`);
          if (!baseline) {
            assert.equal(lines.size, 1, `${name} ${stage}: ${label.type} on one line`);
            assert.equal(label.chars.map(c => c.value).join(''), label.type);
            assert.ok(label.chars.every(c => c.width > 0 && c.x >= label.bounds.x && c.x + c.width <= label.bounds.x + label.bounds.width + 0.1), `${name} ${stage}: complete text inside pill`);
            assert.ok(label.bounds.x >= label.cell.x && label.bounds.x + label.bounds.width <= label.cell.x + label.cell.width + 0.1, `${name} ${stage}: pill inside its actor column`);
            assert.ok(label.icon.width > 14 && label.icon.x + label.icon.width <= label.chars[0].x, `${name} ${stage}: visible icon without overlap`);
            const palette = { Customer: ['rgb(224, 240, 235)', 'rgb(36, 85, 79)'], Orchestrator: ['rgb(246, 229, 235)', 'rgb(120, 55, 76)'], Other: ['rgb(224, 239, 254)', 'rgb(22, 75, 123)'] };
            assert.deepEqual([label.background, label.color], palette[label.type]);
            assert.equal(label.whiteSpace, 'nowrap'); assert.equal(label.overflowWrap, 'normal'); assert.equal(label.wordBreak, 'normal');
            assert.ok(parseFloat(label.fontSize) >= 10.8); // Existing rasterizer copies 11px as 10.9px.
          }
        }
        console.log(problems.length ? 'OBSERVED ' + problems.join('; ') : 'PASS ' + name);
      }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
