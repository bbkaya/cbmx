import { useState } from "react";

// Process actions are explicit; the shared editor keeps its existing behavior.
export default function EditableProcess({ value, readOnly, existing, onCommit, onDelete }: {
  value: string;
  readOnly?: boolean;
  existing?: boolean;
  onCommit: (line: string) => void;
  onDelete?: () => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (readOnly) return <div>{value}</div>;
  if (!editing) return (
    <button type="button" title="Click to edit" onClick={() => {
      setDraft(value); setError(""); setEditing(true);
    }} style={{ textAlign: "left", font: "inherit", width: "100%", border: 0, background: "transparent", cursor: "pointer", padding: 2 }}>
      {value || <span style={{ color: "#888" }}>Process (Actor 1, Actor 2)</span>}
    </button>
  );
  return (
    <div>
      <input autoFocus aria-label="Co-creation process" aria-invalid={Boolean(error)} value={draft}
        disabled={busy} onChange={(event) => { setDraft(event.target.value); setError(""); }}
        style={{ width: "100%", boxSizing: "border-box", font: "inherit", padding: 6, border: "1px solid #999", borderRadius: 6 }} />
      {error && <div role="alert" style={{ color: "#b91c1c", marginTop: 4 }}>{error}</div>}
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <button type="button" disabled={busy} onClick={() => { setDraft(value); setError(""); setEditing(false); }}>Cancel</button>
        <button type="button" disabled={busy} onClick={() => {
          try { onCommit(draft); setEditing(false); setError(""); }
          catch (error) { setError(error instanceof Error ? error.message : "Could not save process."); }
        }}>{existing ? "Rename" : "Add"}</button>
        {existing && onDelete && <button type="button" disabled={busy} onClick={async () => {
          setBusy(true); setError("");
          try { if (await onDelete()) setEditing(false); }
          catch (error) { setError(error instanceof Error ? error.message : "Could not delete process."); }
          finally { setBusy(false); }
        }}>Delete</button>}
      </div>
    </div>
  );
}
