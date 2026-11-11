import { useEffect, useState, type CSSProperties } from "react";

export default function EditableText({
  value,
  onCommit,
  placeholder,
  readOnly,
  multiline,
}: {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  const shown = multiline ? (value ?? "") : (value ?? "").trim();
  const multilineStyle: CSSProperties | undefined = multiline
    ? { whiteSpace: "pre-wrap", overflowWrap: "anywhere" }
    : undefined;

  if (readOnly) {
    return shown ? <div style={multilineStyle}>{shown}</div> : <div style={{ color: "#888" }}>{placeholder ?? ""}</div>;
  }

  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        title="Click to edit"
        style={{
          cursor: "pointer",
          padding: 2,
          borderRadius: 4,
          minHeight: multiline ? 28 : undefined,
          ...multilineStyle,
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.outline = "2px solid #bbb")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.outline = "none")}
      >
        {shown ? shown : <span style={{ color: "#888" }}>{placeholder ?? "Click to edit…"}</span>}
      </div>
    );
  }

  const commonStyle: CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    font: "inherit",
    fontSize: 12,
    lineHeight: 1.25,
    padding: 6,
    border: "1px solid #999",
    borderRadius: 6,
    outline: "none",
  };

  return (
    <div>
      {multiline ? (
        <textarea autoFocus rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} style={commonStyle} />
      ) : (
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} style={commonStyle} />
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <button
          type="button"
          onClick={() => {
            onCommit(draft);
            setEditing(false);
          }}
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(value ?? "");
            setEditing(false);
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
