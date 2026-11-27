import { toSvg } from 'html-to-image';

// Preview only: inspect the same computed-style clone that html-to-image uses.
// This never enters the production bundle or changes the capture API.
async function inspectCapture(node, report) {
  await document.fonts.ready;
  const origin = node.getBoundingClientRect();
  const relativeBounds = (element, root = origin) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left - root.left, top: rect.top - root.top,
      right: rect.right - root.left, bottom: rect.bottom - root.top,
      width: rect.width, height: rect.height };
  };
  const cloneStyle = element => {
    const computed = getComputedStyle(element), parsed = document.createElement('div').style;
    parsed.cssText = computed.cssText;
    return { width: computed.width, inlineSize: computed.inlineSize, cssTextWidth: parsed.width,
      cssTextInlineSize: parsed.inlineSize, cssTextBoxSizing: parsed.boxSizing, cssTextLength: computed.cssText.length };
  };
  const selectedBounds = element => ({
    capture: relativeBounds(element, element.getBoundingClientRect()),
    firstCellCloneStyle: cloneStyle(element.querySelector('td')),
    tableCloneStyle: cloneStyle(element.querySelector('table')),
    tableSizing: { width: getComputedStyle(element.querySelector('table')).width, borderSpacing: getComputedStyle(element.querySelector('table')).borderSpacing },
    columns: [...element.querySelectorAll('col')].map(col => ({ width: getComputedStyle(col).width, measured: col.getBoundingClientRect().width })),
    firstCell: { width: getComputedStyle(element.querySelector('td')).width, measured: element.querySelector('td').getBoundingClientRect().width, padding: getComputedStyle(element.querySelector('td')).padding, boxSizing: getComputedStyle(element.querySelector('td')).boxSizing },
    table: relativeBounds(element.querySelector('table'), element.getBoundingClientRect()),
    lastBenefit: relativeBounds(element.querySelector('.cbmx-row--Financial td:last-child'), element.getBoundingClientRect()),
    scenario: relativeBounds(element.querySelector('.cbmx-row--serviceScenario td:last-child'), element.getBoundingClientRect()),
  });
  const metrics = { environment: { userAgent: navigator.userAgent, devicePixelRatio, viewport: [innerWidth,innerHeight], viewportScale: window.visualViewport?.scale ?? 1 }, ...selectedBounds(node), scrollWidth: node.scrollWidth, scrollHeight: node.scrollHeight };
  report(metrics);
  const data = await toSvg(node, {
    width: Math.ceil(origin.width), height: Math.ceil(origin.height),
    style: { position: 'static', margin: '0', overflow: 'visible' },
  });
  const svg = new DOMParser().parseFromString(decodeURIComponent(data.split(',')[1]), 'image/svg+xml');
  const holder = document.createElement('div');
  holder.innerHTML = new XMLSerializer().serializeToString(svg.querySelector('foreignObject').firstElementChild);
  const clone = holder.firstElementChild;
  Object.assign(clone.style, { position: 'fixed', left: '-100000px', top: '0' });
  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.append(clone);
  document.body.append(host);
  try {
    const root = clone.getBoundingClientRect();
    const rects = [clone.querySelector('table'), ...clone.querySelectorAll('table *')]
      .map(element => relativeBounds(element, root)).filter(rect => rect.width || rect.height);
    const rasterClone = { ...selectedBounds(clone),
      maxRight: Math.max(...rects.map(rect => rect.right)),
      maxBottom: Math.max(...rects.map(rect => rect.bottom)),
      controls: clone.querySelectorAll('button,input,textarea,select,.cbmx-info,.cbmx-help,.cbmx-matrix-scroll').length,
    };
    report({ ...metrics, rasterClone });
  } finally { host.remove(); }
}

export function observeExportCapture(report) {
  const observer = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (!(node instanceof HTMLElement) || !node.matches('.cbmx-matrix--export')) continue;
      observer.disconnect();
      void inspectCapture(node, report).catch(error => report({ error: error.message }));
    }
  });
  observer.observe(document.body, { childList: true });
  return observer;
}
