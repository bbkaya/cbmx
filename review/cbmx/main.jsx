import { observeExportCapture } from './exportDiagnostics.js';
import { useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import CBMXTable, { validateCBMXBlueprint } from '@cbmx/CBMXTable.tsx';
import CBMXEditorToolbar from '@cbmx/ui/CBMXEditorToolbar.tsx';
import CBMXValidationPanel from '@cbmx/ui/CBMXValidationPanel.tsx';
import { captureBlueprintPng, createBlueprintPdf } from '@cbmx/cbmxExport.ts';
import { fixture, processLinks as defaultProcessLinks } from './fixtures.js';
import '@app/index.css';
import '@app/App.css';
import './preview.css';

function App() {
  const [blueprint, setBlueprint] = useState(() => fixture(5));
  const [count, setCount] = useState(5);
  const [density, setDensity] = useState('sparse');
  const [changes, setChanges] = useState(0);
  const [capture, setCapture] = useState('');
  const [metrics, setMetrics] = useState(null);
  const [pdf, setPdf] = useState('');
  const [status, setStatus] = useState('');
  const [validationExample, setValidationExample] = useState('actual');
  const [readOnly, setReadOnly] = useState(false);
  const [administrative, setAdministrative] = useState(false);
  const [pcbAccess, setPCBAccess] = useState('owner');
  const processLinks = defaultProcessLinks.map(link => link.cbmx_process_id !== 'P1' ? link : {
    ...link, has_pcb_access: pcbAccess !== 'none', pcb_access_role: pcbAccess === 'none' ? null : pcbAccess,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const issues = validationExample === 'warning' ? [{ level: 'warning', message: 'Actor "A1" has no costs.' }]
    : validationExample === 'error' ? [{ level: 'error', message: 'Duplicate actor id: A3' },
      { level: 'warning', message: 'Network Value Proposition is empty.' }] : validateCBMXBlueprint(blueprint);

  function reset(nextCount, nextDensity) {
    setCount(nextCount); setDensity(nextDensity); setBlueprint(fixture(nextCount, nextDensity));
    setChanges(0); setCapture(''); setPdf(''); setStatus(''); setMetrics(null);
  }
  function commit(next) { setBlueprint(next); setChanges(value => value + 1); }
  async function captureFiles() {
    setStatus('Capturing'); setCapture(''); setPdf(''); setMetrics(null);
    const observer = observeExportCapture(setMetrics);
    try {
      const png = await captureBlueprintPng(document.getElementById('cbmx-canvas'), { blueprint, processLinks });
      const pdfDocument = await createBlueprintPdf(png);
      setCapture(png); setPdf(pdfDocument.output('datauristring')); setStatus('Capture complete');
    } catch (error) { setStatus(`Capture failed: ${error.message}`); } finally { observer.disconnect(); }
  }
  async function deleteSyntheticProcess(id) {
    // Production deletion remains in EditorPage and is verified separately using mocked services.
    if (!window.confirm('Synthetic preview only: remove this process from memory? Production link and permission safeguards are covered separately by mocked-service regression tests.')) return false;
    setBlueprint(current => ({ ...current,
      coCreationProcesses: current.coCreationProcesses.filter(process => process.id !== id) }));
    setChanges(value => value + 1);
    return true;
  }

  return <>
    <div className="preview-controls">
      <strong>Synthetic Phase 4 preview · no database</strong><span role="status">{status}</span>
      {Array.from({ length: 9 }, (_, index) => index + 2).map(value => <button key={value} onClick={() => reset(value, density)}>{value} actors</button>)}
      {['empty', 'sparse', 'dense'].map(value => <button key={value} onClick={() => reset(count, value)}>{value} blueprint</button>)}
      <span>Committed changes: {changes}</span>
      <button onClick={() => window.scrollTo({ top: 0 })}>Scroll to top</button>
      <button onClick={() => {
        window.scrollTo({ top: document.body.scrollHeight / 2 });
        const scroller = document.querySelector('.cbmx-matrix-scroll');
        scroller.scrollLeft = scroller.scrollWidth;
      }}>Scroll workspace</button>
      <button onClick={() => setValidationExample(value => value === 'actual' ? 'warning' : value === 'warning' ? 'error' : 'actual')}>
        Cycle validation example
      </button>
      <button onClick={() => setReadOnly(value => !value)}>Toggle read-only</button>
      <button onClick={() => { setAdministrative(value => !value); setReadOnly(true); }}>Toggle administrative view</button>
      <label>PCB access <select aria-label="PCB access" value={pcbAccess} onChange={event => setPCBAccess(event.target.value)}>
        <option value="owner">Owner</option><option value="editor">Editor</option><option value="viewer">Viewer</option>
        <option value="none">No access</option>
      </select></label>
      <button disabled={status === 'Capturing'} onClick={captureFiles}>Capture PNG and PDF</button>
      <button disabled={!metrics?.rasterClone || status === 'Capturing'} onClick={() => {
        const image = document.getElementById('capture-result');
        const data = { actors: count, density, readOnly, ...metrics,
          image: image ? { width: image.naturalWidth, height: image.naturalHeight } : null };
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const anchor = document.createElement('a'); anchor.href = url;
        anchor.download = `cbmx-export-diagnostics-${count}-${density}.json`; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}>Download export diagnostics</button>
    </div>
    <div className="site-shell preview-shell">
      <main className="preview-main">
        <div className="cbmx-editor">
          <CBMXEditorToolbar name={blueprint.meta.name}
            onNameChange={name => commit({ ...blueprint, meta: { ...blueprint.meta, name } })}
            readOnly={readOnly} administrative={administrative} autoSaving={false} dirty={false} menuOpen={menuOpen}
            onToggleMenu={() => setMenuOpen(value => !value)} menuRef={menuRef}>
            {menuOpen && <div role="menu" className="cbmx-toolbar-menu">
              {['Export CBMX to JSON', 'Export CBMX to PNG', 'Export CBMX to PDF',
                ...(!readOnly ? ['Import CBMX from JSON'] : [])].map(label =>
                <button key={label} role="menuitem" className="cbmx-menu-item" onClick={() => setMenuOpen(false)}>{label}</button>)}
            </div>}
          </CBMXEditorToolbar>
          <CBMXValidationPanel issues={issues} />
          <div id="cbmx-canvas" style={{ marginTop: 10, width: '100%', minWidth: 0, background: 'white' }}>
            <CBMXTable blueprint={blueprint} presentation={readOnly ? 'readonly' : 'editor'}
              onChange={readOnly ? undefined : commit} processLinks={processLinks}
              onOpenLinkedPCB={id => {
                const link = processLinks.find(value => value.process_canvas_blueprint_id === id);
                if (!link?.has_pcb_access || !['owner', 'editor', 'viewer'].includes(link.pcb_access_role)) return;
                setStatus(`Synthetic PCB open: ${link.pcb_access_role === 'viewer' ? 'read-only' : 'editing'} (${link.pcb_access_role}${administrative ? ', administrative route' : ''}). No database or navigation performed.`);
              }}
              onDeleteProcess={readOnly ? undefined : deleteSyntheticProcess} />
          </div>
        </div>
      </main>
    </div>
    {metrics && <details><summary>Export diagnostics</summary>
      <pre id="export-metrics" style={{ whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto' }}>{JSON.stringify(metrics)}</pre>
    </details>}
    {capture && <div>
      <img id="capture-result" alt="Synthetic full matrix capture" src={capture} style={{ maxWidth: '100%' }} />
      <a href={capture} download={`synthetic-${count}-${density}.png`}>Download PNG</a>{' · '}
      <a id="pdf-result" href={pdf} download={`synthetic-${count}-${density}.pdf`}>Generated single-page PDF</a>
    </div>}
  </>;
}
createRoot(document.getElementById('root')).render(<MemoryRouter><App /></MemoryRouter>);
