import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export default function EditableText({ value, onCommit, placeholder, readOnly, multiline, displayValue, label }: {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  multiline?: boolean;
  displayValue?: ReactNode;
  label?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState("");
  const triggerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const restoreFocus = useRef(false);
  const committed = useRef(false);
  const errorId = useId();

  useEffect(() => {
    if (!editing && restoreFocus.current) {
      triggerRef.current?.focus({ preventScroll: true });
      restoreFocus.current = false;
    }
  }, [editing]);

  useLayoutEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const borders = textareaRef.current.offsetHeight - textareaRef.current.clientHeight;
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight + borders}px`;
    }
  }, [editing, draft]);

  function start() {
    setDraft(value ?? "");
    setError("");
    committed.current = false;
    setEditing(true);
  }

  function cancel() {
    restoreFocus.current = true;
    setDraft(value ?? "");
    setError("");
    setEditing(false);
  }

  function save() {
    if (committed.current) return;
    committed.current = true;
    try {
      onCommit(draft);
      restoreFocus.current = true;
      setEditing(false);
    } catch (error) {
      committed.current = false;
      setError(error instanceof Error ? error.message : "Could not save this edit.");
    }
  }

  const shown = multiline ? (value ?? "") : (value ?? "").trim();
  const multilineStyle: CSSProperties | undefined = multiline
    ? { whiteSpace: "pre-wrap", overflowWrap: "anywhere" } : undefined;

  if (readOnly) {
    return shown ? <div style={multilineStyle}>{displayValue ?? shown}</div> : <div style={{ color: "#888" }}>{placeholder ?? ""}</div>;
  }

  if (!editing) {
    return <div ref={triggerRef} role="button" tabIndex={0} onClick={start} title="Click to edit"
      className="cbmx-editable-trigger" style={{ ...multilineStyle, minHeight: multiline ? 28 : undefined }}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && !event.repeat && !event.nativeEvent.isComposing) {
          event.preventDefault(); event.stopPropagation(); start();
        }
      }}>
      {shown ? (displayValue ?? shown) : <span style={{ color: "#888" }}>{placeholder ?? "Click to edit…"}</span>}
    </div>;
  }

  return <div className="cbmx-inline-editor" onKeyDown={(event) => {
    if (event.nativeEvent.isComposing || event.repeat) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); }
    if (event.key === "Enter" && event.target === event.currentTarget.querySelector("input,textarea") && (!multiline || event.ctrlKey || event.metaKey)) {
      event.preventDefault(); event.stopPropagation(); save();
    }
  }}>
    {multiline ? <textarea ref={textareaRef} autoFocus rows={3} value={draft} aria-label={label ?? "Edit text"}
      aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
      onChange={(event) => setDraft(event.target.value)} className="cbmx-inline-input" /> :
      <input autoFocus value={draft} aria-label={label ?? "Edit text"}
        aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
        onChange={(event) => setDraft(event.target.value)} className="cbmx-inline-input" />}
    {error && <div id={errorId} role="alert" className="cbmx-inline-error">{error}</div>}
    <div className="cbmx-editor-actions">
      <button type="button" className="cbmx-inline-save" onClick={save}>Save</button>
      <button type="button" className="cbmx-inline-cancel" onClick={cancel}>Cancel</button>
    </div>
  </div>;
}
