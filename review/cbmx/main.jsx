import { useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import CBMXTable, { validateCBMXBlueprint } from '@cbmx/CBMXTable.tsx';
import CBMXEditorToolbar from '@cbmx/ui/CBMXEditorToolbar.tsx';
import CBMXValidationPanel from '@cbmx/ui/CBMXValidationPanel.tsx';
import { captureBlueprintPng, createBlueprintPdf } from '@cbmx/cbmxExport.ts';
import { fixture, processLinks } from './fixtures.js';
import '@app/index.css';
import '@app/App.css';
import './preview.css';

function App() {
  const [blueprint, setBlueprint] = useState(() => fixture(5));
  const [count, setCount] = useState(5);
  const [density, setDensity] = useState('sparse');
  const [changes, setChanges] = useState(0);
  const [capture, setCapture] = useState('');
  const [pdf, setPdf] = useState('');
  const [status, setStatus] = useState('');
  const [validationExample, setValidationExample] = useState('actual');
  const [readOnly, setReadOnly] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const issues = validationExample === 'warning' ? [{ level: 'warning', message: 'Actor "A1" has no costs.' }]
    : validationExample === 'error' ? [{ level: 'error', message: 'Duplicate actor id: A3' },
      { level: 'warning', message: 'Network Value Proposition is empty.' }] : validateCBMXBlueprint(blueprint);

  function reset(nextCount, nextDensity) {
    setCount(nextCount); setDensity(nextDensity); setBlueprint(fixture(nextCount, nextDensity));
    setChanges(0); setCapture(''); setPdf(''); setStatus('');
  }
  function commit(next) { setBlueprint(next); setChanges(value => value + 1); }
  async function captureFiles() {
    setStatus('Capturing'); setCapture(''); setPdf('');
    try {
      const png = await captureBlueprintPng(document.getElementById('cbmx-canvas'));
      const pdfDocument = await createBlueprintPdf(png);
      setCapture(png); setPdf(pdfDocument.output('datauristring')); setStatus('Capture complete');
    } catch (error) { setStatus(`Capture failed: ${error.message}`); }
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
      <strong>Synthetic Phase 3 preview · no database</strong><span role="status">{status}</span>
      {[2, 5, 10].map(value => <button key={value} onClick={() => reset(value, density)}>{value} actors</button>)}
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
      <button disabled={status === 'Capturing'} onClick={captureFiles}>Capture PNG and PDF</button>
    </div>
    <div className="site-shell preview-shell">
      <main className="preview-main">
        <div className="cbmx-editor">
          <CBMXEditorToolbar name={blueprint.meta.name}
            onNameChange={name => commit({ ...blueprint, meta: { ...blueprint.meta, name } })}
            readOnly={readOnly} autoSaving={false} dirty={false} menuOpen={menuOpen}
            onToggleMenu={() => setMenuOpen(value => !value)} menuRef={menuRef}>
            {menuOpen && <div role="menu" className="cbmx-toolbar-menu">
              {['Export CBMX to JSON', 'Export CBMX to PNG', 'Export CBMX to PDF',
                ...(!readOnly ? ['Import CBMX from JSON'] : [])].map(label =>
                <button key={label} role="menuitem" className="cbmx-menu-item" onClick={() => setMenuOpen(false)}>{label}</button>)}
            </div>}
          </CBMXEditorToolbar>
          <CBMXValidationPanel issues={issues} />
          <div id="cbmx-canvas" style={{ marginTop: 10, width: '100%', minWidth: 0, background: 'white' }}>
            <CBMXTable blueprint={blueprint} onChange={readOnly ? undefined : commit} processLinks={processLinks}
              onDeleteProcess={readOnly ? undefined : deleteSyntheticProcess} />
          </div>
        </div>
      </main>
    </div>
    {capture && <div>
      <img id="capture-result" alt="Synthetic full matrix capture" src={capture} style={{ maxWidth: '100%' }} />
      <a href={capture} download={`synthetic-${count}-${density}.png`}>Download PNG</a>{' · '}
      <a id="pdf-result" href={pdf} download={`synthetic-${count}-${density}.pdf`}>Generated single-page PDF</a>
    </div>}
  </>;
}
createRoot(document.getElementById('root')).render(<MemoryRouter><App /></MemoryRouter>);
