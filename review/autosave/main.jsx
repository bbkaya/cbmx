import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EditorPage from '../../src/pages/EditorPage';
import PCBEditorPage from '../../src/pages/PCBEditorPage';
import { makeBlankProcessCanvasBlueprint } from '../../src/pcb/processCanvasDomain';
import { fixture } from '../cbmx/fixtures';
import { makeServices } from './mockServices';
import '../../src/index.css';
import '../../src/App.css';

const pcb = makeBlankProcessCanvasBlueprint();
pcb.meta.name = 'Neighbourhood mobility — Process Canvas';
pcb.desirability.purpose = 'Provide reliable, accessible neighbourhood mobility.';
const cbmx = fixture(3); cbmx.meta.name = 'Neighbourhood mobility network';
globalThis.__autosaveModel = makeServices(cbmx, pcb);
const kind = new URLSearchParams(location.search).get('editor') === 'pcb' ? 'pcb' : 'cbmx';
createRoot(document.getElementById('root')).render(<>
  <div style={{ padding: '8px 16px', background: '#eaf0f6', fontSize: 12, display: 'flex', gap: 16, alignItems: 'center' }}>
    <strong>Synthetic review · memory only · saves deliberately held</strong>
    <button onClick={() => globalThis.__autosaveModel.finish('ok')}>Complete save</button>
    <button onClick={() => globalThis.__autosaveModel.finish('network')}>Fail save</button>
    <a href="?editor=cbmx">CBMX</a><a href="?editor=pcb">Process Canvas</a>
  </div>
  <main style={{ padding: 16 }}><MemoryRouter initialEntries={[`/app/${kind === 'cbmx' ? 'b' : 'pcb'}/${kind}`]}>
    <Routes><Route path="/app/b/:blueprintId" element={<EditorPage />} /><Route path="/app/pcb/:pcbId" element={<PCBEditorPage />} /></Routes>
  </MemoryRouter></main>
</>);
