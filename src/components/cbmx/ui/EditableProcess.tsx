import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export default function EditableProcess({ value, displayValue, readOnly, existing, onCommit, onDelete, initiallyEditing, onCancel, onEditingChange }: {
  value: string;
  displayValue?: ReactNode;
  readOnly?: boolean;
  existing?: boolean;
  onCommit: (line: string) => void;
  onDelete?: () => Promise<boolean>;
  initiallyEditing?: boolean;
  onCancel?: () => void;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [editing, setEditing] = useState(Boolean(initiallyEditing));
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const committed = useRef(false);
  const deleting = useRef(false);
  const errorId = useId();

  useEffect(() => {
    if (!editing && restoreFocus.current) {
      triggerRef.current?.focus({ preventScroll: true });
      restoreFocus.current = false;
    }
  }, [editing]);

  function start() { setDraft(value); setError(""); committed.current = false; setEditing(true); onEditingChange?.(true); }
  function cancel() { restoreFocus.current = true; setDraft(value); setError(""); setEditing(false); onEditingChange?.(false); onCancel?.(); }
  function save() {
    if (committed.current || deleting.current) return;
    committed.current = true;
    try { onCommit(draft); restoreFocus.current = true; setEditing(false); setError(""); onEditingChange?.(false); }
    catch (error) { committed.current = false; setError(error instanceof Error ? error.message : "Could not save process."); }
  }

  if (readOnly) return <div>{displayValue ?? value}</div>;
  if (!editing) return <button ref={triggerRef} type="button" title="Click to edit" onClick={start}
    className="cbmx-editable-trigger cbmx-process-trigger" onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault(); event.stopPropagation();
        if (!event.repeat && !event.nativeEvent.isComposing) start();
      }
    }}>
    {displayValue ?? (value || <span style={{ color: "#888" }}>Process (Actor 1, Actor 2)</span>)}
  </button>;

  return <div className="cbmx-inline-editor" onKeyDown={(event) => {
    if (event.key === "Escape" && !event.nativeEvent.isComposing && !event.repeat && !busy) {
      event.preventDefault(); event.stopPropagation(); cancel();
    }
  }}>
    <input autoFocus aria-label="Co-creation process" aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
      value={draft} disabled={busy} onChange={(event) => { setDraft(event.target.value); setError(""); }}
      className="cbmx-inline-input" onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.repeat || busy) return;
        if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); save(); }
      }} />
    {error && <div id={errorId} role="alert" className="cbmx-inline-error">{error}</div>}
    <div className="cbmx-editor-actions">
      <button type="button" disabled={busy} className="cbmx-inline-cancel" onClick={cancel}>Cancel</button>
      <button type="button" disabled={busy} className="cbmx-inline-save" onClick={save}>{existing ? "Rename" : "Add"}</button>
      {existing && onDelete && <button type="button" disabled={busy} className="cbmx-inline-delete" onClick={async () => {
        if (deleting.current) return;
        deleting.current = true; setBusy(true); setError("");
        try { if (await onDelete()) { setEditing(false); onEditingChange?.(false); } }
        catch (error) { setError(error instanceof Error ? error.message : "Could not delete process."); }
        finally { deleting.current = false; setBusy(false); }
      }}>Delete</button>}
    </div>
  </div>;
}
