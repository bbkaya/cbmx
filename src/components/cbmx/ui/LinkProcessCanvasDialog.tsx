import { useEffect, useId, useRef, useState } from "react";
import { loadProcessCanvasLinkOptions, type ProcessCanvasLinkOptions } from "../../../pcb/PCBData";

const EMPTY_MESSAGE = "No available Process Canvases were found. You can create a new Process Canvas or request editor access to an existing unlinked Canvas.";

export default function LinkProcessCanvasDialog({ blueprintId, processId, processName, initiallyLinked, onCancel, onConfirm }: {
  blueprintId: string;
  processId: string;
  processName: string;
  initiallyLinked: boolean;
  onCancel: () => void;
  onConfirm: (pcbId: string, expectedCurrentPCBId: string | null) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submittingRef = useRef(false);
  const titleId = useId();
  const selectId = useId();
  const errorId = useId();
  const [options, setOptions] = useState<ProcessCanvasLinkOptions | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    let alive = true;
    void loadProcessCanvasLinkOptions(blueprintId, processId).then((result) => {
      if (alive) setOptions(result);
    }).catch((error: unknown) => {
      if (alive) setError(error instanceof Error ? error.message : "Could not load available Process Canvases. Reload the list and try again.");
    });
    return () => { alive = false; };
  }, [blueprintId, processId, reload]);

  const relinking = options ? Boolean(options.current_canvas) : initiallyLinked;
  const loading = !options && !error;
  const names = new Map<string, number>();
  for (const canvas of options?.canvases ?? []) {
    const name = canvas.name.trim().toLocaleLowerCase();
    names.set(name, (names.get(name) ?? 0) + 1);
  }

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} aria-busy={loading || busy}
      onCancel={(event) => { event.preventDefault(); if (!submittingRef.current) onCancel(); }}
      style={{ width: 520, maxWidth: "calc(100vw - 48px)", boxSizing: "border-box", border: "1px solid #cbd5e1", borderRadius: 10, padding: 24 }}>
      <form onSubmit={async (event) => {
        event.preventDefault();
        if (submittingRef.current || !options?.canvases.some((canvas) => canvas.id === selectedId)) return;
        submittingRef.current = true;
        setBusy(true); setError("");
        try { await onConfirm(selectedId, options.current_canvas?.id ?? null); }
        catch (error) { setError(error instanceof Error ? error.message : "Could not link the Canvas. Any existing association has been preserved."); }
        finally { submittingRef.current = false; setBusy(false); }
      }}>
        <h2 id={titleId}>{relinking ? "Relink Process Canvas" : "Link Existing Process Canvas"}</h2>
        <p><strong>Co-creation process:</strong> {processName}</p>
        {options?.current_canvas && <p><strong>Currently linked Canvas:</strong> {options.current_canvas.name}</p>}
        {loading && <p role="status">Loading available Process Canvases…</p>}
        {options?.canvases.length === 0 && <p>{EMPTY_MESSAGE}</p>}
        {Boolean(options?.canvases.length) && <div style={{ margin: "16px 0" }}>
          <label htmlFor={selectId} style={{ display: "block", marginBottom: 6 }}>
            {relinking ? "Select replacement Process Canvas" : "Select Process Canvas"}
          </label>
          <select id={selectId} autoFocus value={selectedId} disabled={busy}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => { setSelectedId(event.target.value); setError(""); }}
            style={{ width: "100%", boxSizing: "border-box", padding: 8, font: "inherit", border: "1px solid #94a3b8", borderRadius: 6 }}>
            <option value="" disabled>Select a Process Canvas...</option>
            {options?.canvases.map((canvas) => <option key={canvas.id} value={canvas.id}>
              {canvas.name}{(names.get(canvas.name.trim().toLocaleLowerCase()) ?? 0) > 1
                ? ` — ${canvas.role === "owner" ? "Owned by you" : "Shared as Editor"} — ID: ${canvas.id}` : ""}
            </option>)}
          </select>
        </div>}
        {error && <p id={errorId} role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
        {(!loading && !busy) && <button type="button" onClick={() => {
          setOptions(null); setSelectedId(""); setError(""); setReload((value) => value + 1);
        }} style={{ marginBottom: 16 }}>Reload list</button>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="submit" disabled={loading || busy || !selectedId}>
            {busy ? "Linking…" : relinking ? "Relink Canvas" : "Link Canvas"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
